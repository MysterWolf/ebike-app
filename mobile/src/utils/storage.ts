// ============================================================
// src/utils/storage.ts
// Reads and writes AppState using SQLite (via database.ts)
// Replaces the RNFS JSON file approach.
//
// JSON file is kept as backup but no longer the source of truth.
//
// Fields not in SQLite (apiKey, customGearOptions, checklistState)
// are stored in a small sidecar JSON via RNFS — these are config
// not data, so they don't need relational storage.
// ============================================================

import RNFS from 'react-native-fs';
import { AppState, DEFAULT_STATE, RideLogEntry, ChargeLogEntry, TirePressureEntry, ServiceLogEntry, ModLogEntry, Message } from '../state/types';
import { getDb } from '../db/database';
import type { SQLiteDatabase } from 'react-native-sqlite-storage';

// Sidecar file for fields not in SQLite
const SIDECAR_FILE = `${RNFS.DocumentDirectoryPath}/ebike-config.json`;

// ============================================================
// SIDECAR — apiKey, customGearOptions, checklistState
// ============================================================

interface SidecarData {
  apiKey: string;
  customGearOptions: AppState['customGearOptions'];
  checklistState: AppState['checklistState'];
}

async function loadSidecar(): Promise<SidecarData> {
  try {
    if (await RNFS.exists(SIDECAR_FILE)) {
      return JSON.parse(await RNFS.readFile(SIDECAR_FILE, 'utf8'));
    }
  } catch {}
  return { apiKey: '', customGearOptions: {}, checklistState: {} };
}

async function saveSidecar(data: SidecarData): Promise<void> {
  try {
    await RNFS.writeFile(SIDECAR_FILE, JSON.stringify(data), 'utf8');
  } catch (err) {
    console.warn('[Storage] Sidecar save failed:', err);
  }
}

// ============================================================
// LOAD STATE
// Assembles AppState from SQLite tables + sidecar
// ============================================================

export async function loadState(): Promise<AppState | null> {
  try {
    const db = getDb();

    const bikeRow     = await loadBikeState(db);
    const rides       = await loadRideLog(db);
    const charges     = await loadChargeLog(db);
    const tirePressure = await loadTirePressureLog(db);
    const service     = await loadServiceLog(db);
    const mods        = await loadModLog(db);
    const messages    = await loadMessages(db);
    const sidecar     = await loadSidecar();

    if (!bikeRow) {
      // DB is empty — first run before migration
      return null;
    }

    const state: AppState = {
      // Bike identity
      make:             bikeRow.make        ?? DEFAULT_STATE.make,
      year:             bikeRow.year        ?? DEFAULT_STATE.year,
      voltage:          bikeRow.voltage     ?? DEFAULT_STATE.voltage,
      capacityAh:       bikeRow.capacity_ah ?? DEFAULT_STATE.capacityAh,
      motorWatts:       bikeRow.motor_watts ?? DEFAULT_STATE.motorWatts,
      weightLbs:        bikeRow.weight_lbs  ?? DEFAULT_STATE.weightLbs,
      tireSize:         bikeRow.tire_size   ?? DEFAULT_STATE.tireSize,
      topSpeed:         bikeRow.top_speed_mph ?? DEFAULT_STATE.topSpeed,
      // Running state
      odometer:         bikeRow.odometer_miles ?? DEFAULT_STATE.odometer,
      battery:          bikeRow.battery_pct    ?? DEFAULT_STATE.battery,
      rideMode:         (bikeRow.ride_mode as AppState['rideMode']) ?? DEFAULT_STATE.rideMode,
      // Charger
      chargerAmps:      bikeRow.charger_amps      ?? DEFAULT_STATE.chargerAmps,
      chargeTarget:     bikeRow.charge_target_pct ?? DEFAULT_STATE.chargeTarget,
      // Gear
      footwear:         bikeRow.footwear       ?? DEFAULT_STATE.footwear,
      footwearCustom:   bikeRow.footwear_custom ?? DEFAULT_STATE.footwearCustom,
      helmet:           bikeRow.helmet          ?? DEFAULT_STATE.helmet,
      gloves:           bikeRow.gloves          ?? DEFAULT_STATE.gloves,
      jacket:           bikeRow.jacket          ?? DEFAULT_STATE.jacket,
      cargo:            bikeRow.cargo           ?? DEFAULT_STATE.cargo,
      lock:             bikeRow.lock            ?? DEFAULT_STATE.lock,
      // Rig
      rigDeviceName:    bikeRow.rig_device_name ?? DEFAULT_STATE.rigDeviceName,
      rigMountType:     bikeRow.rig_mount_type  ?? DEFAULT_STATE.rigMountType,
      rigPrimaryUse:    bikeRow.rig_primary_use ?? DEFAULT_STATE.rigPrimaryUse,
      rigOnline:        bikeRow.rig_online === 1,
      tireSizeFromMod:  bikeRow.tire_size_from_mod === 1,
      // Logs
      rideLog:          rides,
      chargeLog:        charges,
      tirePressureLog:  tirePressure,
      serviceLog:       service,
      modLog:           mods,
      messages:         messages,
      // Sidecar fields
      apiKey:           sidecar.apiKey,
      customGearOptions: sidecar.customGearOptions,
      checklistState:   sidecar.checklistState,
    };

    return state;

  } catch (err) {
    console.error('[Storage] loadState failed:', err);
    return null;
  }
}

// ============================================================
// SAVE STATE
// Writes AppState back to SQLite tables + sidecar
// ============================================================

export async function saveState(state: AppState): Promise<void> {
  try {
    const db = getDb();

    await Promise.all([
      saveBikeState(db, state),
      saveRideLog(db, state.rideLog),
      saveChargeLog(db, state.chargeLog),
      saveTirePressureLog(db, state.tirePressureLog),
      saveServiceLog(db, state.serviceLog),
      saveModLog(db, state.modLog),
      saveMessages(db, state.messages),
      saveSidecar({
        apiKey:            state.apiKey,
        customGearOptions: state.customGearOptions,
        checklistState:    state.checklistState,
      }),
    ]);

  } catch (err) {
    console.error('[Storage] saveState failed:', err);
  }
}

// ============================================================
// TABLE LOADERS
// ============================================================

async function loadBikeState(db: SQLiteDatabase): Promise<Record<string, any> | null> {
  try {
    const [res] = await db.executeSql('SELECT * FROM bike_state WHERE id = 1', []);
    return res.rows.length > 0 ? res.rows.item(0) : null;
  } catch { return null; }
}

async function loadRideLog(db: SQLiteDatabase): Promise<RideLogEntry[]> {
  try {
    const [res] = await db.executeSql('SELECT * FROM ride_log ORDER BY logged_at ASC', []);
    const arr: RideLogEntry[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows.item(i);
      arr.push({ distance: r.distance_mi, batteryUsed: r.battery_used_pct, drawRate: r.draw_rate, date: r.date_str ?? r.logged_at });
    }
    return arr;
  } catch { return []; }
}

async function loadChargeLog(db: SQLiteDatabase): Promise<ChargeLogEntry[]> {
  try {
    const [res] = await db.executeSql('SELECT * FROM charge_log ORDER BY logged_at ASC', []);
    const arr: ChargeLogEntry[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows.item(i);
      arr.push({ pct: r.pct, time: r.time_str ?? r.logged_at });
    }
    return arr;
  } catch { return []; }
}

async function loadTirePressureLog(db: SQLiteDatabase): Promise<TirePressureEntry[]> {
  try {
    const [res] = await db.executeSql('SELECT * FROM tire_pressure_log ORDER BY logged_at ASC', []);
    const arr: TirePressureEntry[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows.item(i);
      arr.push({ front: r.front_psi, rear: r.rear_psi, date: r.date_str ?? r.logged_at });
    }
    return arr;
  } catch { return []; }
}

async function loadServiceLog(db: SQLiteDatabase): Promise<ServiceLogEntry[]> {
  try {
    const [res] = await db.executeSql('SELECT * FROM service_log ORDER BY logged_at ASC', []);
    const arr: ServiceLogEntry[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows.item(i);
      arr.push({ date: r.date_str ?? r.logged_at, notes: r.notes, odometer: r.odometer_miles });
    }
    return arr;
  } catch { return []; }
}

async function loadModLog(db: SQLiteDatabase): Promise<ModLogEntry[]> {
  try {
    const [res] = await db.executeSql('SELECT * FROM mod_log ORDER BY logged_at ASC', []);
    const arr: ModLogEntry[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows.item(i);
      arr.push({ id: r.id, category: r.category, component: r.component, notes: r.notes, date: r.date_str ?? r.logged_at });
    }
    return arr;
  } catch { return []; }
}

async function loadMessages(db: SQLiteDatabase): Promise<Message[]> {
  return new Promise(resolve => {
    db.executeSql('SELECT id, role, content, time_str FROM messages ORDER BY created_at ASC', [],
      (res: any) => {
        const arr: Message[] = [];
        for (let i = 0; i < res.rows.length; i++) {
          const r = res.rows.item(i);
          arr.push({ role: r.role, content: r.content, time: r.time_str ?? '' });
        }
        resolve(arr);
      },
      () => resolve([])
    );
  });
}

// ============================================================
// TABLE SAVERS
// ============================================================

function now(): string { return new Date().toISOString(); }
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function saveBikeState(db: SQLiteDatabase, s: AppState): Promise<void> {
  return new Promise((resolve, reject) => {
    db.executeSql(
      `INSERT OR REPLACE INTO bike_state (
        id, make, year, voltage, capacity_ah, motor_watts, capacity_wh,
        weight_lbs, tire_size, top_speed_mph,
        odometer_miles, battery_pct, ride_mode,
        charger_amps, charge_target_pct, tire_size_from_mod,
        footwear, footwear_custom, helmet, gloves, jacket, cargo, lock,
        rig_device_name, rig_mount_type, rig_primary_use, rig_online,
        updated_at
      ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        s.make, s.year, s.voltage, s.capacityAh, s.motorWatts,
        s.voltage * s.capacityAh,
        s.weightLbs, s.tireSize, s.topSpeed,
        s.odometer, s.battery, s.rideMode,
        s.chargerAmps, s.chargeTarget, s.tireSizeFromMod ? 1 : 0,
        s.footwear, s.footwearCustom, s.helmet, s.gloves,
        s.jacket, s.cargo, s.lock,
        s.rigDeviceName, s.rigMountType, s.rigPrimaryUse, s.rigOnline ? 1 : 0,
        now(),
      ],
      () => resolve(),
      reject
    );
  });
}

async function saveRideLog(db: SQLiteDatabase, rides: RideLogEntry[]): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      // Clear and reinsert — ride log is append-only in practice
      // but this keeps save/load symmetric
      tx.executeSql('DELETE FROM ride_log WHERE migrated = 0');
      for (const r of rides) {
        const loggedAt = (() => {
          try {
            return new Date(`${r.date.replace(',', '').trim()} ${new Date().getFullYear()}`).toISOString();
          } catch { return now(); }
        })();
        tx.executeSql(
          `INSERT OR IGNORE INTO ride_log
            (id, distance_mi, battery_used_pct, draw_rate, date_str, logged_at, created_at)
           VALUES (?,?,?,?,?,?,?)`,
          [uuid(), r.distance, r.batteryUsed, r.drawRate, r.date, loggedAt, now()]
        );
      }
    }, reject, () => resolve());
  });
}

async function saveChargeLog(db: SQLiteDatabase, charges: ChargeLogEntry[]): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql('DELETE FROM charge_log WHERE migrated = 0');
      for (const c of charges) {
        tx.executeSql(
          `INSERT OR IGNORE INTO charge_log (id, pct, time_str, logged_at, created_at)
           VALUES (?,?,?,?,?)`,
          [uuid(), c.pct, c.time, now(), now()]
        );
      }
    }, reject, () => resolve());
  });
}

async function saveTirePressureLog(db: SQLiteDatabase, entries: TirePressureEntry[]): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql('DELETE FROM tire_pressure_log WHERE migrated = 0');
      for (const t of entries) {
        tx.executeSql(
          `INSERT OR IGNORE INTO tire_pressure_log (id, front_psi, rear_psi, date_str, logged_at, created_at)
           VALUES (?,?,?,?,?,?)`,
          [uuid(), t.front, t.rear, t.date, now(), now()]
        );
      }
    }, reject, () => resolve());
  });
}

async function saveServiceLog(db: SQLiteDatabase, entries: ServiceLogEntry[]): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql('DELETE FROM service_log WHERE migrated = 0');
      for (const s of entries) {
        tx.executeSql(
          `INSERT OR IGNORE INTO service_log (id, date_str, logged_at, notes, odometer_miles, created_at)
           VALUES (?,?,?,?,?,?)`,
          [uuid(), s.date, now(), s.notes, s.odometer, now()]
        );
      }
    }, reject, () => resolve());
  });
}

async function saveModLog(db: SQLiteDatabase, entries: ModLogEntry[]): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql('DELETE FROM mod_log WHERE migrated = 0');
      for (const m of entries) {
        tx.executeSql(
          `INSERT OR IGNORE INTO mod_log (id, category, component, notes, date_str, logged_at, created_at)
           VALUES (?,?,?,?,?,?,?)`,
          [m.id ?? uuid(), m.category, m.component, m.notes, m.date, now(), now()]
        );
      }
    }, reject, () => resolve());
  });
}

async function saveMessages(db: SQLiteDatabase, messages: Message[]): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql('DELETE FROM messages');
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        tx.executeSql(
          `INSERT INTO messages (id, role, content, time_str, created_at)
           VALUES (?,?,?,?,?)`,
          [uuid(), m.role, m.content, m.time,
           new Date(Date.now() - (messages.length - i) * 1000).toISOString()]
        );
      }
    }, reject, () => resolve());
  });
}
