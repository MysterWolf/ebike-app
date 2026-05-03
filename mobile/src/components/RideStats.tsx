import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatDuration, SPEED_ALERT_THRESHOLD_MPH } from '../utils/rideCalculations';

interface Props {
  duration: number;      // seconds
  distance: number;      // miles
  averageSpeed: number;  // mph
  topSpeed: number;      // mph
}

export function RideStats({ duration, distance, averageSpeed, topSpeed }: Props) {
  return (
    <View style={styles.container}>
      <StatItem label="Duration" value={formatDuration(duration)} />
      <StatItem label="Distance" value={`${distance.toFixed(2)} mi`} />
      <StatItem label="Avg Speed" value={`${averageSpeed.toFixed(1)} mph`} />
      <StatItem
        label="Top Speed"
        value={`${topSpeed.toFixed(1)} mph`}
        highlight={topSpeed > SPEED_ALERT_THRESHOLD_MPH}
      />
    </View>
  );
}

function StatItem({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, highlight && styles.highlightValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#16213e',
    borderRadius: 12,
    rowGap: 12,
    columnGap: 12,
  },
  stat: {
    width: '47%',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#0f3460',
    borderRadius: 10,
  },
  label: {
    fontSize: 11,
    color: '#8a9bb5',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  value: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#e0e0e0',
  },
  highlightValue: {
    color: '#FF9800',
  },
});
