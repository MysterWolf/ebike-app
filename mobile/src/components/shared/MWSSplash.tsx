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
    fontSize: 26,
    color: '#CDD6F4',
    letterSpacing: 2.5,
  },
  studios: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#6C7086',
    letterSpacing: 4,
    marginTop: 2,
  },
  spacer: {
    height: 36,
  },
  appName: {
    fontSize: 14,
    color: '#6C7086',
    letterSpacing: 1.5,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  tagline: {
    fontSize: 13,
    color: '#585B70',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 32,
    lineHeight: 20,
  },
});
