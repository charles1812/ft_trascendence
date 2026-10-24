// SharedWorker that hosts one DemoServer for every open tab of the demo,
// so "Multiplayer" / "Join Multiplayer" work between two tabs or two frames.
import { DemoServer, type ConnHandlers } from "./server-core.ts";
import type { ToServer } from "./protocol.ts";

const server = new DemoServer();
const scope = self as unknown as { onconnect: (e: MessageEvent) => void };

scope.onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  const sockets = new Map<number, ConnHandlers>();

  port.onmessage = ({ data }: MessageEvent<ToServer>) => {
    if (data.t === "http") {
      const res = server.handle(data.method, data.path, data.auth, data.body);
      port.postMessage({ t: "http", id: data.id, ...res });
    } else if (data.t === "ws-open") {
      const handlers = server.connect(data.gameId, data.token, {
        send: (msg) => port.postMessage({ t: "ws-msg", sid: data.sid, data: msg }),
        close: () => {
          sockets.delete(data.sid);
          port.postMessage({ t: "ws-close", sid: data.sid });
        },
      });
      if (handlers) sockets.set(data.sid, handlers);
    } else if (data.t === "ws-send") {
      sockets.get(data.sid)?.onMessage(data.data);
    } else if (data.t === "ws-close") {
      const handlers = sockets.get(data.sid);
      sockets.delete(data.sid);
      handlers?.onClose();
    }
  };
  port.start();
};
