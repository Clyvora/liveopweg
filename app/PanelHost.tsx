"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLanguage } from "./LanguageContext";
import { AppIcon } from "./Icons";

const subscribe = (listener: () => void) => {
  const query = matchMedia("(max-width: 1023px)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};

export function PanelHost({ children, panelKey, onBack, onClose, memory }: { children: ReactNode; panelKey: string; onBack?: () => void; onClose: () => void; memory: Map<string, number> }) {
  const { language } = useLanguage();
  const en = language === "en";
  const [expanded, setExpanded] = useState(false);
  const mobile = useSyncExternalStore(subscribe, () => matchMedia("(max-width: 1023px)").matches, () => false);
  const host = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const dragged = useRef(false);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const fallback = document.querySelector<HTMLElement>(".fleetTools input, .sideNav a");
      (opener?.isConnected ? opener : fallback)?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    host.current?.focus({ preventScroll: true });
    if (host.current) host.current.scrollTop = memory.get(panelKey) ?? 0;
  }, [panelKey, memory]);
  useEffect(() => {
    const element = host.current;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key !== "Tab" || !expanded || !mobile) return;
      const targets = [...(element?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? [])].filter(target => target.tabIndex >= 0 && target.getClientRects().length);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    element?.addEventListener("keydown", handle);
    return () => element?.removeEventListener("keydown", handle);
  }, [expanded, mobile, onClose]);
  return <div className={`panelHost ${expanded ? "panelHostExpanded" : ""}`} ref={host} onScroll={event => memory.set(panelKey, event.currentTarget.scrollTop)} tabIndex={-1} role="dialog" aria-modal={mobile && expanded} aria-label={en ? "Information panel" : "Informatiepaneel"}>
    <div className="panelHostTools">
      {onBack && <button className="panelBack" onClick={onBack} aria-label={en ? "Back" : "Terug"}><AppIcon name="back" /><span>{en ? "Back" : "Terug"}</span></button>}
      <button className="panelResize" aria-expanded={expanded} onClick={() => { if (dragged.current) { dragged.current = false; return; } setExpanded(value => !value); }} onPointerDown={event => { dragged.current = false; start.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerCancel={() => { start.current = null; dragged.current = false; }} onPointerUp={event => { if (start.current !== null && Math.abs(event.clientY - start.current) > 35) { dragged.current = true; setExpanded(event.clientY < start.current); } start.current = null; }} aria-label={en ? "Expand or collapse panel" : "Paneel vergroten of verkleinen"}><i /><span>{expanded ? (en ? "Smaller" : "Kleiner") : (en ? "Expand" : "Vergroten")}</span></button>
    </div>
    {children}
  </div>;
}
