export type LocalPosition = [eastMeters: number, northMeters: number, upMeters: number];

export interface CurveSample {
  position: LocalPosition;
  tangent: LocalPosition;
  distanceMeters: number;
  progress: number;
}

export interface CarPlacement extends CurveSample {
  index: number;
  offsetFromCenterMeters: number;
}

function segmentLength(left: LocalPosition, right: LocalPosition): number {
  return Math.hypot(right[0] - left[0], right[1] - left[1], right[2] - left[2]);
}

export function curveLength(points: LocalPosition[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += segmentLength(points[index - 1], points[index]);
  return total;
}

export function sampleCurveAtDistance(points: LocalPosition[], requestedDistanceMeters: number): CurveSample | null {
  if (points.length < 2) return null;
  const total = curveLength(points);
  if (total <= 0) return null;
  const distanceMeters = Math.max(0, Math.min(total, requestedDistanceMeters));
  let traversed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    const length = segmentLength(left, right);
    if (length <= 0) continue;
    if (traversed + length >= distanceMeters || index === points.length - 1) {
      const segmentProgress = Math.max(0, Math.min(1, (distanceMeters - traversed) / length));
      return {
        position: [
          left[0] + (right[0] - left[0]) * segmentProgress,
          left[1] + (right[1] - left[1]) * segmentProgress,
          left[2] + (right[2] - left[2]) * segmentProgress,
        ],
        tangent: [
          (right[0] - left[0]) / length,
          (right[1] - left[1]) / length,
          (right[2] - left[2]) / length,
        ],
        distanceMeters,
        progress: distanceMeters / total,
      };
    }
    traversed += length;
  }
  return null;
}

export function placeCarsOnCurve(
  points: LocalPosition[],
  centerProgress: number,
  carCount: number,
  carLengthMeters: number,
  gapMeters: number,
): CarPlacement[] {
  if (!Number.isInteger(carCount) || carCount < 1 || carLengthMeters <= 0 || gapMeters < 0) return [];
  const total = curveLength(points);
  const centerDistance = Math.max(0, Math.min(1, centerProgress)) * total;
  const spacing = carLengthMeters + gapMeters;
  return Array.from({ length: carCount }, (_, index) => {
    const offsetFromCenterMeters = (index - (carCount - 1) / 2) * spacing;
    const sample = sampleCurveAtDistance(points, centerDistance + offsetFromCenterMeters);
    return sample ? { ...sample, index, offsetFromCenterMeters } : null;
  }).filter((placement): placement is CarPlacement => placement !== null);
}
