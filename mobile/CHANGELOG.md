# Mission Control — Changelog

All notable changes to Mission Control are documented here.
Format: [version] — date — versionCode — summary.

---

## [0.4.2] — 2026-05-29 — versionCode 32

### Added
- **MWS splash screen** (`src/components/shared/MWSSplash.tsx`) — reusable branded
  splash, props: `appName`, `tagline`, `onComplete`, `duration` (default 3000 ms).
  Gates `ThemeProvider` / `BleProvider` — nothing mounts until splash completes.
- **Brand asset** `src/assets/brand/mws-logo.png` — circular MWS logo (264×242 RGBA).
- **GPS speed & distance** — `BleContext` starts `Geolocation.watchPosition` on BLE
  connect; GPS distance is the authoritative ride distance source. `trip_raw` remains
  as a fallback if no GPS fix is obtained.
- **Live draw rate** (`liveDrawRate`) — `(battery_start_pct − battery_now_pct) / gpsDistMiles`,
  updated every BLE telemetry packet (~150 ms), gated at 0.1 mi minimum.
  Exposed from `BleContext` and displayed in the Telemetry tab.
- **Range agent** (`src/utils/rangeAgent.ts`) — pure rule-based range prediction engine.
  Five rules: mode-specific distance-weighted average, sample confidence scoring,
  50/50 live draw rate blend (at 0.5 mi+), outlier guard (>2× neutral baseline),
  mode fallback to neutral baseline.
- **Confidence display** on EST. RANGE tile — coloured dot + label (● high / ● medium / ● low)
  with `confidenceReason` subtitle. Colours: `C.telemetry` green = high,
  `C.warning` amber = medium, `C.muted` grey = low.

### Fixed
- **EST. RANGE uses live BLE battery** — `estRange()` and `chargeTime()` now accept an
  optional `batteryPct` override; `MetricsRows` passes the live BLE reading when
  connected instead of the last-saved `state.battery`.
- **DRAW RATE BY MODE weighted mean** — mode averages now use distance-weighted mean
  `Σ(drawRate × distance) / Σ(distance)`. Short rides no longer disproportionately
  skew the per-mode figure.
- **Stable overall average** — `overallAvg()` uses a fixed `NEUTRAL_BASELINE = 1.75`
  anchor instead of `modeBaseline(state.rideMode)`. Switching ride modes no longer
  shifts the blended average.
- **AI context SPORT/CUSTOM labels** — `modeLabels` in `ai.ts` now includes `SPORT`
  and `CUSTOM`; legacy `HARD` entries map to the same label as `SPORT`.
- **`finalizeAutoRide` battery delta** — prefers direct `battery_pct` from telemetry
  (`startBattPctRef` / `lastBattPctRef`) over the voltage-to-percent conversion.
  Voltage conversion retained as fallback only.

---

## [0.3.9] — 2026-05 — versionCode ~29

### Changed
- Warm theme overhaul across all screens.
- New app launcher icon.
- Header renamed to "Mission Control".

---

## [0.3.8] — 2026-05

### Added
- V70 mutual BLE authentication handshake (A1/A2 write sequence).
- Binary telemetry decoder for 16-byte A4 packets (proven against 3595-packet GATT capture).
- Auto ride logging on BLE disconnect — saves distance, battery used, draw rate, duration.
- Battery voltage fix: `buf[5] × 0.413 = volts` (corrected from `/3` approximation).
- Ride mode tracking in auto-logged rides.

---

## [0.3.7] — 2026-05

### Fixed
- Ride log edit, delete, and sort order.
- Live battery display when BLE connected.

### Added
- File-based BLE diagnostic logger; Share Log button in Telemetry tab.

---

## [0.3.x] — Earlier

- V70 BLE telemetry decoder from GATT capture analysis.
- A3 subscription removed — confirmed never fires; was corrupting GATT queue.
- Android foreground service to keep BLE alive during rides.
- Edit Bike Profile feature.
- Custom launcher icon.
- Battery restore on ride log delete.
- Always-mounted dual-screen shell (Mission / Telemetry) — BLE state survives tab switch.
