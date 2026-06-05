import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ToastAndroid, PermissionsAndroid, Platform } from 'react-native';
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
import { dbRun } from '../db/database';
import { haversineDistanceMiles, metersPerSecondToMph } from '../utils/rideCalculations';

interface BleContextValue {
  status:       BleStatus;
  statusMsg:    string;
  telemetry:    V70Telemetry | null;
  log:          string[];
  connect:      () => Promise<void>;
  disconnect:   () => Promise<void>;
  setRideMode:  (mode: string) => void;
  gpsSpeedMph:      number | null;   // live GPS speed; null when not riding
  gpsDistMiles:     number;          // accumulated GPS distance for the current ride
  liveDrawRate:     number | null;   // (battery_start - battery_now) / gpsDistMiles; null < 0.1 mi
  lastKnownBlePct:  number | null;   // last BLE-read battery %, persisted across sessions
}

const BleContext = createContext<BleContextValue | null>(null);

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function BleProvider({ children }: { children: React.ReactNode }) {
  const [status,    setStatus]    = useState<BleStatus>(BleService.getStatus());
  const [statusMsg, setStatusMsg] = useState('');
  const [telemetry, setTelemetry] = useState<V70Telemetry | null>(null);
  const [log,       setLog]       = useState<string[]>([]);

  // Auto-ride tracking — all refs: no re-renders, no stale-closure issues
  const rideModeRef          = useRef<string>('CRUISER');
  const rideStartTimeRef     = useRef<number | null>(null);
  const startBattVRef        = useRef<number | null>(null);
  const lastBattVRef         = useRef<number | null>(null);
  const lastTripRawRef       = useRef<number | null>(null);
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

  // Called on every disconnect (user-initiated or peer drop).
  // Reads refs only — no closure over state.
  const finalizeAutoRide = useCallback(async () => {
    const startTime = rideStartTimeRef.current;
    rideStartTimeRef.current = null; // clear immediately to prevent double-fire

    if (!startTime) return;

    const endTime     = Date.now();
    const durationMin = (endTime - startTime) / 60000;

    // ── 2-minute discard rule ──────────────────────────────────────────────
    if (durationMin < 2) {
      console.log(`[AutoRide] Discarded — ${durationMin.toFixed(1)} min < 2 min threshold`);
      return;
    }

    const startV = startBattVRef.current;
    const endV   = lastBattVRef.current;

    // GPS distance is authoritative. Fall back to trip_raw only if GPS
    // never acquired a fix (gpsDistRef still 0 after a 2+ minute ride).
    const distMi  = gpsDistRef.current > 0
      ? gpsDistRef.current
      : (lastTripRawRef.current ?? 0) * 0.1 / 1.60934;
    const distKm  = distMi * 1.60934;

    // Prefer direct battery_pct from telemetry; fall back to voltage conversion
    // if pct refs were never populated (e.g. BLE connected but no packets received).
    const vToPct = (v: number | null): number | null =>
      v != null ? Math.max(0, Math.min(100, Math.round((v - 42) / 16.8 * 100))) : null;
    const startPct = startBattPctRef.current ?? vToPct(startV);
    const endPct   = lastBattPctRef.current  ?? vToPct(endV);
    const battUsed = (startPct != null && endPct != null) ? Math.max(0, startPct - endPct) : 0;
    const drawRate = distMi > 0 ? battUsed / distMi : 0;

    // ── non-ride connection guard ─────────────────────────────────────────────
    if (distMi < 0.1 && battUsed < 3) {
      console.log(`[AutoRide] Discarded — ${distMi.toFixed(3)} mi / ${battUsed}% — below minimum thresholds`);
      return;
    }

    const startIso = new Date(startTime).toISOString();
    const endIso   = new Date(endTime).toISOString();
    const dateStr  =
      new Date(endTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ', ' +
      new Date(endTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // ── auto-save to ride_log ──────────────────────────────────────────────
    try {
      await dbRun(
        `INSERT INTO ride_log
           (id, distance_mi, battery_used_pct, draw_rate, date_str, logged_at,
            ride_mode, start_time, end_time, duration_minutes,
            start_battery_v, end_battery_v, distance_km, auto_logged, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          uuid(), distMi, battUsed, drawRate, dateStr, endIso,
          rideModeRef.current, startIso, endIso,
          Math.round(durationMin * 10) / 10,
          startV, endV, distKm, 1, endIso,
        ]
      );

      const mins = Math.round(durationMin);
      const toast = `Ride logged — ${mins} min, ${battUsed}% battery used`;
      ToastAndroid.show(toast, ToastAndroid.LONG);
      console.log('[AutoRide] Saved:', toast);
    } catch (err) {
      console.error('[AutoRide] Save failed:', err);
    }
  }, []); // refs only — no deps needed

  const startGpsWatch = useCallback(async () => {
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

      // ── Ride START ────────────────────────────────────────────────────────
      if (s === 'connected') {
        gotFirstTelemetryRef.current = false;
        startBattVRef.current        = null;
        lastBattVRef.current         = null;
        lastTripRawRef.current       = null;
        startBattPctRef.current      = null;
        lastBattPctRef.current       = null;
        console.log('[AutoRide] Ride started');
        startGpsWatch();
      }

      // ── Ride END ──────────────────────────────────────────────────────────
      if (prev === 'connected' && (s === 'disconnected' || s === 'error')) {
        stopGpsWatch();
        finalizeAutoRide();
      }

      setStatus(s);
      setStatusMsg(msg ?? '');
      addLog(`Status: ${s}${msg ? ' — ' + msg : ''}`);
    });

    BleService.setTelemetryCallback((t) => {
      setTelemetry({ ...t });
      if (t.raw_notify_2) addLog(`N2: ${t.raw_notify_2}`);

      // First telemetry packet after connect → start ride clock + capture start battery
      if (!gotFirstTelemetryRef.current && t.battery_v != null) {
        rideStartTimeRef.current     = Date.now();
        startBattVRef.current        = t.battery_v;
        startBattPctRef.current      = t.battery_pct ?? null;
        gotFirstTelemetryRef.current = true;
        console.log('[AutoRide] Start battery_v:', t.battery_v, 'pct:', t.battery_pct);
      }
      // Always update last-known values for ride-end snapshot
      if (t.battery_v   != null) lastBattVRef.current   = t.battery_v;
      if (t.battery_pct != null) {
        lastBattPctRef.current = t.battery_pct;
        setLastKnownBlePct(t.battery_pct);
        writeLastBattery(t.battery_pct);
      }
      if (t.trip_raw    != null) lastTripRawRef.current  = t.trip_raw;

      // Live draw rate: (battery_start_pct - battery_now_pct) / gpsDistMiles
      // Suppress below 0.1 mi — prevents divide-by-near-zero at ride start.
      if (startBattPctRef.current != null && t.battery_pct != null && gpsDistRef.current >= 0.1) {
        const rate = (startBattPctRef.current - t.battery_pct) / gpsDistRef.current;
        setLiveDrawRate(Math.max(0, rate));
      }
    });
  }, [addLog, finalizeAutoRide, startGpsWatch, stopGpsWatch]);

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
