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
    backgroundColor: '#1a1a2e',
    borderWidth: 3,
    borderColor: '#4CAF50',
  },
  alertContainer: {
    borderColor: '#F44336',
    backgroundColor: '#2d0a0a',
  },
  speed: {
    fontSize: 52,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  alertSpeed: {
    color: '#F44336',
  },
  unit: {
    fontSize: 16,
    color: '#4CAF50',
    marginTop: -4,
  },
  alertUnit: {
    color: '#F44336',
  },
  alertText: {
    fontSize: 11,
    color: '#F44336',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '600',
  },
});
