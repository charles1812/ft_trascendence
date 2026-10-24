// Messages between a tab (demo/backend-shim.ts) and the in-browser server.
export type ToServer =
  | { t: "http"; id: number; method: string; path: string; auth: string | null; body: unknown }
  | { t: "ws-open"; sid: number; gameId: string; token: string | null }
  | { t: "ws-send"; sid: number; data: string }
  | { t: "ws-close"; sid: number };

export type FromServer =
  | { t: "http"; id: number; status: number; body: unknown }
  | { t: "ws-msg"; sid: number; data: string }
  | { t: "ws-close"; sid: number };
