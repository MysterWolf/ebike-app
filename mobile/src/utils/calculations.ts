import { AppState } from '../state/types';

export function modeBaseline(rideMode: string): number {
  if (rideMode === 'MAX_RANGE') return 1.2;
  if (rideMode === 'HARD') return 4.7;
  return 1.75; // CRUISER
}

export function lastRideDraw(state: AppState): number | null {
  if (!state.rideLog || state.rideLog.length === 0) return null;
  return state.rideLog[state.rideLog.length - 1].drawRate;
}

const BASELINE_WEIGHT = 20; // virtual miles anchoring the mode baseline into the blend

export function overallAvg(state: AppState): number {
  const baseline = modeBaseline(state.rideMode);
  const rides = state.rideLog ?? [];
  const totalDist   = rides.reduce((sum, r) => sum + r.distance, 0);
  const weightedSum = rides.reduce((sum, r) => sum + r.drawRate * r.distance, 0);
  return (weightedSum + baseline * BASELINE_WEIGHT) / (totalDist + BASELINE_WEIGHT);
}

export function estRange(state: AppState): number {
  const avg = overallAvg(state);
  if (avg <= 0) return 0;
  return state.battery / avg;
}

export function chargeTime(state: AppState): number {
  const needed = Math.max(0, state.chargeTarget - state.battery);
  if (state.chargerAmps <= 0) return 0;
  return (state.capacityAh * needed / 100 / state.chargerAmps) * 1.15;
}

export function nextService(odometer: number): number {
  return Math.ceil((odometer + 0.001) / 500) * 500;
}
