// In-browser stand-in for backend/src (server.ts + game.service.ts), used only by the
// GitHub Pages demo. Same routes, same payloads and the same game loop, so the
// frontend runs unmodified with no server behind it.
import { PONG } from "../shared/constants.ts";
import type {
  BallType,
  GameIdType,
  GamePlayerType,
  GameType,
  PaddleType,
  PlayerType,
  SocketDataType,
  UsernameType,
} from "../shared/schemas.ts";

export interface Conn {
  send(data: string): void;
  close(): void;
}

export interface ConnHandlers {
  onMessage(data: string): void;
  onClose(): void;
}

export interface HttpResult {
  status: number;
  body: unknown;
}

type ServerGame = GameType & { sockets: Map<PlayerType, Conn> };

const TOKEN_PREFIX = "demo.";

export function signToken(username: string): string {
  return TOKEN_PREFIX + btoa(encodeURIComponent(JSON.stringify({ username })));
}

function verifyToken(token: string | null | undefined): UsernameType | null {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  try {
    const user = JSON.parse(decodeURIComponent(atob(token.slice(TOKEN_PREFIX.length))));
    return typeof user.username === "string" ? user.username : null;
  } catch {
    return null;
  }
}

function uuid(): string {
  return crypto.randomUUID?.() ??
    "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16),
    );
}

export class DemoServer {
  private games = new Map<string, ServerGame>();

  constructor() {
    setInterval(() => this.updateGames(), 16);
  }

  // ---- HTTP routes (mirror backend/src/server.ts) ----
  handle(method: string, path: string, authorization: string | null, body: unknown): HttpResult {
    const ok = (b: unknown): HttpResult => ({ status: 200, body: b });
    const err = (status: number, error: string): HttpResult => ({ status, body: { error } });

    if (method === "POST" && path === "/api/login") {
      const username = (body as { username?: unknown })?.username;
      if (
        typeof username !== "string" ||
        username.length < PONG.user.minLen ||
        username.length > PONG.user.maxLen
      ) {
        return err(400, "body/username must be between 1 and 10 characters");
      }
      return ok({ token: signToken(username) });
    }

    const username = verifyToken(authorization?.replace(/^Bearer\s+/i, ""));
    if (!username) return err(401, "Authorization token is invalid");

    if (method === "GET" && path === "/api/user") return ok({ username });

    if (method === "POST" && path === "/api/game") {
      const opponents = (body as { opponents?: string[] })?.opponents;
      let players: UsernameType[];
      if (opponents) {
        players = [username, ...opponents];
        if (players.length % 2) return err(404, "Invalid number of opponents");
      } else {
        players = [username, username];
      }
      return ok(this.publicGame(this.createGame(players)));
    }

    if (method === "GET" && path === "/api/user/games") return ok(this.getUserGameIds(username));

    const m = path.match(/^\/api\/game\/([^/]+)(?:\/(pause|unpause))?$/);
    if (m) {
      const [, id, action] = m;
      if (method === "GET" && !action) {
        const game = this.games.get(id);
        return game ? ok(this.publicGame(game)) : err(404, "Game not found");
      }
      if (method === "POST" && action) {
        const game = this.pauseGame(id, action === "pause");
        return game ? ok(this.publicGame(game)) : err(404, "Game not found");
      }
    }

    return err(404, `Route ${method}:${path} not found`);
  }

  // ---- WebSocket route /ws/game/:id?token= ----
  connect(gameId: string, token: string | null, conn: Conn): ConnHandlers | null {
    const game = this.games.get(gameId);
    const username = verifyToken(token);
    const found = game?.players.find((p) => p.player.username === username);
    if (!game || !username || !found) {
      conn.close();
      return null;
    }
    const handlers = this.addSocket(game, found.player, conn);
    const data: SocketDataType = { type: "game_state", payload: this.publicGame(game) };
    conn.send(JSON.stringify(data));
    return handlers;
  }

  // ---- game service (mirror backend/src/game.service.ts) ----
  private createGame(players: string[]): ServerGame {
    const gamePlayers: GamePlayerType[] = players.map((player, i) => {
      const paddleY =
        players.length > 2
          ? [
              PONG.map.ySize / 4 - PONG.paddle.ySize / 2,
              PONG.map.ySize * (3 / 4) - PONG.paddle.ySize / 2,
            ]
          : [PONG.map.ySize / 2 - PONG.paddle.ySize / 2];
      return {
        player: { username: player, score: 0, won: false },
        paddle: { y: paddleY[i < 2 ? 0 : 1], direction: "up", moving: false },
      };
    });
    const game: ServerGame = {
      id: uuid(),
      paused: true,
      players: gamePlayers,
      ball: { x: PONG.map.xSize / 2, y: PONG.map.ySize / 2, vx: 0, vy: 0 },
      sockets: new Map(),
    };
    this.resetBall(game.ball, -1);
    this.games.set(game.id, game);
    return game;
  }

  private addSocket(game: ServerGame, player: PlayerType, conn: Conn): ConnHandlers {
    game.sockets.set(player, conn);
    if (game.sockets.size === game.players.length) game.paused = false;
    return {
      onMessage: (message) => {
        const data: SocketDataType = JSON.parse(message);
        if (data?.type === "paddle_move") {
          const { paddle, direction, moving } = data.payload;
          const ref = game.players[paddle]?.paddle;
          if (ref) {
            ref.direction = direction;
            ref.moving = moving;
          }
        }
      },
      onClose: () => {
        if (!this.games.has(game.id)) return;
        if (game.players[0].player.score < 10 && game.players[1].player.score < 10) {
          const leftSide =
            player === game.players[0].player ||
            (game.players.length > 2 && player === game.players[2].player);
          game.players[leftSide ? 1 : 0].player.won = true;
        }
        game.sockets.delete(player);
        this.broadcast(game);
        for (const other of game.sockets.values()) other.close();
        this.games.delete(game.id);
      },
    };
  }

  private publicGame(game: ServerGame): GameType {
    const { id, paused, players, ball } = game;
    return {
      id,
      paused,
      players,
      ball: { ...ball, x: Math.round(ball.x), y: Math.round(ball.y) },
    };
  }

  private broadcast(game: ServerGame) {
    const data: SocketDataType = { type: "game_state", payload: this.publicGame(game) };
    const message = JSON.stringify(data);
    for (const conn of game.sockets.values()) conn.send(message);
  }

  private updateGames() {
    for (const game of this.games.values()) {
      if (game.paused) continue;
      let paddleCollision = false;
      for (const player of game.players) this.movePaddle(player.paddle);
      game.ball.x += game.ball.vx;
      game.ball.y += game.ball.vy;
      const r = PONG.ball.diameter / 2;
      if (game.ball.y - r <= 0 || game.ball.y + r >= PONG.map.ySize) {
        game.ball.vy *= -1;
      } else {
        for (let i = 0; i < game.players.length; i++) {
          const paddle = game.players[i].paddle;
          const inY =
            game.ball.y + r >= paddle.y && game.ball.y - r <= paddle.y + PONG.paddle.ySize;
          if (i % 2 === 0 && inY && game.ball.x - r <= PONG.paddle.xSize) {
            this.handlePaddleBounce(game.ball, paddle.y, 1);
            paddleCollision = true;
          } else if (i % 2 === 1 && inY && game.ball.x + r >= PONG.map.xSize - PONG.paddle.xSize) {
            this.handlePaddleBounce(game.ball, paddle.y, -1);
            paddleCollision = true;
          }
        }
      }
      if (paddleCollision) continue;
      if (game.ball.x - r <= 0) {
        game.players[1].player.score++;
        this.resetBall(game.ball, -1);
      } else if (game.ball.x + r >= PONG.map.xSize) {
        game.players[0].player.score++;
        this.resetBall(game.ball, 1);
      }
      this.broadcast(game);
      if (game.players[0].player.score === 10 || game.players[1].player.score === 10) {
        game.players[game.players[0].player.score === 10 ? 0 : 1].player.won = true;
        this.broadcast(game);
        this.games.delete(game.id);
      }
    }
  }

  private resetBall(ball: BallType, direction: number) {
    ball.x = PONG.map.xSize / 2;
    ball.y = PONG.map.ySize / 2;
    const speed = 5;
    const angle = (Math.random() * Math.PI) / 3 - Math.PI / 6;
    ball.vx = direction * speed * Math.cos(angle);
    ball.vy = speed * Math.sin(angle);
  }

  private handlePaddleBounce(ball: BallType, paddleY: number, direction: number) {
    const normalized = (ball.y - (paddleY + PONG.paddle.ySize / 2)) / (PONG.paddle.ySize / 2);
    const speed = Math.hypot(ball.vx, ball.vy) * 1.2;
    const bounceAngle = normalized * (Math.PI / 3);
    ball.vx = speed * Math.cos(bounceAngle) * direction;
    ball.vy = speed * Math.sin(bounceAngle);
  }

  private getUserGameIds(username: string): GameIdType[] {
    return [...this.games.values()]
      .filter((g) => g.players.some((p) => p.player.username === username))
      .map((g) => ({ id: g.id }));
  }

  private pauseGame(id: string, pause: boolean): ServerGame | undefined {
    const game = this.games.get(id);
    if (game) game.paused = pause;
    return game;
  }

  private movePaddle(paddle: PaddleType) {
    if (!paddle.moving) return;
    if (paddle.direction === "down") {
      paddle.y = Math.min(paddle.y + PONG.paddle.moveSpeed, PONG.map.ySize - PONG.paddle.ySize);
    } else {
      paddle.y = Math.max(paddle.y - PONG.paddle.moveSpeed, 0);
    }
  }
}
