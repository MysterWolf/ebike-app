import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ToastAndroid } from 'react-native';
import { BleService, BleStatus, V70Telemetry } from '../services/BleService';
import { dbRun } from '../db/database';

interface BleContextValue {
  status:      BleStatus;
  statusMsg:   string;
  telemetry:   V70Telemetry | null;
  log:         string[];
  connect:     () => Promise<void>;
  disconnect:  () => Promise<void>;
  setRideMode: (mode: string) => void;
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

  const addLog = useCallback((msg: string) => {
    setLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev.slice(0, 49)]);
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

    const startV  = startBattVRef.current;
    const endV    = lastBattVRef.current;
    const tripRaw = lastTripRawRef.current ?? 0;
    const distKm  = tripRaw * 0.1;
    const distMi  = distKm / 1.60934;

    // V = buf[5]/3; 14S pack: 42V empty → 58.8V full → range 16.8V
    const vToPct = (v: number | null): number | null =>
      v != null ? Math.max(0, Math.min(100, Math.round((v - 42) / 16.8 * 100))) : null;
    const startPct = vToPct(startV);
    const endPct   = vToPct(endV);
    const battUsed = (startPct != null && endPct != null) ? Math.max(0, startPct - endPct) : 0;
    const drawRate = distMi > 0 ? battUsed / distMi : 0;

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

  useEffect(() => {
    BleService.setStatusCallback((s, msg) => {
      const prev = prevStatusRef.current;
      prevStatusRef.current = s;

      // ── Ride START ────────────────────────────────────────────────────────
      if (s === 'connected') {
        rideStartTimeRef.current     = Date.now();
        gotFirstTelemetryRef.current = false;
        startBattVRef.current        = null;
        lastBattVRef.current         = null;
        lastTripRawRef.current       = null;
        console.log('[AutoRide] Ride started');
      }

      // ── Ride END ──────────────────────────────────────────────────────────
      if (prev === 'connected' && (s === 'disconnected' || s === 'error')) {
        finalizeAutoRide();
      }

      setStatus(s);
      setStatusMsg(msg ?? '');
      addLog(`Status: ${s}${msg ? ' — ' + msg : ''}`);
    });

    BleService.setTelemetryCallback((t) => {
      setTelemetry({ ...t });
      if (t.raw_notify_2) addLog(`N2: ${t.raw_notify_2}`);

      // First telemetry packet after connect → capture start_battery_v
      if (!gotFirstTelemetryRef.current && t.battery_v != null) {
        startBattVRef.current        = t.battery_v;
        gotFirstTelemetryRef.current = true;
        console.log('[AutoRide] Start battery_v:', t.battery_v);
      }
      // Always update last-known values for ride-end snapshot
      if (t.battery_v != null) lastBattVRef.current  = t.battery_v;
      if (t.trip_raw  != null) lastTripRawRef.current = t.trip_raw;
    });
  }, [addLog, finalizeAutoRide]);

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
    <BleContext.Provider value={{ status, statusMsg, telemetry, log, connect, disconnect, setRideMode }}>
      {children}
    </BleContext.Provider>
  );
}

export function useBleContext(): BleContextValue {
  const ctx = useContext(BleContext);
  if (!ctx) throw new Error('useBleContext must be used inside <BleProvider>');
  return ctx;
}
