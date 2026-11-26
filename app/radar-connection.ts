import { realtimeWebSocketUrl } from "./realtime-url";

export type ConnectionState = "verbinden" | "live" | "herstellen" | "offline";

const openTimeout = 12_000;
const resyncTimeout = 8_000;
const resumeAfter = 20_000;

export function openRadarConnection(options: {
  feed: "rail" | "road";
  recovered: () => boolean;
  onStatus: (status: ConnectionState) => void;
  onSocket: (socket: WebSocket | null) => void;
  onOpen: (socket: WebSocket) => void;
  onMessage: (event: MessageEvent, socket: WebSocket) => boolean | void;
}) {
  let socket: WebSocket | null = null;
  let reconnect: number | undefined;
  let disposed = false;
  let attempt = 0;
  let deadline = 0;
  let lastReceipt: number | null = null;
  let resyncStarted: number | null = null;
  const idleTimeout = options.feed === "rail" ? 45_000 : 90_000;

  function retire(active: WebSocket) {
    if (disposed || socket !== active) return;
    socket = null;
    options.onSocket(null);
    options.onStatus("offline");
    active.close();
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt++, 5));
    reconnect = window.setTimeout(connect, delay + Math.random() * 500);
  }

  function checkConnection(resumed = false) {
    if (disposed || document.hidden) return;
    const active = socket;
    if (!active) {
      if (resumed) { window.clearTimeout(reconnect); connect(); }
      return;
    }
    const now = Date.now();
    if (active.readyState !== WebSocket.OPEN) {
      if (now >= deadline) retire(active);
      return;
    }
    if (resyncStarted !== null) {
      if (now - resyncStarted >= resyncTimeout) retire(active);
      return;
    }
    if (lastReceipt === null ? now < deadline : now - lastReceipt < (resumed ? resumeAfter : idleTimeout)) return;
    resyncStarted = now;
    options.onStatus("herstellen");
    active.send(JSON.stringify({ protocolVersion: 2, type: "resync" }));
  }

  function connect() {
    options.onStatus(options.recovered() ? "herstellen" : "verbinden");
    const url = new URL(realtimeWebSocketUrl());
    url.searchParams.set("feed", options.feed);
    const active = socket = new WebSocket(url);
    deadline = Date.now() + openTimeout;
    lastReceipt = null;
    resyncStarted = null;
    options.onSocket(active);
    active.onopen = () => {
      if (disposed || socket !== active) return;
      // An open socket does not guarantee that the data stream reached the browser.
      deadline = Date.now() + resyncTimeout;
      options.onOpen(active);
    };
    active.onmessage = event => {
      if (disposed || socket !== active || !options.onMessage(event, active)) return;
      lastReceipt = Date.now();
      resyncStarted = null;
      attempt = 0;
      options.onStatus("live");
    };
    active.onclose = active.onerror = () => retire(active);
  }

  const resume = () => checkConnection(true);
  const watchdog = window.setInterval(checkConnection, 4_000);
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("online", resume);
  connect();
  return () => {
    disposed = true;
    options.onSocket(null);
    window.clearTimeout(reconnect);
    window.clearInterval(watchdog);
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("online", resume);
    socket?.close();
  };
}
