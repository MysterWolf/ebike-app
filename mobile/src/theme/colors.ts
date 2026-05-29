import { Platform } from 'react-native';

export interface ThemeTokens {
  background:  string;
  surface:     string;
  border:      string;
  ink:         string;
  inkMid:      string;
  muted:       string;
  accent:      string;
  accentDark:  string;
  accentTint:  string;
  telemetry:   string;
  white:       string;
  danger:      string;
  dangerTint:  string;
  warning:     string;
  dangerBg:    string;
}

export const DIGITAL_HORIZON: ThemeTokens = {
  background:  '#F1F3F5',
  surface:     '#E4E9ED',
  border:      '#A2B0BC',
  ink:         '#0F141C',
  inkMid:      '#3A4550',
  muted:       '#6B7A88',
  accent:      '#FF5A00',
  accentDark:  '#CC4800',
  accentTint:  'rgba(255,90,0,0.10)',
  telemetry:   '#00B464',
  white:       '#FFFFFF',
  danger:      '#D9381E',
  dangerTint:  'rgba(217,56,30,0.12)',
  warning:     '#C4883A',
  dangerBg:    '#2D1510',
};

export const OVERLAND_UTILITY: ThemeTokens = {
  background:  '#1A1D1A',
  surface:     '#252825',
  border:      '#3A3D38',
  ink:         '#E8EAE4',
  inkMid:      '#9EA89A',
  muted:       '#5A5F58',
  accent:      '#FF5A00',
  accentDark:  '#CC4800',
  accentTint:  'rgba(255,90,0,0.15)',
  telemetry:   '#00B464',
  white:       '#2E322D',
  danger:      '#D9381E',
  dangerTint:  'rgba(217,56,30,0.22)',
  warning:     '#D9381E',
  dangerBg:    '#2D1510',
};

// Backwards-compat static export — prefer useTheme() in components
export const C = DIGITAL_HORIZON;
export const theme = DIGITAL_HORIZON;
export default DIGITAL_HORIZON;

export const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
