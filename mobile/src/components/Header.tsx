import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { MONO } from '../theme/colors';

interface Props {
  make: string;
  model: string;
  nickname: string;
}

export function Header({ make, model, nickname }: Props) {
  const { C } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;

  const styles = useMemo(() => StyleSheet.create({
    header: {
      backgroundColor: C.white,
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
      color: C.inkMid,
      letterSpacing: 0.5,
      marginTop: 2,
    },
    dot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: C.accent,
    },
  }), [C]);

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
        <Text style={styles.title}>MISSION CONTROL</Text>
        <Text style={styles.subtitle}>
          {nickname || (model ? `${make} ${model}` : make)}
        </Text>
      </View>
      <Animated.View style={[styles.dot, { opacity: pulse }]} />
    </View>
  );
}
