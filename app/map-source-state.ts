export function failedBaseMaps(event: { sourceId?: string; error?: { message?: string; url?: string } }): string[] {
  if (event.sourceId && ["base-standard", "base-light", "base-satellite"].includes(event.sourceId)) return [event.sourceId];
  const detail = `${event.error?.url ?? ""} ${event.error?.message ?? ""}`;
  if (detail.includes("https://tile.openstreetmap.org/")) return ["base-standard", "base-light"];
  if (detail.includes("https://server.arcgisonline.com/")) return ["base-satellite"];
  return [];
}
