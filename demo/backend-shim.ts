// Loaded before frontend/src/main.ts in the GitHub Pages build only.
// It answers the frontend's /api and /ws calls from an in-browser copy of the
// backend, so the static site is fully playable. The frontend code is untouched.
import { DemoServer, type ConnHandlers } from "./server-core.ts";
import type { FromServer, ToServer } from "./protocol.ts";

// ---------------------------------------------------------------------------
// Transport: one shared server for all tabs (SharedWorker), or a private one.
// ---------------------------------------------------------------------------
type Listener = (msg: FromServer) => void;

interface Transport {
  post(msg: ToServer): void;
  listen(fn: Listener): void;
}

function sharedTransport(): Transport | null {
  if (typeof SharedWorker === "undefined") return null;
  try {
    const worker = new SharedWorker(new URL("./server-worker.ts", import.meta.url), {
      type: "module",
      name: "pong-demo-server",
    });
    const listeners: Listener[] = [];
    worker.port.onmessage = (e: MessageEvent<FromServer>) => listeners.forEach((fn) => fn(e.data));
    worker.port.start();
    return { post: (msg) => worker.port.postMessage(msg), listen: (fn) => listeners.push(fn) };
  } catch {
    return null;
  }
}

function inlineTransport(): Transport {
  const server = new DemoServer();
  const listeners: Listener[] = [];
  const sockets = new Map<number, ConnHandlers>();
  // deliver asynchronously, like a network would
  const emit = (msg: FromServer) => setTimeout(() => listeners.forEach((fn) => fn(msg)));
  return {
    listen: (fn) => listeners.push(fn),
    post: (msg) => {
      if (msg.t === "http") {
        emit({ t: "http", id: msg.id, ...server.handle(msg.method, msg.path, msg.auth, msg.body) });
      } else if (msg.t === "ws-open") {
        const h = server.connect(msg.gameId, msg.token, {
          send: (data) => emit({ t: "ws-msg", sid: msg.sid, data }),
          close: () => {
            sockets.delete(msg.sid);
            emit({ t: "ws-close", sid: msg.sid });
          },
        });
        if (h) sockets.set(msg.sid, h);
      } else if (msg.t === "ws-send") {
        sockets.get(msg.sid)?.onMessage(msg.data);
      } else {
        const h = sockets.get(msg.sid);
        sockets.delete(msg.sid);
        h?.onClose();
      }
    },
  };
}

const transport = sharedTransport() ?? inlineTransport();
const pendingHttp = new Map<number, (res: { status: number; body: unknown }) => void>();
const openSockets = new Map<number, DemoSocket>();
let nextId = 1;

transport.listen((msg) => {
  if (msg.t === "http") {
    pendingHttp.get(msg.id)?.(msg);
    pendingHttp.delete(msg.id);
  } else if (msg.t === "ws-msg") {
    openSockets.get(msg.sid)?._receive(msg.data);
  } else {
    openSockets.get(msg.sid)?._serverClosed();
  }
});

// ---------------------------------------------------------------------------
// fetch: /api/* goes to the demo server, everything else to the network.
// ---------------------------------------------------------------------------
function apiPath(url: string): string | null {
  const { pathname, origin } = new URL(url, location.href);
  if (origin !== location.origin) return null;
  const i = pathname.indexOf("/api/");
  return i === -1 ? null : pathname.slice(i);
}

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  const path = apiPath(url);
  if (!path) return nativeFetch(input, init);

  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  let body: unknown;
  if (typeof init?.body === "string" && init.body) {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = undefined;
    }
  }
  const id = nextId++;
  const res = await new Promise<{ status: number; body: unknown }>((resolve) => {
    pendingHttp.set(id, resolve);
    transport.post({ t: "http", id, method, path, auth: headers.get("Authorization"), body });
  });
  return new Response(JSON.stringify(res.body), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};

// ---------------------------------------------------------------------------
// WebSocket: /ws/game/:id talks to the demo server through the transport.
// ---------------------------------------------------------------------------
const NativeWebSocket = window.WebSocket;

class DemoSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState = 0;
  url = "";
  readonly protocol = "";
  readonly extensions = "";
  binaryType: BinaryType = "blob";
  bufferedAmount = 0;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  private sid = nextId++;

  constructor(url: string | URL, protocols?: string | string[]) {
    super();
    const u = new URL(String(url), location.href);
    const m = u.pathname.match(/\/ws\/game\/([^/]+)$/);
    if (!m) return new NativeWebSocket(url, protocols) as unknown as DemoSocket;
    this.url = u.href;
    openSockets.set(this.sid, this);
    setTimeout(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.fire(new Event("open"), this.onopen);
      transport.post({ t: "ws-open", sid: this.sid, gameId: m[1], token: u.searchParams.get("token") });
      demoUi.socketsChanged();
    });
  }

  send(data: string) {
    if (this.readyState !== 1) return;
    transport.post({ t: "ws-send", sid: this.sid, data: String(data) });
  }

  close() {
    if (this.readyState >= 2) return;
    const wasOpen = this.readyState === 1;
    this.readyState = 2;
    if (wasOpen) transport.post({ t: "ws-close", sid: this.sid });
    setTimeout(() => this.finish());
  }

  _receive(data: string) {
    if (this.readyState === 1) this.fire(new MessageEvent("message", { data }), this.onmessage);
  }

  _serverClosed() {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    this.finish();
  }

  private finish() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    openSockets.delete(this.sid);
    this.fire(new CloseEvent("close", { code: 1000, wasClean: true }), this.onclose);
    demoUi.socketsChanged();
  }

  private fire<E extends Event>(ev: E, handler: ((ev: E) => void) | null) {
    handler?.call(this as unknown as WebSocket, ev);
    this.dispatchEvent(ev);
  }
}

window.WebSocket = DemoSocket as unknown as typeof WebSocket;

// close our sockets when the tab goes away, so the other player is told
window.addEventListener("pagehide", () => openSockets.forEach((s) => s.close()));

// ---------------------------------------------------------------------------
// Per-frame identities: the device lab loads two copies of the app side by
// side (iframe name "seat-1" / "seat-2"); each gets its own login cookies.
// ---------------------------------------------------------------------------
const seat = /^seat-\d+$/.test(window.name) ? window.name : "";
if (seat) {
  const desc = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;
  const prefix = `${seat}__`;
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get() {
      return (desc.get!.call(document) as string)
        .split(/;\s*/)
        .filter((c) => c.startsWith(prefix))
        .map((c) => c.slice(prefix.length))
        .join("; ");
    },
    set(value: string) {
      desc.set!.call(document, prefix + value);
    },
  });
}

// ---------------------------------------------------------------------------
// Demo chrome: credits ribbon, touch controls, small-screen fit.
// ---------------------------------------------------------------------------
const demoUi = (() => {
  const css = `
  #demo-ribbon { position: fixed; left: 12px; bottom: 12px; z-index: 60; max-width: calc(100vw - 24px);
    display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 14px; border-radius: 999px;
    background: rgba(17, 12, 12, .82); color: #fde68a; font: 500 12.5px/1.3 system-ui, sans-serif;
    box-shadow: 0 8px 30px rgba(0,0,0,.35); backdrop-filter: blur(6px); }
  #demo-ribbon a { color: #fff; text-decoration: underline; text-underline-offset: 2px; }
  #demo-ribbon button { all: unset; cursor: pointer; color: #fca5a5; padding: 0 6px; font-size: 16px; }
  #demo-ribbon.min .demo-more { display: none; }
  #demo-pads { position: fixed; inset: auto 0 0 0; z-index: 45; display: none; justify-content: space-between;
    padding: 0 14px calc(14px + env(safe-area-inset-bottom)); pointer-events: none; }
  #demo-pads.on { display: flex; }
  .demo-pad { display: flex; flex-direction: column; gap: 10px; pointer-events: auto; }
  .demo-pad button { width: 64px; height: 64px; border-radius: 18px; border: 2px solid rgba(253,230,138,.6);
    background: rgba(127, 29, 29, .75); color: #fde68a; font-size: 26px; touch-action: none;
    -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
  .demo-pad button:active, .demo-pad button.down { background: #fde68a; color: #7f1d1d; }
  .demo-pad small { color: #fde68a; text-align: center; font: 600 11px system-ui; opacity: .8; }
  #demo-pads.on ~ #demo-ribbon { display: none; }
  @media (max-width: 1040px) {
    #game-menu > div, #in-game-menu > div, #in-tournament-menu > div, #custom-prompt > div, #custom-alert > div {
      width: min(640px, calc(100vw - 24px)) !important; height: auto !important; min-height: 0 !important;
      padding: 28px 18px !important; }
    #game-menu .flex.space-x-4 { flex-wrap: wrap; justify-content: center; gap: 10px; }
    #game-menu .flex.space-x-4 > * { margin: 0 !important; }
    #game-menu h2 { font-size: 28px !important; }
    #tournament-queue { position: static !important; width: 100% !important; margin-top: 12px; }
  }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  let pads: HTMLElement | null = null;
  let board: HTMLElement | null = null;

  function fitBoard() {
    board ??= document.getElementById("game-container")?.parentElement ?? null;
    if (!board) return;
    const scale = Math.min(1, (window.innerWidth - 16) / 1000);
    board.style.zoom = scale < 1 ? String(scale) : "";
  }

  function key(k: string, down: boolean) {
    document.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: k, bubbles: true }));
  }

  function pad(label: string, up: string, down: string) {
    const el = document.createElement("div");
    el.className = "demo-pad";
    for (const [k, txt] of [[up, "▲"], [down, "▼"]] as const) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = txt;
      b.setAttribute("aria-label", `${label} ${txt === "▲" ? "up" : "down"}`);
      const press = (e: Event) => { e.preventDefault(); b.classList.add("down"); key(k, true); };
      const release = (e: Event) => { e.preventDefault(); if (b.classList.contains("down")) { b.classList.remove("down"); key(k, false); } };
      b.addEventListener("pointerdown", press);
      b.addEventListener("pointerup", release);
      b.addEventListener("pointerleave", release);
      b.addEventListener("pointercancel", release);
      b.addEventListener("contextmenu", (e) => e.preventDefault());
      el.appendChild(b);
    }
    const s = document.createElement("small");
    s.textContent = label;
    el.appendChild(s);
    return el;
  }

  function needsTouch() {
    return matchMedia("(pointer: coarse)").matches || window.innerWidth < 820;
  }

  function mount() {
    const ribbon = document.createElement("div");
    ribbon.id = "demo-ribbon";
    ribbon.innerHTML = `<span>🏓 <b>Live demo</b><span class="demo-more"> · backend simulated in your browser · frontend by
      <a href="https://github.com/charles1812" target="_blank" rel="noopener">@charles1812</a> ·
      <a href="https://github.com/charles1812/ft_trascendence" target="_blank" rel="noopener">source</a></span></span>
      <button type="button" aria-label="Collapse">×</button>`;
    ribbon.querySelector("button")!.addEventListener("click", () => ribbon.classList.toggle("min"));
    if (seat || sessionStorage.getItem("demo-ribbon-min")) ribbon.classList.add("min");
    ribbon.addEventListener("click", () => sessionStorage.setItem("demo-ribbon-min", "1"));

    pads = document.createElement("div");
    pads.id = "demo-pads";
    pads.append(pad("W / S", "w", "s"), pad("↑ / ↓", "ArrowUp", "ArrowDown"));
    document.body.append(pads, ribbon);

    fitBoard();
    window.addEventListener("resize", fitBoard);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  return {
    socketsChanged() {
      pads?.classList.toggle("on", openSockets.size > 0 && needsTouch());
    },
  };
})();
