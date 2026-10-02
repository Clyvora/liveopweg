/** Return one key per continuously delayed train/stop, not per delay update. */
export function delayNotificationKey(
  vehicleId: string | null,
  stationCode: string | null,
  delaySeconds: number | null,
  permissionGranted: boolean,
): string | null {
  if (!vehicleId || !stationCode || delaySeconds === null || delaySeconds < 300 || !permissionGranted) return null;
  return `${vehicleId}:${stationCode}`;
}
