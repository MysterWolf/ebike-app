import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { MONO } from '../theme/colors';
import { AppState, DEFAULT_CHARGE_SESSION } from '../state/types';
import {
  modeBaseline,
  lastRideDraw,
  overallAvg,
  chargeTime,
} from '../utils/calculations';
import { runRangeAgent } from '../utils/rangeAgent';
import { useBleContext } from '../context/BleContext';
import { currentChargeEstimate, elapsedLabel } from '../utils/chargeEstimate';

const NEUTRAL_BASELINE = 1.75;

interface Props {
  state: AppState;
  onOpenCharging?: () => void;
}

export function MetricsRows({ state, onOpenCharging }: Props) {
  const { C } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: 5,
      paddingHorizontal: 8,
      paddingTop: 6,
      backgroundColor: C.background,
    },
    row2: { paddingBottom: 4 },
    tile: {
      flex: 1,
      backgroundColor: C.white,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 6,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    label: {
      fontFamily: MONO,
      fontSize: 7,
      letterSpacing: 1,
      color: C.inkMid,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    value: {
      fontFamily: MONO,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 18,
    },
    unit: {
      fontFamily: MONO,
      fontSize: 8,
      color: C.muted,
      marginTop: 1,
    },
    confidenceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 2,
    },
    confidenceDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
    },
    confidenceLabel: {
      fontFamily: MONO,
      fontSize: 7,
    },
    confidenceReason: {
      fontFamily: MONO,
      fontSize: 6,
      color: C.muted,
      marginTop: 1,
    },
    chargeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 8,
      marginTop: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      backgroundColor: C.accentTint,
      borderWidth: 1,
      borderColor: C.telemetry,
      borderRadius: 6,
    },
    chargeDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: C.telemetry,
    },
    chargeText: {
      fontFamily: MONO,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: C.telemetry,
      flex: 1,
    },
    chargeChevron: {
      fontFamily: MONO,
      fontSize: 12,
      color: C.telemetry,
    },
  }), [C]);

  const odo      = state.odometer;
  const draw     = lastRideDraw(state);
  const avg      = overallAvg(state);
  const baseline = modeBaseline(state.rideMode);

  const { status, telemetry, liveDrawRate, gpsDistMiles } = useBleContext();
  const isLive  = status === 'connected' && telemetry?.battery_pct != null;
  const liveBat = isLive ? telemetry!.battery_pct! : state.battery;

  // Gate live draw rate at 0.5 mi — below that the per-mile figure is too noisy
  // to be a useful blend signal for the range agent.
  const agentLiveRate = status === 'connected' && gpsDistMiles >= 0.5 ? liveDrawRate : null;

  const agentResult = runRangeAgent({
    currentBatteryPct: liveBat,
    currentMode:       state.rideMode,
    rideHistory:       state.rideLog,
    liveDrawRate:      agentLiveRate,
    neutralBaseline:   NEUTRAL_BASELINE,
  });

  const confidenceColor =
    agentResult.confidence === 'high'   ? C.telemetry :
    agentResult.confidence === 'medium' ? C.warning   : C.muted;

  const ct = chargeTime(state, liveBat);

  const batColor   = liveBat < 20 ? C.danger : liveBat < 35 ? C.warning : C.accent;
  const rangeColor = agentResult.estimatedRangeMiles < 8
    ? C.danger
    : agentResult.estimatedRangeMiles < 15 ? C.warning : C.accent;

  // Live "ON CHARGER" banner — visible on every Mission sub-tab (MetricsRows sits
  // above TabBar). Ticks every 60s to keep elapsed/estimate fresh with no BLE needed.
  const chargeSession = state.chargeSession ?? DEFAULT_CHARGE_SESSION;
  const [, setChargeTick] = useState(0);
  useEffect(() => {
    if (!chargeSession.isCharging) return;
    const t = setInterval(() => setChargeTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, [chargeSession.isCharging]);
  const chargeEst = chargeSession.isCharging ? currentChargeEstimate(chargeSession) : null;

  return (
    <>
      {chargeSession.isCharging && (
        <Pressable style={styles.chargeBanner} onPress={onOpenCharging} disabled={!onOpenCharging}>
          <View style={styles.chargeDot} />
          <Text style={styles.chargeText}>
            ON CHARGER · {elapsedLabel(chargeSession.startTime!)} · Est. {chargeEst!.pct.toFixed(0)}%
          </Text>
          {onOpenCharging && <Text style={styles.chargeChevron}>›</Text>}
        </Pressable>
      )}
      <View style={styles.row}>
        <View style={styles.tile}>
          <Text style={styles.label}>TOTAL MILES</Text>
          <Text style={[styles.value, { color: C.inkMid }]}>{odo.toFixed(1)}</Text>
          <Text style={styles.unit}>mi</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.label}>BATTERY</Text>
          <Text style={[styles.value, { color: batColor }]}>{liveBat.toFixed(0)}</Text>
          <Text style={styles.unit}>%</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.label}>EST. RANGE</Text>
          <Text style={[styles.value, { color: rangeColor }]}>
            {agentResult.estimatedRangeMiles.toFixed(1)}
          </Text>
          <View style={styles.confidenceRow}>
            <Text style={styles.unit}>mi</Text>
            <View style={[styles.confidenceDot, { backgroundColor: confidenceColor }]} />
            <Text style={[styles.confidenceLabel, { color: confidenceColor }]}>
              {agentResult.confidence}
            </Text>
          </View>
          <Text style={styles.confidenceReason} numberOfLines={2}>
            {agentResult.confidenceReason}
          </Text>
        </View>
      </View>
      <View style={[styles.row, styles.row2]}>
        <View style={styles.tile}>
          <Text style={styles.label}>LAST RIDE</Text>
          <Text style={[styles.value, { color: C.inkMid }]}>{draw !== null ? draw.toFixed(2) : '—'}</Text>
          <Text style={styles.unit}>%/mi</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.label}>OVERALL AVG</Text>
          <Text style={[styles.value, { color: C.inkMid }]}>{avg.toFixed(2)}</Text>
          <Text style={styles.unit}>%/mi</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.label}>MODE PROFILE</Text>
          <Text style={[styles.value, { color: C.inkMid }]}>{baseline.toFixed(2)}</Text>
          <Text style={styles.unit}>%/mi</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.label}>TO TARGET</Text>
          <Text style={[styles.value, { color: C.inkMid }]}>{ct.toFixed(1)}</Text>
          <Text style={styles.unit}>hrs</Text>
        </View>
      </View>
    </>
  );
}
