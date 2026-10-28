export type Panel = { kind: "search" | "train" | "station" | "planner" | "stats" | "layers" | "nearby" | "stations" | "favorites" | "notices" | "more"; id?: string };
export type PanelNavigation = { current: Panel | null; history: Panel[] };
export type PanelAction = { type: "open"; panel: Panel } | { type: "toggle"; panel: Panel } | { type: "dismiss"; kinds: Panel["kind"][] } | { type: "back" } | { type: "close" };
export function panelReducer(state: PanelNavigation, action: PanelAction): PanelNavigation {
  if (action.type === "close") return { current: null, history: [] };
  if (action.type === "back") return { current: state.history.at(-1) ?? null, history: state.history.slice(0, -1) };
  if (action.type === "dismiss") return state.current && action.kinds.includes(state.current.kind) ? { ...state, current: null } : state;
  if (action.type === "toggle" && state.current?.kind === action.panel.kind) return { current: null, history: [] };
  if (state.current?.kind === action.panel.kind && state.current.id === action.panel.id) return state;
  return { current: action.panel, history: state.current ? [...state.history, state.current].slice(-12) : state.history };
}
