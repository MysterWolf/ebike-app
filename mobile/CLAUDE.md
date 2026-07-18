# Mission Control — Project Context

React Native e-bike companion app for the Movcan V70.
Android only. Bare workflow (no Expo runtime).

**Current version:** 0.4.17 (versionCode 48)
**Package:** `com.ebikeapp`
**Repo:** https://github.com/MysterWolf/ebike-app (branch: master)
**APK output:** `android/app/build/outputs/apk/release/ebike-mission-control-release.apk`

---

## Stack

| Layer | Library |
|---|---|
| Framework | React Native 0.73.4, bare workflow |
| BLE | react-native-ble-plx |
| GPS | @react-native-community/geolocation |
| Storage | react-native-sqlite-storage (ebike.db) + RNFS sidecar JSON |
| AI chat | Direct Anthropic API (user-supplied key, `claude-sonnet-4-6`) |
| Keep awake / PiP | `ScreenModule.kt` (native) | `FLAG_KEEP_SCREEN_ON` active full session; `enterPip(w,h)` stub ready |

---

## CRITICAL — Do not touch

These files implement a working V70 mutual authentication handshake that took weeks to
reverse-engineer. Any change to the BLE layer risks breaking the handshake.

- `src/services/BleService.ts`
- `src/services/BleAuth.ts`
- `src/services/BleEncryption.ts`

**Hard invariants:**
- A1 writes use `writeCharacteristicWithoutResponseForService` — never change to write-with-response.
- No A3 subscription. A3 never fires on the V70; subscribing corrupts the GATT queue.
- No `readStaticInfo()`, no MTU negotiation, no connection priority calls.
- The auth state machine in `BleAuth.ts` is correct — do not reorder or add steps.

`BleContext.tsx` manages the BLE session, GPS tracking, and live draw rate.
The GPS additions and live draw rate logic are safe to modify; the BLE status callback
structure and BLE service integration must not be restructured.

---

## Architecture

```
App.tsx
├── showSplash gate (MWSSplash, 3 s)
└── ThemeProvider
    └── AppContent  ← activateKeepAwake() on mount / deactivateKeepAwake() on unmount
        ├── DB init + JSON→SQLite migration
        └── BleProvider (BleContext.tsx)
            ├── MissionControlScreen   [Mission tab]
            │   ├── state: AppState (loaded from SQLite via storage.ts)
            │   ├── SetupWizard        [first-run only — 3-step bike identity/electrical/starting-point]
            │   ├── EditBikeScreen     [overlay — make/model/nickname, reachable from OpsTab]
            │   ├── MetricsRows        [top tiles: odometer, battery, est.range, draw rates]
            │   ├── TabBar             [ride | bike | gear | ops | chat]
            │   └── Tabs:
            │       ├── RideTab        [battery, ride mode, manual log, mission history, draw rate by mode]
            │       ├── BikeTab        [bike specs — identity, electrical, physical, specs summary]
            │       ├── GearTab        [gear loadout — footwear/helmet/gloves/jacket/cargo/lock, custom items]
            │       ├── OpsTab         [notifications, display mode, hardware rig status, pre-mission
            │       │                   checklist, tire pressure log, service log, mod log, AI analysis
            │       │                   shortcuts, bike profile, data export/import/reset — see below]
            │       └── ChatPanel      [AI analyst, API key, quick queries]
            └── TelemetryScreen        [Telemetry tab]
                └── Live BLE data + GPS speed + draw rate
```

Both screens stay mounted (`display: none` for inactive) — BLE and GPS state survive
tab switches without reconnect.

---

## State

### AppState (`src/state/types.ts`)
Single source of truth. Persisted to SQLite + sidecar JSON on every `update()` call.

Key fields relevant to ride pipeline:
- `battery` — last manually set or BLE-synced battery %
- `rideMode` — `MAX_RANGE | CRUISER | SPORT | CUSTOM`
- `rideLog: RideLogEntry[]` — array of completed rides
- `odometer` — cumulative miles

### RideLogEntry
```ts
{ distance: number; batteryUsed: number; drawRate: number;
  date: string; logged_at?: string; rideMode?: string; notes?: string }
```
`drawRate = batteryUsed / distance` (%/mi). This is the core metric everywhere.

---

## BLE + GPS session (`BleContext.tsx`)

**Ride logging is fully manual** — users log rides via the LOG MISSION form in RideTab.
BLE provides live telemetry only; there is no auto-save pipeline.

**On BLE connect (`status → 'connected'`):**
1. Reset `gotFirstTelemetryRef`, `startBattPctRef`, `lastBattPctRef`
2. Start `Geolocation.watchPosition` — accumulates `gpsDistRef` via haversine

**Every telemetry packet (~150 ms):**
- Merges into `telemetry` state (battery_v, battery_pct, motor_w, trip_raw, etc.)
- First packet → captures `startBattPctRef` (for live draw rate)
- Updates `lastBattPctRef`, `lastKnownBlePct`, persists to `last_known_battery.json`
- If `gpsDistRef >= 0.1 mi`: computes `liveDrawRate = (startBattPct - nowBattPct) / gpsDistMiles`

**On disconnect:**
1. Stop GPS watch, clear `liveDrawRate`
2. `MissionControlScreen` syncs `lastKnownBlePct` → `state.battery` on disconnect

**Context values exposed:**
- `status`, `statusMsg`, `telemetry`, `log`
- `connect()`, `disconnect()`, `setRideMode()`
- `gpsSpeedMph: number | null` — live GPS speed
- `gpsDistMiles: number` — accumulated GPS distance this ride
- `liveDrawRate: number | null` — live draw rate, null below 0.1 mi
- `lastKnownBlePct: number | null` — last BLE battery %, persisted across restarts

---

## Calculations (`src/utils/calculations.ts`)

| Function | Description |
|---|---|
| `modeBaseline(mode)` | Returns %/mi baseline: MAX_RANGE=1.2, SPORT/HARD=4.7, else 1.75 |
| `overallAvg(state)` | Distance-weighted avg across all rides + 20 virtual-mile anchor at 1.75 |
| `estRange(state, batteryPct?)` | `batteryPct / overallAvg`; callers pass live BLE value |
| `chargeTime(state, batteryPct?)` | `capacityAh × needed% / chargerAmps × (voltage / 58.8)` — 58.8V is 14S Li-ion full-charge voltage; corrects for nominal vs charge voltage difference |
| `lastRideDraw(state)` | Most recent ride's drawRate by `logged_at` |

Key invariant: `NEUTRAL_BASELINE = 1.75` — mode switches do not affect `overallAvg`.

---

## Range agent (`src/utils/rangeAgent.ts`)

Pure function, no native deps. Input: `{ currentBatteryPct, currentMode, rideHistory, liveDrawRate, neutralBaseline }`.

Five rules (in order):
1. Mode-specific distance-weighted average (HARD normalised → SPORT)
2. Sample confidence: <3 rides = low, 3–7 = medium, 8+ = high
3. Live draw rate blend: 50/50 with historical avg when `liveDrawRate != null`; upgrades `low → medium`
4. Outlier guard: exclude rides where `drawRate > 2 × neutralBaseline`
5. Mode fallback: no valid history → use `liveDrawRate` or `neutralBaseline`, confidence = low

`MetricsRows` gates `liveDrawRate` passed to agent at **0.5 mi** (noisier below that).

---

## Charging timer (`src/utils/chargeEstimate.ts`)

No BLE dependency — pure time-based estimate while the bike is on the charger. Lives in
`AppState.chargeSession` (`ChargeSession`), persisted to the sidecar JSON like other config
fields (not SQLite — it's transient session state, not a log).

- `ChargeSession { isCharging, startTime, startPct, lastActualPct, lastActualTime, calibration[] }`
- `estimatePct(startPct, elapsedMinutes)` — tiered 52V lithium charge rate, walked across
  tier boundaries: 0–20% at 1.5%/10min, 20–80% at 1.0%/10min, 80–100% at 0.5%/10min
- `currentChargeEstimate(session, now?)` — re-anchors from `lastActualPct`/`lastActualTime`
  once the user has logged an actual reading, and scales the base rate by how far off the
  last prediction was (clamped 0.4×–2.5×, same outlier-guard spirit as `rangeAgent.ts`)
- `elapsedLabel(startTime, now?)` — `"1h 23m"` display string

Elapsed time and the estimate are always computed from `startTime`/`now()` at render time —
never a running interval that would drift or break when backgrounded. OpsTab's 60s
`setInterval` only forces a re-render to refresh the display; it holds no state of its own.

UI lives in OpsTab → CHARGING (top section). "DONE CHARGING" writes a `ChargeLogEntry` into
the existing `chargeLog` and sets `state.battery` to the final actual %, same as RideTab's
existing "POST-CHARGE UPDATE" flow — so the rest of the app (EST. RANGE, etc.) reflects it
immediately rather than the charging timer keeping a second, disconnected battery record.

---

## Database (`src/db/`)

SQLite via `react-native-sqlite-storage`. DB name: `ebike.db`.

Key tables: `bike_state`, `ride_log`, `charge_log`, `tire_pressure_log`,
`service_log`, `mod_log`, `messages`, `telemetry_readings`, `ai_usage_log`.
Views: `v_mission_history`, `v_ride_stats`, `v_battery_trend`.

**`telemetry_readings`, `ai_usage_log`, the three views, and the `tier`/`sub_expires_at`/
`sub_provider`/`sub_receipt` columns on `bike_state` are schema-only right now** — defined
in `schema.ts` but nothing in the app reads or writes them yet (no telemetry-per-reading
logging, no AI usage tracking, no subscription/tier gating implemented).

Schema versioned via `_schema_version` table. Current migrations:
- v1: Initial schema
- v2: Add `model`, `nickname` to `bike_state`
- v3: Add auto-ride columns to `ride_log` (`start_time`, `end_time`, `duration_minutes`,
  `start_battery_v`, `end_battery_v`, `distance_km`, `auto_logged`) — these columns are
  also currently unused; they were added for the BLE auto-ride pipeline that was later
  removed (v0.4.12). `saveRideLog`/`loadRideLog` in `storage.ts` never touch them.

`storage.ts` assembles full `AppState` from all tables + sidecar JSON
(`ebike-config.json` stores `apiKey`, `customGearOptions`, `checklistState`,
`preflightSchedules`, `preflightNotifEnabled`, `hasAskedNotifPermission`).

---

## AI chat (`src/utils/ai.ts`)

- `buildSystem()` — E-Bike Range Analyst persona (rules: no weather, mission not ride, etc.)
- `buildContext(state)` — telemetry snapshot injected into every message
- `callAPI(text, state, history)` — direct `fetch` to Anthropic API, last 20 messages as history
- `QUICK_QUERIES` — 6 preset buttons (Range, Charge, Efficiency, Deepburn, Wildcard, Service)
- `OPS_PROMPTS` — 5 OpsTab action prompts (pre-mission, BMS, service, gear, debrief)

Model: `claude-sonnet-4-6`, max_tokens: 1024.

---

## Theme (`src/theme/`)

Two themes: `DIGITAL_HORIZON` (day, warm light) and `OVERLAND_UTILITY` (night, dark green).
Access via `useTheme()` → `{ C: ThemeTokens, instrC: InstrumentColors }`.

`C.telemetry` (#00B464) = live/connected green — used for high confidence, live BLE indicators.
`C.accent` (#FF5A00) = orange — primary action colour.
`instrC` = always dark (instrument panel aesthetic, even in day mode).

---

## Splash (`src/components/shared/MWSSplash.tsx`)

Reusable MWS branded splash. Drop-in for any app:
```tsx
<MWSSplash appName="Mission Control" tagline="Ride farther. Ride smarter." onComplete={fn} />
<MWSSplash appName="CannaGuide" tagline="Know what you're lighting." onComplete={fn} />
<MWSSplash appName="DPad Pilot" tagline="A simple LG TV remote." onComplete={fn} />
```
Logo: `src/assets/brand/mws-logo.png`. Duration default: 3000 ms.

---

## Screen / PiP (`src/utils/ScreenModule.ts` + `ScreenModule.kt`)

`ScreenModule.kt` — native Android module registered via `ScreenModulePackage`.

| Method | What it does |
|---|---|
| `activateKeepAwake()` | Adds `FLAG_KEEP_SCREEN_ON` to Activity window (UI thread) |
| `deactivateKeepAwake()` | Clears the flag |
| `enterPip(w, h)` | Enters PiP mode at given aspect ratio (API 26+, UI thread) |
| `exitPip()` | Stub — PiP exits via user interaction; retained for future hooks |

`App.tsx` calls `activateKeepAwake()` in `AppContent`'s first `useEffect`.
To trigger PiP later: call `enterPip(16, 9)` (landscape strip) or `enterPip(2, 1)` (narrow portrait).
The `.gitignore` has `android/` — new `.kt` files in `com.ebikeapp` must be `git add -f`'d.

---

## Battery SOC estimation

Mission Control uses **voltage-based SOC** — `(voltage - 42.0) / (58.8 - 42.0) × 100`, clamped 0–100.

- 42.0V = 0% (14S fully depleted), 58.8V = 100% (14S fully charged)
- Voltage multiplier for the V70 BLE packet: `buf[5] × 0.325` (confirmed via raw logcat: buf[5]=181 at full charge → 58.8V)
- **A 3–5% offset vs the Movcan companion app is expected and correct.** The Movcan uses coulomb counting (integrates current out of the pack). Voltage-based estimation reads slightly higher at the top of the charge curve where cell voltage is flat. This is not a bug — it is a fundamental difference in estimation method.

---

## Notifications (`src/utils/NotificationService.ts`)

Wraps a native `NotificationModule` (Kotlin). Only feature today: **daily preflight-check
alarms** — up to 3 concurrent `PreflightSchedule` entries (`{id, hour, minute}`), each fires
a notification via `PreflightReceiver.kt` and sets a `preflightResetPending` flag in the
`app_flags` SQLite table, which resets `checklistState` on next app load. Configured from
OpsTab → NOTIFICATIONS. No battery-threshold or charging-related notifications exist yet.

---

## Data export/import (`src/utils/dataExport.ts`)

- `exportData()` — shares the full `AppState` as JSON via the OS share sheet (used for backup)
- `exportRidesCsv()` / `importRidesCsv()` — CSV round-trip for `ride_log` only, distances in km
- `importData()` — restores a full JSON backup; preserves the current API key over the
  imported one unless the current one is empty
All four are wired into OpsTab → DATA MANAGEMENT.

---

## Known-stale / unused code — do not build on these without asking
- `src/screens/RideTrackingScreen.tsx`, `src/components/RideStats.tsx`,
  `src/services/rideService.ts`, `src/types/ride.ts` — an earlier ride-tracking screen that
  called a fake `localhost:3000` backend. Not imported by `App.tsx`; fully superseded by
  `MissionControlScreen` + `RideTab`. `SpeedMonitor.tsx` is only used by this dead screen.
- Repo root (one level above `mobile/`) also has `App.tsx.broken`, empty `EbikeApp/`/`TempApp/`
  dirs, a root `src/db/` prototype, and a `backend/` Node server — none of it touches the real
  app; see root `../CLAUDE.md` for details.

---

## Deferred / not yet implemented

- **PiP handlebar mode** — `enterPip()` stub is wired; needs UI trigger (long-press, disconnect event, etc.)
- **Notification year assumption** — `parseDateStr` uses `new Date().getFullYear()` for rides without a year in `date_str`; rides logged in a different calendar year will sort incorrectly (not a current concern)
- **RevenueCat IAP** — Tier 1 (free) / Tier 2 (pro) subscription gating
- **SQLite migration session** — consolidate JSON sidecar fields into main DB
- **TFLite/ONNX range model** — upgrade path after ~200 tagged production rides
- **CUSTOM ride mode input** — currently falls through to CRUISER baseline (1.75)
- **Theme or UI changes** — deferred

---

## Changelog

### v0.4.17 (build 48) — July 2026
- Fix: removed the battery-zone multiplier from `rangeAgent.ts` — the weighted average
  draw rate already reflects real-world performance across charge levels, so multiplying
  it by a zone factor on top double-penalized the estimate at high/low starting charge
- `getBatteryZoneMultiplier()` deleted entirely; `getBatteryZone()`/`getZoneNote()` kept —
  `batteryZone`/`zoneNote` still flow to `MetricsRows` as informational UI context only,
  no longer distort `estimatedRangeMiles`/`drawRateUsed`
- Fix: Rule 1's `validRides` filter now requires `distance >= 3` (was `distance > 0`) —
  rides under 3 mi have unreliable draw rates (stop/start dominates) and don't represent
  true mode efficiency, so they're excluded from `rangeAgent.ts`'s mode-specific weighted
  average and its confidence/ride-count. Note: `calculations.ts`'s `overallAvg()` (feeds
  the separate OVERALL AVG tile) has its own filter and was *not* changed — short rides
  still count there, which is an intentional scope decision, not an oversight.

### v0.4.16 (build 47) — July 2026
- Feat: battery-zone multiplier in the range agent — real-world V70 data shows draw rate
  is worse starting a ride from a high (>85%) or low (<30%) charge than from the 30-85%
  "sweet spot" (voltage least stable at the extremes of the lithium curve)
- `rangeAgent.ts` — `RangeAgentInput.startBatteryPct` (required); `getBatteryZone`/
  `getBatteryZoneMultiplier` (1.15× high, 1.25× low, 1.0× sweet spot) applied to the draw
  rate after the live blend (Rule 3), before the final range calc; output gains
  `batteryZone: 'optimal' | 'high' | 'low'` and `zoneNote: string`
- `MetricsRows.tsx` — passes `state.battery` as `startBatteryPct` (it only updates on
  ride-end/disconnect-sync or manual log events, never mid-ride, so it already holds the
  session's starting battery % for free — no BLE files touched, no new state); EST. RANGE
  tile shows `zoneNote` as a second subtitle line when the zone isn't optimal

### v0.4.15 (build 46) — July 2026
- Feat: live "ON CHARGER" banner in `MetricsRows` — shown above the metric tiles on every
  Mission sub-tab (RIDE/BIKE/GEAR/OPS/CHAT) whenever a charging session is active, since the
  OPS-tab-only placement from v0.4.14 wasn't discoverable enough in testing
- Tapping the banner jumps to the OPS tab (`onOpenCharging` prop, wired from
  `MissionControlScreen` via `setActiveTab('ops')`)
- Ticks every 60s (same pattern as OpsTab's own timer) to keep elapsed/estimate fresh
  with no BLE connection required

### v0.4.14 (build 45) — July 2026
- Feat: Charging Timer & Battery Estimator — time-based charge % estimate while the bike
  is on the charger, no BLE required
- New `src/utils/chargeEstimate.ts` — tiered charge-rate model (`estimatePct`), calibration-aware
  live estimate (`currentChargeEstimate`), elapsed-time formatter (`elapsedLabel`)
- `state/types.ts` — `ChargeSession`/`ChargeCalibrationPoint` types, `chargeSession` field
  added to `AppState` + `DEFAULT_STATE`
- `storage.ts` — `chargeSession` persisted via the sidecar JSON (same as `preflightSchedules`)
- `OpsTab.tsx` — new CHARGING section (top of tab): START CHARGING (pre-fills from last known
  BLE battery %), live "ON CHARGER" status with elapsed time + estimate, UPDATE ACTUAL %
  (adds a calibration point, re-anchors the estimate), DONE CHARGING (records final actual %
  into the existing `chargeLog` and syncs `state.battery`, same as RideTab's charge logging)
- Root-level docs (`../CLAUDE.md`) updated to match

### v0.4.13 — July 2026
- Fix: LOG MISSION form now asks only for END BATTERY %
- Start battery reads from `state.battery` (already known); no input required
- Removed START BATTERY % field added erroneously in v0.4.11
- Form is now: DISTANCE + END BATTERY % + mode pills + LOG button

### v0.4.12 — July 2026
- Refactor: removed `BatteryUsedModal` and entire auto-ride pipeline
- `BleContext.tsx` — deleted `PendingRide`, `finalizeAutoRide`, `saveRide`, associated state/refs; BLE disconnect no longer triggers any ride-save flow
- `MissionControlScreen.tsx` — removed modal import, handlers, and watcher; only BLE battery sync on disconnect remains
- `BatteryUsedModal.tsx` — deleted
- Ride logging is now fully manual and fully intentional: LOG MISSION form in RideTab only

### v0.4.11 — July 2026
- Fix: LOG MISSION form no longer asks user to calculate battery delta
- Replaced single `BATTERY USED %` field with `START BATTERY %` and `END BATTERY %`
- `logRide()` computes `battUsed = start - end` and `drawRate = battUsed / dist` internally
- `state.battery` updated to `endBat` directly on log (end battery is current battery — no subtraction)
- Distance field moved to full-width row above the battery pair
- Validation: end battery must be less than start battery

### v0.4.10 — June 2026
- Fix: phone lockup on BLE connect after v0.4.9 sideload
- `BatteryUsedModal.tsx` — removed `autoFocus` (was firing on component mount with `visible=false`, popping keyboard before any ride); replaced with `useRef` + `useEffect` that focuses 200ms after modal becomes visible
- `BatteryUsedModal.tsx` — moved `StyleSheet.create()` into `useMemo([C])` so styles are not recreated on every 150ms telemetry re-render
- `MissionControlScreen.tsx` — `handleSaveRide`/`handleSkipRide` now wrapped in `useCallback` so `BatteryUsedModal` doesn't re-render unnecessarily from parent renders
- `BleContext.tsx` — on `'connected'`: clears `pendingRideRef` and calls `setPendingRide(null)` before starting a new ride, dismissing any unanswered modal from a previous ride
- `BleContext.tsx` — `startGpsWatch` now clears any existing watch before starting a new one, guarding against double GPS watch accumulation on rapid reconnect

### v0.4.9 — June 2026
- Feat: manual battery entry modal on ride end (Option B)
- `BleContext.tsx` — `finalizeAutoRide` now sets `pendingRide` state instead of auto-saving; exposes `pendingRide: PendingRide | null` and `saveRide(batteryUsedPct: number | null)` in context value
- New `src/components/BatteryUsedModal.tsx` — overlay modal: "How much battery did you use?", numeric input 0–100, Save / Skip buttons; auto-focuses keyboard on appear
- `MissionControlScreen.tsx` — watches `pendingRide`, shows `BatteryUsedModal`, calls `saveRide(pct)` on Save or `saveRide(null)` on Skip
- `state/types.ts` — `RideLogEntry.batteryUsed` and `.drawRate` are now `number | null`; skipped rides save with null battery fields
- `calculations.ts` — `overallAvg` filters out null-drawRate rides before computing weighted avg
- `rangeAgent.ts` — mode-filter guards `r.drawRate != null` before the `> 0` check
- `ai.ts`, `RideTab.tsx` — null-safe display for batteryUsed/drawRate in history and mode stats
- Draw rate formula unchanged: `battUsed / distMi` — but now computed from user-entered battery, not BLE estimate

### v0.4.8 — June 2026
- Feat: multi-alarm preflight notification scheduler
- Replaced hardcoded 5-slot time picker with 5 category tiles (Morning 5:30 AM, Midday 12:00 PM, Afternoon 3:30 PM, Evening 6:00 PM, Custom cold-open)
- Tapping a tile opens a custom +/− stepper time picker modal (12h display, AM/PM toggle, 5-min minute increments) — no external package needed
- Up to 3 simultaneous daily alarms; each shown in a deletable list below the tiles
- `PreflightReceiver.kt` / `NotificationModule.kt` rewritten with `slotId` support; `REQUEST_CODE_BASE = 42`, `NOTIF_ID_BASE = 1001`; slots 0-2 → request codes 42-44
- `NotificationService.ts` API: `schedulePreflightNotifications(schedules)` cancels all then schedules each slot; `cancelAllPreflightNotifications()` replaces single-cancel
- `storage.ts`: `preflightSchedules: PreflightSchedule[]` added to `SidecarData`; migration from legacy single-alarm fields on first load
- `types.ts`: `PreflightSchedule` interface, `preflightSchedules` field on `AppState` and `DEFAULT_STATE`; legacy `preflightNotifHour/Minute` kept for migration only
- `MissionControlScreen`: startup reschedule uses `schedulePreflightNotifications(state.preflightSchedules)` instead of single-slot call

### v0.4.7 (build 39) — June 2026
- Fix: `rideLog` stale after auto-logged ride — `BleContext` now exposes `lastRideLoggedAt`
  (set after each successful `dbRun` INSERT); `MissionControlScreen` watches it and reloads
  `rideLog` from storage so LAST RIDE / OVERALL AVG / EST. RANGE tiles update immediately
  after disconnect without restarting the app.
- Fix: battery tile showed 0 even after manual input — `lastKnownBlePct ?? state.battery`
  used `??` which doesn't skip `0`, so a persisted zero BLE reading permanently shadowed
  `state.battery`. Fix: sync BLE battery into `state.battery` via `update()` on disconnect
  in `MissionControlScreen`; `MetricsRows` now reads `state.battery` directly (single
  source of truth). Manual input always wins.

### v0.4.6 (build 38) — June 2026
- Fix: voltage multiplier `buf[5] × 0.413` → `0.325` (confirmed via logcat: buf[5]=181 at
  full charge → 58.8V). Percentage formula updated to explicit 14S bounds.
- Fix: on BLE disconnect, hold last BLE-read battery % instead of reverting to manual entry.
  Persisted to `last_known_battery.json` via RNFS.
- Fix: phantom ride logging — ride clock delayed to first telemetry packet; discard rule
  `distMi < 0.1 AND battUsed < 3%` added.
- Docs: Battery SOC estimation section added to CLAUDE.md.

## Build

```bash
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/ebike-mission-control-release.apk
```
