import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { C, MONO } from '../theme/colors';

interface Props {
  make: string;
  model: string;
  nickname: string;
}

export function Header({ make, model, nickname }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.title}>E-BIKE RANGE ANALYST</Text>
        <Text style={styles.subtitle}>
          {nickname || (model ? `${make} ${model}` : make)} — Mission Control
        </Text>
      </View>
      <Animated.View style={[styles.dot, { opacity: pulse }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: C.accent,
  },
  subtitle: {
    fontFamily: MONO,
    fontSize: 10,
    color: C.textSec,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.accent,
  },
});
