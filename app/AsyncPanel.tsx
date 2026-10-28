"use client";

import { Component, Suspense, type ReactNode } from "react";
import { useLanguage } from "./LanguageContext";

class PanelBoundary extends Component<{ children: ReactNode; message: string; retry: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <aside className="asyncPanelNotice" role="alert">
      <p>{this.props.message}</p>
      <button type="button" onClick={() => window.location.reload()}>{this.props.retry}</button>
    </aside>;
    return this.props.children;
  }
}

export function AsyncPanel({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const english = language === "en";
  return <PanelBoundary message={english ? "This panel could not be opened. Reload to get the latest version." : "Dit paneel kon niet worden geopend. Herlaad de pagina om de nieuwste versie op te halen."} retry={english ? "Reload page" : "Pagina herladen"}>
    <Suspense fallback={<aside className="asyncPanelNotice" role="status">{english ? "Opening panel…" : "Paneel openen…"}</aside>}>{children}</Suspense>
  </PanelBoundary>;
}
