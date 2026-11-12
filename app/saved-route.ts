import type { RailStation } from "../packages/domain-rail/stations";

export type FollowedRoute = { originCode: string; originName: string; destinationCode: string; destinationName: string };

export function parseSavedRoute(raw: string | null, stations: RailStation[]): FollowedRoute | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || !("originCode" in value) || !("destinationCode" in value)) return null;
    const a = stations.find(station => station.code === value.originCode);
    const b = stations.find(station => station.code === value.destinationCode);
    return a && b && a.code !== b.code ? { originCode: a.code, originName: a.name, destinationCode: b.code, destinationName: b.name } : null;
  } catch { return null; }
}
