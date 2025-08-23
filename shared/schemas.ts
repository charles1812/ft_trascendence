import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { PONG } from "./constants.js";

export const Username = Type.String({
  minLength: PONG.user.minLen,
  maxLength: PONG.user.maxLen,
});
export type UsernameType = Static<typeof Username>;

export const Id = Type.String({ format: "uuid" });
export type IdType = Static<typeof Id>;

export const Player = Type.Object({
  username: Username,
  score: Type.Integer({ minimum: 0, maximum: PONG.user.maxScore }),
  won: Type.Boolean(),
});
export type PlayerType = Static<typeof Player>;

export const PaddleDirection = Type.Union([
  Type.Literal("up"),
  Type.Literal("down"),
]);
export type PaddleDirectionType = Static<typeof PaddleDirection>;

export const Paddle = Type.Object({
  y: Type.Integer({
    minimum: 0,
    maximum: PONG.map.ySize - PONG.paddle.ySize,
  }),
  moving: Type.Boolean(),
  direction: PaddleDirection,
});
export type PaddleType = Static<typeof Paddle>;

export const PaddleName = Type.Union([
  Type.Literal("paddle1"),
  Type.Literal("paddle2"),
]);
export type PaddleNameType = Static<typeof PaddleName>;

export const User = Type.Object({
  username: Username,
});
export type UserType = Static<typeof User>;

export const Ball = Type.Object({
  x: Type.Integer({ minimum: 0, maximum: PONG.map.xSize }),
  y: Type.Integer({ minimum: 0, maximum: PONG.map.ySize }),
  vx: Type.Number(),
  vy: Type.Number(),
});
export type BallType = Static<typeof Ball>;

export const GamePlayer = Type.Object({
  player: Player,
  paddle: Paddle,
});
export type GamePlayerType = Static<typeof GamePlayer>;

export const Game = Type.Object({
  id: Id,
  paused: Type.Boolean(),
  players: Type.Array(GamePlayer, {
    minItems: PONG.game.minPlayers,
    maxItems: PONG.game.maxPlayers,
  }),
  ball: Ball,
});
export type GameType = Static<typeof Game>;

export const PaddleMove = Type.Object({
  paddle: Type.Integer({
    minimum: PONG.game.minPlayers - 1,
    maximum: PONG.game.maxPlayers - 1,
  }),
  direction: PaddleDirection,
  moving: Type.Boolean(),
});
export type PaddleMoveType = Static<typeof PaddleMove>;

export const SocketData = Type.Union([
  Type.Object({
    type: Type.Literal("game_state"),
    payload: Game,
  }),
  Type.Object({
    type: Type.Literal("paddle_move"),
    payload: PaddleMove,
  }),
]);
export type SocketDataType = Static<typeof SocketData>;

export const PongError = Type.Object({
  error: Type.String(),
});
export type PongErrorType = Static<typeof PongError>;

export const AuthorizationHeader = Type.Object({
  Authorization: Type.String(),
});
export type AuthorizationHeaderType = Static<typeof AuthorizationHeader>;

export const LoginBody = Type.Object({
  username: Type.String({
    minLength: PONG.user.minLen,
    maxLength: PONG.user.maxLen,
  }),
});
export type LoginBodyType = Static<typeof LoginBody>;

export const LoginResponse = Type.Object({
  token: Type.String(),
});
export type LoginResponseType = Static<typeof LoginResponse>;

export const GameId = Type.Object({
  id: Id,
});
export type GameIdType = Static<typeof GameId>;

export const GetGames = Type.Array(GameId);
export type GetGamesType = Static<typeof GetGames>;

export const PostGame = Type.Object({
  opponents: Type.Optional(
    Type.Array(
      Type.String({ minLength: PONG.user.minLen, maxLength: PONG.user.maxLen }),
      {
        uniqueItems: true,
        minItems: PONG.game.minPlayers - 1,
        maxItems: PONG.game.maxPlayers - 1,
      },
    ),
  ),
});
export type PostGameType = Static<typeof PostGame>;

export const GameQuery = Type.Object({
  token: Type.String(),
});
export type GameQueryType = Static<typeof GameQuery>;
