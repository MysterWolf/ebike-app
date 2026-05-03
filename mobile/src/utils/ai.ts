import { AppState, Message } from '../state/types';
import {
  modeBaseline,
  lastRideDraw,
  overallAvg,
  estRange,
  chargeTime,
  nextService,
} from './calculations';

export function nowTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function buildSystem(): string {
  return `You are an E-Bike Range Analyst — a tactical mission advisor for urban e-bike riders. You provide precise, calculated guidance based on real telemetry data.

ABSOLUTE RULES — never break these:
• NEVER mention weather under any circumstances — this is strictly prohibited
• Do NOT use bridge phrases like "Given your history", "Based on your data", "Looking at your telemetry"
• Do NOT narrate telemetry back to the user — USE it to calculate, then give the answer
• Format all responses with **bold headers** and bullet points for mobile readability
• Every ride is called a "mission" — never "ride", "trip", or "journey"
• Every charge/charging session is called a "calibration event" — never "charge" or "charging"
• BMS calibration protocol = the 15% Floor Protocol followed by a 4–6 hour Green Light Soak
• Three ride modes: MAX RANGE (1.2%/mi, eco/efficient), CRUISER (1.75%/mi, moderate), HARD (4.7%/mi, aggressive/high-speed) — reference by name when relevant
• Occasionally suggest wildcard adjustments (gear swap, mode switch, route style) when appropriate
• Charging safety rules: hard surface only, away from exits, no over-soak except monthly deep calibration

RESPONSE STYLE:
• Lead with the key actionable insight
• Use **bold** for section headers and critical values
• Bullet points for lists and breakdowns
• Be concise and tactical — no padding, no pleasantries`;
}

function buildContext(state: AppState): string {
  const draw = lastRideDraw(state);
  const avg = overallAvg(state);
  const baseline = modeBaseline(state.rideMode);
  const range = estRange(state);
  const ct = chargeTime(state);
  const ns = nextService(state.odometer);
  const wh = state.voltage * state.capacityAh;
  const delta = draw !== null ? draw - baseline : null;

  let footwearDesc = state.footwear;
  if (state.footwear === 'Adidas Sambas') footwearDesc += ' (casual/low-profile power transfer)';
  else if (state.footwear === 'Weatherproof AF1s') footwearDesc += ' (heavy duty/high-speed stability)';
  else if (state.footwear === 'Other') footwearDesc = 'Other: ' + (state.footwearCustom || 'unspecified');

  let lockNote = '';
  if (state.lock === 'Cable lock') lockNote = ' [LOW SECURITY]';
  else if (state.lock === 'None') lockNote = ' [UNSECURED]';

  const totalMissionDist = state.rideLog.reduce((s, r) => s + r.distance, 0);
  const recentMissions = [...state.rideLog].reverse().slice(0, 5);
  const missionLines = recentMissions.length > 0
    ? recentMissions.map(r =>
        `    ${r.date.padEnd(18)}${r.distance.toFixed(1).padStart(5)} mi  ${String(r.batteryUsed).padStart(4)}%  ${r.drawRate.toFixed(2)} %/mi`
      ).join('\n')
    : '    No missions logged';

  const recentPressure = [...(state.tirePressureLog ?? [])].reverse().slice(0, 3);
  const pressureLines = recentPressure.length > 0
    ? recentPressure.map(e => `    ${e.date.padEnd(22)}F ${e.front} PSI  R ${e.rear} PSI`).join('\n')
    : '    No readings logged';

  const modeLabels: Record<string, string> = {
    MAX_RANGE: 'MAX RANGE — eco/efficient',
    CRUISER:   'CRUISER — moderate',
    HARD:      'HARD — aggressive/high-speed',
  };
  const modeLabel = modeLabels[state.rideMode] ?? state.rideMode;

  return `
╔═ TELEMETRY SNAPSHOT ═══════════════════════════
BIKE: ${state.make} (${state.year})
Electrical: ${state.voltage}V / ${state.capacityAh}Ah / ${wh}Wh total
Motor: ${state.motorWatts}W | Top Speed: ${state.topSpeed}mph | Weight: ${state.weightLbs}lbs | Tires: ${state.tireSize}

LIVE STATE:
  Odometer:       ${state.odometer.toFixed(1)} mi
  Battery:        ${state.battery}%
  Ride Mode:      ${modeLabel} (${baseline.toFixed(2)}%/mi baseline)
  Est. Range:     ${range.toFixed(1)} mi
  Charger:        ${state.chargerAmps}A → target ${state.chargeTarget}%
  Charge Time:    ${ct.toFixed(1)} hrs to target

EFFICIENCY:
  Last Mission:   ${draw !== null ? draw.toFixed(2) + ' %/mi' : 'no data'}
  Overall Avg:    ${avg.toFixed(2)} %/mi (weighted across ${state.rideLog.length} missions, ${totalMissionDist.toFixed(1)} mi total)
  Mode Baseline:  ${baseline.toFixed(2)} %/mi
  Delta:          ${delta !== null ? ((delta >= 0 ? '+' : '') + delta.toFixed(2) + ' %/mi vs profile') : 'no data'}

MISSION LOG (last 5 of ${state.rideLog.length}):
${missionLines}

TIRE PRESSURE LOG (last 3):
${pressureLines}

CALIBRATION HISTORY:
  Total Events:   ${state.chargeLog.length}

GEAR LOADOUT:
  Footwear:  ${footwearDesc}
  Helmet:    ${state.helmet}
  Gloves:    ${state.gloves}
  Jacket:    ${state.jacket}
  Cargo:     ${state.cargo}
  Lock:      ${state.lock}${lockNote}

Media Rig:      ${
    state.rigDeviceName
      ? `${state.rigOnline ? 'ONLINE' : 'OFFLINE'} — ${state.rigDeviceName}${state.rigMountType ? ' · ' + state.rigMountType : ''}${state.rigPrimaryUse ? ' · ' + state.rigPrimaryUse : ''}`
      : 'Not configured'
  }
Next Service: ${ns} mi (${Math.max(0, ns - state.odometer).toFixed(0)} mi away)
╚════════════════════════════════════════════════`;
}

export async function callAPI(
  userText: string,
  state: AppState,
  priorMessages: Message[]
): Promise<string> {
  if (!state.apiKey || state.apiKey.length < 10) {
    return '**No API key configured.**\n\nEnter your Anthropic API key in the CHAT tab to activate the analyst.';
  }

  const filtered = priorMessages.filter(m => m.role === 'user' || m.role === 'assistant');
  const history = filtered.slice(-20);

  const apiMsgs = history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  apiMsgs.push({ role: 'user', content: buildContext(state) + '\n\nQuery: ' + userText });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': state.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: buildSystem(),
      messages: apiMsgs,
    }),
  });

  if (!res.ok) {
    let errMsg = res.statusText;
    try {
      const j = await res.json();
      errMsg = j.error?.message || errMsg;
    } catch {}
    if (res.status === 401) return '**Auth error:** Invalid API key. Check the key and try again.';
    if (res.status === 429) return '**Rate limited.** Wait a moment and retry.';
    return `**API error ${res.status}:** ${errMsg}`;
  }

  const data = await res.json();
  return data.content?.[0]?.text || 'No response received.';
}

export const QUICK_QUERIES: Record<string, string> = {
  range: 'What is my current range estimate and how reliable is it given my efficiency data?',
  charge: 'How long to reach my charge target, and what are the calibration event safety rules I should follow?',
  efficiency: 'Analyze my efficiency — how does my last mission draw rate compare to my mode profile, and what does it mean?',
  deepburn: 'Run a deep burn analysis: full breakdown of my battery consumption, efficiency patterns, and where I can optimize.',
  wildcard: 'Give me one unexpected wildcard suggestion that could meaningfully improve my next mission.',
  service: 'Where am I on service intervals and what maintenance should I prioritize right now?',
};

export const OPS_PROMPTS: Record<string, string> = {
  'pre-mission': 'Run a full pre-mission check. Assess battery level, estimated range for planned distance, gear loadout completeness and safety gaps, lock security, and give me a GO / NO-GO verdict with your top concerns.',
  bms: 'Walk me through the BMS calibration protocol in detail. When should I run it, what exact steps do I follow, and what does the Green Light Soak look like?',
  service: 'Give me a complete service interval analysis — what maintenance is due or coming up, what to watch for at my current odometer, and what I should prioritize.',
  gear: 'Do a thorough gear check on my current loadout. Flag safety gaps, mismatches with my ride mode, weather-independent risks, and give me specific optimization recommendations.',
  debrief: 'Run a full mission debrief. Analyze my last ride data and efficiency vs baseline, identify any red flags, and give me tactical adjustments for the next mission.',
};

export const WELCOME_MESSAGE = `**E-Bike Range Analyst — Online**

Mission control initialized. Your personal analyst is standing by.

**To get started:**
• Enter your bike specs in the **BIKE** tab
• Update odometer and battery level in **RIDE**
• Configure your gear in the **GEAR** tab
• Add your Anthropic API key in the **CHAT** tab to activate live analysis

**Quick commands:** Range, Charge time, Efficiency, Deep Burn, Wildcard, Service

**OPS tab:** Pre-Mission Check, BMS Calibration, Service Interval, Gear Check, Mission Debrief

Every mission is tracked. Every calibration event is logged. Ready when you are.`;
