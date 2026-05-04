
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
  // Confirmed fields (decoded from V70wNotify.csv GATT capture)
  speed_kph?:      number | null;   // word[6] / 10  (0–37.3 km/h observed)
  speed_mph?:      number | null;   // speed_kph × 0.6214
  battery_v?:      number | null;   // word[1] / 100 (volts; 10S pack: 31.27–31.64V observed)
  battery_pct?:    number | null;   // reserved — needs cell-count config before computing
  assist_level?:   number | null;   // from +MODE=N ASCII packet on A4 (1 | 2 | 3)
  odometer_raw?:   number | null;   // word[5] raw counter — use delta for trip distance
  load_raw?:       number | null;   // word[3] — 0 at rest, rises while riding (current or temp, TBD)
  word2_raw?:      number | null;   // word[2] — decreases over session, meaning unknown
  checksum_ok?:    boolean;         // XOR of bytes 0–14 === byte 15 (verified 3595/3595 in capture)
  // Pending — byte map not yet identified in capture
  motor_w?:        number | null;
  cadence_rpm?:    number | null;
  // Raw payloads for debugging
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
// A4 (NOTIFY_2) carries all live data. A3 (NOTIFY_1) was
// enabled in the capture but never fired — kept for future use.
//
// A4 packet types:
//   16-byte telemetry  — header 0x3AA0, 8 × BE uint16
//   7-byte mode change — ASCII "+MODE=N" (N = 1|2|3)
//
// 16-byte telemetry layout (big-endian uint16):
//   word[0]  bytes 0-1   0x3AA0      header / magic
//   word[1]  bytes 2-3   voltage     ÷ 100 = volts
//   word[2]  bytes 4-5   unknown     decreases over session (TBD)
//   word[3]  bytes 6-7   load        0 at rest, rises while riding (current or temp, TBD)
//   word[4]  bytes 8-9   0x0000      reserved
//   word[5]  bytes 10-11 odometer    raw counter; use delta for trip distance
//   word[6]  bytes 12-13 speed       ÷ 10 = km/h  (verified: 0 when stopped)
//   word[7]  bytes 14-15 checksum    low byte = XOR of bytes 0–14; high byte = 0x00
// ============================================================

const TELEMETRY_HEADER = 0x3AA0;
const KPH_TO_MPH       = 0.621371;

// A3 never fired in the GATT capture — return raw in case it activates in future sessions
function decodeNotify1(base64: string): Partial<V70Telemetry> {
  try {
    const buf = Buffer.from(base64, 'base64');
    console.log('[BLE] Notify1 (A3) raw:', buf.toString('hex'));
    return { raw_notify_1: buf.toString('hex') };
  } catch (err) {
    console.error('[BLE] Notify1 decode error:', err);
    return { raw_notify_1: base64 };
  }
}

function decodeNotify2(base64: string): Partial<V70Telemetry> {
  try {
    const buf = Buffer.from(base64, 'base64');

    // --- Mode-change packet: ASCII "+MODE=N" ---
    if (buf[0] === 0x2B) {
      const ascii = buf.toString('ascii').trim();
      if (ascii.startsWith('+MODE=')) {
        const level = parseInt(ascii.slice(6), 10);
        if (!isNaN(level)) {
          console.log('[BLE] Assist level ->', level);
          return { assist_level: level };
        }
      }
      return { raw_notify_2: buf.toString('hex') };
    }

    // --- 16-byte telemetry packet ---
    if (buf.length !== 16 || buf.readUInt16BE(0) !== TELEMETRY_HEADER) {
      console.warn('[BLE] Unexpected A4 packet:', buf.toString('hex'));
      return { raw_notify_2: buf.toString('hex') };
    }

    // XOR checksum: bytes 0–14 XORed must equal byte 15
    let xor = 0;
    for (let i = 0; i < 15; i++) xor ^= buf[i];
    const checksum_ok = xor === buf[15];
    if (!checksum_ok) {
      console.warn('[BLE] Checksum mismatch on packet:', buf.toString('hex'));
    }

    const voltageRaw = buf.readUInt16BE(2);   // word[1]
    const word2      = buf.readUInt16BE(4);   // word[2] — TBD
    const loadRaw    = buf.readUInt16BE(6);   // word[3] — current or temp TBD
    // word[4] offset 8 is always 0x0000 — skip
    const odomRaw    = buf.readUInt16BE(10);  // word[5]
    const speedRaw   = buf.readUInt16BE(12);  // word[6]
    // word[7] offset 14 is the checksum — already consumed above

    const speed_kph = speedRaw / 10;

    return {
      speed_kph,
      speed_mph:    parseFloat((speed_kph * KPH_TO_MPH).toFixed(2)),
      battery_v:    parseFloat((voltageRaw / 100).toFixed(2)),
      odometer_raw: odomRaw,
      load_raw:     loadRaw,
      word2_raw:    word2,
      checksum_ok,
      raw_notify_2: buf.toString('hex'),
    };
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
