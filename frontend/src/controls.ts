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
