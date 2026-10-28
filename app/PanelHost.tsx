"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLanguage } from "./LanguageContext";

export function PanelHost({ children, panelKey, onBack, onClose, memory }: { children: ReactNode; panelKey: string; onBack?: () => void; onClose: () => void; memory: Map<string, number> }) {
  const { language } = useLanguage(); const en = language === "en";
  const [expanded, setExpanded] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const dragged = useRef(false);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    host.current?.focus({ preventScroll: true });
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { host.current?.focus({ preventScroll: true }); }, [panelKey]);
  useEffect(() => {
    const element = host.current;
    if (element) element.scrollTop = memory.get(panelKey) ?? 0;
  }, [panelKey, memory]);
  useEffect(() => {
    const element = host.current;
    const handle = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    if (event.key === "Tab" && expanded && matchMedia("(max-width: 1023px)").matches) {
      const elements = [...(host.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,select,[tabindex="0"]') ?? [])].filter(element => element.getClientRects().length);
      if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0]?.focus(); }
    }
    };
    element?.addEventListener("keydown", handle);
    return () => element?.removeEventListener("keydown", handle);
  }, [expanded, onClose]);
  return <div className={`panelHost ${expanded ? "panelHostExpanded" : ""}`} ref={host} onScroll={event => memory.set(panelKey, event.currentTarget.scrollTop)} tabIndex={-1} role="dialog" aria-modal={false} aria-label={en ? "Information panel" : "Informatiepaneel"}>
    <div className="panelHostTools">
      {onBack && <button onClick={onBack} aria-label={en ? "Back" : "Terug"}>← <span>{en ? "Back" : "Terug"}</span></button>}
      <button className="panelResize" aria-expanded={expanded} onClick={() => { if (dragged.current) { dragged.current = false; return; } setExpanded(value => !value); }} onPointerDown={event => { dragged.current = false; start.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerCancel={() => { start.current = null; dragged.current = false; }} onPointerUp={event => { if (start.current !== null && Math.abs(event.clientY - start.current) > 35) { dragged.current = true; setExpanded(event.clientY < start.current); } start.current = null; }} aria-label={en ? "Expand or collapse panel" : "Paneel vergroten of verkleinen"}><i /><span>{expanded ? (en ? "Smaller" : "Kleiner") : (en ? "Expand" : "Vergroten")}</span></button>
    </div>
    {children}
  </div>;
}
