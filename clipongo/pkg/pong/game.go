package pong

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"clipongo/pkg/api"

	"github.com/gdamore/tcell/v2"
	"github.com/gorilla/websocket"
)

const (
	// Winscore
	WinScore = 3

	// Game dimensions
	GameWidth    = 1000 // Width of the game area
	GameHeight   = 500  // Height of the game area
	PaddleWidth  = 10   // Width of the paddles
	PaddleHeight = 100  // Height of the paddles
	BallSize     = 10   // Diameter of the ball

	// Game X Y pos
	CenterX      = GameWidth / 2
	CenterY      = GameHeight / 2
	PaddleOffset = 1
)

var (
	// Terminal display dimensions
	TermWidth  int
	TermHeight int
	// Paddle positions (X coordinates)
	LeftPaddleX  = PaddleWidth + PaddleOffset
	RightPaddleX = GameWidth - PaddleWidth - PaddleOffset
)

type LocalGameState struct {
	GameState api.GameState
}

type winEvent struct {
	Winner  string
	YouWon  bool
	EndTime time.Time
}

func StartGame(client *api.Client, gameID string, playerNumber int) {
	screen, err := tcell.NewScreen()
	if err != nil {
		log.Fatalf("Failed to create screen: %v", err)
	}
	if err := screen.Init(); err != nil {
		log.Fatalf("Failed to initialize screen: %v", err)
	}
	defer screen.Fini()
	screen.SetStyle(tcell.StyleDefault)
	screen.Clear()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	gameStateChan := make(chan *api.GameState)
	stopWS := make(chan struct{})
	forceStopChan := make(chan struct{})

	winChan := make(chan winEvent)
	defer close(winChan)
	done := make(chan struct{})
	go handleWinEvents(screen, winChan, done)

	conn, err := listenGameWebSocket(client, gameID, gameStateChan, stopWS, forceStopChan)
	if err != nil {
		log.Fatalf("WebSocket connection failed: %v", err)
	}

	defer func() {
		close(stopWS)
		time.Sleep(100 * time.Millisecond)
		conn.Close()
	}()
	var localState *LocalGameState
	select {
	case initial := <-gameStateChan:
		if initial == nil {
			log.Fatal("Received nil initial state from WebSocket")
		}
		localState = &LocalGameState{
			GameState: *initial,
		}
	case <-time.After(3 * time.Second):
		log.Fatal("Timed out waiting for initial game state from WebSocket")
	}
	eventQueue := make(chan tcell.Event, 100)
	go func() {
		for {
			eventQueue <- screen.PollEvent()
		}
	}()
	ticker := time.NewTicker(16 * time.Millisecond)
	defer ticker.Stop()

	tickerPaddle := time.NewTicker(50 * time.Millisecond)
	defer tickerPaddle.Stop()

	keyStates := make(map[string]bool)
	lastKeyPress := time.Now()

	winDetected := false
	var updated *api.GameState

gameLoop:
	for {
		select {
		case event := <-eventQueue:
			switch ev := event.(type) {
			case *tcell.EventKey:
				lastKeyPress = time.Now()
				if ev.Key() == tcell.KeyCtrlSpace {
					updated, err = client.Unpause(localState.GameState.ID)
				}
				if ev.Key() == tcell.KeyEsc || ev.Key() == tcell.KeyCtrlC {
					return
				}
				var action string
				switch ev.Key() {
				case tcell.KeyUp:
					action = "paddle-up"
				case tcell.KeyDown:
					action = "paddle-down"
				}
				switch ev.Rune() {
				case 'w', 'W':
					action = "paddle-up"
				case 's', 'S':
					action = "paddle-down"
				}
				if action != "" && !keyStates[action] {
					keyStates[action] = true
					if !localState.GameState.Pause && localState.GameState.Players[0].Player.Score < 10 && localState.GameState.Players[1].Player.Score < 10 {
						sendMoveFromAction(conn, playerNumber, action, true)
					}
				}
			case *tcell.EventResize:
				w, h := ev.Size()
				TermWidth, TermHeight = w, h
				screen.Sync()

			}

		case updated = <-gameStateChan:
			if updated != nil {
				localState.GameState = *updated
				localState.GameState.Pause = updated.Pause
				if !winDetected {
					if ev := detectWin(*localState, playerNumber); ev != nil {
						winDetected = true
						winChan <- *ev
						break gameLoop
					}
				}
			}

		case <-tickerPaddle.C:
			if time.Since(lastKeyPress) > 16*time.Millisecond && !localState.GameState.Pause {
				sendMoveFromAction(conn, playerNumber, "up", false)
			}

		case <-ticker.C:
			screen.Clear()
			drawGameStateTcell(screen, &localState.GameState)

			screen.Show()
		default:
			keyStates["paddle-up"] = false
			keyStates["paddle-down"] = false
		case <-forceStopChan:
			if ev := detectWin(*localState, playerNumber); ev != nil {
				winChan <- *ev
				break gameLoop
			}
			drawEndPage(screen, time.Now(), "CONNECTION LOST")
			break gameLoop

		case <-sigChan:
			break gameLoop
		}
	}
	<-done
	return
}

func fetchInitialGameState(client *api.Client, gameID string, maxRetries int) (*api.GameState, error) {
	var (
		game *api.GameState
		err  error
	)
	for i := 0; i < maxRetries; i++ {
		game, err = client.GetGameState(gameID)
		if err == nil {
			return game, nil
		}
		time.Sleep(time.Second)
	}
	return nil, fmt.Errorf("failed to get initial game state after %d attempts: %w", maxRetries, err)
}

func listenGameWebSocket(
	client *api.Client,
	gameID string,
	gameStateChan chan<- *api.GameState,
	stopChan <-chan struct{},
	forceStopChan chan struct{},
) (*websocket.Conn, error) {

	url := fmt.Sprintf("wss://localhost:1443/ws/game/%s?token=%s", gameID, client.GetToken())

	header := http.Header{}
	header.Set("Authorization", "Bearer "+client.GetToken())
	header.Set("Origin", "https://localhost:1443")

	dialer := websocket.Dialer{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: true,
		},
	}

	conn, resp, err := dialer.Dial(url, header)
	if err != nil {
		log.Printf("WebSocket dial error: %v", err)
		if resp != nil {
			defer resp.Body.Close()
			body, _ := io.ReadAll(resp.Body)
			log.Printf("Response status: %s, body: %s", resp.Status, string(body))
		}
		return nil, err
	}

	go func() {
		defer func() {
			log.Printf("WebSocket reader exiting")
			close(forceStopChan)
		}()
		for {
			select {
			case <-stopChan:
				log.Printf("Stop signal received: closing WebSocket reader")
				return
			default:
				_, msg, err := conn.ReadMessage()
				if err != nil {
					if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
						log.Printf("WebSocket closed normally")
					} else {
						log.Printf("WebSocket read error: %v", err)
					}
					return
				}

				if len(msg) == 0 {
					log.Printf("Received empty message: ignoring")
					continue
				}
				var typedMsg struct {
					Type    string          `json:"type"`
					Payload json.RawMessage `json:"payload"`
				}
				if err := json.Unmarshal(msg, &typedMsg); err != nil {
					log.Printf("Failed to parse message type: %v", err)
					continue
				}

				if typedMsg.Type != "game_state" {
					log.Printf("Ignoring non-game_state: %s", typedMsg.Type)
					continue
				}

				var state api.GameState
				if err := json.Unmarshal(typedMsg.Payload, &state); err != nil {
					log.Printf("Failed to parse game state payload: %v", err)
					continue
				}

				gameStateChan <- &state
			}
		}
	}()

	return conn, nil
}

func sendPaddleMove(conn *websocket.Conn, playerNum int, paddle, direction string, moving bool) {
	msg := map[string]interface{}{
		"type": "paddle_move",
		"payload": map[string]interface{}{
			"paddle":    playerNum - 1,
			"direction": direction,
			"moving":    moving,
		},
	}
	if conn == nil {
		log.Printf("Websocket is nill, skipping send")
		return
	}
	if err := conn.WriteJSON(msg); err != nil {
		log.Printf("WebSocket send error: %v", err)
	}
}

func sendMoveFromAction(conn *websocket.Conn, playerNum int, action string, moving bool) {
	var paddle, direction string
	if playerNum == 1 {
		paddle = "paddle1"
	} else {
		paddle = "paddle2"
	}
	if strings.HasSuffix(action, "up") {
		direction = "up"
	} else {
		direction = "down"
	}
	sendPaddleMove(conn, playerNum, paddle, direction, moving)
}

func clearScreen() {
	fmt.Print("\033[H\033[2J")
}

func detectWin(state LocalGameState, playerNumber int) *winEvent {
	p0 := state.GameState.Players[0].Player
	p1 := state.GameState.Players[1].Player

	var winner string
	switch {
	case p0.Won && !p1.Won:
		winner = p0.Username
	case p1.Won && !p0.Won:
		winner = p1.Username
	default:
		if p0.Score >= WinScore || p1.Score >= WinScore {
			if p0.Score > p1.Score {
				winner = p0.Username
			} else if p1.Score > p0.Score {
				winner = p1.Username
			} else {
				// tie
				return nil
			}
		} else {
			// no one won yet
			return nil
		}
	}
	localIdx := playerNumber - 1
	localName := state.GameState.Players[localIdx].Player.Username
	youWon := (localName == winner)

	return &winEvent{
		Winner:  winner,
		YouWon:  youWon,
		EndTime: time.Now(),
	}
}

func handleWinEvents(screen tcell.Screen, winChan <-chan winEvent, done chan<- struct{}) {
	ev, ok := <-winChan
	if !ok {
		close(done)
		return
	}
	drawWinPage(screen, ev.EndTime, ev.YouWon, ev.Winner)
	drawEndPage(screen, time.Now(), "GAME ENDED")
	close(done)
}
