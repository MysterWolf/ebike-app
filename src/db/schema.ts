// ============================================================
// src/db/schema.ts
// ============================================================

export const EBIKE_SCHEMA = `
CREATE TABLE IF NOT EXISTS bike_state (
    id                  INTEGER PRIMARY KEY CHECK(id = 1),
    make                TEXT,
    year                INTEGER,
    voltage             REAL,
    capacity_ah         REAL,
    motor_watts         INTEGER,
    capacity_wh         REAL,
    weight_lbs          REAL,
    tire_size           TEXT,
    top_speed_mph       REAL,
    odometer_miles      REAL DEFAULT 0,
    battery_pct         REAL,
    ride_mode           TEXT DEFAULT 'TOUR',
    charger_amps        REAL,
    charge_target_pct   REAL,
    tire_size_from_mod  INTEGER DEFAULT 0,
    footwear            TEXT,
    footwear_custom     TEXT,
    helmet              TEXT,
    gloves              TEXT,
    jacket              TEXT,
    cargo               TEXT,
    lock                TEXT,
    rig_device_name     TEXT,
    rig_mount_type      TEXT,
    rig_primary_use     TEXT,
    rig_online          INTEGER DEFAULT 0,
    tier                TEXT NOT NULL DEFAULT 'free' CHECK(tier IN ('free','pro')),
    sub_expires_at      TEXT,
    sub_provider        TEXT,
    sub_receipt         TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ride_log (
    id                  TEXT PRIMARY KEY,
    distance_mi         REAL NOT NULL,
    battery_used_pct    REAL NOT NULL,
    draw_rate           REAL,
    date_str            TEXT,
    logged_at           TEXT,
    wh_used             REAL,
    range_remaining_mi  REAL,
    battery_pct_after   REAL,
    ride_mode           TEXT,
    odometer_after      REAL,
    notes               TEXT,
    migrated            INTEGER DEFAULT 0,
    created_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ride_log_date ON ride_log(logged_at DESC);
CREATE TABLE IF NOT EXISTS charge_log (
    id              TEXT PRIMARY KEY,
    pct             REAL NOT NULL,
    time_str        TEXT,
    logged_at       TEXT,
    charger_amps    REAL,
    notes           TEXT,
    migrated        INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_charge_log_date ON charge_log(logged_at DESC);
CREATE TABLE IF NOT EXISTS tire_pressure_log (
    id          TEXT PRIMARY KEY,
    front_psi   REAL,
    rear_psi    REAL,
    date_str    TEXT,
    logged_at   TEXT,
    notes       TEXT,
    migrated    INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tire_pressure_date ON tire_pressure_log(logged_at DESC);
CREATE TABLE IF NOT EXISTS service_log (
    id              TEXT PRIMARY KEY,
    date_str        TEXT,
    logged_at       TEXT,
    notes           TEXT,
    odometer_miles  REAL,
    migrated        INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_service_log_date ON service_log(logged_at DESC);
CREATE TABLE IF NOT EXISTS mod_log (
    id          TEXT PRIMARY KEY,
    category    TEXT,
    component   TEXT,
    notes       TEXT,
    date_str    TEXT,
    logged_at   TEXT,
    migrated    INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    role        TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
    content     TEXT NOT NULL,
    time_str    TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    event_type  TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at ASC);
CREATE TABLE IF NOT EXISTS telemetry_readings (
    id              TEXT PRIMARY KEY,
    ride_id         TEXT REFERENCES ride_log(id) ON DELETE CASCADE,
    recorded_at     TEXT NOT NULL,
    speed_mph       REAL,
    battery_pct     REAL,
    battery_v       REAL,
    motor_w         REAL,
    assist_level    INTEGER,
    cadence_rpm     INTEGER,
    raw_payload     TEXT
);
CREATE INDEX IF NOT EXISTS idx_telemetry_ride ON telemetry_readings(ride_id, recorded_at);
CREATE TABLE IF NOT EXISTS ai_usage_log (
    id              TEXT PRIMARY KEY,
    called_at       TEXT DEFAULT (datetime('now')),
    call_type       TEXT NOT NULL CHECK(call_type IN ('analyst_chat','mission_debrief','range_analysis','gear_check','service_interval')),
    model           TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    input_tokens    INTEGER DEFAULT 0,
    output_tokens   INTEGER DEFAULT 0,
    cost_usd        REAL,
    success         INTEGER DEFAULT 1,
    error_message   TEXT
);
CREATE VIEW IF NOT EXISTS v_mission_history AS
SELECT r.id, r.logged_at, r.date_str, r.distance_mi, r.battery_used_pct, r.draw_rate, r.wh_used, r.range_remaining_mi, r.ride_mode, r.odometer_after, r.notes,
    CASE WHEN r.draw_rate <= 1.5 THEN 'A' WHEN r.draw_rate <= 2.5 THEN 'B' WHEN r.draw_rate <= 3.5 THEN 'C' ELSE 'D' END AS efficiency_grade
FROM ride_log r ORDER BY r.logged_at DESC;
CREATE VIEW IF NOT EXISTS v_ride_stats AS
SELECT COUNT(*) AS total_missions, ROUND(SUM(distance_mi),1) AS total_miles, ROUND(AVG(distance_mi),1) AS avg_miles_per_mission, ROUND(AVG(battery_used_pct),1) AS avg_battery_used_pct, ROUND(AVG(draw_rate),2) AS avg_draw_rate, ROUND(MIN(draw_rate),2) AS best_draw_rate, ROUND(MAX(draw_rate),2) AS worst_draw_rate, ROUND(SUM(wh_used),0) AS total_wh_used, MAX(logged_at) AS last_mission_at FROM ride_log;
CREATE VIEW IF NOT EXISTS v_battery_trend AS
SELECT DATE(logged_at) AS ride_date, ROUND(AVG(draw_rate),2) AS avg_draw_rate, ROUND(AVG(distance_mi),1) AS avg_distance, COUNT(*) AS ride_count FROM ride_log WHERE logged_at IS NOT NULL GROUP BY ride_date ORDER BY ride_date DESC;
`;
