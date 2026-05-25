import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Vibration } from 'react-native';
import { SPEED_ALERT_THRESHOLD_MPH, isOverSpeedLimit } from '../utils/rideCalculations';

interface Props {
  speed: number;
  isRiding: boolean;
}

export function SpeedMonitor({ speed, isRiding }: Props) {
  const over = isOverSpeedLimit(speed);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const prevOverRef = useRef(false);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Vibrate once on threshold crossing
  useEffect(() => {
    if (over && !prevOverRef.current) {
      Vibration.vibrate([0, 300, 100, 300]);
    }
    prevOverRef.current = over;
  }, [over]);

  // Pulse animation while over limit
  useEffect(() => {
    if (over) {
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.07, duration: 350, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
        ])
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [over, pulseAnim]);

  if (!isRiding) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        over && styles.alertContainer,
        { transform: [{ scale: pulseAnim }] },
      ]}
    >
      <Text style={[styles.speed, over && styles.alertSpeed]}>
        {speed.toFixed(1)}
      </Text>
      <Text style={[styles.unit, over && styles.alertUnit]}>mph</Text>
      {over && (
        <Text style={styles.alertText}>
          Exceeds {SPEED_ALERT_THRESHOLD_MPH} mph limit!
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2720',
    borderWidth: 3,
    borderColor: '#2D7A4F',
  },
  alertContainer: {
    borderColor: '#C0392B',
    backgroundColor: '#2D1510',
  },
  speed: {
    fontSize: 52,
    fontWeight: 'bold',
    color: '#2D7A4F',
  },
  alertSpeed: {
    color: '#C0392B',
  },
  unit: {
    fontSize: 16,
    color: '#2D7A4F',
    marginTop: -4,
  },
  alertUnit: {
    color: '#C0392B',
  },
  alertText: {
    fontSize: 11,
    color: '#C0392B',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '600',
  },
});
