import { realtimeWebSocketUrl } from "./realtime-url";

export type ConnectionState = "verbinden" | "live" | "herstellen" | "offline";

export function openRadarConnection(options: {
  feed: "rail" | "road";
  recovered: () => boolean;
  onStatus: (status: ConnectionState) => void;
  onSocket: (socket: WebSocket | null) => void;
  onOpen: (socket: WebSocket) => void;
  onMessage: (event: MessageEvent, socket: WebSocket) => void;
}) {
  let socket: WebSocket | null = null;
  let reconnect: number | undefined;
  let disposed = false;
  let attempt = 0;

  function connect() {
    options.onStatus(options.recovered() ? "herstellen" : "verbinden");
    const url = new URL(realtimeWebSocketUrl());
    url.searchParams.set("feed", options.feed);
    const active = socket = new WebSocket(url);
    options.onSocket(active);
    active.onopen = () => {
      if (disposed) return;
      attempt = 0;
      options.onStatus("live");
      options.onOpen(active);
    };
    active.onmessage = event => { if (!disposed) options.onMessage(event, active); };
    active.onclose = () => {
      if (disposed) return;
      options.onSocket(null);
      options.onStatus("offline");
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt++, 5));
      reconnect = window.setTimeout(connect, delay + Math.random() * 500);
    };
    active.onerror = () => active.close();
  }

  connect();
  return () => {
    disposed = true;
    options.onSocket(null);
    window.clearTimeout(reconnect);
    socket?.close();
  };
}
