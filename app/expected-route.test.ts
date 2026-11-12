import { describe, expect, it } from "vitest";
import { expectedRouteSchema } from "../packages/protocol/expected-route";

const route = { method:"EXPECTED_SHORTEST_TRACK_PATH", exactSwitchPathKnown:false, geometry:{type:"MultiLineString",coordinates:[[[5.11,52.09],[4.9,52.38]]]},stops:[],routedStops:1 };
describe("rail route boundary", () => {
  it("accepts a supplied route and an explicitly empty route", () => {
    expect(expectedRouteSchema.safeParse(route).success).toBe(true);
    expect(expectedRouteSchema.safeParse({...route,geometry:{...route.geometry,coordinates:[]},routedStops:0}).success).toBe(true);
  });
  it("rejects malformed, impossible or non-finite coordinates before rendering", () => {
    for (const coordinates of [null, [[5,52]], [[[5,95],[4,52]]], [[[Infinity,52],[4,52]]], [[[5,52]]]]) {
      expect(expectedRouteSchema.safeParse({...route,geometry:{...route.geometry,coordinates}}).success).toBe(false);
    }
  });
  it("rejects unsupported certainty and invalid stop metadata", () => {
    expect(expectedRouteSchema.safeParse({...route,exactSwitchPathKnown:true}).success).toBe(false);
    expect(expectedRouteSchema.safeParse({...route,stops:[{code:"UT",name:"Utrecht",arrivalAt:"yesterday",departureAt:null,delaySeconds:null}]}).success).toBe(false);
  });
});
