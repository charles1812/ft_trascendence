// src/ai.ts
import { sendMove, gameState } from "./main.ts";
import { PONG } from "@samir/shared/constants";

let aiInterval: NodeJS.Timeout | null = null;
let aiLastKey: "🤖" | "🦿" | null = null;

export function startAI(): void {
  if (aiInterval) return;
  const paddleX = PONG.map.xSize - PONG.paddle.xSize;
  const H = PONG.map.ySize;

  aiInterval = setInterval(() => {
    const { ball, players } = gameState;
    const paddle = players[1]?.paddle;
    if (!ball || !paddle) return;
    const dx = paddleX - ball.x;
    if (ball.vx === 0) return;
    const t = dx / ball.vx;
    if (t <= 0) return;

    let y = ball.y + ball.vy * t;
    const period = 2 * H;
    y = ((y % period) + period) % period;
    const predictedY = y > H ? period - y : y;

    const paddleCenter = paddle.y + PONG.paddle.ySize / 2;
    const delta = predictedY - paddleCenter;

    const DEAD_ZONE = 40;
    const MIN_HOLD = 100;
    const MAX_HOLD = 600;
    let desired: "🤖" | "🦿" | null = null;
    if (delta < -DEAD_ZONE) desired = "🤖";
    else if (delta > DEAD_ZONE) desired = "🦿";

    if (aiLastKey && aiLastKey !== desired) {
      sendMove(aiLastKey, false);
      aiLastKey = null;
    }
    if (desired) {
      sendMove(desired, true);
      aiLastKey = desired;

      // how far are we beyond the dead-zone?
      const overshoot = Math.max(0, Math.abs(delta) - DEAD_ZONE);
      // normalize to [0…1] over the remaining playfield height
      const ratio = Math.min(1, overshoot / (H / 2 - DEAD_ZONE));
      // linearly interpolate into your [MIN_HOLD…MAX_HOLD] window
      const holdTime = MIN_HOLD + ratio * (MAX_HOLD - MIN_HOLD);

      setTimeout(() => {
        if (aiLastKey === desired) {
          sendMove(desired, false);
          aiLastKey = null;
        }
      }, holdTime);
    } else if (aiLastKey) {
      sendMove(aiLastKey, false);
      aiLastKey = null;
    }
  }, 1000);
}

export function stopAI(): void {
  if (aiInterval) clearInterval(aiInterval);
  if (aiLastKey) sendMove(aiLastKey, false);
  aiInterval = null;
  aiLastKey = null;
}
