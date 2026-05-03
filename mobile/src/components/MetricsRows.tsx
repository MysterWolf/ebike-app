import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, MONO } from '../theme/colors';
import { AppState } from '../state/types';
import {
  modeBaseline,
  lastRideDraw,
  overallAvg,
  estRange,
  chargeTime,
} from '../utils/calculations';

interface Props {
  state: AppState;
}

function Tile({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color?: string;
}) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: color || C.text }]}>{value}</Text>
      <Text style={styles.unit}>{unit}</Text>
    </View>
  );
}

export function MetricsRows({ state }: Props) {
  const bat = state.battery;
  const odo = state.odometer;
  const range = estRange(state);
  const draw = lastRideDraw(state);
  const avg = overallAvg(state);
  const baseline = modeBaseline(state.rideMode);
  const ct = chargeTime(state);

  const batColor = bat < 20 ? C.red : bat < 35 ? C.amber : C.accent;
  const rangeColor = range < 8 ? C.red : range < 15 ? C.amber : C.accent;

  return (
    <>
      <View style={styles.row}>
        <Tile label="TOTAL MILES" value={odo.toFixed(1)} unit="mi" color={C.textSec} />
        <Tile label="BATTERY" value={bat.toFixed(0)} unit="%" color={batColor} />
        <Tile label="EST. RANGE" value={range.toFixed(1)} unit="mi" color={rangeColor} />
      </View>
      <View style={[styles.row, styles.row2]}>
        <Tile label="LAST RIDE" value={draw !== null ? draw.toFixed(2) : '—'} unit="%/mi" color={C.textSec} />
        <Tile label="OVERALL AVG" value={avg.toFixed(2)} unit="%/mi" color={C.textSec} />
        <Tile label="MODE PROFILE" value={baseline.toFixed(2)} unit="%/mi" color={C.textSec} />
        <Tile label="TO TARGET" value={ct.toFixed(1)} unit="hrs" color={C.textSec} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
    paddingTop: 6,
    backgroundColor: C.bg,
  },
  row2: {
    paddingBottom: 4,
  },
  tile: {
    flex: 1,
    backgroundColor: C.surface,
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
    color: C.textSec,
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
    color: C.textTer,
    marginTop: 1,
  },
});
