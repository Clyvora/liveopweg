import type { StationBoardEntry } from "../packages/protocol/station";

/** Track numbers 5a and 5b are sections of the same platform track. */
function platformTrack(track: string | null) {
  return (track?.trim().toUpperCase() ?? "").replace(/^(\d+)\s*[AB]$/, "$1");
}

export function departurePlatforms(entries: StationBoardEntry[]) {
  const tracks = entries.flatMap(entry => [platformTrack(entry.track), platformTrack(entry.plannedTrack)]);
  return [...new Set(tracks.filter(Boolean))].sort((left, right) => left.localeCompare(right, "nl", { numeric: true }));
}

export function movedFromPlatform(entry: StationBoardEntry, platform: string) {
  return Boolean(platform && entry.trackChanged && entry.track
    && platformTrack(entry.plannedTrack) === platform && platformTrack(entry.track) !== platform);
}

export function showsOnPlatform(entry: StationBoardEntry, platform: string) {
  return !platform || platformTrack(entry.track) === platform || movedFromPlatform(entry, platform)
    || (entry.cancelled && !entry.track && platformTrack(entry.plannedTrack) === platform);
}
