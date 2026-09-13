import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { TrainPanel, nextTrainStop, trainClock, trainDelay } from "./TrainPanel";
import type { RailJourney } from "../packages/protocol/journey";
import type { RailObservation } from "../packages/protocol/rail";
import { LanguageProvider } from "./LanguageContext";

const now = Date.parse("2026-09-09T12:30:00Z");
function stop(order: number, name: string, time: string, cancelled = false): RailJourney["stops"][number] {
  return { order, station: { code: `s${order}`, uicCode: null, shortName: name, mediumName: name, longName: name }, calls: { actual: !cancelled, planned: true }, arrival: { actualAt: time, plannedAt: time, exactDelaySeconds: 180, actualTrack: "5", plannedTrack: "3" }, departure: { actualAt: time, plannedAt: time, exactDelaySeconds: 180, actualTrack: "5", plannedTrack: "3" }, destination: { actual: null, planned: null }, changes: [] };
}
const stops = [stop(0,"Amsterdam Centraal","2026-09-09T12:22:00Z"),stop(1,"Amsterdam Amstel","2026-09-09T12:28:00Z"),stop(2,"Hilversum","2026-09-09T12:38:00Z"),stop(3,"Baarn","2026-09-09T12:45:00Z",true),stop(4,"Utrecht Centraal","2026-09-09T13:01:00Z")];
const observation = { vehicleId: "test", trainNumber: "1735", materialNumber: "8601", speed: { valueKmh:132 } } as RailObservation;
const journey = { stops, operator:"NS", trainCategory:{name:"Intercity",code:"IC"}, destination:{actual:"Utrecht Centraal",planned:"Utrecht Centraal"} } as RailJourney;
function render(j: RailJourney | null = journey, o = observation) { 
  return renderToStaticMarkup(
    createElement(LanguageProvider, null, 
      createElement(TrainPanel, { observation:o, journey:j, now, onClose() {} })
    )
  );
}

describe("train passenger panel", () => {
  it("selects the next served stop and skips passed and cancelled stops", () => {
    expect(nextTrainStop(stops, now)?.station.longName).toBe("Hilversum");
    expect(nextTrainStop(stops, Date.parse("2026-09-09T12:40:00Z"))?.station.longName).toBe("Utrecht Centraal");
    expect(nextTrainStop(stops, Date.parse("2026-09-09T14:00:00Z"))).toBeNull();
  });
  it("does not invent time or delay for missing data", () => {
    expect(trainClock(null)).toBe("—"); expect(trainDelay(null)).toBe("—");
    expect(trainDelay(0)).toBe("Op tijd"); expect(trainDelay(30)).toBe("+<1 min");
    const html=render(null,{...observation, materialNumber:null, speed:null});
    expect(html).toContain("Nog niet bekend"); expect(html).toContain("side-unknown.png");
    expect(html).not.toContain("132 km/u"); expect(html).not.toContain("Op tijd");
  });
  it("renders every stop, cancellations, changed tracks and next-stop status", () => {
    const html=render(); expect(html).toContain('aria-current="step"'); expect(html).toContain("Vervalt"); expect(html).toContain("Spoor gewijzigd: 5");
    expect(html).toContain("132 km/u"); expect(html).not.toContain("confidence"); expect(html).not.toContain("Delen");
    expect(html).not.toContain("Bezetting");
    const long=render({...journey,stops:Array.from({length:40},(_,i)=>stop(i,`Station ${i}`,"2026-09-09T13:00:00Z"))});
    expect(long).toContain("Station 39");
  });
  it("maps all five material families to locally available images", () => {
    for(const [number,family] of [["8601","virm"],["3101","icng"],["4001","icm"],["2301","sng"],["2401","slt"],["0","unknown"]]) {
      expect(render(journey,{...observation,materialNumber:number})).toContain(`side-${family}.png`);
      expect(readFileSync(`public/trains/side-${family}.png`).length).toBeGreaterThan(1000);
    }
  });
  it("keeps a served station eligible until its departure", () => {
    const dwelling = stop(0, "Hilversum", "2026-09-09T12:29:00Z");
    dwelling.departure.actualAt = "2026-09-09T12:32:00Z";
    expect(nextTrainStop([dwelling], now)).toBe(dwelling);
    expect(nextTrainStop([dwelling], Date.parse("2026-09-09T12:33:00Z"))).toBeNull();
  });
  it("shows a newly added stop in the journey", () => {
    const added = { ...stop(2, "Nieuw station", "2026-09-09T12:40:00Z"), calls: { actual: true, planned: false } };
    expect(render({ ...journey, stops: [...stops, added] })).toContain("Nieuw station");
  });
  it("shows unknown track and delay when neither is supplied", () => {
    const missing = stop(0, "Hilversum", "2026-09-09T12:38:00Z");
    for (const event of [missing.arrival, missing.departure]) {
      event.actualTrack = null;
      event.plannedTrack = null;
      event.exactDelaySeconds = null;
    }
    const html = render({ ...journey, stops: [missing] });
    expect(html).toContain("Spoor —");
    expect(html).not.toContain("Op tijd");
    expect(html).not.toContain("+3 min");
  });
});

if(process.env.TRAIN_PANEL_PREVIEW === "1") {
  mkdirSync(".wrangler",{recursive:true});
  const css=readFileSync("app/globals.css","utf8").replace(/^@import.*$/m,"")+readFileSync("app/train-panel.css","utf8");
  const html=render().replace(/src="\/trains\/([^"]+)"/g,(_,file)=>`src="data:image/png;base64,${readFileSync(`public/trains/${file}`).toString("base64")}"`);
  writeFileSync(".wrangler/train-panel-preview.html",`<!doctype html><html lang="nl"><meta charset="utf-8"><style>${css}</style><main class="shell" style="background:#dce8e8">${html}<div class="mapZoomControls"><button>+</button><button>−</button></div><div class="mapStylePicker">Kaartstijl</div></main></html>`);
}
