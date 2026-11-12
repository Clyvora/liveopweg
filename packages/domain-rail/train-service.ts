import type { RailObservation } from "../protocol/rail.js";
import { measurementTime, observationIsStale, validMeasuredPosition } from "./position-quality.js";
const date = new Intl.DateTimeFormat("en-CA", { timeZone:"Europe/Amsterdam", year:"numeric", month:"2-digit", day:"2-digit" });
export function observationServiceDate(observation: RailObservation): string {
  return date.format(new Date(measurementTime(observation) ?? Date.parse(observation.time.receivedAt)));
}
export interface TrainService { trainNumber:string; measurementDate:string; primary:RailObservation; units:RailObservation[] }
/** Coupled material units are one passenger train, with their own measured positions preserved. */
export function groupTrainServices(observations: RailObservation[], nowMs: number, selectedVehicleId?: string | null): TrainService[] {
  const groups = new Map<string, TrainService>();
  for (const observation of observations) {
    const measurementDate = observationServiceDate(observation);
    const key = observation.trainNumber;
    const group = groups.get(key);
    if (group) group.units.push(observation);
    else groups.set(key, { trainNumber:observation.trainNumber, measurementDate, primary:observation, units:[observation] });
  }
  const sequence = (o:RailObservation) => o.materialSequence && /^\d+$/.test(o.materialSequence) && Number(o.materialSequence)>0 ? Number(o.materialSequence) : Infinity;
  for (const group of groups.values()) {
    group.units.sort((a,b) => Number(!validMeasuredPosition(a))-Number(!validMeasuredPosition(b)) || Number(observationIsStale(a,nowMs))-Number(observationIsStale(b,nowMs)) || sequence(a)-sequence(b) || (measurementTime(b)??0)-(measurementTime(a)??0) || a.vehicleId.localeCompare(b.vehicleId));
    group.primary = group.units.find(o=>o.vehicleId===selectedVehicleId&&validMeasuredPosition(o)&&!observationIsStale(o,nowMs)) ?? group.units[0];
    group.measurementDate = observationServiceDate(group.primary);
  }
  return [...groups.values()].sort((a,b)=>a.trainNumber.localeCompare(b.trainNumber,"nl",{numeric:true}));
}
