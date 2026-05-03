import { Platform } from 'react-native';

export const C = {
  bg: '#f5f5f7',
  surface: '#ffffff',
  surfaceAlt: '#f0f0f5',
  border: '#e2e2e7',
  accent: '#00b870',
  accentBg: '#e8f9f2',
  accentDim: 'rgba(0,184,112,0.15)',
  text: '#1c1c1e',
  textSec: '#6e6e73',
  textTer: '#aeaeb2',
  amber: '#ff9500',
  amberBg: 'rgba(255,149,0,0.08)',
  red: '#ff3b30',
  redBg: 'rgba(255,59,48,0.08)',
  white: '#ffffff',
  shadow: 'rgba(0,0,0,0.06)',
};

export const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
