import { describe, expect, it } from "vitest";
import type { RailObservation } from "../protocol/rail.js";
import { groupTrainServices } from "./train-service.js";
const now=Date.parse('2026-11-12T12:00:00Z');
const unit=(id:string,sequence:string,time=now)=>({vehicleId:id,observationId:id,trainNumber:'559',materialNumber:'8656',materialSequence:sequence,position:{longitude:5.11,latitude:52.09},gpsQuality:{fix:'1'},time:{sourceMeasuredAt:new Date(time).toISOString(),receivedAt:new Date(time).toISOString()},quality:{state:'FRESH_SOURCE',freshnessThresholdSeconds:30}} as RailObservation);
describe("passenger train grouping",()=>{
  it("keeps coupled units together and chooses the measured lead unit",()=>{
    const groups=groupTrainServices([unit('tail','2'),unit('head','1',now-4000)],now);
    expect(groups).toHaveLength(1);expect(groups[0].units).toHaveLength(2);expect(groups[0].primary.vehicleId).toBe('head');
  });
  it("does not choose an invalid or stale lead over a current second unit",()=>{
    const head=unit('head','1',now-60000),tail=unit('tail','2');
    expect(groupTrainServices([head,tail],now)[0].primary.vehicleId).toBe('tail');
    expect(groupTrainServices([{...head,time:tail.time,gpsQuality:{...head.gpsQuality,fix:'0'}},tail],now)[0].primary.vehicleId).toBe('tail');
  });
  it("keeps an explicit current material-unit selection accessible",()=>{
    expect(groupTrainServices([unit('head','1'),unit('tail','2')],now,'tail')[0].primary.vehicleId).toBe('tail');
  });
  it("does not duplicate a coupled train when its measurements straddle local midnight",()=>{
    const midnight=Date.parse('2026-11-12T23:00:05Z');
    expect(groupTrainServices([unit('head','1',midnight),unit('tail','2',midnight-10000)],midnight)).toHaveLength(1);
  });
});
