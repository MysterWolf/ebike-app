import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Vibration } from 'react-native';
import { SPEED_ALERT_THRESHOLD_MPH, isOverSpeedLimit } from '../utils/rideCalculations';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  speed: number;
  isRiding: boolean;
}

export function SpeedMonitor({ speed, isRiding }: Props) {
  const { instrC: C } = useTheme();
  const over = isOverSpeedLimit(speed);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const prevOverRef = useRef(false);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      width: 180, height: 180, borderRadius: 90,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 3, borderColor: C.sage,
    },
    alertContainer: { borderColor: C.danger, backgroundColor: C.bg },
    speed:      { fontSize: 52, fontWeight: 'bold', color: C.sage },
    alertSpeed: { color: C.danger },
    unit:       { fontSize: 16, color: C.sage, marginTop: -4 },
    alertUnit:  { color: C.danger },
    alertText:  { fontSize: 11, color: C.danger, textAlign: 'center', marginTop: 4, fontWeight: '600' },
  }), [C]);

  useEffect(() => {
    if (over && !prevOverRef.current) {
      Vibration.vibrate([0, 300, 100, 300]);
    }
    prevOverRef.current = over;
  }, [over]);

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
