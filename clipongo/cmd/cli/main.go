package main

import (
	"bufio"
	"clipongo/pkg/api"
	"clipongo/pkg/pong"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
)

func displayWelcome() {
	fmt.Println(`
	 ██████╗██╗     ██╗██████╗  ██████╗ ███╗   ██╗ ██████╗ ██████╗
	██╔════╝██║     ██║██╔══██╗██╔═══██╗████╗  ██║██╔════╝ ██╔═══██╗
	██║     ██║     ██║██████╔╝██║   ██║██╔██╗ ██║██║  ███╗██║   ██║
	██║     ██║     ██║██╔═══╝ ██║   ██║██║╚██╗██║██║   ██║██║   ██║
	╚██████╗╚██████╗██║██║     ╚██████╔╝██║ ╚████║╚██████╔╝╚██████╔╝
	 ╚═════╝ ╚═════╝╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝  ╚═════╝
`)
}

func main() {
	clearScreen()
	displayWelcome()

	f, err := os.OpenFile("testlogfile", os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666)
	if err != nil {
		log.Fatalf("error opening file: %v", err)
	}
	defer f.Close()

	log.SetOutput(f)
	for {
		action := getAction()

		switch action {
		case "1":
			client, ok := handleLogin()
			if ok {
				for handleGameMode(client) {
				}
			}
		case "2":
			clearScreen()
			fmt.Println("\n The entire codebase was provided by ChatGPT")
			os.Exit(0)
		default:
			fmt.Println("\n Invalid choice. Please try again.")
		}
	}
}

func getAction() string {
	reader := bufio.NewReader(os.Stdin)

	for {
		fmt.Println("\n What would you like to do?")
		fmt.Println("1. Login")
		fmt.Println("2. Exit")
		fmt.Print("\n Enter your choice (1-2): ")

		choice, _ := reader.ReadString('\n')
		choice = strings.TrimSpace(choice)

		if choice == "1" || choice == "2" {
			return choice
		}
		fmt.Println("\n Please enter a number between 1 and 2")
	}
}

func getGameMode() string {
	reader := bufio.NewReader(os.Stdin)

	for {
		fmt.Println("\n Select Game Mode")
		fmt.Println("1. Multiplayer Pong (Host)")
		fmt.Println("2. Join Multiplayer Game")
		fmt.Println("3. Logout")
		fmt.Print("\n Enter your choice (1-3): ")

		choice, _ := reader.ReadString('\n')
		choice = strings.TrimSpace(choice)

		if choice >= "1" && choice <= "3" {
			return choice
		}
		fmt.Println("\n Please enter a number between 1 and 3")
	}
}

func handleLogin() (*api.Client, bool) {
	clearScreen()
	displayWelcome()

	fmt.Println("\n Login to Your Account")
	fmt.Println("-----------------------")

	username, err := getCredentials()
	if err != nil {
		fmt.Printf("\nError: %v\n", err)
		return nil, false
	}

	client := api.NewClient("https://localhost", "", username)
	token, err := client.Authenticate(username)
	if err != nil {
		fmt.Printf("\n Authentication failed: %v\n", err)
		return nil, false
	}
	client.SetToken(token)
	fmt.Println("\n Login successful!")
	return client, true
}

func handleGameMode(client *api.Client) bool {
	reader := bufio.NewReader(os.Stdin)

	for {
		clearScreen()
		displayWelcome()
		mode := getGameMode()

		switch mode {
		case "1": // Host the pong game
			clearScreen()
			fmt.Println("\nHost a Multiplayer Game")
			fmt.Println("-------------------------")
			fmt.Print("Enter your opponent username : ")
			opponent, _ := reader.ReadString('\n')
			opponent = strings.TrimSpace(opponent)
			if opponent == client.GetUsername() || opponent == "" {
				continue
			}
			fmt.Println("\nCreating game...")
			game, err := client.CreateGame(opponent)
			if err != nil {
				fmt.Printf("\nFailed to create game: %v\n", err)
				fmt.Println("Press Enter to continue...")
				reader.ReadBytes('\n')
				continue ///////////////
			}
			fmt.Printf("\nGame created! Waiting for opponent to join...\n")
			pong.StartGame(client, game.ID, 1)
			continue
		case "2": // Join the pong game
			clearScreen()
			displayWelcome()
			fmt.Println("Join Multiplayer Game")
			fmt.Println("----------------------")

			games, err := client.ListGames()
			if err != nil {
				fmt.Printf("\nFailed to fetch games: %v\n", err)
				fmt.Println("Press Enter to continue...")
				reader.ReadBytes('\n')
				continue
			}

			if len(games) == 0 {
				fmt.Println("\nNo games available to join.")
				fmt.Println("Press Enter to continue...")
				reader.ReadBytes('\n')
				continue
			}

			fmt.Println("\nAvailable games to join:")
			for i, gi := range games {
				state, err := client.GetGameState(gi.ID)
				if err != nil {
					fmt.Printf("%d. [error fetching game %q]\n", i+1, gi.ID)
					continue
				}
				fmt.Printf("%d. Host: %s\n", i+1, state.Players[0].Player.Username)
			}
			for {
				fmt.Print("\nSelect a game number to join (or 0 to cancel): ")
				choice, _ := reader.ReadString('\n')
				choice = strings.TrimSpace(choice)

				if choice == "0" {
					break
				}
				gameIndex, err := strconv.Atoi(choice)
				if err != nil || gameIndex < 1 || gameIndex > len(games) {
					fmt.Println("Invalid selection. Please try again.")
					continue
				}

				// Look up the *full* state for this game:
				gameID := games[gameIndex-1].ID
				state, err := client.GetGameState(gameID)
				if err != nil {
					fmt.Printf("Failed to fetch game state for %q: %v\n", gameID, err)
					continue
				}

				// Now it's safe to index into state.Players
				host := state.Players[0].Player.Username
				fmt.Printf("\nJoining game %s hosted by %s...\n", gameID, host)
				pong.StartGame(client, gameID, 2)
				break // exit the join loop and re-draw the menu
			}
		case "3":
			fmt.Println("\n Logging out...")
			clearScreen()
			return false
		}
	}
}

func getCredentials() (string, error) {
	reader := bufio.NewReader(os.Stdin)

	fmt.Print("Username: ")
	username, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	username = strings.TrimSpace(username)

	return username, nil
}

func clearScreen() {
	fmt.Print("\033[H\033[2J")
}
