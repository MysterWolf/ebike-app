export const SPEED_ALERT_THRESHOLD_MPH = 28;

export function metersPerSecondToMph(mps: number): number {
  return mps * 2.23694;
}

export function metersToMiles(meters: number): number {
  return meters * 0.000621371;
}

export function haversineDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateAverageSpeed(readings: number[]): number {
  if (readings.length === 0) return 0;
  return readings.reduce((sum, v) => sum + v, 0) / readings.length;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function isOverSpeedLimit(speed: number): boolean {
  return speed > SPEED_ALERT_THRESHOLD_MPH;
}
