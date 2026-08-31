import type { RailObservation } from "../protocol/rail.js";

export const DEFAULT_RENDER_DELAY_MS = 12_000;
const MAX_PLAUSIBLE_SEGMENT_SPEED_KMH = 350;

export type RenderMode = "SOURCE_HOLD" | "INTERPOLATED" | "STALE_HOLD";

export interface MotionSample {
  previous: RailObservation | null;
  current: RailObservation;
}

export interface ConfidenceBreakdown {
  positionAge: number;
  gpsQuality: number | null;
  movementPlausibility: number;
  renderMethod: number;
  final: number;
  band: "HIGH" | "MEDIUM" | "LOW";
}

export interface RenderedMotion {
  longitude: number;
  latitude: number;
  sourceLongitude: number;
  sourceLatitude: number;
  sourceAgeSeconds: number;
  renderDelaySeconds: number;
  progress: number | null;
  mode: RenderMode;
  stale: boolean;
  confidence: ConfidenceBreakdown;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function observationTime(observation: RailObservation): number {
  return Date.parse(observation.time.sourceMeasuredAt ?? observation.time.receivedAt);
}

function distanceMeters(left: RailObservation, right: RailObservation): number {
  const radius = 6_371_000;
  const latitude1 = left.position.latitude * Math.PI / 180;
  const latitude2 = right.position.latitude * Math.PI / 180;
  const latitudeDelta = (right.position.latitude - left.position.latitude) * Math.PI / 180;
  const longitudeDelta = (right.position.longitude - left.position.longitude) * Math.PI / 180;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function gpsQuality(observation: RailObservation): number | null {
  if (observation.gpsQuality.hdop !== null) {
    return clamp(1 - Math.max(0, observation.gpsQuality.hdop - 1) / 9);
  }
  if (observation.gpsQuality.satellites !== null) {
    return clamp((observation.gpsQuality.satellites - 3) / 9);
  }
  return null;
}

function confidence(
  observation: RailObservation,
  sourceAgeSeconds: number,
  mode: RenderMode,
  movementPlausibility: number,
): ConfidenceBreakdown {
  const freshThreshold = observation.quality.freshnessThresholdSeconds;
  const staleStop = Math.max(freshThreshold + 10, 40);
  const positionAge = sourceAgeSeconds <= freshThreshold
    ? clamp(1 - 0.5 * (sourceAgeSeconds / freshThreshold))
    : clamp(0.5 * (1 - (sourceAgeSeconds - freshThreshold) / (staleStop - freshThreshold)));
  const measuredGpsQuality = gpsQuality(observation);
  const renderMethod = mode === "INTERPOLATED" ? 0.9 : mode === "SOURCE_HOLD" ? 1 : 0;
  const components = [
    { value: positionAge, weight: 0.6 },
    { value: renderMethod, weight: 0.25 },
    { value: movementPlausibility, weight: 0.15 },
  ];
  if (measuredGpsQuality !== null) components.push({ value: measuredGpsQuality, weight: 0.15 });
  const weight = components.reduce((sum, component) => sum + component.weight, 0);
  const weighted = clamp(components.reduce((sum, component) => sum + component.value * component.weight, 0) / weight);
  const final = movementPlausibility === 0 ? Math.min(weighted, 0.49) : weighted;
  return {
    positionAge,
    gpsQuality: measuredGpsQuality,
    movementPlausibility,
    renderMethod,
    final,
    band: final >= 0.8 ? "HIGH" : final >= 0.5 ? "MEDIUM" : "LOW",
  };
}

export function renderMotion(
  sample: MotionSample,
  nowMs: number,
  renderDelayMs = DEFAULT_RENDER_DELAY_MS,
): RenderedMotion {
  const currentTime = observationTime(sample.current);
  const sourceAgeSeconds = Math.max(0, (nowMs - currentTime) / 1_000);
  const stale = sourceAgeSeconds > sample.current.quality.freshnessThresholdSeconds;
  const targetTime = nowMs - renderDelayMs;
  let longitude = sample.current.position.longitude;
  let latitude = sample.current.position.latitude;
  let progress: number | null = null;
  let mode: RenderMode = stale ? "STALE_HOLD" : "SOURCE_HOLD";
  let movementPlausibility = 1;

  if (sample.previous) {
    const previousTime = observationTime(sample.previous);
    const elapsedSeconds = (currentTime - previousTime) / 1_000;
    if (elapsedSeconds > 0) {
      const segmentSpeedKmh = distanceMeters(sample.previous, sample.current) / elapsedSeconds * 3.6;
      movementPlausibility = segmentSpeedKmh <= MAX_PLAUSIBLE_SEGMENT_SPEED_KMH ? 1 : 0;
      if (!stale && movementPlausibility === 1 && targetTime >= previousTime && targetTime < currentTime) {
        progress = clamp((targetTime - previousTime) / (currentTime - previousTime));
        longitude = sample.previous.position.longitude
          + (sample.current.position.longitude - sample.previous.position.longitude) * progress;
        latitude = sample.previous.position.latitude
          + (sample.current.position.latitude - sample.previous.position.latitude) * progress;
        mode = "INTERPOLATED";
      } else if (!stale && targetTime < previousTime) {
        longitude = sample.previous.position.longitude;
        latitude = sample.previous.position.latitude;
      }
    }
  }

  return {
    longitude,
    latitude,
    sourceLongitude: sample.current.position.longitude,
    sourceLatitude: sample.current.position.latitude,
    sourceAgeSeconds,
    renderDelaySeconds: Math.max(0, (nowMs - targetTime) / 1_000),
    progress,
    mode,
    stale,
    confidence: confidence(sample.current, sourceAgeSeconds, mode, movementPlausibility),
  };
}
