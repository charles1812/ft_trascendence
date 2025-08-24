import "./style.css";
import type {
  GameType,
  GetGamesType,
  PaddleDirectionType,
  PostGameType,
  SocketDataType,
} from "@samir/shared/schemas";
import { t } from "./i18n";

import { startAI, stopAI } from "./ai";

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
export let aiControllingPaddle = false;
let socket: WebSocket;
export let gameState: GameType;
let players: Player[] = [];
let closeSocket = false;

type Player = {
  id: number;
  username: string;
};

function applyTranslations() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n")!;
    el.textContent = t(key);
  });
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

function showCustomAlert(
  key: string,
  vars: Record<string, string | number> = {},
): Promise<void> {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-alert")!;
    const alertMsg = document.getElementById("alert-message")!;
    const okBtn = document.getElementById("alert-ok")!;

    alertMsg.textContent = t(key, vars);
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

function showCustomPrompt(
  key: string,
  vars: Record<string, string | number> = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-prompt")!;
    const input = document.getElementById("prompt-input") as HTMLInputElement;
    const promptMsg = document.getElementById("prompt-message")!;
    const okBtn = document.getElementById("prompt-ok")!;
    const cancelBtn = document.getElementById("prompt-cancel")!;

    promptMsg.textContent = t(key, vars);
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
        showCustomAlert("Prompt cannot be empty!");
        return;
      }
      if (trimmed.length > 10) {
        showCustomAlert("alert.username_length");
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
    const ul = document.getElementById("match-queue-list")!;
    ul.innerHTML = "";

    players = players.sort(() => Math.random() - 0.5);

    const matchPairs: [Player, Player | null][] = [];
    for (let i = 0; i < players.length; i += 2) {
      matchPairs.push([players[i], players[i + 1] || null]);
    }

    for (const [p1, p2] of matchPairs) {
      const li = document.createElement("li");
      li.className =
        "flex items-center justify-center w-40 truncate px-4 py-2 " +
        "bg-red-900 bg-opacity-50 text-yellow-300 rounded " +
        "hover:bg-opacity-75 transition";

      const left = document.createElement("span");
      left.textContent = p1.username;
      left.className = "truncate flex-1 text-left";

      const vs = document.createElement("span");
      vs.textContent = "vs";
      vs.className = "px-2";

      const right = document.createElement("span");
      right.textContent = p2?.username ?? "(bye)";
      right.className = "truncate flex-1 text-right";

      li.append(left, vs, right);
      ul.appendChild(li);
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

      const p1Name = document.getElementById("player1-name");
      const p2Name = document.getElementById("player2-name");

      if (p1Name && p2Name) {
        p1Name.textContent = player1.username;
        tPlayer1 = player1.username;
        p2Name.textContent = player2.username;
        tPlayer2 = player2.username;
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

      const winner = await waitForWinnerName();
      twinner = winner;
      console.log(`Winner of match: ${winner}`);
      closeSocket = true;
      socket.close();

      nextRoundPlayers.push(winner === player1.username ? player1 : player2);

      winnerName = null;
    }

    players = nextRoundPlayers;
    round++;
  }
  winTournament(twinner);
  tournamentStarted = false;
  console.log(`\n🏆 Tournament Winner: ${twinner}`);
  resetTournament();
}

async function promptTournamentPlayers(): Promise<void> {
  const usernames = new Set<string>();

  let playerCountStr: string | null;
  let playerCount: number = 0;

  do {
    playerCountStr = await showCustomPrompt("prompt.enter_player_count");
    if (!playerCountStr) return;
    playerCount = parseInt(playerCountStr.trim());
  } while (isNaN(playerCount) || playerCount < 3 || playerCount > 10);

  if (!username) return;
  usernames.add(username);
  players.push({ id: 0 + 1, username });

  for (let i = 1; i < playerCount; i++) {
    let username: string | null;
    while (true) {
      username = await showCustomPrompt("prompt.enter_player_username", {
        player: i + 1,
      });
      if (!username) {
        await showCustomAlert("alert.username_required");
        resetTournament();
        return;
      }
      username = username.trim();
      if (username === "") {
        await showCustomAlert("alert.username_required");
      } else if (usernames.has(username)) {
        await showCustomAlert("alert.username_taken");
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
  const inGameMenu = document.getElementById("in-game-menu");
  const gameMenu = document.getElementById("game-menu");
  const leftPaddle2 = document.getElementById("leftPaddle2");
  const rightPaddle2 = document.getElementById("rightPaddle2");

  socket.onopen = () => {
    console.log("WebSocket connected");
    closeSocket = false;
  };

  socket.onmessage = (event) => {
    const data: SocketDataType = JSON.parse(event.data);
    if (data.type === "game_state") {
      const gameData: GameType = data.payload;
      gameState = gameData;
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
        closeSocket = true;
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
            winnerName = tPlayer1;
            closeSocket = true;
            socket.close();
            return;
          } else if (gameData.players[1].player.score >= 3) {
            winnerName = tPlayer2;
            closeSocket = true;
            socket.close();
            return;
          }
        } else {
          if (gameData.players[0].player.score >= 3) {
            if (username != null) {
              winTournament(username);
            }
          } else if (gameData.players[1].player.score >= 3) {
            if (username2 != null) {
              winTournament(username2);
            }
          }
        }
        setTimeout(() => {
          document.getElementById("player1-score")!.textContent = "0";
          document.getElementById("player2-score")!.textContent = "0";
        }, 5000);
      } else if (
        gameData.players[0].player.won === true ||
        gameData.players[1].player.won === true
      ) {
        pauseGame(gameId);
        if (multiplayerGameStarted === true) {
          if (gameData.players[0].player.won === true) {
            winnerName = gameData.players[0].player.username;
            if (gameData.players[0].player.username === username) {
              winTournament(gameData.players[0].player.username + "");
            } else {
              lose();
            }
          } else if (gameData.players[1].player.won === true) {
            winnerName = gameData.players[1].player.username;
            if (gameData.players[1].player.username === username) {
              winTournament(gameData.players[1].player.username + "");
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
              winTournament(
                gameData.players[0].player.username +
                  " & " +
                  gameData.players[2].player.username +
                  "",
              );
            } else {
              lose();
            }
          } else if (gameData.players[1].player.won) {
            if (
              gameData.players[1].player.username === username ||
              gameData.players[3].player.username === username
            ) {
              winTournament(
                gameData.players[1].player.username +
                  " & " +
                  gameData.players[3].player.username +
                  "",
              );
            } else {
              lose();
            }
          }
        }
        setTimeout(() => {
          document.getElementById("player1-score")!.textContent = "0";
          document.getElementById("player2-score")!.textContent = "0";
        }, 5000);
      }
    }
  };

  socket.onclose = () => {
    if (closeSocket === false) {
      if (history.state === "game") {
        history.replaceState({ page: "menu" }, "", "/");
      }
      updateGameState({
        ballX: 480,
        ballY: 200,
        leftPaddleY: 200,
        rightPaddleY: 200,
      });

      if (tournamentStarted === true) {
        resetTournament();
      }
      if (aiControllingPaddle === true) {
        stopAI();
      }
      leftPaddle2?.classList.add("hidden");
      rightPaddle2?.classList.add("hidden");
      username2 = null;
      username3 = null;
      username3 = null;
      newpong = false;
      gameStarted = false;
      tournamentStarted = false;
      aiControllingPaddle = false;
      multiplayerGameStarted = false;
      inGameMenu?.classList.add("hidden");
      gameMenu?.classList.remove("hidden");
      console.log("WebSocket disconnected");
    }
    leftPaddle2?.classList.add("hidden");
    rightPaddle2?.classList.add("hidden");
  };

  socket.onerror = (err) => {
    if (history.state === "game") {
      history.replaceState({ page: "menu" }, "", "/");
    }
    updateGameState({
      ballX: 480,
      ballY: 200,
      leftPaddleY: 200,
      rightPaddleY: 200,
    });

    if (tournamentStarted === true) {
      resetTournament();
    }
    if (aiControllingPaddle === true) {
      stopAI();
    }
    username2 = null;
    username3 = null;
    username3 = null;
    newpong = false;
    gameStarted = false;
    tournamentStarted = false;
    aiControllingPaddle = false;
    multiplayerGameStarted = false;
    inGameMenu?.classList.add("hidden");
    gameMenu?.classList.remove("hidden");
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
  const leftPaddle2 = document.getElementById("leftPaddle2");
  const rightPaddle2 = document.getElementById("rightPaddle2");

  winBtn?.classList.remove("hidden");
  closeSocket = true;
  socket.close();
  history.replaceState({ page: "menu" }, "", "/");

  setTimeout(() => {
    winBtn?.classList.add("hidden");
    gameMenu?.classList.remove("hidden");
  }, 5000);
  updateGameState({
    ballX: 480,
    ballY: 200,
    leftPaddleY: 200,
    rightPaddleY: 200,
  });
  if (aiControllingPaddle === true) {
    stopAI();
  }
  if (newpong === true) {
    leftPaddle2?.classList.add("hidden");
    rightPaddle2?.classList.add("hidden");
  }
  newpong = false;
  gameStarted = false;
  aiControllingPaddle = false;
  multiplayerGameStarted = false;
}

async function winTournament(wusername: string) {
  const winMsg = document.getElementById("tournament-win-message");
  const gameMenu = document.getElementById("game-menu");

  if (!winMsg) return;
  winMsg.textContent = `👑 ${wusername} 👑`;
  winMsg?.classList.remove("hidden");
  closeSocket = true;
  socket.close();
  history.replaceState({ page: "menu" }, "", "/");
  setTimeout(() => {
    winMsg?.classList.add("hidden");
    gameMenu?.classList.remove("hidden");
  }, 5000);
  updateGameState({
    ballX: 480,
    ballY: 200,
    leftPaddleY: 200,
    rightPaddleY: 200,
  });
  if (aiControllingPaddle === true) {
    stopAI();
  }
  newpong = false;
  gameStarted = false;
  tournamentStarted = false;
  aiControllingPaddle = false;
  multiplayerGameStarted = false;
}

async function lose() {
  const loseBtn = document.getElementById("lose-message");
  const gameMenu = document.getElementById("game-menu");
  const leftPaddle2 = document.getElementById("leftPaddle2");
  const rightPaddle2 = document.getElementById("rightPaddle2");

  closeSocket = true;
  socket.close();
  history.replaceState({ page: "menu" }, "", "/");

  loseBtn?.classList.remove("hidden");
  setTimeout(() => {
    loseBtn?.classList.add("hidden");
    gameMenu?.classList.remove("hidden");
  }, 5000);
  updateGameState({
    ballX: 480,
    ballY: 200,
    leftPaddleY: 200,
    rightPaddleY: 200,
  });
  if (aiControllingPaddle === true) {
    stopAI();
  }
  if (newpong === true) {
    leftPaddle2?.classList.add("hidden");
    rightPaddle2?.classList.add("hidden");
  }
  newpong = false;
  gameStarted = false;
  aiControllingPaddle = false;
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
      await showCustomAlert("alert.bad_username2");
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
  applyTranslations();
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
      if (aiControllingPaddle === true) {
        stopAI();
      }
      if (newpong === true) {
        leftPaddle2?.classList.add("hidden");
        rightPaddle2?.classList.add("hidden");
      }
      closeSocket = true;
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
      username2 = await showCustomPrompt("prompt.enter_friend_username1v1");
      if (!username2) {
        return;
      }
      if (username2 === "ai") {
        aiControllingPaddle = true;
        stopAI();
        startAI();
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
        await showCustomAlert("alert.failed_start_game");
      }
      setupPlayerControls();
      goToGame();
    } else {
      await showCustomAlert("alert.failed_login");
    }
  });

  tournamentButton?.addEventListener("click", async () => {
    if (token && username) {
      tournamentStarted = true;
      history.pushState({ page: "game", gameId }, "", `?game=${gameId}`);
      promptTournamentPlayers();
    } else {
      await showCustomAlert("alert.failed_login");
    }
  });

  newpongButton?.addEventListener("click", async () => {
    if (token) {
      username2 = await showCustomPrompt("prompt.enter_friend_username2");
      if (!username2 || username2 === username) return;
      username3 = await showCustomPrompt("prompt.enter_friend_username3");
      if (!username3 || username3 === username || username3 === username2)
        return;
      username4 = await showCustomPrompt("prompt.enter_friend_username4");
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
        await showCustomAlert("alert.failed_newpong");
      }
    } else {
      await showCustomAlert("alert.failed_create_game");
    }
    setupPlayerControls();
    goToGame();
  });

  joinNewpongButton?.addEventListener("click", async () => {
    if (token) {
      username2 = await showCustomPrompt("prompt.enter_friend_username");
      if (!username2) return;
      const id = await joinMultiplayerGame();
      if (id && gameState.players.length === 4) {
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
        await showCustomAlert("alert.failed_join_multiplayer");
      }
    } else {
      await showCustomAlert("alert.failed_join_login");
    }
    setupPlayerControls();
    goToGame();
  });

  multiplayerButton?.addEventListener("click", async () => {
    if (token) {
      username2 = await showCustomPrompt("prompt.enter_friend_username");
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
        await showCustomAlert("alert.failed_newpong");
      }
    } else {
      await showCustomAlert("alert.failed_create_game");
    }
    setupPlayerControls();
    goToGame();
  });

  joinMultiplayerButton?.addEventListener("click", async () => {
    if (token) {
      username2 = await showCustomPrompt("prompt.enter_friend_username");
      if (!username2) return;
      const id = await joinMultiplayerGame();
      if (id && gameState.players.length === 2) {
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
        await showCustomAlert("alert.failed_join_multiplayer");
      }
    } else {
      await showCustomAlert("alert.failed_join_multiplayer");
    }
    setupPlayerControls();
    goToGame();
  });

  loginBtn?.addEventListener("click", async () => {
    username = await showCustomPrompt("prompt.enter_username");
    if (!username) {
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
      await showCustomAlert("alert.failed_login");
    }
  });

  exitButton?.addEventListener("click", () => {
    closeSocket = true;
    socket.close();
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
    if (aiControllingPaddle === true) {
      stopAI();
    }
    if (newpong === true) {
      leftPaddle2?.classList.add("hidden");
      rightPaddle2?.classList.add("hidden");
    }
    username2 = null;
    username3 = null;
    username3 = null;
    newpong = false;
    gameStarted = false;
    tournamentStarted = false;
    aiControllingPaddle = false;
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
  let paddle: number | undefined;
  let direction: PaddleDirectionType;

  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (multiplayerGameStarted === true || newpong === true) {
    for (let i = 0; i < 4; i++) {
      if (gameState.players[i]?.player.username === username) {
        paddle = i;
        break;
      }
    }
    if (paddle === undefined) return;

    if (key === "w" || key === "ArrowUp") {
      direction = "up";
    } else if (key === "s" || key === "ArrowDown") {
      direction = "down";
    } else {
      return;
    }
  } else if (aiControllingPaddle === true) {
    if (key === "w") {
      paddle = 0;
      direction = "up";
    } else if (key === "s") {
      paddle = 0;
      direction = "down";
    } else if (key === "ArrowUp") {
      paddle = 0;
      direction = "up";
    } else if (key === "ArrowDown") {
      paddle = 0;
      direction = "down";
    } else if (key === "🤖") {
      paddle = 1;
      direction = "up";
    } else if (key === "🦿") {
      paddle = 1;
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

import { setLanguage, getCurrentLanguage } from "./i18n";

const supportedLanguages = ["en", "fr", "it", "nl", "pirate"];
const flags: Record<string, string> = {
  en: "🇬🇧",
  fr: "🇫🇷",
  it: "🇮🇹",
  nl: "🇳🇱",
  pirate: "🏴‍☠️",
};

const languageButton = document.getElementById(
  "languageToggle",
) as HTMLButtonElement;
const languageList = document.getElementById("languageList") as HTMLDivElement;

let currentLanguage = getCurrentLanguage();
updateButtonLabel(currentLanguage);

supportedLanguages.forEach((lang) => {
  const item = document.createElement("button");
  item.className = "p-2 text-yellow-300 hover:bg-gray-200 w-full text-left";
  item.textContent = `${flags[lang]} ${lang.toUpperCase()}`;
  item.addEventListener("click", () => {
    currentLanguage = lang;
    updateButtonLabel(currentLanguage);
    setLanguage(currentLanguage);
    toggleDropdown(false);
  });
  languageList.appendChild(item);
});

languageButton.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleDropdown();
});

document.addEventListener("click", () => {
  toggleDropdown(false);
});

function updateButtonLabel(lang: string) {
  languageButton.textContent = `${flags[lang]} ${lang.toUpperCase()} ▼`;
}

function toggleDropdown(show?: boolean) {
  const isVisible = !languageList.classList.contains("hidden");
  const shouldShow = show !== undefined ? show : !isVisible;

  if (shouldShow) {
    languageList.style.width = `${languageButton.offsetWidth}px`;
    languageList.classList.remove("hidden");
  } else {
    languageList.classList.add("hidden");
  }
}
