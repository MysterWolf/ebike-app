import { AppState } from '../state/types';

export function modeBaseline(rideMode: string): number {
  if (rideMode === 'MAX_RANGE') return 1.2;
  if (rideMode === 'SPORT' || rideMode === 'HARD') return 4.7;
  return 1.75; // CRUISER / CUSTOM
}

export function lastRideDraw(state: AppState): number | null {
  if (!state.rideLog || state.rideLog.length === 0) return null;
  const lastRide = [...state.rideLog].sort((a, b) => {
    const ta = a.logged_at ?? a.date;
    const tb = b.logged_at ?? b.date;
    return tb > ta ? 1 : -1;
  })[0];
  return lastRide.drawRate;
}

// Fix 3: fixed neutral anchor — mode switches no longer shift the blended average.
// 1.75 is the CRUISER midpoint; chosen as a stable, mode-independent prior.
const BASELINE_WEIGHT  = 20;   // virtual miles
const NEUTRAL_BASELINE = 1.75; // fixed anchor regardless of current rideMode

export function overallAvg(state: AppState): number {
  const rides = state.rideLog ?? [];
  const totalDist   = rides.reduce((sum, r) => sum + r.distance, 0);
  const weightedSum = rides.reduce((sum, r) => sum + r.drawRate * r.distance, 0);
  return (weightedSum + NEUTRAL_BASELINE * BASELINE_WEIGHT) / (totalDist + BASELINE_WEIGHT);
}

// Fix 1: optional batteryPct param — callers pass live BLE value when connected
// so the estimate reflects real-time state, not the last saved state.battery.
export function estRange(state: AppState, batteryPct?: number): number {
  const avg = overallAvg(state);
  if (avg <= 0) return 0;
  return (batteryPct ?? state.battery) / avg;
}

export function chargeTime(state: AppState, batteryPct?: number): number {
  const needed = Math.max(0, state.chargeTarget - (batteryPct ?? state.battery));
  if (state.chargerAmps <= 0) return 0;
  return (state.capacityAh * needed / 100 / state.chargerAmps) * 1.15;
}

export function nextService(odometer: number): number {
  return Math.ceil((odometer + 0.001) / 500) * 500;
}
