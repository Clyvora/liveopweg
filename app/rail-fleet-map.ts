import type { Feature, Point } from "geojson";
import type { GeoJSONSource } from "maplibre-gl";
import type { RailObservation } from "../packages/protocol/rail";
import { trainMarkerIdentity } from "./train-map-preview";

type Position = { longitude: number; latitude: number };
type MappedTrain = { observation: RailObservation; position: Position; stale: boolean };

function mapTrainFeature({ observation, position, stale }: MappedTrain, selectedVehicleId: string | null) {
  const selected = observation.vehicleId === selectedVehicleId;
  const { shape, livery, front, ...identity } = trainMarkerIdentity(observation.trainNumber, observation.materialNumber);
  return {
    type: "Feature" as const,
    id: observation.vehicleId,
    geometry: { type: "Point" as const, coordinates: [position.longitude, position.latitude] },
    properties: {
      vehicleId: observation.vehicleId,
      ...identity,
      selected,
      priority: selected ? 2 : stale ? 0 : 1,
      hasHeading: !stale && observation.headingDegrees != null,
      heading: observation.headingDegrees ?? 0,
      icon: front ? `train-${livery}-${shape}:${front}` : `train-${livery}-${shape}`,
    },
  };
}

type FleetFeature = ReturnType<typeof mapTrainFeature>;
type FleetDiff = Parameters<GeoJSONSource["updateData"]>[0];

export function fleetMapUpdate(previous: ReadonlyMap<string, FleetFeature>, trains: MappedTrain[], selectedVehicleId: string | null) {
  const features = new Map<string, FleetFeature>();
  const add: Feature<Point>[] = [];
  const update: NonNullable<FleetDiff["update"]> = [];
  for (const train of trains) {
    const feature = mapTrainFeature(train, selectedVehicleId);
    const before = previous.get(feature.id);
    features.set(feature.id, feature);
    if (!before) {
      add.push(feature);
      continue;
    }
    const moved = before.geometry.coordinates[0] !== feature.geometry.coordinates[0] || before.geometry.coordinates[1] !== feature.geometry.coordinates[1];
    const properties = Object.keys(feature.properties) as (keyof FleetFeature["properties"])[];
    const changed = properties.filter(key => before.properties[key] !== feature.properties[key]);
    if (moved || changed.length) update.push({
      id: feature.id,
      ...(moved && { newGeometry: feature.geometry }),
      ...(changed.length && { addOrUpdateProperties: changed.map(key => ({ key, value: feature.properties[key] })) }),
    });
  }
  const remove = [...previous.keys()].filter(id => !features.has(id));
  const diff: FleetDiff | null = add.length || update.length || remove.length ? { add, update, remove } : null;
  return { features, diff };
}

export type FleetMapFeatures = ReturnType<typeof fleetMapUpdate>["features"];
