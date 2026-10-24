# ft_transcendence

A multiplayer **Pong** web app: 1v1 on one keyboard, against an AI, online 1v1 between two browsers,
2v2, and knockout tournaments, in 5 languages (EN, FR, IT, NL and Pirate). Built as a team project at 42 school.

### ▶️ [Play it in your browser](https://charles1812.github.io/ft_trascendence/) · 📱💻 [Phone + desktop device lab](https://charles1812.github.io/ft_trascendence/devices.html)

No install, no account: pick a username and play. On a phone, on-screen ▲▼ pads appear during a match.
In the device lab a desktop and a phone run side by side, so you can play a real online match between them.

## 👤 My role: frontend

**I designed and built the frontend** (`frontend/`): the whole interface and game client.

- Game screen and rendering driven by the server's game state over WebSocket
- Menus, in-game pause menu, custom prompt and alert dialogs, win / lose / champion screens
- Game modes on the client side: local 1v1, **AI opponent** (`frontend/src/ai.ts`, predicts the ball's bounce and moves the paddle like a player would), online 1v1, 2v2 and **tournaments** with random pairing, byes and a match queue
- Login flow with JWT stored in cookies, browser history handling
- **Internationalization** (`frontend/src/i18n.ts` + `frontend/locales/`), switchable live
- Built with TypeScript, Vite and Tailwind CSS

— Charles · [@charles1812](https://github.com/charles1812)

## Stack

| Part | Tech |
|------|------|
| Frontend | TypeScript, Vite, Tailwind CSS 4, nginx (HTTPS) |
| Backend | Node.js, Fastify, WebSocket, JWT, Swagger (`/docs`), TypeBox schemas shared with the frontend (`shared/`) |
| Extra | `clipongo/`: a terminal Pong client in Go that talks to the same API |
| Infra | Docker Compose |

## Run it locally (full stack)

    commandline: docker compose up -d

    navigator: http://transcendence.localhost:1080

## About the live demo

GitHub Pages can only host static files, so the online demo can't run the Fastify server. Instead,
[`demo/`](demo/) contains an in-browser copy of the backend: the same routes, the same JSON and the same
game loop as `backend/src`, running in a SharedWorker that every open tab shares. That's why online
multiplayer works between two tabs (or the two screens of the device lab).

The application code is **not modified** for the demo: [`demo/vite.config.js`](demo/vite.config.js) builds
`frontend/` as it is and loads [`demo/backend-shim.ts`](demo/backend-shim.ts) in front of it, which answers the
`/api` and `/ws` calls. The built site is published from the `gh-pages` branch.

```bash
# build the demo yourself
YARN_NODE_LINKER=node-modules yarn install
cd frontend && yarn vite build --config ../demo/vite.config.js   # output: demo/dist
```
