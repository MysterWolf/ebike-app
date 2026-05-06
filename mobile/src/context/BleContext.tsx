import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BleService, BleStatus, V70Telemetry } from '../services/BleService';

interface BleContextValue {
  status:     BleStatus;
  statusMsg:  string;
  telemetry:  V70Telemetry | null;
  log:        string[];
  connect:    () => Promise<void>;
  disconnect: () => Promise<void>;
}

const BleContext = createContext<BleContextValue | null>(null);

export function BleProvider({ children }: { children: React.ReactNode }) {
  const [status,    setStatus]    = useState<BleStatus>(BleService.getStatus());
  const [statusMsg, setStatusMsg] = useState('');
  const [telemetry, setTelemetry] = useState<V70Telemetry | null>(null);
  const [log,       setLog]       = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev.slice(0, 49)]);
  }, []);

  useEffect(() => {
    BleService.setStatusCallback((s, msg) => {
      setStatus(s);
      setStatusMsg(msg ?? '');
      addLog(`Status: ${s}${msg ? ' — ' + msg : ''}`);
    });
    BleService.setTelemetryCallback((t) => {
      setTelemetry({ ...t });
      if (t.raw_notify_2) addLog(`N2: ${t.raw_notify_2}`);
    });
    // No cleanup disconnect here — connection must survive tab switches.
    // Disconnect only happens via explicit user action or app going to background.
  }, [addLog]);

  const connect = useCallback(async () => {
    addLog('Starting scan for V70...');
    await BleService.connect();
  }, [addLog]);

  const disconnect = useCallback(async () => {
    await BleService.disconnect();
  }, []);

  return (
    <BleContext.Provider value={{ status, statusMsg, telemetry, log, connect, disconnect }}>
      {children}
    </BleContext.Provider>
  );
}

export function useBleContext(): BleContextValue {
  const ctx = useContext(BleContext);
  if (!ctx) throw new Error('useBleContext must be used inside <BleProvider>');
  return ctx;
}
