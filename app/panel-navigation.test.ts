import { describe, expect, it } from "vitest";
import { panelReducer, type PanelNavigation } from "./panel-navigation";
describe("panel navigation", () => {
  it("keeps one primary pane and returns to the previous directory", () => {
    let state: PanelNavigation = { current: null, history: [] };
    state = panelReducer(state, { type: "open", panel: { kind: "stations" } });
    state = panelReducer(state, { type: "open", panel: { kind: "station", id: "UT" } });
    state = panelReducer(state, { type: "open", panel: { kind: "train", id: "1735" } });
    state = panelReducer(state, { type: "back" });
    expect(state.current).toEqual({ kind: "station", id: "UT" });
    state = panelReducer(state, { type: "back" });
    expect(state.current).toEqual({ kind: "stations" });
  });
  it("does not close a newly opened pane when an older pane is dismissed", () => {
    const state: PanelNavigation = { current: { kind: "planner" }, history: [{ kind: "train", id: "1" }] };
    expect(panelReducer(state, { type: "dismiss", kinds: ["train"] })).toEqual(state);
  });
  it("clears history when closing and avoids duplicate history entries", () => {
    const state: PanelNavigation = { current: { kind: "stations" }, history: [] };
    expect(panelReducer(state, { type: "open", panel: { kind: "stations" } })).toEqual(state);
    expect(panelReducer(state, { type: "close" })).toEqual({ current: null, history: [] });
  });
  it("restores the search text and toggles nearby without accumulating history", () => {
    let state: PanelNavigation = { current: { kind: "search", id: "Utrecht" }, history: [] };
    state = panelReducer(state, { type: "open", panel: { kind: "station", id: "UT" } });
    expect(panelReducer(state, { type: "back" }).current).toEqual({ kind: "search", id: "Utrecht" });
    state = panelReducer(state, { type: "toggle", panel: { kind: "nearby" } });
    expect(panelReducer(state, { type: "toggle", panel: { kind: "nearby" } })).toEqual({ current: null, history: [] });
  });
});
