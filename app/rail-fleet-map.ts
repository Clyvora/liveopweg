import type { FeatureCollection, Point } from "geojson";
import type { RailObservation } from "../packages/protocol/rail";
import { trainMarkerIdentity } from "./train-map-preview";

type Position = { longitude: number; latitude: number };
type MappedTrain = { observation: RailObservation; position: Position; stale: boolean; matched: boolean };

export function fleetMapFeatures(trains: MappedTrain[], selectedVehicleId: string | null): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: trains.map(({ observation, position, stale, matched }) => {
      const selected = observation.vehicleId === selectedVehicleId;
      const { shape, livery, ...identity } = trainMarkerIdentity(observation.trainNumber, observation.materialNumber);
      return {
        type: "Feature",
        id: observation.vehicleId,
        geometry: { type: "Point", coordinates: [position.longitude, position.latitude] },
        properties: {
          vehicleId: observation.vehicleId,
          ...identity,
          selected,
          priority: selected ? 2 : stale ? 0 : 1,
          hasHeading: observation.headingDegrees != null,
          heading: observation.headingDegrees ?? 0,
          badge: stale ? "train-stale" : selected ? "train-selected" : matched ? "train-matched" : "train-gps",
          detailIcon: stale ? `train-stale-${shape}` : `train-${livery}-${shape}`,
          dotIcon: stale ? "train-stale-dot" : `train-${livery}-dot`,
        },
      };
    }),
  };
}
