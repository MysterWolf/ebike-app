
// ============================================================
// src/services/BleService.ts
// V70 BLE telemetry service
// Service:  12FF69A0-73AE-11EE-B962-0002A5D5C51B
// Notify 1: 12FF69A3-73AE-11EE-B962-0002A5D5C51B (telemetry stream 1)
// Notify 2: 12FF69A4-73AE-11EE-B962-0002A5D5C51B (telemetry stream 2)
// Write 1:  12FF69A1-73AE-11EE-B962-0002A5D5C51B (commands)
// Write 2:  12FF69A2-73AE-11EE-B962-0002A5D5C51B (auth/handshake)
// Read:     12FF69A5-73AE-11EE-B962-0002A5D5C51B (static info)
// ============================================================

import { BleManager, Device, Characteristic, BleError } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

// V70 UUIDs
const V70_SERVICE      = '12FF69A0-73AE-11EE-B962-0002A5D5C51B';
const V70_WRITE_1      = '12FF69A1-73AE-11EE-B962-0002A5D5C51B';
const V70_WRITE_2      = '12FF69A2-73AE-11EE-B962-0002A5D5C51B';
const V70_NOTIFY_1     = '12FF69A3-73AE-11EE-B962-0002A5D5C51B';
const V70_NOTIFY_2     = '12FF69A4-73AE-11EE-B962-0002A5D5C51B';
const V70_READ         = '12FF69A5-73AE-11EE-B962-0002A5D5C51B';
const V70_DEVICE_NAME  = 'V70';

// ============================================================
// TELEMETRY TYPES
// ============================================================

export interface V70Telemetry {
  // Known fields (to be confirmed by empirical testing)
  speed_mph?:      number | null;
  battery_pct?:    number | null;
  battery_v?:      number | null;
  assist_level?:   number | null;
  motor_w?:        number | null;
  cadence_rpm?:    number | null;
  // Raw payloads for decoding
  raw_notify_1?:   string;
  raw_notify_2?:   string;
  timestamp:       number;
}

export type BleStatus =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export type TelemetryCallback = (telemetry: V70Telemetry) => void;
export type StatusCallback    = (status: BleStatus, message?: string) => void;

// ============================================================
// PAYLOAD DECODER
// This is where we map bytes to sensor values.
// Initially everything goes to raw — we decode empirically.
// ============================================================

function decodeNotify1(base64: string): Partial<V70Telemetry> {
  try {
    const buf = Buffer.from(base64, 'base64');
    console.log('[BLE] Notify1 raw bytes:', buf.toString('hex'));
    console.log('[BLE] Notify1 bytes:', Array.from(buf));

    // Empirical decoding — update these as we learn the protocol
    // Common Chinese ebike UART patterns:
    // Byte 0:    Header (often 0x41 or 0x3A)
    // Byte 1:    Command type
    // Byte 2-3:  Speed (little-endian, /10 for mph or kph)
    // Byte 4:    Battery percentage
    // Byte 5:    Assist level
    // Byte 6-7:  Checksum

    // For now return raw — we watch logs during a ride to decode
    return { raw_notify_1: buf.toString('hex') };

    // Uncomment and adjust once we know the byte map:
    // const speedRaw  = buf.readUInt16LE(2);
    // const battPct   = buf[4];
    // const assist    = buf[5];
    // return {
    //   speed_mph:    speedRaw / 10,
    //   battery_pct:  battPct,
    //   assist_level: assist,
    //   raw_notify_1: buf.toString('hex'),
    // };
  } catch (err) {
    console.error('[BLE] Notify1 decode error:', err);
    return { raw_notify_1: base64 };
  }
}

function decodeNotify2(base64: string): Partial<V70Telemetry> {
  try {
    const buf = Buffer.from(base64, 'base64');
    console.log('[BLE] Notify2 raw bytes:', buf.toString('hex'));
    console.log('[BLE] Notify2 bytes:', Array.from(buf));

    // Raw for now — motor power and cadence likely here
    return { raw_notify_2: buf.toString('hex') };

    // Uncomment once byte map is known:
    // const motorW   = buf.readUInt16LE(0);
    // const cadence  = buf[2];
    // return {
    //   motor_w:     motorW,
    //   cadence_rpm: cadence,
    //   raw_notify_2: buf.toString('hex'),
    // };
  } catch (err) {
    console.error('[BLE] Notify2 decode error:', err);
    return { raw_notify_2: base64 };
  }
}

// ============================================================
// BLE SERVICE
// ============================================================

class V70BleService {
  private manager:           BleManager;
  private device:            Device | null = null;
  private status:            BleStatus = 'idle';
  private onTelemetry:       TelemetryCallback | null = null;
  private onStatusChange:    StatusCallback | null = null;
  private latestTelemetry:   V70Telemetry = { timestamp: Date.now() };

  constructor() {
    this.manager = new BleManager();
  }

  // ---- Public API ----

  setTelemetryCallback(cb: TelemetryCallback) {
    this.onTelemetry = cb;
  }

  setStatusCallback(cb: StatusCallback) {
    this.onStatusChange = cb;
  }

  getStatus(): BleStatus { return this.status; }
  getLatestTelemetry(): V70Telemetry { return this.latestTelemetry; }
  isConnected(): boolean { return this.status === 'connected'; }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const apiLevel = parseInt(String(Platform.Version), 10);
      if (apiLevel >= 31) {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return Object.values(results).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.error('[BLE] Permission error:', err);
      return false;
    }
  }

  async connect(): Promise<boolean> {
    this.setStatus('scanning');
    const hasPerms = await this.requestPermissions();
    if (!hasPerms) {
      this.setStatus('error', 'Bluetooth permissions denied');
      return false;
    }

    return new Promise((resolve) => {
      this.manager.startDeviceScan(null, null, async (error, device) => {
        if (error) {
          console.error('[BLE] Scan error:', error);
          this.setStatus('error', error.message);
          resolve(false);
          return;
        }

        if (device?.name === V70_DEVICE_NAME || device?.localName === V70_DEVICE_NAME) {
          console.log('[BLE] Found V70:', device.id);
          this.manager.stopDeviceScan();
          this.setStatus('connecting');

          try {
            const connected = await device.connect({ autoConnect: false });
            await connected.discoverAllServicesAndCharacteristics();
            this.device = connected;
            this.setStatus('connected');
            this.setupNotifications();
            this.readStaticInfo();
            resolve(true);
          } catch (err: any) {
            console.error('[BLE] Connect error:', err);
            this.setStatus('error', err.message);
            resolve(false);
          }
        }
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        if (this.status === 'scanning') {
          this.manager.stopDeviceScan();
          this.setStatus('error', 'V70 not found — is the bike powered on?');
          resolve(false);
        }
      }, 15000);
    });
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      try { await this.device.cancelConnection(); } catch {}
      this.device = null;
    }
    this.setStatus('disconnected');
  }

  // ---- Private ----

  private setStatus(status: BleStatus, message?: string) {
    this.status = status;
    console.log('[BLE] Status:', status, message ?? '');
    this.onStatusChange?.(status, message);
  }

  private setupNotifications() {
    if (!this.device) return;

    // Subscribe to notify characteristic 1 (primary telemetry)
    this.device.monitorCharacteristicForService(
      V70_SERVICE, V70_NOTIFY_1,
      (error: BleError | null, char: Characteristic | null) => {
        if (error) {
          console.error('[BLE] Notify1 error:', error);
          return;
        }
        if (char?.value) {
          const decoded = decodeNotify1(char.value);
          this.mergeTelemetry(decoded);
        }
      }
    );

    // Subscribe to notify characteristic 2 (secondary telemetry)
    this.device.monitorCharacteristicForService(
      V70_SERVICE, V70_NOTIFY_2,
      (error: BleError | null, char: Characteristic | null) => {
        if (error) {
          console.error('[BLE] Notify2 error:', error);
          return;
        }
        if (char?.value) {
          const decoded = decodeNotify2(char.value);
          this.mergeTelemetry(decoded);
        }
      }
    );

    // Watch for disconnection
    this.device.onDisconnected((error, device) => {
      console.log('[BLE] Disconnected:', error?.message ?? 'clean disconnect');
      this.device = null;
      this.setStatus('disconnected');
    });
  }

  private async readStaticInfo() {
    if (!this.device) return;
    try {
      const char = await this.device.readCharacteristicForService(
        V70_SERVICE, V70_READ
      );
      if (char.value) {
        const buf = Buffer.from(char.value, 'base64');
        console.log('[BLE] Static info hex:', buf.toString('hex'));
        console.log('[BLE] Static info utf8:', buf.toString('utf8'));
      }
    } catch (err) {
      console.log('[BLE] Static info read failed (may require auth):', err);
    }
  }

  private mergeTelemetry(partial: Partial<V70Telemetry>) {
    this.latestTelemetry = {
      ...this.latestTelemetry,
      ...partial,
      timestamp: Date.now(),
    };
    this.onTelemetry?.(this.latestTelemetry);
  }
}

// Singleton
export const BleService = new V70BleService();
