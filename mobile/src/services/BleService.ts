
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
import { Platform, PermissionsAndroid, NativeModules } from 'react-native';
import { Buffer } from 'buffer';
import RNFS from 'react-native-fs';
import { BleAuth } from './BleAuth';

// ---- File-based diagnostic logger ----
export const BLE_LOG_FILE = RNFS.ExternalDirectoryPath + '/ble-diagnostic.txt';

function fts(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function fileLog(msg: string): void {
  RNFS.appendFile(BLE_LOG_FILE, `[${fts()}] ${msg}\n`, 'utf8').catch(() => {});
}

async function initLogFile(): Promise<void> {
  try {
    await RNFS.mkdir(RNFS.ExternalDirectoryPath);
    await RNFS.writeFile(BLE_LOG_FILE, `[${fts()}] LOG STARTED\n`, 'utf8');
  } catch {}
}

const BleFS: { start: () => void; stop: () => void } | null =
  Platform.OS === 'android' ? NativeModules.BleForegroundService ?? null : null;

// V70 UUIDs
const V70_SERVICE      = '12FF69A0-73AE-11EE-B962-0002A5D5C51B';
const V70_WRITE_1      = '12FF69A1-73AE-11EE-B962-0002A5D5C51B';
const V70_WRITE_2      = '12FF69A2-73AE-11EE-B962-0002A5D5C51B';
const V70_NOTIFY_2     = '12FF69A4-73AE-11EE-B962-0002A5D5C51B';
const V70_DEVICE_NAME  = 'V70';

// ============================================================
// TELEMETRY TYPES
// ============================================================

export interface V70Telemetry {
  // Confirmed fields (byte map proven by V70wNotify.csv, 3595 binary packets)
  speed_kph?:      number | null;   // not present in packet — null until derived from trip_raw deltas
  speed_mph?:      number | null;   // not present in packet — null until derived from trip_raw deltas
  battery_v?:      number | null;   // buf[5] / 3 (52V 14S pack: ~42–58.8V range)
  battery_pct?:    number | null;   // derived: (battery_v − 42) / 16.8 × 100, clamped 0–100
  assist_level?:   number | null;   // from +MODE=N ASCII packet on A4 (1 | 2 | 3)
  trip_raw?:       number | null;   // buf[7]: trip distance counter, ~100 m/unit (0 at session start)
  odometer_raw?:   number | null;   // buf[10–11] uint16 BE: lifetime odometer, ~100 m/unit
  motor_w?:        number | null;   // buf[12–13] uint16 BE: motor power in watts (0 at idle)
  checksum_ok?:    boolean;         // XOR of bytes 0–14 === byte 15 (verified 0 errors / 3595 packets)
  // UI compat aliases (kept to avoid breaking existing consumers)
  load_raw?:       number | null;   // alias for trip_raw
  word2_raw?:      number | null;   // buf[5] fine voltage raw byte
  // Not yet identified in capture
  cadence_rpm?:    number | null;
  // Raw payload for debugging
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
//   16-byte binary telemetry — starts with 0x3A 0xA0
//   variable ASCII mode-change — "+MODE=N" (starts with 0x2B = '+')
//
// 16-byte binary layout (proven by V70wNotify.csv, 3595 packets):
//   [0]     0x3A              frame magic (constant)
//   [1]     0xA0              frame magic (constant)
//   [2]     0x0C              constant — NOT part of voltage
//   [3]     batt_v_coarse     battery voltage indicator, range 55–92 raw
//   [4]     0x02              constant
//   [5]     batt_v_fine       battery voltage, range 112–176 raw
//                             formula: V = buf[5] / 3  (52V 14S pack: ~37–58.8V)
//   [6]     0x00              constant
//   [7]     trip_raw          trip distance counter, ~100 m/unit (0 at session start)
//   [8–9]   0x00 0x00         constant
//   [10–11] odometer_raw      uint16 BE, lifetime odometer, ~100 m/unit
//   [12–13] motor_w           uint16 BE, motor power in watts (0 at idle, 150–375W riding)
//                             NOT speed — speed is not present in this packet
//   [14]    0x00              constant
//   [15]    XOR checksum      XOR of bytes 0–14 (verified 0 errors / 3595 packets)
// ============================================================

function decodeNotify2(base64: string): Partial<V70Telemetry> {
  try {
    const buf = Buffer.from(base64, 'base64');

    // --- Mode-change packet: ASCII "+MODE=N" (starts with '+' = 0x2B) ---
    if (buf[0] === 0x2B) {
      const ascii = buf.toString('ascii').trim();
      if (ascii.startsWith('+MODE=')) {
        const level = parseInt(ascii.slice(6), 10);
        if (!isNaN(level)) {
          console.log('[BLE] Assist level ->', level);
          return { assist_level: level, raw_notify_2: buf.toString('hex') };
        }
      }
      console.warn('[BLE] Unknown ASCII packet on A4:', ascii);
      return { raw_notify_2: buf.toString('hex') };
    }

    // --- 16-byte binary telemetry packet ---
    if (buf.length !== 16 || buf[0] !== 0x3A || buf[1] !== 0xA0) {
      const reason = buf.length !== 16
        ? `wrong length: got ${buf.length} expected 16`
        : `wrong header: 0x${buf[0].toString(16).padStart(2, '0')}${buf[1].toString(16).padStart(2, '0')} expected 0x3aa0`;
      console.warn('[BLE] DECODE REJECTED:', reason, 'hex:', buf.toString('hex'));
      fileLog(`DECODE REJECTED: ${reason} raw:${buf.toString('hex')}`);
      return { raw_notify_2: buf.toString('hex') };
    }

    // XOR checksum: XOR of bytes 0–14 must equal byte 15
    let xor = 0;
    for (let i = 0; i < 15; i++) xor ^= buf[i];
    const checksum_ok = xor === buf[15];
    if (!checksum_ok) {
      console.warn('[BLE] Checksum mismatch:', buf.toString('hex'));
      fileLog(`DECODE REJECTED: XOR check failed raw:${buf.toString('hex')}`);
    }

    // Movcan V70: 14S Li-ion, 42.0V (0%) – 58.8V (100%). buf[5]=181 at full charge → 181×0.325=58.8V
    const battery_v   = parseFloat((buf[5] * 0.325).toFixed(1));
    const battery_pct = Math.max(0, Math.min(100,
      Math.round((battery_v - 42.0) / (58.8 - 42.0) * 100)
    ));

    const trip_raw     = buf[7];                 // ~100 m/unit, 0 at session start
    const odometer_raw = buf.readUInt16BE(10);   // ~100 m/unit, lifetime counter
    const motor_w      = buf.readUInt16BE(12);   // watts; 0 at idle

    return {
      speed_kph:    null,       // not encoded in packet
      speed_mph:    null,
      battery_v,
      battery_pct,
      odometer_raw,
      trip_raw,
      motor_w,
      checksum_ok,
      load_raw:     trip_raw,   // UI compat alias
      word2_raw:    buf[5],     // fine voltage raw byte
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
  private bleAuth:           BleAuth = new BleAuth();

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
    await initLogFile();
    fileLog('SCAN STARTED');
    this.setStatus('scanning');
    const hasPerms = await this.requestPermissions();
    if (!hasPerms) {
      fileLog('ERROR: Bluetooth permissions denied');
      this.setStatus('error', 'Bluetooth permissions denied');
      return false;
    }

    return new Promise((resolve) => {
      this.manager.startDeviceScan(null, null, async (error, device) => {
        if (error) {
          console.error('[BLE] Scan error:', error);
          fileLog(`ERROR: Scan error — ${error.message}`);
          this.setStatus('error', error.message);
          resolve(false);
          return;
        }

        if (device?.name === V70_DEVICE_NAME || device?.localName === V70_DEVICE_NAME) {
          console.log('[BLE] Found V70:', device.id);
          fileLog(`DEVICE FOUND: ${device.name ?? device.localName} id:${device.id}`);
          this.manager.stopDeviceScan();
          this.setStatus('connecting');

          try {
            const connected = await device.connect({ autoConnect: false });
            await connected.discoverAllServicesAndCharacteristics();
            this.device = connected;
            fileLog('CONNECTED');
            this.setStatus('connected');
            BleFS?.start();
            this.setupNotifications();
            // Give GATT stack 500ms to settle, then kick off mutual auth
            await new Promise(r => setTimeout(r, 500));
            this.bleAuth.reset();
            this.bleAuth.start(this.writeToA1.bind(this), fileLog);
            resolve(true);
          } catch (err: any) {
            console.error('[BLE] Connect error:', err);
            fileLog(`ERROR: Connect failed — ${err.message}`);
            this.setStatus('error', err.message);
            resolve(false);
          }
        }
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        if (this.status === 'scanning') {
          this.manager.stopDeviceScan();
          fileLog('ERROR: Scan timeout — V70 not found');
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
    fileLog('DISCONNECTED: user initiated');
    BleFS?.stop();
    this.setStatus('disconnected');
  }

  // ---- Private ----

  private async writeToA1(data: string): Promise<void> {
    if (!this.device) {
      fileLog(`AUTH WRITE SKIP: no device, data=${data}`);
      return;
    }
    const b64 = Buffer.from(data, 'ascii').toString('base64');
    fileLog(`AUTH WRITE A1: ${data}`);
    // writeWithoutResponse — companion app never uses ACK on A1
    await this.device.writeCharacteristicWithoutResponseForService(
      V70_SERVICE, V70_WRITE_1, b64
    );
  }

  private setStatus(status: BleStatus, message?: string) {
    this.status = status;
    console.log('[BLE] Status:', status, message ?? '');
    this.onStatusChange?.(status, message);
  }

  private setupNotifications() {
    if (!this.device) return;

    // A3 (V70_NOTIFY_1) omitted — GATT capture confirmed it never fires across
    // a full ride session. Subscribing to a silent notifying characteristic
    // corrupts the Android GATT queue and stalls the A4 subscription.

    fileLog('SETUP NOTIFICATIONS CALLED');

    // A4 (V70_NOTIFY_2) — sole telemetry source
    fileLog('MONITOR REGISTERED FOR A4');
    this.device.monitorCharacteristicForService(
      V70_SERVICE, V70_NOTIFY_2,
      (error: BleError | null, char: Characteristic | null) => {
        fileLog(`RAW BASE64: ${char?.value}`);
        const rawB64 = char?.value ?? null;
        const byteLen = rawB64 ? Buffer.from(rawB64, 'base64').length : 0;
        console.log('[BLE] RAW A4 PACKET:', rawB64, 'timestamp:', Date.now());
        fileLog(`RAW A4 PACKET: ${rawB64 ?? 'null'} len:${byteLen}`);
        if (error) {
          console.error('[BLE] Notify2 error:', error);
          fileLog(`ERROR: A4 monitor — ${error.message} (code:${error.errorCode})`);
          return;
        }
        if (rawB64) {
          // ALWAYS decode and merge — auth is purely additive, never blocks this path
          const decoded = decodeNotify2(rawB64);
          fileLog(`DECODED: ${JSON.stringify(decoded)}`);
          this.mergeTelemetry(decoded);
          // Route auth/control packets to state machine.
          // '+' prefix = auth protocol; buf.length < 16 = short control (CODE_OK etc).
          // 16-byte binary telemetry (0x3A 0xA0 header) matches neither — unaffected.
          const buf = Buffer.from(rawB64, 'base64');
          if (buf[0] === 0x2B || buf.length < 16) {
            this.bleAuth.handlePacket(buf.toString('ascii').trim(), this.writeToA1.bind(this), fileLog);
          }
        }
      }
    );

    // Watch for disconnection
    this.device.onDisconnected((error, _device) => {
      console.log('[BLE] DISCONNECT REASON:', JSON.stringify(error));
      fileLog(`DISCONNECT: androidErrorCode:${error?.androidErrorCode} errorCode:${error?.errorCode} message:${error?.message} reason:${error?.reason}`);
      this.device = null;
      BleFS?.stop();
      this.setStatus('disconnected');
    });
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
