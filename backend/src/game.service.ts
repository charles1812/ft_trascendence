import { PONG } from "@samir/shared/constants";
import {
  BallType,
  GameIdType,
  GamePlayerType,
  GameType,
  IdType,
  PaddleType,
  PlayerType,
  SocketDataType,
} from "@samir/shared/schemas";
import { v4 as uuidv4 } from "uuid";
import { WebSocket } from "@fastify/websocket";

export type GameServiceGame = GameType & {
  sockets: Map<PlayerType, WebSocket>;
};

class GameService {
  private games = new Map<IdType, GameServiceGame>();

  constructor() {
    setInterval(() => this.updateGames(), 16);
  }

  createGame(players: string[]): GameType {
    const id: IdType = uuidv4();
    const gamePlayers: GamePlayerType[] = [];
    let i: number = 0;
    for (const player of players) {
      const paddleY: number[] =
        players.length > 2
          ? [
              PONG.map.ySize / 4 - PONG.paddle.ySize / 2,
              PONG.map.ySize * (3 / 4) - PONG.paddle.ySize / 2,
            ]
          : [PONG.map.ySize / 2 - PONG.paddle.ySize / 2];
      gamePlayers.push({
        player: {
          username: player,
          score: 0,
          won: false,
        },
        paddle: {
          y: paddleY[i < 2 ? 0 : 1],
          direction: "up",
          moving: false,
        },
      });
      ++i;
    }
    const game: GameServiceGame = {
      id,
      paused: true,
      players: gamePlayers,
      ball: {
        x: PONG.map.xSize / 2,
        y: PONG.map.ySize / 2,
        vx: 0,
        vy: 0,
      },
      sockets: new Map(),
    };
    this.resetBall(game.ball, -1);
    this.games.set(id, game);
    return game;
  }

  addSocket(gameId: IdType, player: PlayerType, socket: WebSocket) {
    const game = this.games.get(gameId);
    if (!game) return;
    game.sockets.set(player, socket);
    socket.on("close", () => {
      console.log("Socket closed, game: ", game);
      if (
        game.players[0].player.score < 10 &&
        game.players[1].player.score < 10
      ) {
        const disconnectedPlayer: PlayerType | undefined = (() => {
          for (const [key, value] of game.sockets.entries()) {
            if (value === socket) {
              return key;
            }
          }
          return undefined;
        })();
        if (!disconnectedPlayer) return;
        game.sockets.delete(socket);
        if (
          disconnectedPlayer === game.players[0].player ||
          (game.players.length > 2 &&
            disconnectedPlayer === game.players[2].player)
        ) {
          game.players[1].player.won = true;
        } else {
          game.players[0].player.won = true;
        }
      }
      this.broadcast(gameId);
      for (const socket of game.sockets.values()) {
        socket.close();
      }
      this.games.delete(gameId);
    });
    socket.on("message", (message: string) => {
      const data: SocketDataType = JSON.parse(message);
      console.log("Socket message recieved: ", data);
      if (!data) return;
      if (data.type === "paddle_move") {
        const { paddle, direction, moving } = data.payload;
        const paddleRef = game.players[paddle].paddle;
        paddleRef.direction = direction;
        paddleRef.moving = moving;
      }
    });
    if (game.sockets.size === game.players.length) {
      game.paused = false;
    }
  }

  broadcast(gameId: IdType) {
    const game = this.games.get(gameId);
    if (!game) return;
    const data: SocketDataType = {
      type: "game_state",
      payload: game,
    };
    const message = JSON.stringify(data);
    for (const socket of game.sockets.values()) {
      socket.send(message);
    }
  }

  private updateGames() {
    for (const game of this.games.values()) {
      if (!game.paused) {
        let paddleCollison = false;
        // Paddle moves
        for (const player of game.players) {
          this.movePaddleSocket(player.paddle);
        }
        // Ball moves
        game.ball.x += game.ball.vx;
        game.ball.y += game.ball.vy;
        // Top and bottom wall
        if (
          game.ball.y - PONG.ball.diameter / 2 <= 0 ||
          game.ball.y + PONG.ball.diameter / 2 >= PONG.map.ySize
        ) {
          game.ball.vy *= -1;
        } else {
          for (let i = 0; i < game.players.length; i++) {
            const paddle = game.players[i].paddle;
            const isLeft = i % 2 === 0;
            const isRight = !isLeft;

            // Check collision for left paddles
            if (
              isLeft &&
              game.ball.x - PONG.ball.diameter / 2 <= PONG.paddle.xSize &&
              game.ball.y + PONG.ball.diameter / 2 >= paddle.y &&
              game.ball.y - PONG.ball.diameter / 2 <=
                paddle.y + PONG.paddle.ySize
            ) {
              this.handlePaddleBounce(game.ball, paddle.y, 1);
              paddleCollison = true;
            }
            // Check collision for right paddles
            else if (
              isRight &&
              game.ball.x + PONG.ball.diameter / 2 >=
                PONG.map.xSize - PONG.paddle.xSize &&
              game.ball.y + PONG.ball.diameter / 2 >= paddle.y &&
              game.ball.y - PONG.ball.diameter / 2 <=
                paddle.y + PONG.paddle.ySize
            ) {
              this.handlePaddleBounce(game.ball, paddle.y, -1);
              paddleCollison = true;
            }
          }
        }
        if (paddleCollison) continue;
        // Left wall
        else if (game.ball.x - PONG.ball.diameter / 2 <= 0) {
          game.players[1].player.score++;
          this.resetBall(game.ball, -1);
        }
        // Right wall
        else if (game.ball.x + PONG.ball.diameter / 2 >= PONG.map.xSize) {
          game.players[0].player.score++;
          this.resetBall(game.ball, 1);
        }
        this.broadcast(game.id);
        if (
          game.players[0].player.score === 10 ||
          game.players[1].player.score === 10
        ) {
          game.players[game.players[0].player.score === 10 ? 0 : 1].player.won =
            true;
          this.broadcast(game.id);
          this.games.delete(game.id);
        }
      }
    }
  }

  resetBall(ball: BallType, direction: number) {
    ball.x = PONG.map.xSize / 2;
    ball.y = PONG.map.ySize / 2;

    const speed = 5;
    const angle = (Math.random() * Math.PI) / 3 - Math.PI / 6;
    ball.vx = direction * speed * Math.cos(angle);
    ball.vy = speed * Math.sin(angle);
  }

  handlePaddleBounce(ball: BallType, paddleY: number, direction: number) {
    const paddleCenter = paddleY + PONG.paddle.ySize / 2;
    const distanceFromCenter = ball.y - paddleCenter;
    const normalized = distanceFromCenter / (PONG.paddle.ySize / 2);

    const speed = Math.hypot(ball.vx, ball.vy) * 1.2;
    const maxBounceAngle = Math.PI / 3;

    const bounceAngle = normalized * maxBounceAngle;

    ball.vx = speed * Math.cos(bounceAngle) * direction;
    ball.vy = speed * Math.sin(bounceAngle);
  }

  getUserGameIds(username: string): GameIdType[] {
    return Array.from(this.games.values())
      .filter((game) =>
        game.players.some((player) => player.player.username === username),
      )
      .map((game) => ({ id: game.id }));
  }

  getGame(id: IdType): GameType | undefined {
    return this.games.get(id);
  }

  pauseGame(id: IdType, pause: boolean): GameType | undefined {
    const game = this.games.get(id);
    if (!game) return undefined;
    game.paused = pause;
    return game;
  }

  movePaddleSocket(paddle: PaddleType) {
    if (paddle.moving === true) {
      if (paddle.direction === "down") {
        paddle.y = Math.min(
          paddle.y + PONG.paddle.moveSpeed,
          PONG.map.ySize - PONG.paddle.ySize,
        );
      } else if (paddle.direction === "up") {
        paddle.y = Math.max(paddle.y - PONG.paddle.moveSpeed, 0);
      }
    }
  }
}

export const gameService = new GameService();
