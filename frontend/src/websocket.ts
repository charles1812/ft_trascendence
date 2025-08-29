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