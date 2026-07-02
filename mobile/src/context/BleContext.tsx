import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import Geolocation from '@react-native-community/geolocation';

const LAST_BATTERY_FILE = `${RNFS.DocumentDirectoryPath}/last_known_battery.json`;
async function readLastBattery(): Promise<number | null> {
  try {
    if (await RNFS.exists(LAST_BATTERY_FILE)) {
      return JSON.parse(await RNFS.readFile(LAST_BATTERY_FILE, 'utf8'));
    }
  } catch {}
  return null;
}
function writeLastBattery(pct: number): void {
  RNFS.writeFile(LAST_BATTERY_FILE, JSON.stringify(pct), 'utf8').catch(() => {});
}
import { BleService, BleStatus, V70Telemetry } from '../services/BleService';
import { haversineDistanceMiles, metersPerSecondToMph } from '../utils/rideCalculations';

interface BleContextValue {
  status:       BleStatus;
  statusMsg:    string;
  telemetry:    V70Telemetry | null;
  log:          string[];
  connect:      () => Promise<void>;
  disconnect:   () => Promise<void>;
  setRideMode:  (mode: string) => void;
  gpsSpeedMph:      number | null;
  gpsDistMiles:     number;
  liveDrawRate:     number | null;
  lastKnownBlePct:  number | null;
}

const BleContext = createContext<BleContextValue | null>(null);

export function BleProvider({ children }: { children: React.ReactNode }) {
  const [status,    setStatus]    = useState<BleStatus>(BleService.getStatus());
  const [statusMsg, setStatusMsg] = useState('');
  const [telemetry, setTelemetry] = useState<V70Telemetry | null>(null);
  const [log,       setLog]       = useState<string[]>([]);

  const rideModeRef          = useRef<string>('CRUISER');
  const gotFirstTelemetryRef = useRef(false);
  const prevStatusRef        = useRef<BleStatus>(BleService.getStatus());

  // GPS tracking refs — reset at ride start, read at ride end
  const gpsWatchIdRef   = useRef<number | null>(null);
  const gpsDistRef      = useRef<number>(0);
  const gpsLastPosRef   = useRef<{ lat: number; lon: number } | null>(null);
  const [gpsSpeedMph,  setGpsSpeedMph]  = useState<number | null>(null);
  const [gpsDistMiles, setGpsDistMiles] = useState<number>(0);

  // Battery pct refs — prefer direct pct over voltage conversion
  const startBattPctRef = useRef<number | null>(null);
  const lastBattPctRef  = useRef<number | null>(null);
  const [liveDrawRate,    setLiveDrawRate]    = useState<number | null>(null);
  const [lastKnownBlePct, setLastKnownBlePct] = useState<number | null>(null);

  const addLog = useCallback((msg: string) => {
    setLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev.slice(0, 49)]);
  }, []);

  // Load persisted BLE battery % on mount
  useEffect(() => {
    readLastBattery().then(val => { if (val !== null) setLastKnownBlePct(val); });
  }, []);


  const startGpsWatch = useCallback(async () => {
    // Clear any stale watch before starting a new one
    if (gpsWatchIdRef.current !== null) {
      Geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
      console.log('[GPS] Cleared stale watch before starting new one');
    }
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        console.warn('[GPS] Location permission denied');
        return;
      }
    }
    gpsDistRef.current    = 0;
    gpsLastPosRef.current = null;
    setGpsDistMiles(0);
    setGpsSpeedMph(null);

    gpsWatchIdRef.current = Geolocation.watchPosition(
      pos => {
        const mph = Math.max(0, metersPerSecondToMph(pos.coords.speed ?? 0));
        setGpsSpeedMph(mph);
        if (gpsLastPosRef.current) {
          const delta = haversineDistanceMiles(
            gpsLastPosRef.current.lat,
            gpsLastPosRef.current.lon,
            pos.coords.latitude,
            pos.coords.longitude,
          );
          gpsDistRef.current += delta;
          setGpsDistMiles(gpsDistRef.current);
        }
        gpsLastPosRef.current = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      },
      err => console.warn('[GPS] Error:', err.message),
      { enableHighAccuracy: true, distanceFilter: 5, interval: 1000, fastestInterval: 500 }
    );
    console.log('[GPS] Watch started');
  }, []); // only refs + stable setters

  const stopGpsWatch = useCallback(() => {
    if (gpsWatchIdRef.current !== null) {
      Geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    setGpsSpeedMph(null);
    setLiveDrawRate(null);
    console.log('[GPS] Watch stopped');
  }, []);


  useEffect(() => {
    BleService.setStatusCallback((s, msg) => {
      const prev = prevStatusRef.current;
      prevStatusRef.current = s;

      if (s === 'connected') {
        gotFirstTelemetryRef.current = false;
        startBattPctRef.current      = null;
        lastBattPctRef.current       = null;
        startGpsWatch();
      }

      if (prev === 'connected' && (s === 'disconnected' || s === 'error')) {
        stopGpsWatch();
      }

      setStatus(s);
      setStatusMsg(msg ?? '');
      addLog(`Status: ${s}${msg ? ' — ' + msg : ''}`);
    });

    BleService.setTelemetryCallback((t) => {
      setTelemetry({ ...t });
      if (t.raw_notify_2) addLog(`N2: ${t.raw_notify_2}`);

      // Capture start battery on first packet — used for live draw rate
      if (!gotFirstTelemetryRef.current && t.battery_pct != null) {
        startBattPctRef.current      = t.battery_pct;
        gotFirstTelemetryRef.current = true;
      }
      if (t.battery_pct != null) {
        lastBattPctRef.current = t.battery_pct;
        setLastKnownBlePct(t.battery_pct);
        writeLastBattery(t.battery_pct);
      }

      // Live draw rate: (battery_start_pct - battery_now_pct) / gpsDistMiles
      // Suppress below 0.1 mi — prevents divide-by-near-zero at ride start.
      if (startBattPctRef.current != null && t.battery_pct != null && gpsDistRef.current >= 0.1) {
        const rate = (startBattPctRef.current - t.battery_pct) / gpsDistRef.current;
        setLiveDrawRate(Math.max(0, rate));
      }
    });
  }, [addLog, startGpsWatch, stopGpsWatch]);

  const connect = useCallback(async () => {
    addLog('Starting scan for V70...');
    await BleService.connect();
  }, [addLog]);

  const disconnect = useCallback(async () => {
    await BleService.disconnect();
  }, []);

  // Called by MissionControlScreen whenever rideMode changes so the
  // active ride is tagged with the correct mode at save time.
  const setRideMode = useCallback((mode: string) => {
    rideModeRef.current = mode;
  }, []);

  return (
    <BleContext.Provider value={{ status, statusMsg, telemetry, log, connect, disconnect, setRideMode, gpsSpeedMph, gpsDistMiles, liveDrawRate, lastKnownBlePct }}>
      {children}
    </BleContext.Provider>
  );
}

export function useBleContext(): BleContextValue {
  const ctx = useContext(BleContext);
  if (!ctx) throw new Error('useBleContext must be used inside <BleProvider>');
  return ctx;
}
