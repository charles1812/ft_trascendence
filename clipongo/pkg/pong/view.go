package pong

import (
	"clipongo/pkg/api"
	"fmt"
	"strings"
	"time"

	"github.com/gdamore/tcell/v2"
)

func drawGameStateTcell(screen tcell.Screen, game *api.GameState) {
	// Terminal grid dimensions
	width := TermWidth
	height := TermHeight

	innerWidth := width - 2
	innerHeight := height - 2

	// Colors and styles
	borderStyle := tcell.StyleDefault.Foreground(tcell.ColorWhite)
	paddleStyle := tcell.StyleDefault.Foreground(tcell.ColorGreen)
	ballStyle := tcell.StyleDefault.Foreground(tcell.ColorYellow)
	centerLineStyle := tcell.StyleDefault.Foreground(tcell.ColorGray)
	scoreStyle := tcell.StyleDefault.Foreground(tcell.ColorWhite)

	// Draw borders
	for x := 0; x < width; x++ {
		screen.SetContent(x, 0, '─', nil, borderStyle)
		screen.SetContent(x, height-1, '─', nil, borderStyle)
	}
	screen.SetContent(0, 0, '╭', nil, borderStyle)
	screen.SetContent(width-1, 0, '╮', nil, borderStyle)
	screen.SetContent(0, height-1, '╰', nil, borderStyle)
	screen.SetContent(width-1, height-1, '╯', nil, borderStyle)
	for y := 1; y < height-1; y++ {
		screen.SetContent(0, y, '│', nil, borderStyle)
		screen.SetContent(width-1, y, '│', nil, borderStyle)
	}

	// Draw center line
	centerX := innerWidth/2 + 1
	for y := 1; y < height-1; y++ {
		screen.SetContent(centerX, y, '│', nil, centerLineStyle)
	}

	// Helper to scale game coordinates to terminal
	scaleX := func(x int) int {
		return int(float64(x) * float64(innerWidth) / float64(GameWidth))
	}
	scaleY := func(y int) int {
		return int(float64(y) * float64(innerHeight) / float64(GameHeight))
	}

	// Draw player info line
	topLine := fmt.Sprintf("%s─%d─────────%d─%s", Truncate(game.Players[0].Player.Username, 10), game.Players[0].Player.Score, game.Players[1].Player.Score, Truncate(game.Players[1].Player.Username, 10))
	startX := (innerWidth-len(topLine))/2 + 1
	for i, r := range topLine {
		screen.SetContent(startX+i, 0, r, nil, scoreStyle)
	}

	// Draw paddles
	paddleHeight := (PaddleHeight * innerHeight) / GameHeight
	if paddleHeight < 1 {
		paddleHeight = 1
	}

	maxGameY := GameHeight - PaddleHeight
	maxScreenY := innerHeight - paddleHeight

	scalePaddleY := func(y float64) int {
		if maxGameY <= 0 {
			return 1
		}
		return int(y/float64(maxGameY)*float64(maxScreenY)) + 1
	}

	p1x := scaleX(LeftPaddleX) + 1
	p1y := scalePaddleY(game.Players[0].Paddle.Y)
	for y := 0; y < paddleHeight; y++ {
		py := p1y + y
		if py > 0 && py < height-1 {
			screen.SetContent(p1x, py, '█', nil, paddleStyle)
		}
	}
	p2x := scaleX(RightPaddleX) + 1
	p2y := scalePaddleY(game.Players[1].Paddle.Y)
	for y := 0; y < paddleHeight; y++ {
		py := p2y + y
		if py > 0 && py < height-1 {
			screen.SetContent(p2x, py, '█', nil, paddleStyle)
		}
	}

	// Draw ball
	ballX := scaleX(int(game.Ball.X)) + 1
	ballY := scaleY(int(game.Ball.Y)) + 1
	if ballX > 0 && ballX < width-1 && ballY > 0 && ballY < height-1 {
		screen.SetContent(ballX, ballY, '●', nil, ballStyle)
	}
}

func Truncate(s string, maxRunes int) string {
	rs := []rune(s)
	if len(rs) <= maxRunes {
		return s
	}
	return string(rs[:maxRunes])
}

func drawPausedOverlay(screen tcell.Screen) {
	msg := " PAUSED "
	style := tcell.StyleDefault.Foreground(tcell.ColorRed).Bold(true)
	x := (TermWidth - len(msg)) / 2
	y := TermHeight / 2
	for i, r := range msg {
		screen.SetContent(x+i, y, r, nil, style)
	}
}

func drawEndOverlay(screen tcell.Screen, winner string, youWon bool) {
	var msg string
	if youWon {
		msg = " YOU WIN! "
	} else {
		msg = " YOU LOSE! "
	}
	style := tcell.StyleDefault.Foreground(tcell.ColorGreen).Bold(true)
	if !youWon {
		style = tcell.StyleDefault.Foreground(tcell.ColorRed).Bold(true)
	}
	x := (TermWidth - len(msg)) / 2
	y := TermHeight / 2
	for i, r := range msg {
		screen.SetContent(x+i, y, r, nil, style)
	}
	// Optional: show who won
	winnerMsg := fmt.Sprintf("Winner: %s", winner)
	wx := (TermWidth - len(winnerMsg)) / 2
	wy := y + 2
	for i, r := range winnerMsg {
		screen.SetContent(wx+i, wy, r, nil, style)
	}
}

func drawEndPage(screen tcell.Screen, endTime time.Time, reason string) {
	screen.Clear()

	// Main message (reason: "GAME ENDED" or "CONNECTION LOST")
	msg := " " + reason + " "
	msgStyle := tcell.StyleDefault.Foreground(tcell.ColorRed).Bold(true)
	x := (TermWidth - len(msg)) / 2
	y := TermHeight / 2
	for i, r := range msg {
		screen.SetContent(x+i, y, r, nil, msgStyle)
	}

	// Sub message: prompt to exit
	subMsg := "Press two key to exit,\n First to create a PollEvent()\n Ans Second to trigger EventKey"
	subStyle := tcell.StyleDefault.Foreground(tcell.ColorWhite)

	lines := strings.Split(subMsg, "\n")

	startY := y + 2

	for row, line := range lines {
		// center each line individually
		sx := (TermWidth - len(line)) / 2
		sy := startY + row

		for i, r := range line {
			screen.SetContent(sx+i, sy, r, nil, subStyle)
		}
	}

	screen.Show()

	for {
		// check for timeout
		if time.Since(endTime) > 3*time.Second {
			break
		}
		// non-blocking poll: see if the user pressed anything
		switch screen.PollEvent().(type) {
		case *tcell.EventKey:
			return // exit on any key
		case *tcell.EventResize:
			screen.Sync() // handle resize
		default:
			// small sleep to avoid busy-looping
			time.Sleep(20 * time.Millisecond)
		}
	}
}

func drawWinPage(screen tcell.Screen, endTime time.Time, winstate bool, winner string) {
	screen.Clear()

	var msg string
	var msgStyle tcell.Style
	if winstate {
		msg = " YOU WON "
		msgStyle = tcell.StyleDefault.Foreground(tcell.ColorGreen).Bold(true)
	} else {
		msg = " YOU LOST "
		msgStyle = tcell.StyleDefault.Foreground(tcell.ColorRed).Bold(true)
	}
	x := (TermWidth - len(msg)) / 2
	y := TermHeight / 2
	for i, r := range msg {
		screen.SetContent(x+i, y, r, nil, msgStyle)
	}

	winnerMsg := fmt.Sprintf("Winner: %s", winner)
	wx := (TermWidth - len(winnerMsg)) / 2
	wy := y + 2
	for i, r := range winnerMsg {
		screen.SetContent(wx+i, wy, r, nil, msgStyle)
	}

	subMsg := "Press two key to exit,\n First to create a PollEvent()\n Ans Second to trigger EventKey"
	subStyle := tcell.StyleDefault.Foreground(tcell.ColorWhite)

	lines := strings.Split(subMsg, "\n")

	startY := y + 4

	for row, line := range lines {
		// center each line individually
		sx := (TermWidth - len(line)) / 2
		sy := startY + row

		for i, r := range line {
			screen.SetContent(sx+i, sy, r, nil, subStyle)
		}
	}

	screen.Show()

	for {
		if time.Since(endTime) > 3*time.Second {
			break
		}
		switch screen.PollEvent().(type) {
		case *tcell.EventResize:
			screen.Sync() // handle resize
		default:
			time.Sleep(20 * time.Millisecond)
		}
	}
	return
}
