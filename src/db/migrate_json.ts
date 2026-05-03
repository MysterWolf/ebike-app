// ============================================================
// ebike/migrations/migrate_json.ts
// One-time migration: AsyncStorage JSON → SQLite
// Built from actual E-Bike Companion JSON data shape
// ============================================================
// Reads the single AsyncStorage blob and splits it into
// proper relational tables. Safe to run multiple times.
// Does NOT delete AsyncStorage data (keep as backup).
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

// The key your app uses to store the main JSON blob
// Change this if yours is different
const STORAGE_KEY = 'ebikeData';

// Fallback keys to try if the primary isn't found
const FALLBACK_KEYS = [
  'ebikeData',
  'ebike_data',
  'bikeData',
  'bike_data',
  'appData',
  '@EBikeApp:data',
  'EBikeApp',
];

// ============================================================
// DATE PARSER
// Your dates are strings like 'Apr 24, 11:05 AM'
// and 'Apr 24 12:47 PM' (note: inconsistent comma)
// We parse these into ISO-8601, defaulting to current year
// ============================================================
function parseEbikeDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  try {
    // Normalise: 'Apr 24, 11:05 AM' and 'Apr 24 12:47 PM'
    const cleaned = dateStr.replace(',', '').trim();
    const year = new Date().getFullYear();
    const parsed = new Date(`${cleaned} ${year}`);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  } catch {
    return null;
  }
}

// Simple UUID v4 (no expo dependency)
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function now(): string {
  return new Date().toISOString();
}

// ============================================================
// MIGRATE BIKE STATE
// The top-level JSON blob → bike_state single row
// ============================================================
async function migrateBikeState(db: any, data: any): Promise<void> {
  // capacity_wh derived from voltage * capacity_ah
  const capacityWh = data.voltage && data.capacityAh
    ? data.voltage * data.capacityAh
    : null;

  await db.runAsync(
    `INSERT OR REPLACE INTO bike_state (
      id,
      make, year,
      voltage, capacity_ah, motor_watts, capacity_wh,
      weight_lbs, tire_size, top_speed_mph,
      odometer_miles, battery_pct, ride_mode,
      charger_amps, charge_target_pct, tire_size_from_mod,
      footwear, footwear_custom, helmet, gloves,
      jacket, cargo, lock,
      rig_device_name, rig_mount_type, rig_primary_use, rig_online,
      updated_at
    ) VALUES (
      1,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?
    )`,
    [
      data.make ?? null, data.year ?? null,
      data.voltage ?? null, data.capacityAh ?? null,
      data.motorWatts ?? null, capacityWh,
      data.weightLbs ?? null, data.tireSize ?? null,
      data.topSpeed ?? null,
      data.odometer ?? null, data.battery ?? null,
      data.rideMode ?? 'TOUR',
      data.chargerAmps ?? null, data.chargeTarget ?? null,
      data.tireSizeFromMod ? 1 : 0,
      data.footwear ?? null, data.footwearCustom ?? null,
      data.helmet ?? null, data.gloves ?? null,
      data.jacket ?? null, data.cargo ?? null,
      data.lock ?? null,
      data.rigDeviceName ?? null, data.rigMountType ?? null,
      data.rigPrimaryUse ?? null, data.rigOnline ? 1 : 0,
      now(),
    ]
  );
}

// ============================================================
// MIGRATE RIDE LOG
// rideLog[] → ride_log table
// ============================================================
async function migrateRideLog(
  db: any, rides: any[], capacityWh: number | null
): Promise<number> {
  let count = 0;
  for (const ride of rides) {
    const id       = uuid();
    const loggedAt = parseEbikeDate(ride.date);
    const whUsed   = capacityWh && ride.batteryUsed != null
      ? parseFloat(((capacityWh * ride.batteryUsed) / 100).toFixed(1))
      : null;

    await db.runAsync(
      `INSERT OR IGNORE INTO ride_log (
        id, distance_mi, battery_used_pct, draw_rate,
        date_str, logged_at, wh_used,
        migrated, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        id,
        ride.distance   ?? null,
        ride.batteryUsed ?? null,
        ride.drawRate   ?? null,
        ride.date       ?? null,
        loggedAt,
        whUsed,
        now(),
      ]
    );
    count++;
  }
  return count;
}

// ============================================================
// MIGRATE CHARGE LOG
// chargeLog[] → charge_log table
// ============================================================
async function migrateChargeLog(db: any, charges: any[]): Promise<number> {
  let count = 0;
  for (const charge of charges) {
    await db.runAsync(
      `INSERT OR IGNORE INTO charge_log (
        id, pct, time_str, logged_at, migrated, created_at
      ) VALUES (?, ?, ?, ?, 1, ?)`,
      [
        uuid(),
        charge.pct  ?? null,
        charge.time ?? null,
        parseEbikeDate(charge.time),
        now(),
      ]
    );
    count++;
  }
  return count;
}

// ============================================================
// MIGRATE TIRE PRESSURE LOG
// tirePressureLog[] → tire_pressure_log table
// ============================================================
async function migrateTirePressureLog(db: any, entries: any[]): Promise<number> {
  let count = 0;
  for (const entry of entries) {
    await db.runAsync(
      `INSERT OR IGNORE INTO tire_pressure_log (
        id, front_psi, rear_psi, date_str, logged_at, migrated, created_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [
        uuid(),
        entry.front ?? null,
        entry.rear  ?? null,
        entry.date  ?? null,
        parseEbikeDate(entry.date),
        now(),
      ]
    );
    count++;
  }
  return count;
}

// ============================================================
// MIGRATE SERVICE LOG
// serviceLog[] → service_log table
// ============================================================
async function migrateServiceLog(db: any, entries: any[]): Promise<number> {
  let count = 0;
  for (const entry of entries) {
    await db.runAsync(
      `INSERT OR IGNORE INTO service_log (
        id, date_str, logged_at, notes, odometer_miles, migrated, created_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [
        uuid(),
        entry.date     ?? null,
        parseEbikeDate(entry.date),
        entry.notes    ?? null,
        entry.odometer ?? null,
        now(),
      ]
    );
    count++;
  }
  return count;
}

// ============================================================
// MIGRATE MOD LOG
// modLog[] → mod_log table
// ============================================================
async function migrateModLog(db: any, entries: any[]): Promise<number> {
  let count = 0;
  for (const entry of entries) {
    await db.runAsync(
      `INSERT OR IGNORE INTO mod_log (
        id, category, component, notes,
        date_str, logged_at, migrated, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        entry.id       ?? uuid(),   // preserve original JS timestamp ID
        entry.category  ?? null,
        entry.component ?? null,
        entry.notes    ?? null,
        entry.date     ?? null,
        parseEbikeDate(entry.date),
        now(),
      ]
    );
    count++;
  }
  return count;
}

// ============================================================
// MIGRATE MESSAGES
// messages[] → messages table
// ============================================================
async function migrateMessages(db: any, msgs: any[]): Promise<number> {
  let count = 0;
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];

    // Infer event_type from system message content
    let eventType: string | null = null;
    if (msg.role === 'system') {
      if (msg.content?.includes('Mission logged'))      eventType = 'mission_logged';
      else if (msg.content?.includes('Calibration'))    eventType = 'calibration';
      else if (msg.content?.includes('Telemetry'))      eventType = 'telemetry_restored';
    }

    // Use index-based ordering since time_str has no date
    // Offset by index so messages stay in order even within same minute
    const createdAt = new Date(Date.now() - (msgs.length - i) * 1000).toISOString();

    await db.runAsync(
      `INSERT OR IGNORE INTO messages (
        id, role, content, time_str, event_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        msg.role    ?? 'system',
        msg.content ?? '',
        msg.time    ?? null,
        eventType,
        createdAt,
      ]
    );
    count++;
  }
  return count;
}

// ============================================================
// MAIN: migrateJsonToSqlite()
// Call from App.tsx after DB is initialised.
// ============================================================
export async function migrateJsonToSqlite(db: any): Promise<{
  success: boolean;
  alreadyDone?: boolean;
  results?: Record<string, number>;
  error?: string;
}> {
  // Idempotency check — version 100 = JSON migration done
  const already = await db.getFirstAsync(
    `SELECT version FROM _schema_version WHERE version = 100`
  );
  if (already) {
    console.log('[Migration] Already complete.');
    return { success: true, alreadyDone: true };
  }

  console.log('[Migration] Starting E-Bike Companion JSON → SQLite...');

  // ---- Find the AsyncStorage blob ----
  let raw: string | null = null;
  let foundKey = '';

  for (const key of FALLBACK_KEYS) {
    try {
      raw = await AsyncStorage.getItem(key);
      if (raw) { foundKey = key; break; }
    } catch { /* try next */ }
  }

  if (!raw) {
    console.warn('[Migration] No data found in AsyncStorage.');
    await db.runAsync(
      `INSERT OR IGNORE INTO _schema_version (version, description)
       VALUES (100, 'JSON migration — no AsyncStorage data found')`
    );
    return { success: true, results: {} };
  }

  console.log(`[Migration] Found data under key "${foundKey}"`);

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { success: false, error: 'Failed to parse AsyncStorage JSON' };
  }

  const capacityWh = data.voltage && data.capacityAh
    ? data.voltage * data.capacityAh
    : null;

  // ---- Run all migrations inside a transaction ----
  const results: Record<string, number> = {};

  try {
    await db.withTransactionAsync(async () => {
      await migrateBikeState(db, data);

      results.rides = await migrateRideLog(
        db, data.rideLog ?? [], capacityWh
      );
      results.charges = await migrateChargeLog(
        db, data.chargeLog ?? []
      );
      results.tirePressure = await migrateTirePressureLog(
        db, data.tirePressureLog ?? []
      );
      results.service = await migrateServiceLog(
        db, data.serviceLog ?? []
      );
      results.mods = await migrateModLog(
        db, data.modLog ?? []
      );
      results.messages = await migrateMessages(
        db, data.messages ?? []
      );

      // Mark migration complete
      await db.runAsync(
        `INSERT OR IGNORE INTO _schema_version (version, description)
         VALUES (100, ?)`,
        [`JSON migration — rides:${results.rides} charges:${results.charges} ` +
         `mods:${results.mods} messages:${results.messages}`]
      );
    });

    console.log('[Migration] Complete:', results);
    return { success: true, results };

  } catch (err: any) {
    console.error('[Migration] Failed:', err);
    return { success: false, error: err.message };
  }
}
