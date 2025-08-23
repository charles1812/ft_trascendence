package api

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type GameState struct {
	ID      string       `json:"id"`
	Pause   bool         `json:"pause"`
	Players []GamePlayer `json:"players"`
	Ball    Ball         `json:"ball"`
}

type GamePlayer struct {
	Player Player `json:"player"`
	Paddle Paddle `json:"paddle"`
}

type Player struct {
	Username string `json:"username"`
	Score    int    `json:"score"`
	Won      bool   `json:"won"`
}

type Paddle struct {
	Y float64 `json:"y"`
}

type Ball struct {
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
	Vx float64 `json:"vx"`
	Vy float64 `json:"vy"`
}

type Client struct {
	baseURL    string
	httpClient *http.Client
	token      string
	username   string
}

type AuthRequest struct {
	Username string `json:"username"`
}

type AuthResponse struct {
	Token string `json:"token"`
}

func NewClient(serverURL string, token string, username string) *Client {
	return &Client{
		baseURL:    serverURL,
		httpClient: &http.Client{},
		token:      token,
		username:   username,
	}
}

// CreateGame creates a new game and returns the initial game state.
// If opponent is not empty, it will be used to specify the opponent's username.
func (c *Client) CreateGame(opponent string) (*GameState, error) {
	// Prepare the request body
	var reqBody []byte
	var err error
	opponents := []string{opponent}

	if opponent != "" {
		reqBody, err = json.Marshal(map[string][]string{"opponents": opponents})
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
	} else {
		reqBody = []byte("{}")
	}

	req, err := http.NewRequestWithContext(
		context.Background(),
		http.MethodPost,
		fmt.Sprintf("%s/api/game", c.baseURL),
		bytes.NewBuffer(reqBody),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Rest of the existing CreateGame implementation remains the same...
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code %d: %s", resp.StatusCode, string(body))
	}

	var game GameState
	if err := json.Unmarshal(body, &game); err != nil {
		return nil, fmt.Errorf("failed to decode game state: %w", err)
	}

	return &game, nil
}

// GetGameState retrieves the current game state by ID.
// It sends a GET request to the server's /api/game/{id} endpoint.
// Requires an authorization token in the "Authorization" header.
func (c *Client) GetGameState(gameID string) (*GameState, error) {
	// Create a new request
	req, err := http.NewRequest("GET", fmt.Sprintf("%s/api/game/%s", c.baseURL, gameID), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}

	// Add the required Authorization header
	req.Header.Add("Authorization", "Bearer "+c.token)

	// Send the request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get game state: %v", err)
	}
	defer resp.Body.Close()

	// Read the response body first to include it in error messages
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == http.StatusNotFound {
		var errorResp struct {
			Error string `json:"error"`
		}
		if err := json.Unmarshal(body, &errorResp); err == nil {
			return nil, fmt.Errorf("game not found: %s", errorResp.Error)
		}
		return nil, fmt.Errorf("game not found")
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code %d: %s", resp.StatusCode, string(body))
	}

	var game GameState
	if err := json.Unmarshal(body, &game); err != nil {
		return nil, fmt.Errorf("failed to decode game state: %v", err)
	}

	return &game, nil
}

func (c *Client) Authenticate(username string) (string, error) {
	// Prepare payload
	payload := AuthRequest{Username: username}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal auth payload: %w", err)
	}

	// Create request
	req, err := http.NewRequestWithContext(
		context.Background(),
		http.MethodPost,
		fmt.Sprintf("%s/api/login", c.baseURL),
		bytes.NewBuffer(body),
	)
	if err != nil {
		return "", fmt.Errorf("failed to create auth request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	c.httpClient = &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
		},
	}
	// Send request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send auth request: %w", err)
	}
	defer resp.Body.Close()

	// Parse response
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("authentication failed: %s", resp.Status)
	}
	var authResp AuthResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return "", fmt.Errorf("failed to decode auth response: %w", err)
	}

	return authResp.Token, nil
}

func (c *Client) SetToken(token string) {
	c.token = token
}

func (c *Client) GetToken() string {
	return c.token
}

func (c *Client) GetUsername() string {
	return c.username
}

// ListGames retrieves a list of all available multiplayer games.
// It sends a GET request to the server's /api/games endpoint.
// Requires an authorization token in the "Authorization" header.
func (c *Client) ListGames() ([]GameState, error) {
	req, err := http.NewRequest(
		http.MethodGet,
		fmt.Sprintf("%s/api/user/games", c.baseURL),
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.GetToken())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code %d: %s", resp.StatusCode, string(body))
	}

	var games []GameState
	if err := json.Unmarshal(body, &games); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w. Body: %s", err, string(body))
	}

	return games, nil
}

func (c *Client) SetPause(gameID string, pause bool) (*GameState, error) {
	var endpoint string
	if pause {
		endpoint = fmt.Sprintf("%s/api/game/%s/pause", c.baseURL, gameID)
	} else {
		endpoint = fmt.Sprintf("%s/api/game/%s/unpause", c.baseURL, gameID)
	}
	req, err := http.NewRequest(http.MethodPost, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create pause/unpause request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send pause/unpause request: %v", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("pause/unpause request failed: status %d, body: %s", resp.StatusCode, string(body))
	}
	var game GameState
	if err := json.Unmarshal(body, &game); err != nil {
		return nil, fmt.Errorf("failed to decode game state: %w (response: %s)", err, string(body))
	}
	return &game, nil
}
