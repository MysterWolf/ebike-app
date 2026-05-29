import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import RNFS from 'react-native-fs';
import { DIGITAL_HORIZON, OVERLAND_UTILITY, ThemeTokens } from './colors';

export type ThemeMode = 'day' | 'night' | 'auto';

// Instrument colors: dark even in Day mode (warm dark), cool dark in Night mode
export interface InstrumentColors {
  bg:      string;
  surface: string;
  border:  string;
  text:    string;
  muted:   string;
  sage:    string;   // telemetry / BLE green
  amber:   string;   // warning accent
  danger:  string;
  white:   string;
}

const DAY_INSTR: InstrumentColors = {
  bg:      '#1C1A15',
  surface: '#2A2720',
  border:  '#3D3A32',
  text:    '#F0EDE6',
  muted:   '#8A8780',
  sage:    '#2D7A4F',
  amber:   '#C4883A',
  danger:  '#C0392B',
  white:   '#FFFFFF',
};

const NIGHT_INSTR: InstrumentColors = {
  bg:      '#1A1D1A',
  surface: '#252825',
  border:  '#3A3D38',
  text:    '#E8EAE4',
  muted:   '#5A5F58',
  sage:    '#00B464',
  amber:   '#FF5A00',
  danger:  '#D9381E',
  white:   '#2E322D',
};

interface ThemeContextValue {
  C:            ThemeTokens;
  instrC:       InstrumentColors;
  mode:         ThemeMode;
  resolvedMode: 'day' | 'night';
  setMode:      (m: ThemeMode) => void;
}

const THEME_FILE = `${RNFS.DocumentDirectoryPath}/ebike-theme.json`;

const ThemeContext = createContext<ThemeContextValue>({
  C:            DIGITAL_HORIZON,
  instrC:       DAY_INSTR,
  mode:         'day',
  resolvedMode: 'day',
  setMode:      () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('day');

  useEffect(() => {
    RNFS.exists(THEME_FILE)
      .then(exists => {
        if (!exists) return 'day' as ThemeMode;
        return RNFS.readFile(THEME_FILE, 'utf8').then(raw => {
          const parsed = JSON.parse(raw) as { mode?: string };
          if (parsed.mode === 'day' || parsed.mode === 'night' || parsed.mode === 'auto') {
            return parsed.mode as ThemeMode;
          }
          return 'day' as ThemeMode;
        });
      })
      .then(m => setModeState(m))
      .catch(() => {});
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    RNFS.writeFile(THEME_FILE, JSON.stringify({ mode: m }), 'utf8').catch(() => {});
  }, []);

  const resolvedMode = useMemo<'day' | 'night'>(() => {
    if (mode === 'auto') return systemScheme === 'dark' ? 'night' : 'day';
    return mode;
  }, [mode, systemScheme]);

  const C = useMemo<ThemeTokens>(
    () => (resolvedMode === 'night' ? OVERLAND_UTILITY : DIGITAL_HORIZON),
    [resolvedMode],
  );

  const instrC = useMemo<InstrumentColors>(
    () => (resolvedMode === 'night' ? NIGHT_INSTR : DAY_INSTR),
    [resolvedMode],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ C, instrC, mode, resolvedMode, setMode }),
    [C, instrC, mode, resolvedMode, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
