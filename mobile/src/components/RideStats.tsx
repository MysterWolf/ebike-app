import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatDuration, SPEED_ALERT_THRESHOLD_MPH } from '../utils/rideCalculations';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  duration: number;
  distance: number;
  averageSpeed: number;
  topSpeed: number;
}

export function RideStats({ duration, distance, averageSpeed, topSpeed }: Props) {
  const { instrC: C } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      padding: 16,
      backgroundColor: C.surface,
      borderRadius: 12,
      rowGap: 12,
      columnGap: 12,
    },
    stat: {
      width: '47%',
      alignItems: 'center',
      padding: 14,
      backgroundColor: C.border,
      borderRadius: 10,
    },
    label: {
      fontSize: 11,
      color: C.muted,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    value:          { fontSize: 22, fontWeight: 'bold', color: C.text },
    highlightValue: { color: C.amber },
  }), [C]);

  return (
    <View style={styles.container}>
      <View style={styles.stat}>
        <Text style={styles.label}>Duration</Text>
        <Text style={styles.value}>{formatDuration(duration)}</Text>
      </View>
      <View style={styles.stat}>
        <Text style={styles.label}>Distance</Text>
        <Text style={styles.value}>{`${distance.toFixed(2)} mi`}</Text>
      </View>
      <View style={styles.stat}>
        <Text style={styles.label}>Avg Speed</Text>
        <Text style={styles.value}>{`${averageSpeed.toFixed(1)} mph`}</Text>
      </View>
      <View style={styles.stat}>
        <Text style={styles.label}>Top Speed</Text>
        <Text style={[styles.value, topSpeed > SPEED_ALERT_THRESHOLD_MPH && styles.highlightValue]}>
          {`${topSpeed.toFixed(1)} mph`}
        </Text>
      </View>
    </View>
  );
}
