
======================================================================

	 ██████╗██╗     ██╗██████╗  ██████╗ ███╗   ██╗ ██████╗ ██████╗
	██╔════╝██║     ██║██╔══██╗██╔═══██╗████╗  ██║██╔════╝ ██╔═══██╗
	██║     ██║     ██║██████╔╝██║   ██║██╔██╗ ██║██║  ███╗██║   ██║
	██║     ██║     ██║██╔═══╝ ██║   ██║██║╚██╗██║██║   ██║██║   ██║
	╚██████╗╚██████╗██║██║     ╚██████╔╝██║ ╚████║╚██████╔╝╚██████╔╝
	 ╚═════╝ ╚═════╝╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝  ╚═════╝

======================================================================

  Getting Started
  ──────────────────
  1. Prerequisites
     * Go (>=1.20)
         if not installed -> sudo apt-get -y install golang-go
     * GNU Make
     * A running Clipongo API server at http://localhost:1443

  2. Build the CLI
     In your project root, run:
       $ make
     This compiles the Go code and produces the executable `cli`.

  3. Run the Game
       $ ./cli
     You will see the login page !

  Playing the Game
  ────────────────────
  1. Login
     > Enter your username (no password needed).

  2. Select Mode
     1) Host a multiplayer game
     2) Join an existing game
     3) Logout

  3. Hosting (choose 1)
     * Enter your opponent’s username.
     * Wait for them to join.
     * A Game will appear on screen !

  4. Joining (choose 2)
     * View available games hosted by friends.
     * Enter the number of the game to join (0 to cancel).
     * When joining the game will be paused so you need to unpause the game by pressing Ctrl + Space

  5. Controls
     * W or ↑  — Move paddle up
     * S or ↓  — Move paddle down

  Exit & Logout
  ───────────────
  * To quit from main menu, select option 3 (Logout) then select option 2 (Exit).
  * In-game, press Esc or Ctrl+C to exit the ongoing game.
  * To switch users, logout and login again.

  Tips
  ───────────────
  * You can resize the terminal.

  Enjoy the match !
