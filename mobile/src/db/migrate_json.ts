import RNFS from 'react-native-fs';
import type { SQLiteDatabase as DB, Transaction } from 'react-native-sqlite-storage';
import { isMigrationDone } from './database';

const STATE_FILE        = `${RNFS.DocumentDirectoryPath}/ebike-state.json`;
const MIGRATION_VERSION = 100;

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function now(): string { return new Date().toISOString(); }
function parseEbikeDate(s: string | null | undefined): string | null {
  if (!s) return null;
  try {
    const parsed = new Date(`${s.replace(',', '').trim()} ${new Date().getFullYear()}`);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  } catch { return null; }
}
function inferEventType(content: string): string | null {
  if (content.includes('Mission logged')) return 'mission_logged';
  if (content.includes('Calibration'))    return 'calibration';
  if (content.includes('Telemetry'))      return 'telemetry_restored';
  return null;
}

export type MigrationResult = {
  success: boolean;
  alreadyDone?: boolean;
  results?: Record<string, number>;
  error?: string;
};

export async function migrateJsonToSqlite(db: DB): Promise<MigrationResult> {
  if (await isMigrationDone(MIGRATION_VERSION, db)) {
    console.log('[Migration] Already complete.');
    return { success: true, alreadyDone: true };
  }

  console.log(`[Migration] Reading ${STATE_FILE}`);

  if (!(await RNFS.exists(STATE_FILE))) {
    console.warn('[Migration] ebike-state.json not found.');
    db.executeSql(
      'INSERT OR IGNORE INTO _schema_version (version, description) VALUES (?,?)',
      [MIGRATION_VERSION, 'file not found']
    );
    return { success: true, results: {} };
  }

  let data: any;
  try {
    data = JSON.parse(await RNFS.readFile(STATE_FILE, 'utf8'));
  } catch (err: any) {
    return { success: false, error: err.message };
  }

  const capacityWh: number | null =
    data.voltage && data.capacityAh ? data.voltage * data.capacityAh : null;
  const results = { rides: 0, charges: 0, tirePressure: 0, service: 0, mods: 0, messages: 0 };

  return new Promise(resolve => {
    db.transaction(
      (tx: Transaction) => {

        tx.executeSql(
          `INSERT OR REPLACE INTO bike_state
            (id,make,year,voltage,capacity_ah,motor_watts,capacity_wh,
             weight_lbs,tire_size,top_speed_mph,odometer_miles,battery_pct,
             ride_mode,charger_amps,charge_target_pct,tire_size_from_mod,
             footwear,footwear_custom,helmet,gloves,jacket,cargo,lock,
             rig_device_name,rig_mount_type,rig_primary_use,rig_online,updated_at)
           VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            data.make??null, data.year??null,
            data.voltage??null, data.capacityAh??null, data.motorWatts??null, capacityWh,
            data.weightLbs??null, data.tireSize??null, data.topSpeed??null,
            data.odometer??null, data.battery??null, data.rideMode??'TOUR',
            data.chargerAmps??null, data.chargeTarget??null, data.tireSizeFromMod?1:0,
            data.footwear??null, data.footwearCustom??null,
            data.helmet??null, data.gloves??null, data.jacket??null,
            data.cargo??null, data.lock??null,
            data.rigDeviceName??null, data.rigMountType??null,
            data.rigPrimaryUse??null, data.rigOnline?1:0, now(),
          ]
        );

        for (const r of (data.rideLog??[])) {
          const whUsed = capacityWh && r.batteryUsed != null
            ? parseFloat(((capacityWh * r.batteryUsed) / 100).toFixed(1)) : null;
          tx.executeSql(
            `INSERT OR IGNORE INTO ride_log
              (id,distance_mi,battery_used_pct,draw_rate,date_str,logged_at,wh_used,migrated,created_at)
             VALUES (?,?,?,?,?,?,?,1,?)`,
            [uuid(),r.distance??null,r.batteryUsed??null,r.drawRate??null,
             r.date??null,parseEbikeDate(r.date),whUsed,now()]
          );
          results.rides++;
        }

        for (const c of (data.chargeLog??[])) {
          tx.executeSql(
            `INSERT OR IGNORE INTO charge_log (id,pct,time_str,logged_at,migrated,created_at)
             VALUES (?,?,?,?,1,?)`,
            [uuid(),c.pct??null,c.time??null,parseEbikeDate(c.time),now()]
          );
          results.charges++;
        }

        for (const t of (data.tirePressureLog??[])) {
          tx.executeSql(
            `INSERT OR IGNORE INTO tire_pressure_log
              (id,front_psi,rear_psi,date_str,logged_at,migrated,created_at)
             VALUES (?,?,?,?,?,1,?)`,
            [uuid(),t.front??null,t.rear??null,t.date??null,parseEbikeDate(t.date),now()]
          );
          results.tirePressure++;
        }

        for (const s of (data.serviceLog??[])) {
          tx.executeSql(
            `INSERT OR IGNORE INTO service_log
              (id,date_str,logged_at,notes,odometer_miles,migrated,created_at)
             VALUES (?,?,?,?,?,1,?)`,
            [uuid(),s.date??null,parseEbikeDate(s.date),s.notes??null,s.odometer??null,now()]
          );
          results.service++;
        }

        for (const m of (data.modLog??[])) {
          tx.executeSql(
            `INSERT OR IGNORE INTO mod_log
              (id,category,component,notes,date_str,logged_at,migrated,created_at)
             VALUES (?,?,?,?,?,?,1,?)`,
            [m.id??uuid(),m.category??null,m.component??null,m.notes??null,
             m.date??null,parseEbikeDate(m.date),now()]
          );
          results.mods++;
        }

        const msgs: any[] = data.messages??[];
        for (let i = 0; i < msgs.length; i++) {
          const m = msgs[i];
          tx.executeSql(
            `INSERT OR IGNORE INTO messages
              (id,role,content,time_str,event_type,created_at)
             VALUES (?,?,?,?,?,?)`,
            [uuid(), m.role??'system', m.content??'', m.time??null,
             m.role==='system' ? inferEventType(m.content??'') : null,
             new Date(Date.now() - (msgs.length - i) * 1000).toISOString()]
          );
          results.messages++;
        }

        tx.executeSql(
          'INSERT OR IGNORE INTO _schema_version (version,description) VALUES (?,?)',
          [MIGRATION_VERSION,
           `RNFS migration — rides:${results.rides} messages:${results.messages}`]
        );
      },
      (err: any) => {
        console.error('[Migration] Failed:', err.message);
        resolve({ success: false, error: err.message });
      },
      () => {
        console.log('[Migration] Complete:', results);
        resolve({ success: true, results });
      }
    );
  });
}
