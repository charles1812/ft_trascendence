import "@fastify/jwt";
import { UserType } from "@samir/shared/schemas";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: UserType;
    user: UserType;
  }
}
