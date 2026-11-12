import type { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  train: <><rect x="6" y="3" width="12" height="15" rx="3" /><path d="M9 7h6M7 12h10M8 21l2-3m6 0 2 3" /><circle cx="9" cy="15" r=".5" /><circle cx="15" cy="15" r=".5" /></>,
  layers: <><path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5" /></>,
  moon: <path d="M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8Z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4m8-4v4M4 10h16" /></>,
  radar: <><circle cx="12" cy="12" r="8" /><path d="m12 12 5-5M12 4v2M4 12h2M12 18v2M18 12h2" /></>,
  stations: <><path d="M3 20h18M5 17V8l7-5 7 5v9M3 8h18M9 12h6M9 16h6" /></>,
  notices: <><path d="M6 10a6 6 0 0 1 12 0c0 6 2 6 2 6H4s2 0 2-6Z" /><path d="M10 20h4" /></>,
  favorites: <path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1.1 6.1-5.6-3-5.6 3 1.1-6.1L3 9.5l6.2-.9L12 3Z" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3H9Z" /></>,
  planner: <><circle cx="5" cy="18" r="2" /><circle cx="19" cy="5" r="2" /><path d="M7 18h5a4 4 0 0 0 0-8h-1a3 3 0 0 1 0-6h6" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  swap: <><path d="M8 3v16m-4-4 4 4 4-4M16 21V5m-4 4 4-4 4 4" /></>,
  back: <path d="m10 5-7 7 7 7M3 12h18" />,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="5" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8 10 7-4m-7 8 7 4" /></>,
};

export function AppIcon({ name }: { name: string }) {
  return <svg className="uiIcon" viewBox="0 0 24 24" aria-hidden="true">{paths[name] ?? paths.more}</svg>;
}

export function BrandMark() {
  return <svg className="radarBrandGlyph" viewBox="0 0 32 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M13 3 5 25M26 3l-8 22M7 7h23M5 12h23M3 17h23M1 22h23" /></svg>;
}
