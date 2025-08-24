import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AuthorizationHeader,
  Game,
  GameId,
  GameIdType,
  GameQuery,
  GameQueryType,
  GetGames,
  LoginBody,
  LoginBodyType,
  LoginResponse,
  PongError,
  PostGame,
  PostGameType,
  SocketDataType,
  User,
  UsernameType,
  UserType,
} from "@samir/shared/schemas";
import Fastify, { FastifyRequest } from "fastify";
import { gameService } from "./game.service.js";
import websocket from "@fastify/websocket";

const server = Fastify({
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

await server.register(cors, {
  origin: true,
});

await server.register(websocket);

await server.register(swagger, {
  openapi: {
    info: {
      title: "Pong Game API",
      description: "API documentation for the Pong game",
      version: "1.0.0",
    },
  },
});

await server.register(swaggerUI, {
  routePrefix: "/docs",
  uiConfig: {
    deepLinking: false,
  },
});

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

await server.register(jwt, {
  secret: JWT_SECRET,
});

server.decorate("authenticate", async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
});

server.get(
  "/api/user",
  {
    onRequest: [server.authenticate],
    schema: {
      response: {
        200: User,
      },
    },
  },
  async function (request) {
    return request.user;
  },
);

server.post(
  "/api/login",
  {
    schema: {
      body: LoginBody,
      response: {
        200: LoginResponse,
      },
    },
  },
  async function (request: FastifyRequest<{ Body: LoginBodyType }>) {
    const { username } = request.body;

    const user: UserType = { username: username };
    const token = server.jwt.sign(user);
    return { token };
  },
);

server.post(
  "/api/game",
  {
    onRequest: [server.authenticate],
    schema: {
      headers: AuthorizationHeader,
      body: PostGame,
      response: {
        200: Game,
        400: PongError,
      },
    },
  },
  async function (request: FastifyRequest<{ Body: PostGameType }>, reply) {
    const { username } = request.user;
    const { opponents } = request.body;
    let players: UsernameType[];
    if (opponents) {
      players = [username, ...opponents];
      if (players.length % 2) {
        return reply.status(404).send({ error: "Invalid number of opponents" });
      }
    } else {
      players = [username, username];
    }
    return gameService.createGame(players);
  },
);

server.get(
  "/api/user/games",
  {
    onRequest: [server.authenticate],
    schema: {
      response: {
        200: GetGames,
      },
    },
  },
  async function (request) {
    const { username } = request.user;
    return gameService.getUserGameIds(username);
  },
);

server.get(
  "/api/game/:id",
  {
    onRequest: [server.authenticate],
    schema: {
      headers: AuthorizationHeader,
      params: GameId,
      response: {
        200: Game,
        404: PongError,
      },
    },
  },
  async function (request: FastifyRequest<{ Params: GameIdType }>, reply) {
    const { id } = request.params;
    const game = gameService.getGame(id);
    if (!game) {
      return reply.status(404).send({ error: "Game not found" });
    }
    return game;
  },
);

server.post(
  "/api/game/:id/pause",
  {
    onRequest: [server.authenticate],
    schema: {
      headers: AuthorizationHeader,
      params: GameId,
      response: {
        200: Game,
        404: PongError,
      },
    },
  },
  async function (request: FastifyRequest<{ Params: GameIdType }>, reply) {
    const { id } = request.params;
    const game = gameService.pauseGame(id, true);
    if (!game) {
      return reply.status(404).send({ error: "Game not found" });
    }
    return game;
  },
);

server.post(
  "/api/game/:id/unpause",
  {
    onRequest: [server.authenticate],
    schema: {
      headers: AuthorizationHeader,
      params: GameId,
      response: {
        200: Game,
        404: PongError,
      },
    },
  },
  async function (request: FastifyRequest<{ Params: GameIdType }>, reply) {
    const { id } = request.params;
    const game = gameService.pauseGame(id, false);
    if (!game) {
      return reply.status(404).send({ error: "Game not found" });
    }
    return game;
  },
);

server.get(
  "/ws/game/:id",
  {
    websocket: true,
    schema: {
      params: GameId,
      querystring: GameQuery,
    },
  },
  (
    socket,
    request: FastifyRequest<{ Params: GameIdType; Querystring: GameQueryType }>,
  ) => {
    const { id } = request.params;
    const { token } = request.query;
    const game = gameService.getGame(id);
    if (!game || !token) {
      socket.close();
      return;
    }
    let username: UsernameType;
    try {
      const user = server.jwt.verify<UserType>(token);
      username = user.username;
    } catch {
      socket.close();
      return;
    }
    const found = game.players.find(
      (player) => player.player.username === username,
    );
    if (!found) {
      socket.close();
      return;
    }
    gameService.addSocket(id, found.player, socket);
    const data: SocketDataType = {
      type: "game_state",
      payload: game,
    };
    socket.send(JSON.stringify(data));
  },
);

const start = async () => {
  try {
    const port = parseInt(process.env.BACKEND_PORT || "3000", 10);
    const host = process.env.BACKEND_HOST || "0.0.0.0";

    await server.listen({ port, host });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
