import "./style.css";
import type {
  GameType,
  GetGamesType,
  PaddleDirectionType,
  PostGameType,
  SocketDataType,
} from "@samir/shared/schemas";

import { startAI } from "./ai";

let token: string = "";
let gameId: string = "";
let username: string | null;
let tPlayer1: string | null;
let tPlayer2: string | null;
let username2: string | null = null;
let username3: string | null = null;
let username4: string | null = null;
let winnerName: string | null = null;
let newpong = false;
let gameStarted = false;
let tournamentStarted = false;
let multiplayerGameStarted = false;
let socket: WebSocket;
export let gameState: GameType;
let players: Player[] = [];

type Player = {
  id: number;
  username: string;
};

export function sendMoveForAI(paddle: number, key: string, moving: boolean) {
  const direction = key === "w" || key === "ArrowUp" ? "up"
                  : key === "s" || key === "ArrowDown" ? "down"
                  : null;
  if (direction === null || !socket || socket.readyState !== WebSocket.OPEN) return;

  const payload: SocketDataType = {
    type: "paddle_move",
    payload: {
      paddle,
      direction,
      moving,
    },
  };
  socket.send(JSON.stringify(payload));
}


updateGameState({
  ballX: 480,
  ballY: 200,
  leftPaddleY: 200,
  rightPaddleY: 200,
});

const cookieUsername = getUsernameFromCookie();
if (cookieUsername !== null) {
  username = cookieUsername;
  if (username) {
    document.cookie = `username=${username}; path=/; max-age=86400; SameSite=Strict`;
  }
  document.getElementById("show-login")?.classList.add("hidden");
  document.getElementById("profile-username")!.textContent = username;
  document.getElementById("profile-initial")!.textContent =
    username[0].toUpperCase();
}

function getUsernameFromCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)username=([^;]*)/);
  if (match) {
    return decodeURIComponent(match[1]);
  } else {
    return null;
  }
}

const cookieToken = getTokenFromCookie();
if (cookieToken !== null) {
  token = cookieToken;
}

function getTokenFromCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)token=([^;]*)/);
  if (match) {
    return decodeURIComponent(match[1]);
  } else {
    return null;
  }
}

function showCustomAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-alert")!;
    const alertMsg = document.getElementById("alert-message")!;
    const okBtn = document.getElementById("alert-ok")!;

    alertMsg.textContent = message;
    modal.classList.remove("hidden");

    const close = () => {
      modal.classList.add("hidden");
      okBtn.removeEventListener("click", close);
      resolve();
    };

    okBtn.addEventListener("click", close);

    document.addEventListener(
      "keydown",
      function escListener(e) {
        if (e.key === "Enter" || e.key === "Escape") {
          close();
          document.removeEventListener("keydown", escListener);
        }
      },
      { once: true },
    );
  });
}

function showCustomPrompt(message: string): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-prompt")!;
    const input = document.getElementById("prompt-input") as HTMLInputElement;
    const promptMsg = document.getElementById("prompt-message")!;
    const okBtn = document.getElementById("prompt-ok")!;
    const cancelBtn = document.getElementById("prompt-cancel")!;

    promptMsg.textContent = message;
    input.value = "";
    modal.classList.remove("hidden");
    input.focus();

    const cleanup = () => {
      modal.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
    };

    const onOk = () => {
      const trimmed = input.value.trim();
      if (trimmed === "") {
        // Don't close — just alert
        showCustomAlert("Prompt cannot be empty!");
        return;
      }
      if (trimmed.length > 10) {
        showCustomAlert("Username must be 10 characters or fewer.");
        return;
      }
      cleanup();
      resolve(trimmed);
    };

    const onCancel = () => {
      if (tournamentStarted === true) {
        resetTournament();
      }
      cleanup();
      resolve(null);
    };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onOk();
      if (e.key === "Escape") onCancel();
    });
  });
}

function waitForWinnerName(): Promise<string> {
  return new Promise((resolve) => {
    const check = () => {
      if (winnerName !== null) {
        resolve(winnerName);
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });
}

function resetTournament(): void {
  history.replaceState({ page: "menu" }, "", location.pathname);
  players = [];
  tournamentStarted = false;
  tPlayer1 = null;
  tPlayer2 = null;
  winnerName = null;
}

async function tournamentMatchmaking(players: Player[]): Promise<void> {
  let round = 1;
  let twinner: string;
  twinner = "string";
  const gameMenu = document.getElementById("game-menu");
  const startMessage = document.getElementById("start-message");
  const inGameMenu = document.getElementById("in-tournament-menu");

  while (players.length > 1) {
    console.log(`\n--- Round ${round} ---`);
    const nextRoundPlayers: Player[] = [];

    players = players.sort(() => Math.random() - 0.5);

    const matchPairs: [Player, Player | null][] = [];
    for (let i = 0; i < players.length; i += 2) {
      matchPairs.push([players[i], players[i + 1] || null]);
    }

    for (const [player1, player2] of matchPairs) {
      if (!player2) {
        console.log(`${player1.username} advances with a bye`);
        nextRoundPlayers.push(player1);
        continue;
      }

      console.log(`Match: ${player1.username} vs ${player2.username}`);
      const matchupText = document.getElementById("matchup-text");
      if (matchupText) {
        matchupText.textContent = `${player1.username} vs ${player2.username}`;
      }

      const id = await newGame();
      if (id) {
        gameId = id;
        initWebSocket(gameId, token);
        gameStarted = true;
        gameMenu?.classList.add("hidden");
        inGameMenu?.classList.remove("hidden");
        console.log("Game started! ID:", gameId);
        startMessage?.classList.remove("hidden");
        setTimeout(() => {
          startMessage?.classList.add("hidden");
        }, 1000);
        setupPlayerControls();
        goToGame();
      } else {
        alert("Failed to start tournament");
      }

      const p1Name = document.getElementById("player1-name");
      const p2Name = document.getElementById("player2-name");

      if (p1Name && p2Name) {
        p1Name.textContent = player1.username;
        tPlayer1 = player1.username;
        p2Name.textContent = player2.username;
        tPlayer2 = player2.username;
      }

      const winner = await waitForWinnerName();
      twinner = winner;
      console.log(`Winner of match: ${winner}`);

      nextRoundPlayers.push(winner === player1.username ? player1 : player2);

      winnerName = null;
    }

    players = nextRoundPlayers;
    round++;
  }
  winTournament(twinner);
  //location.reload();
  console.log(`\n🏆 Tournament Winner: ${twinner}`);
}

async function promptTournamentPlayers(): Promise<void> {
  const usernames = new Set<string>();

  let playerCountStr: string | null;
  let playerCount: number = 0;

  do {
    playerCountStr = await showCustomPrompt(
      "Enter the number of players (at least 3, max 10):",
    );
    if (!playerCountStr) return;
    playerCount = parseInt(playerCountStr.trim());
  } while (isNaN(playerCount) || playerCount < 3 || playerCount > 10);

  if (!username) return;
  usernames.add(username);
  players.push({ id: 0 + 1, username });

  for (let i = 1; i < playerCount; i++) {
    let username: string | null;
    while (true) {
      username = await showCustomPrompt(`Enter username for Player ${i + 1}:`);
      if (!username) {
        await showCustomAlert("Username required");
        resetTournament();
        return;
      }
      username = username.trim();
      if (username === "") {
        await showCustomAlert("Username cannot be empty.");
      } else if (usernames.has(username)) {
        await showCustomAlert("Username already taken. Please choose another.");
      } else {
        usernames.add(username);
        players.push({ id: i + 1, username });
        break;
      }
    }
  }
  if (players.length >= 3) {
    tournamentMatchmaking(players);
  }
}

function initWebSocket(gameId: string, token: string) {
  socket = new WebSocket(`/ws/game/${gameId}?token=${token}`);

  socket.onopen = () => {
    console.log("WebSocket connected");
  };

  socket.onmessage = (event) => {
    const data: SocketDataType = JSON.parse(event.data);
    if (data.type === "game_state") {
      const gameData: GameType = data.payload;
      if (newpong === false) {
        updateGameState({
          ballX: gameData.ball.x,
          ballY: gameData.ball.y,
          leftPaddleY: gameData.players[0].paddle.y,
          rightPaddleY: gameData.players[1].paddle.y,
        });
      } else {
        updateGameState2({
          ballX: gameData.ball.x,
          ballY: gameData.ball.y,
          leftPaddleY: gameData.players[0].paddle.y,
          rightPaddleY: gameData.players[1].paddle.y,
          leftPaddleY2: gameData.players[2].paddle.y,
          rightPaddleY2: gameData.players[3].paddle.y,
        });
      }

      if (
        gameStarted === false &&
        newpong === false &&
        multiplayerGameStarted === false &&
        tournamentStarted === false
      ) {
        socket.close();
      }

      document.getElementById("player1-score")!.textContent = String(
        gameData.players[0].player.score,
      );
      document.getElementById("player2-score")!.textContent = String(
        gameData.players[1].player.score,
      );
      const p1Name = document.getElementById("player1-name");
      const p2Name = document.getElementById("player2-name");

      if (p1Name && p2Name) {
        if (
          multiplayerGameStarted != true &&
          newpong != true &&
          tournamentStarted != true
        ) {
          p1Name.textContent = gameData.players[0].player.username;
          p2Name.textContent = username2;
        } else if (tournamentStarted != true) {
          p1Name.textContent = gameData.players[0].player.username;
          p2Name.textContent = gameData.players[1].player.username;
        }
      }
      if (
        gameData.players[0].player.score >= 3 ||
        gameData.players[1].player.score >= 3
      ) {
        pauseGame(gameId);
        if (multiplayerGameStarted === true) {
          if (gameData.players[0].player.score >= 3) {
            winnerName = gameData.players[0].player.username;
            if (gameData.players[0].player.username === username) {
              win();
            } else {
              lose();
            }
          } else if (gameData.players[1].player.score >= 3) {
            winnerName = gameData.players[1].player.username;
            if (gameData.players[1].player.username === username) {
              win();
            } else {
              lose();
            }
          }
        } else if (newpong === true) {
          if (gameData.players[0].player.score >= 3) {
            if (
              gameData.players[0].player.username === username ||
              gameData.players[2].player.username === username
            ) {
              win();
            } else {
              lose();
            }
          } else if (gameData.players[1].player.score >= 3) {
            if (
              gameData.players[1].player.username === username ||
              gameData.players[3].player.username === username
            ) {
              win();
            } else {
              lose();
            }
          }
        } else if (tournamentStarted === true) {
          if (gameData.players[0].player.score >= 3) {
            pauseGame(gameId);
            winnerName = tPlayer1;
            socket.close();
            return;
          } else if (gameData.players[1].player.score >= 3) {
            pauseGame(gameId);
            winnerName = tPlayer2;
            socket.close();
            return;
          }
        } else {
          if (gameData.players[0].player.score >= 3) {
            pauseGame(gameId);
            if (username != null) {
              winTournament(username);
            }
          } else if (gameData.players[1].player.score >= 3) {
            pauseGame(gameId);
            if (username2 != null) {
              winTournament(username2);
            }
          }
        }
        document.getElementById("player1-score")!.textContent = "0";
        document.getElementById("player2-score")!.textContent = "0";
      } else if (
        gameData.players[0].player.won === true ||
        gameData.players[1].player.won === true
      ) {
        pauseGame(gameId);
        if (multiplayerGameStarted === true) {
          if (gameData.players[0].player.won === true) {
            winnerName = gameData.players[0].player.username;
            if (gameData.players[0].player.username === username) {
              winTournament(username2 + " resigned you ");
            } else {
              lose();
            }
          } else if (gameData.players[1].player.won === true) {
            winnerName = gameData.players[1].player.username;
            if (gameData.players[1].player.username === username) {
              winTournament(username2 + " resigned you ");
            } else {
              lose();
            }
          }
        } else if (newpong === true) {
          if (gameData.players[0].player.won) {
            if (
              gameData.players[0].player.username === username ||
              gameData.players[2].player.username === username
            ) {
              winTournament(username2 + " resigned you ");
            } else {
              lose();
            }
          } else if (gameData.players[1].player.won) {
            if (
              gameData.players[1].player.username === username ||
              gameData.players[3].player.username === username
            ) {
              winTournament(username2 + " resigned you ");
            } else {
              lose();
            }
          }
        }
        document.getElementById("player1-score")!.textContent = "0";
        document.getElementById("player2-score")!.textContent = "0";
      }
    }
  };

  socket.onclose = () => {
    console.log("WebSocket disconnected");
  };

  socket.onerror = (err) => {
    console.error("WebSocket error", err);
  };
}

async function pauseGame(gameId: string) {
  if (!gameId) return null;
  try {
    const res = await fetch(`/api/game/${gameId}/pause`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const data: GameType = await res.json();

    if (!res.ok) {
      console.error("Game pause failed");
      return null;
    } else {
      console.log("Game paused:", data);
      gameState = data;
      return data.id;
    }
  } catch (err) {
    console.error("Network error during game creation:", err);
    return null;
  }
}

async function resumeGame(gameId: string) {
  if (!gameId) return null;
  try {
    const res = await fetch(`/api/game/${gameId}/unpause`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const data: GameType = await res.json();

    if (!res.ok) {
      console.error("Game resume failed");
      return null;
    } else {
      gameState = data;
      console.log("Game resume:", data);
      return data.id;
    }
  } catch (err) {
    console.error("Network error during game creation:", err);
    return null;
  }
}

async function win() {
  const winBtn = document.getElementById("win-message");
  const gameMenu = document.getElementById("game-menu");

  winBtn?.classList.remove("hidden");
  socket.close();
  history.replaceState({ page: "menu" }, "", "/");

  setTimeout(() => {
    winBtn?.classList.add("hidden");
    gameMenu?.classList.remove("hidden");
    // if (tournamentStarted === false) {
    //   location.reload();
    // }
  }, 10000);
  updateGameState({
    ballX: 480,
    ballY: 200,
    leftPaddleY: 200,
    rightPaddleY: 200,
  });
  newpong = false;
  gameStarted = false;
  //tournamentStarted = false;
  multiplayerGameStarted = false;
}

async function winTournament(wusername: string) {
  const winMsg = document.getElementById("tournament-win-message");
  const gameMenu = document.getElementById("game-menu");

  if (!winMsg) return;
  winMsg.textContent = `${wusername} won`;
  winMsg?.classList.remove("hidden");
  socket.close();
  history.replaceState({ page: "menu" }, "", "/");
  setTimeout(() => {
    winMsg?.classList.add("hidden");
    gameMenu?.classList.remove("hidden");
    //if (tournamentStarted === false) {
    //location.reload();
    //}
  }, 10000);
  updateGameState({
    ballX: 480,
    ballY: 200,
    leftPaddleY: 200,
    rightPaddleY: 200,
  });
  newpong = false;
  gameStarted = false;
  //tournamentStarted = false;
  multiplayerGameStarted = false;
}

async function lose() {
  const loseBtn = document.getElementById("lose-message");
  const gameMenu = document.getElementById("game-menu");

  socket.close();
  history.replaceState({ page: "menu" }, "", "/");

  loseBtn?.classList.remove("hidden");
  setTimeout(() => {
    loseBtn?.classList.add("hidden");
    gameMenu?.classList.remove("hidden");
    // if (tournamentStarted === false) {
    //   location.reload();
    // }
  }, 10000);
  updateGameState({
    ballX: 480,
    ballY: 200,
    leftPaddleY: 200,
    rightPaddleY: 200,
  });
  newpong = false;
  gameStarted = false;
  tournamentStarted = false;
  multiplayerGameStarted = false;
}

export async function fetchGameState(gameId: string) {
  try {
    const res = await fetch(`/api/game/${gameId}`, {
      headers: {
        Authorization: "Bearer " + token,
      },
    });
    const data: GameType = await res.json();

    if (!res.ok) {
      console.error("Failed to fetch game state");
    } else {
      gameState = data;
      updateGameState({
        ballX: data.ball.x,
        ballY: data.ball.y,
        leftPaddleY: data.players[0].paddle.y,
        rightPaddleY: data.players[1].paddle.y,
      });
    }
  } catch (err) {
    console.error("Network error while fetching game state:", err);
  }
}

async function loginGame() {
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();

    if (!res.ok) {
      console.error("New game creation failed:", data.error);
      return null;
    } else {
      token = data.token;
      if (token) {
        document.cookie = `token=${token}; path=/; max-age=86400; SameSite=Strict`;
      }
      return data.token;
    }
  } catch (err) {
    console.error("Network error during game creation:", err);
    return null;
  }
}

async function newGame(): Promise<string | null> {
  try {
    const res = await fetch("/api/game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({}),
    });

    const data: GameType = await res.json();

    if (!res.ok) {
      console.error("New game creation failed");
      return null;
    } else {
      gameState = data;
      console.log("New game created:", data);
      return data.id;
    }
  } catch (err) {
    console.error("Network error during game creation", err);
    return null;
  }
}

async function joinMultiplayerGame(): Promise<string | null> {
  try {
    const res = await fetch("/api/user/games", {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const data: GetGamesType = await res.json();

    if (!res.ok) {
      console.error("New game creation failed");
      return null;
    }

    gameId = data[0]?.id;
    if (!gameId) {
      console.error("No game ID found in response.");
      return null;
    }

    const res2 = await fetch(`/api/game/${gameId}`, {
      headers: {
        Authorization: "Bearer " + token,
      },
    });
    const data2: GameType = await res2.json();

    if (!res2.ok) {
      console.error("Failed to fetch game state");
    }

    gameState = data2;
    updateGameState({
      ballX: data2.ball.x,
      ballY: data2.ball.y,
      leftPaddleY: data2.players[0].paddle.y,
      rightPaddleY: data2.players[1].paddle.y,
    });
    if (gameState.players[0].player.username === username2) {
      return gameId;
    } else {
      await showCustomAlert("bad username2");
      return null;
    }
  } catch (err) {
    console.error("Network error during game creation:", err);
    return null;
  }
}

async function multiplayerGame(): Promise<string | null> {
  try {
    if (!username2) {
      return null;
    }
    const body: PostGameType = { opponents: [username2] };
    const res = await fetch("/api/game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(body),
    });

    const data: GameType = await res.json();

    if (!res.ok) {
      console.error("New game creation failed");
      return null;
    } else {
      gameState = data;
      console.log("New game created:", data);
      return data.id;
    }
  } catch (err) {
    console.error("Network error during game creation:", err);
    return null;
  }
}

async function newpongGame(): Promise<string | null> {
  try {
    if (!username2 || !username3 || !username4) {
      showCustomAlert("porcodio");
      return null;
    }
    const body: PostGameType = { opponents: [username2, username3, username4] };
    const res = await fetch("/api/game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(body),
    });

    const data: GameType = await res.json();

    if (!res.ok) {
      console.error("New game creation failed");
      return null;
    } else {
      gameState = data;
      console.log("New game created:", data);
      return data.id;
    }
  } catch (err) {
    console.error("Network error during game creation:", err);
    return null;
  }
}

function goToGame() {
  document.getElementById("menu")?.classList.add("hidden");
  document.getElementById("game")?.classList.remove("hidden");
}

history.pushState({ page: "menu" }, "", location.pathname);

document.addEventListener("DOMContentLoaded", () => {
  const toggleButton = document.getElementById("menuToggle");

  const gameMenu = document.getElementById("game-menu");
  const startButton = document.getElementById("start-game-btn");
  const tournamentButton = document.getElementById("start-tournament-btn");
  const multiplayerButton = document.getElementById("multiplayer-game-btn");
  const newpongButton = document.getElementById("newpong-game-btn");
  const joinNewpongButton = document.getElementById("join-newpong-game-btn");
  const joinMultiplayerButton = document.getElementById(
    "join-multiplayer-game-btn",
  );

  const inGameMenu = document.getElementById("in-game-menu");
  const resumeButton = document.getElementById("resume-game-btn");
  const exitButton = document.getElementById("exit-game-btn");

  const loginBtn = document.getElementById("show-login");
  const signUpBtn = document.getElementById("show-register");
  const signOutBtn = document.getElementById("show-signout");

  const startBtn = document.getElementById("start-message");
  const createBtn = document.getElementById("create-message");
  const joinBtn = document.getElementById("join-message");

  const tournamentMenu = document.getElementById("in-tournament-menu");
  const roundBtn = document.getElementById("round-btn");

  const leftPaddle2 = document.getElementById("leftPaddle2");
  const rightPaddle2 = document.getElementById("rightPaddle2");

  window.addEventListener("popstate", (event) => {
    //console.log("POPSTATE", event.state, "CURRENT STATE", history.state);
    const state = event.state;

    if (
      state?.page === "game" ||
      gameStarted === true ||
      newpong === true ||
      multiplayerGameStarted === true ||
      tournamentStarted === true
    ) {
      location.reload();
      if (tournamentStarted === true) {
        resetTournament();
      }
      //lose();
      socket.close();
      history.replaceState({ page: "menu" }, "", "/");

      newpong = false;
      gameStarted = false;
      tournamentStarted = false;
      multiplayerGameStarted = false;
      inGameMenu?.classList.add("hidden");
      gameMenu?.classList.remove("hidden");
    }
  });

  startButton?.addEventListener("click", async () => {
    if (username) {
      username2 = await showCustomPrompt("Enter friend username:");
      if (!username2) {
        //await showCustomAlert("Friend username can't be empty");
        return;
      }
      const id = await newGame();
      if (id) {
        gameId = id;
        initWebSocket(gameId, token);
        gameStarted = true;
        gameMenu?.classList.add("hidden");
        history.pushState({ page: "game", gameId }, "", `?game=${gameId}`);
        console.log("Game started! ID:", gameId);
        startBtn?.classList.remove("hidden");
        setTimeout(() => {
          startBtn?.classList.add("hidden");
        }, 1000);
        resumeGame(gameId);
      } else {
        await showCustomAlert("Failed to start game");
      }
      setupPlayerControls();
      if (username2 === "ai") {
        startAI(1);
      }
      //history.replaceState({ page: "game", gameId }, "", `?game=${gameId}`);
      goToGame();
    } else {
      await showCustomAlert("Failed to start game, you need to login");
    }
  });

  tournamentButton?.addEventListener("click", async () => {
    if (token && username) {
      tournamentStarted = true;
      history.pushState({ page: "game", gameId }, "", `?game=${gameId}`);
      promptTournamentPlayers();
    } else {
      await showCustomAlert("Failed to start game, you need to login");
    }
  });

  newpongButton?.addEventListener("click", async () => {
    if (token) {
      username2 = await showCustomPrompt("Enter friend username2:");
      if (!username2 || username2 === username) return;
      username3 = await showCustomPrompt("Enter friend username3:");
      if (!username3 || username3 === username || username3 === username2)
        return;
      username4 = await showCustomPrompt("Enter friend username4:");
      if (
        !username4 ||
        username4 === username ||
        username4 === username2 ||
        username4 === username3
      )
        return;
      const id = await newpongGame();
      if (id) {
        gameId = id;
        newpong = true;
        initWebSocket(gameId, token);
        await fetchGameState(gameId);
        gameMenu?.classList.add("hidden");
        leftPaddle2?.classList.remove("hidden");
        rightPaddle2?.classList.remove("hidden");
        console.log("Multiplayer Game started! ID:", gameId);
        createBtn?.classList.remove("hidden");
        setTimeout(() => {
          createBtn?.classList.add("hidden");
        }, 1000);
      } else {
        await showCustomAlert(
          "Failed to start multiplayer game, friend username empty",
        );
      }
    } else {
      await showCustomAlert(
        "Failed to start multiplayer game, you need to be logged in",
      );
    }
    setupPlayerControls();
    goToGame();
  });

  joinNewpongButton?.addEventListener("click", async () => {
    if (token) {
      username2 = await showCustomPrompt("Enter creator username:");
      if (!username2) return;
      const id = await joinMultiplayerGame();
      if (id) {
        gameId = id;
        newpong = true;
        initWebSocket(gameId, token);
        await fetchGameState(gameId);
        gameMenu?.classList.add("hidden");
        leftPaddle2?.classList.remove("hidden");
        rightPaddle2?.classList.remove("hidden");
        console.log("Multiplayer Game started! ID:", gameId);
        joinBtn?.classList.remove("hidden");
        setTimeout(() => {
          joinBtn?.classList.add("hidden");
        }, 1000);
      } else {
        await showCustomAlert("Failed to join multiplayer game");
      }
    } else {
      await showCustomAlert(
        "Failed to join multiplayer game, you need to be logged in",
      );
    }
    setupPlayerControls();
    goToGame();
  });

  multiplayerButton?.addEventListener("click", async () => {
    if (token) {
      username2 = await showCustomPrompt("Enter friend username:");
      if (!username2) return;
      const id = await multiplayerGame();
      if (id) {
        gameId = id;
        multiplayerGameStarted = true;
        initWebSocket(gameId, token);
        await fetchGameState(gameId);
        gameMenu?.classList.add("hidden");
        console.log("Multiplayer Game started! ID:", gameId);
        createBtn?.classList.remove("hidden");
        setTimeout(() => {
          createBtn?.classList.add("hidden");
        }, 1000);
      } else {
        await showCustomAlert(
          "Failed to start multiplayer game, friend username empty",
        );
      }
    } else {
      await showCustomAlert(
        "Failed to start multiplayer game, you need to be logged in",
      );
    }
    setupPlayerControls();
    goToGame();
  });

  joinMultiplayerButton?.addEventListener("click", async () => {
    if (token) {
      username2 = await showCustomPrompt("Enter creator username:");
      if (!username2) return;
      const id = await joinMultiplayerGame();
      if (id) {
        gameId = id;
        multiplayerGameStarted = true;
        initWebSocket(gameId, token);
        await fetchGameState(gameId);
        resumeGame(gameId);
        gameMenu?.classList.add("hidden");
        console.log("Multiplayer Game started! ID:", gameId);
        joinBtn?.classList.remove("hidden");
        setTimeout(() => {
          joinBtn?.classList.add("hidden");
        }, 1000);
      } else {
        await showCustomAlert("Failed to join multiplayer game");
      }
    } else {
      await showCustomAlert("Failed to start game, you need to login");
    }
    setupPlayerControls();
    goToGame();
  });

  loginBtn?.addEventListener("click", async () => {
    username = await showCustomPrompt("Enter your username:");
    if (!username) {
      await showCustomAlert("Username is required.");
      return;
    } else {
      if (username) {
        document.cookie = `username=${username}; path=/; max-age=86400; SameSite=Strict`;
      }
      document.getElementById("profile-username")!.textContent = username;
      document.getElementById("profile-initial")!.textContent =
        username[0].toUpperCase();
    }
    const token = await loginGame();
    if (token && username != null) {
      loginBtn?.classList.add("hidden");
      signUpBtn?.classList.add("hidden");
      signOutBtn?.classList.remove("hidden");
      console.log("Logged in with token:", token);
    } else {
      await showCustomAlert("Login failed.");
    }
  });

  exitButton?.addEventListener("click", () => {
    socket.close();
    // lose();
    history.replaceState({ page: "menu" }, "", "/");
    updateGameState({
      ballX: 480,
      ballY: 200,
      leftPaddleY: 200,
      rightPaddleY: 200,
    });

    if (tournamentStarted === true) {
      resetTournament();
    }

    newpong = false;
    gameStarted = false;
    tournamentStarted = false;
    multiplayerGameStarted = false;
    inGameMenu?.classList.add("hidden");
    gameMenu?.classList.remove("hidden");
  });

  toggleButton?.addEventListener("click", () => {
    if (multiplayerGameStarted === false) {
      pauseGame(gameId);
    }
    if (gameStarted || multiplayerGameStarted || newpong) {
      inGameMenu?.classList.remove("hidden");
    }
  });

  resumeButton?.addEventListener("click", () => {
    inGameMenu?.classList.add("hidden");
    gameMenu?.classList.add("hidden");
    tournamentMenu?.classList.add("hidden");
    resumeGame(gameId);
  });

  roundBtn?.addEventListener("click", () => {
    inGameMenu?.classList.add("hidden");
    gameMenu?.classList.add("hidden");
    tournamentMenu?.classList.add("hidden");
    resumeGame(gameId);
    startBtn?.classList.remove("hidden");
    setTimeout(() => {
      startBtn?.classList.add("hidden");
    }, 1000);
  });

  if (!username) {
    signOutBtn?.classList.add("hidden");
  }

  signOutBtn?.addEventListener("click", async () => {
    username = null;
    token = "0";
    document.cookie =
      "username=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict";
    document.cookie =
      "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict";
    loginBtn?.classList.remove("hidden");
    signUpBtn?.classList.remove("hidden");
    signOutBtn?.classList.add("hidden");
    document.getElementById("profile-username")!.textContent = "Username";
    document.getElementById("profile-initial")!.textContent = "U";
    location.replace("/menu");
  });
});

function updateGameState({
  ballX,
  ballY,
  leftPaddleY,
  rightPaddleY,
}: {
  ballX: number;
  ballY: number;
  leftPaddleY: number;
  rightPaddleY: number;
}) {
  const ball = document.getElementById("ball");
  const leftPaddle = document.getElementById("leftPaddle");
  const rightPaddle = document.getElementById("rightPaddle");

  if (ball) {
    ball.style.left = `${ballX}px`;
    ball.style.top = `${ballY}px`;
  }

  if (leftPaddle) {
    leftPaddle.style.top = `${leftPaddleY}px`;
  }

  if (rightPaddle) {
    rightPaddle.style.top = `${rightPaddleY}px`;
  }
}

function updateGameState2({
  ballX,
  ballY,
  leftPaddleY,
  rightPaddleY,
  leftPaddleY2,
  rightPaddleY2,
}: {
  ballX: number;
  ballY: number;
  leftPaddleY: number;
  rightPaddleY: number;
  leftPaddleY2: number;
  rightPaddleY2: number;
}) {
  const ball = document.getElementById("ball");
  const leftPaddle = document.getElementById("leftPaddle");
  const rightPaddle = document.getElementById("rightPaddle");
  const leftPaddle2 = document.getElementById("leftPaddle2");
  const rightPaddle2 = document.getElementById("rightPaddle2");

  if (ball) {
    ball.style.left = `${ballX}px`;
    ball.style.top = `${ballY}px`;
  }

  if (leftPaddle) {
    leftPaddle.style.top = `${leftPaddleY}px`;
  }

  if (rightPaddle) {
    rightPaddle.style.top = `${rightPaddleY}px`;
  }

  if (leftPaddle2) {
    leftPaddle2.style.top = `${leftPaddleY2}px`;
  }

  if (rightPaddle2) {
    rightPaddle2.style.top = `${rightPaddleY2}px`;
  }
}

let moving: boolean;

export function sendMove(key: string, moving: boolean) {
  let paddle: number;
  let direction: PaddleDirectionType;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (multiplayerGameStarted === true || newpong === true) {
    if (gameState.players[0].player.username === username) {
      paddle = 0;
    } else if (gameState.players[1].player.username === username) {
      paddle = 1;
    } else if (gameState.players[2].player.username === username) {
      paddle = 2;
    } else if (gameState.players[3].player.username === username) {
      paddle = 3;
    } else {
      return;
    }

    if (key === "w" || key === "ArrowUp") {
      direction = "up";
    } else if (key === "s" || key === "ArrowDown") {
      direction = "down";
    } else {
      return;
    }
  } else {
    if (key === "w") {
      paddle = 0;
      direction = "up";
    } else if (key === "s") {
      paddle = 0;
      direction = "down";
    } else if (key === "ArrowUp") {
      paddle = 1;
      direction = "up";
    } else if (key === "ArrowDown") {
      paddle = 1;
      direction = "down";
    } else {
      return;
    }
  }
  const payload: SocketDataType = {
    type: "paddle_move",
    payload: {
      paddle,
      direction,
      moving,
    },
  };
  socket.send(JSON.stringify(payload));
}

export function setupPlayerControls() {
  document.addEventListener("keydown", (e) => {
    moving = true;
    sendMove(e.key, moving);
  });

  document.addEventListener("keyup", (e) => {
    moving = false;
    sendMove(e.key, moving);
  });
}
