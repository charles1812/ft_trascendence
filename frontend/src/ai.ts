// src/ai.ts
import { sendMoveForAI, gameState } from "./main.ts"; // your existing move functions

//let aiInterval: NodeJS.Timeout | null = null;
//let aiActive = false;
let aiLastKey: string | null = null;
let key: string;

export async function startAI(paddleIndex: number) {
  //if (paddleIndex < 0 || paddleIndex > 3) return;
  //aiActive = true;

  setInterval(() => {
    paddleIndex = 0;

    const ballY = gameState.ball.y;
    //const reactionZone = 15 + Math.random() * 10; // Between 15 and 25 pixels
    const reactionZone = 1;

    const offset = 100 / 2; // Half paddle height
    const paddleCenterY = gameState.players[1].paddle.y + offset;

    // Simulate a delay in reaction and "zone of uncertainty"
    const verticalDelta = ballY - paddleCenterY;

    if (Math.abs(verticalDelta) > reactionZone) {
      key =
        verticalDelta < 0
          ? paddleIndex === 0 || paddleIndex === 1
            ? "w"
            : "ArrowUp"
          : paddleIndex === 0 || paddleIndex === 1
            ? "s"
            : "ArrowDown";

      // Stop previous movement if key has changed
      if (aiLastKey && aiLastKey !== key) {
        sendMoveForAI(paddleIndex, key, true);
        //console.log(`[AI] Stopping ${aiLastKey}`);
      }

      console.log(`[AI] Ball Y: ${ballY}, Paddle Y: ${paddleCenterY}, Δ: ${verticalDelta.toFixed(1)}`);

      sendMoveForAI(paddleIndex, key, true);
      aiLastKey = key;
    } else {
      // Within tolerance zone: stop movement
      if (aiLastKey) {
        sendMoveForAI(paddleIndex, key, true);
        //console.log(`[AI] Moving ${key} (true)`);
        aiLastKey = null;
      }
    }
  }, 1000); // Refresh every second
}

// export function stopAI() {
//   if (aiInterval) {
//     clearInterval(aiInterval);
//     aiInterval = null;
//   }
//   if (aiLastKey) {
//     sendMoveForAI(paddleIndex, key, false);
//     aiLastKey = null;
//   }
//   aiActive = false;
// }
