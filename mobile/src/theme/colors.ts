import { Platform } from 'react-native';

export const theme = {
  background: '#F7F6F3',
  surface: '#EFEEE9',
  border: '#DDDAD2',
  ink: '#111009',
  inkMid: '#3A3830',
  muted: '#8A8780',
  accent: '#C4A962',
  accentDark: '#A08840',
  live: '#2D7A4F',
  white: '#FDFCFA',
  danger: '#C0392B',
  warning: '#C4883A',
  dangerBg: '#2D1510',
};

export const C = theme;
export default theme;

export const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
