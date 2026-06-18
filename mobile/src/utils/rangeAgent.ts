import { RideLogEntry } from '../state/types';

export interface RangeAgentInput {
  currentBatteryPct: number;
  currentMode:       string;
  rideHistory:       RideLogEntry[];
  liveDrawRate:      number | null;  // null if GPS dist < 0.5 mi or not riding
  neutralBaseline:   number;         // 1.75 — caller passes NEUTRAL_BASELINE constant
}

export interface RangeAgentOutput {
  estimatedRangeMiles: number;
  drawRateUsed:        number;
  confidence:          'low' | 'medium' | 'high';
  confidenceReason:    string;
  rideCount:           number;
  liveBlended:         boolean;
}

const MODE_LABEL: Record<string, string> = {
  MAX_RANGE: 'Max Range',
  CRUISER:   'Cruiser',
  SPORT:     'Sport',
  HARD:      'Sport',
  CUSTOM:    'Custom',
};

function normalizeMode(mode: string): string {
  return mode === 'HARD' ? 'SPORT' : mode;
}

export function runRangeAgent(input: RangeAgentInput): RangeAgentOutput {
  const { currentBatteryPct, currentMode, rideHistory, liveDrawRate, neutralBaseline } = input;

  // Rule 4 — outlier threshold: exclude rides > 2× the neutral baseline
  const OUTLIER_THRESHOLD  = 2 * neutralBaseline;
  const normalizedCurrent  = normalizeMode(currentMode);
  const modeLabel          = MODE_LABEL[currentMode] ?? currentMode;

  // Rule 1 — mode-specific rides with outliers removed
  const validRides = rideHistory.filter(r =>
    normalizeMode(r.rideMode ?? '') === normalizedCurrent &&
    r.distance > 0 &&
    r.drawRate != null && r.drawRate > 0 &&
    r.drawRate <= OUTLIER_THRESHOLD
  );

  const totalDist   = validRides.reduce((s, r) => s + r.distance, 0);
  const weightedSum = validRides.reduce((s, r) => s + r.drawRate! * r.distance, 0);
  const weightedAvg = totalDist > 0 ? weightedSum / totalDist : null;

  // Rule 5 — mode fallback: no valid history for this mode
  if (weightedAvg === null) {
    if (liveDrawRate != null && liveDrawRate > 0) {
      return {
        estimatedRangeMiles: Math.max(0, currentBatteryPct / liveDrawRate),
        drawRateUsed:        liveDrawRate,
        confidence:          'low',
        confidenceReason:    `No ${modeLabel} history — using live ride data`,
        rideCount:           0,
        liveBlended:         true,
      };
    }
    return {
      estimatedRangeMiles: Math.max(0, currentBatteryPct / neutralBaseline),
      drawRateUsed:        neutralBaseline,
      confidence:          'low',
      confidenceReason:    `No ride history for ${modeLabel} yet`,
      rideCount:           0,
      liveBlended:         false,
    };
  }

  const count = validRides.length;

  // Rule 2 — sample confidence from ride count
  let confidence: 'low' | 'medium' | 'high';
  let confidenceReason: string;
  if (count < 3) {
    confidence       = 'low';
    confidenceReason = `${count} ${modeLabel} ride${count !== 1 ? 's' : ''} logged — more improves accuracy`;
  } else if (count < 8) {
    confidence       = 'medium';
    confidenceReason = `Based on ${count} ${modeLabel} rides`;
  } else {
    confidence       = 'high';
    confidenceReason = `Based on ${count} ${modeLabel} rides`;
  }

  // Rule 3 — blend live draw rate 50/50 when available
  let drawRateUsed = weightedAvg;
  let liveBlended  = false;
  if (liveDrawRate != null && liveDrawRate > 0) {
    drawRateUsed    = (weightedAvg + liveDrawRate) / 2;
    liveBlended     = true;
    if (confidence === 'low') confidence = 'medium';
    confidenceReason += ' + live ride';
  }

  return {
    estimatedRangeMiles: Math.max(0, currentBatteryPct / drawRateUsed),
    drawRateUsed,
    confidence,
    confidenceReason,
    rideCount:  count,
    liveBlended,
  };
}
