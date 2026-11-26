import { afterEach, describe, expect, it, vi } from "vitest";
import { openRadarConnection } from "./radar-connection";

vi.mock("./realtime-url", () => ({ realtimeWebSocketUrl: () => "wss://radar.example/v1/realtime" }));

class TestSocket {
  static OPEN = 1;
  static instances: TestSocket[] = [];
  readyState = 0;
  onopen?: () => void;
  onmessage?: (event: MessageEvent) => void;
  onclose?: () => void;
  onerror?: () => void;
  send = vi.fn();

  constructor() { TestSocket.instances.push(this); }
  open() { this.readyState = TestSocket.OPEN; this.onopen?.(); }
  receive(data: string) { this.onmessage?.(new MessageEvent("message", { data })); }
  close() { this.readyState = 3; this.onclose?.(); }
}

function start() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-26T09:00:00Z"));
  const page = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("window", Object.assign(new EventTarget(), { setTimeout, clearTimeout, setInterval, clearInterval }));
  vi.stubGlobal("document", page);
  vi.stubGlobal("WebSocket", TestSocket);
  const status = vi.fn();
  const stop = openRadarConnection({
    feed: "rail",
    recovered: () => true,
    onSocket: () => {},
    onStatus: status,
    onOpen: () => {},
    onMessage: event => event.data === "fleet",
  });
  return { socket: TestSocket.instances[0]!, status, stop, page };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  TestSocket.instances = [];
});

describe("radar realtime connection", () => {
  it("requests a snapshot and replaces an open connection which stops delivering data", () => {
    const { socket, status, stop } = start();
    socket.open();
    socket.receive("fleet");
    expect(status).toHaveBeenLastCalledWith("live");
    vi.advanceTimersByTime(40_000);
    socket.receive("other");
    vi.advanceTimersByTime(8_000);
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ protocolVersion: 2, type: "resync" }));
    expect(status).toHaveBeenLastCalledWith("herstellen");
    vi.advanceTimersByTime(10_000);
    expect(TestSocket.instances).toHaveLength(2);
    socket.receive("fleet");
    expect(status).not.toHaveBeenLastCalledWith("live");
    TestSocket.instances[1]!.open();
    TestSocket.instances[1]!.receive("fleet");
    expect(status).toHaveBeenLastCalledWith("live");
    stop();
  });

  it("refreshes when the page becomes visible again", () => {
    const { socket, status, stop, page } = start();
    socket.open();
    socket.receive("fleet");
    page.hidden = true;
    vi.advanceTimersByTime(60_000);
    expect(socket.send).not.toHaveBeenCalled();
    page.hidden = false;
    page.dispatchEvent(new Event("visibilitychange"));
    expect(socket.send).toHaveBeenCalledTimes(1);
    socket.receive("fleet");
    expect(status).toHaveBeenLastCalledWith("live");
    vi.advanceTimersByTime(12_000);
    expect(TestSocket.instances).toHaveLength(1);
    stop();
  });
});
