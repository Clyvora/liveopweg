function configuredRealtimeUrl(): URL | null {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL;
  return configured ? new URL(configured, window.location.origin) : null;
}

function isLocalDevelopmentHost(): boolean {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function realtimeWebSocketUrl(): string {
  const configured = configuredRealtimeUrl();
  if (configured) return configured.toString();
  if (isLocalDevelopmentHost()) {
    return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:8081/v1/realtime`;
  }
  return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/v1/realtime`;
}

export function realtimeHttpUrl(pathname: string): string {
  const url = configuredRealtimeUrl() ?? new URL(realtimeWebSocketUrl());
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}
