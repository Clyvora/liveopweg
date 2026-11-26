import type { RoadEvent } from "../packages/protocol/road";

export function roadPlace(event: Pick<RoadEvent, "roadName" | "direction" | "description">) {
  const description = event.description?.trim() || null;
  const number = description?.match(/^(?:op\s+de\s+|on\s+the\s+)?([AN]\s?\d{1,3})\b/i)?.[1];
  const direction = event.direction && /^(?:richting|direction|towards?|naar)\s/i.test(event.direction) ? event.direction : null;
  return { name: event.roadName ?? number?.toUpperCase() ?? null, direction, description };
}
