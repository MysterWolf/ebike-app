import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet, StatusBar } from 'react-native';

interface MWSSplashProps {
  appName:    string;
  tagline:    string;
  onComplete: () => void;
  duration?:  number;
}

const LOGO = require('../../assets/brand/mws-logo.png');

export function MWSSplash({ appName, tagline, onComplete, duration = 3000 }: MWSSplashProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, duration);
    return () => clearTimeout(timer);
  }, [onComplete, duration]);

  return (
    <View style={s.root}>
      <StatusBar hidden />
      <View style={s.logoWrap}>
        <Image source={LOGO} style={s.logo} resizeMode="contain" />
      </View>
      <Text style={s.brand}>mysterwolf</Text>
      <Text style={s.studios}>studios</Text>
      <View style={s.spacer} />
      <Text style={s.appName}>{appName}</Text>
      <Text style={s.tagline}>{tagline}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#12111A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    backgroundColor: '#12111A',
    marginBottom: 16,
  },
  logo: {
    width: 120,
    height: 120,
  },
  brand: {
    fontFamily: 'serif',
    fontSize: 32,
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  studios: {
    fontFamily: 'serif',
    fontSize: 14,
    color: '#8A8780',
    letterSpacing: 6,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  spacer: {
    height: 32,
  },
  appName: {
    fontSize: 22,
    fontWeight: '500',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  tagline: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#8A8780',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 32,
  },
});
