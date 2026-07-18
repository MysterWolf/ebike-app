import { ChargeSession } from '../state/types';

// 52V lithium tiered charge rate — %/minute. Defaults; refined per-session via calibration.
function baseRateAt(pct: number): number {
  if (pct < 20) return 1.5 / 10;  // 0-20%: fast
  if (pct < 80) return 1.0 / 10;  // 20-80%: steady
  return 0.5 / 10;                // 80-100%: slow
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// Walks forward from startPct across tier boundaries rather than applying
// one flat rate — a session can cross from one tier into the next partway through.
export function estimatePct(startPct: number, elapsedMinutes: number): number {
  let pct = startPct;
  let remaining = elapsedMinutes;
  while (remaining > 0 && pct < 100) {
    const tierCeiling = pct < 20 ? 20 : pct < 80 ? 80 : 100;
    const rate = baseRateAt(pct);
    const minutesToTierEnd = (tierCeiling - pct) / rate;
    const step = Math.min(remaining, minutesToTierEnd);
    pct += rate * step;
    remaining -= step;
  }
  return Math.min(100, pct);
}

export interface ChargeEstimateResult {
  pct: number;
  confidence: 'default' | 'calibrated';
}

export function currentChargeEstimate(session: ChargeSession, now: Date = new Date()): ChargeEstimateResult {
  if (!session.isCharging || session.startTime == null || session.startPct == null) {
    return { pct: session.startPct ?? 0, confidence: 'default' };
  }

  const anchorPct  = session.lastActualPct  ?? session.startPct;
  const anchorTime = session.lastActualTime ?? session.startTime;
  const elapsedMin = Math.max(0, (now.getTime() - Date.parse(anchorTime)) / 60000);

  if (session.calibration.length === 0) {
    return { pct: estimatePct(anchorPct, elapsedMin), confidence: 'default' };
  }

  // Scale the base rate using how far off the model was just before the most
  // recent correction — clamped so one bad reading can't blow up the estimate.
  const last = session.calibration[session.calibration.length - 1];
  const priorAnchorPct  = session.calibration.length > 1
    ? session.calibration[session.calibration.length - 2].actual
    : session.startPct;
  const modelDelta  = last.estimated - priorAnchorPct;
  const actualDelta = last.actual    - priorAnchorPct;
  const scale = modelDelta > 0 ? clamp(actualDelta / modelDelta, 0.4, 2.5) : 1;

  const rawEstimate = estimatePct(anchorPct, elapsedMin);
  const scaledEstimate = anchorPct + (rawEstimate - anchorPct) * scale;
  return { pct: clamp(scaledEstimate, 0, 100), confidence: 'calibrated' };
}

export function elapsedLabel(startTime: string, now: Date = new Date()): string {
  const totalMin = Math.max(0, Math.floor((now.getTime() - Date.parse(startTime)) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
