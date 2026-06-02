# Mission Control — Project Context

React Native e-bike companion app for the Movcan V70.
Android only. Bare workflow (no Expo runtime).

**Current version:** 0.4.5 (versionCode 37)
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

`BleContext.tsx` contains the auto-ride pipeline that wraps the BLE session.
The GPS additions and live draw rate logic are safe to modify; the BLE status callback
structure and `finalizeAutoRide` refs pattern must not be restructured.

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
            │   ├── MetricsRows        [top tiles: odometer, battery, est.range, draw rates]
            │   ├── TabBar             [ride | bike | gear | ops | chat]
            │   └── Tabs:
            │       ├── RideTab        [battery, ride mode, manual log, mission history]
            │       ├── BikeTab        [bike specs]
            │       ├── GearTab        [gear loadout]
            │       ├── OpsTab         [pre-mission check, BMS, service, gear, debrief]
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

## BLE + GPS ride pipeline (`BleContext.tsx`)

**On BLE connect (`status → 'connected'`):**
1. Reset all ride refs (`rideStartTimeRef`, `startBattVRef`, `startBattPctRef`, etc.)
2. Start `Geolocation.watchPosition` — accumulates `gpsDistRef` via haversine
3. First telemetry packet → capture `startBattPctRef` and `startBattVRef`

**Every telemetry packet (~150 ms):**
- Merges into `telemetry` state (battery_v, battery_pct, motor_w, trip_raw, etc.)
- Updates `lastBattPctRef`, `lastBattVRef`, `lastTripRawRef`
- If `gpsDistRef >= 0.1 mi`: computes `liveDrawRate = (startBattPct - nowBattPct) / gpsDistMiles`

**On disconnect:**
1. Stop GPS watch, clear `liveDrawRate`
2. `finalizeAutoRide()` — discards if < 2 min; saves to `ride_log` via `dbRun`

**Distance source priority:** GPS (`gpsDistRef`) > `trip_raw` fallback

**Context values exposed:**
- `status`, `statusMsg`, `telemetry`, `log`
- `connect()`, `disconnect()`, `setRideMode()`
- `gpsSpeedMph: number | null` — live GPS speed
- `gpsDistMiles: number` — accumulated GPS distance this ride
- `liveDrawRate: number | null` — live draw rate, null below 0.1 mi

---

## Calculations (`src/utils/calculations.ts`)

| Function | Description |
|---|---|
| `modeBaseline(mode)` | Returns %/mi baseline: MAX_RANGE=1.2, SPORT/HARD=4.7, else 1.75 |
| `overallAvg(state)` | Distance-weighted avg across all rides + 20 virtual-mile anchor at 1.75 |
| `estRange(state, batteryPct?)` | `batteryPct / overallAvg`; callers pass live BLE value |
| `chargeTime(state, batteryPct?)` | `capacityAh × needed% / chargerAmps × 1.15` |
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

## Database (`src/db/`)

SQLite via `react-native-sqlite-storage`. DB name: `ebike.db`.

Key tables: `bike_state`, `ride_log`, `charge_log`, `tire_pressure_log`,
`service_log`, `mod_log`, `messages`, `telemetry_readings`, `ai_usage_log`.

Schema versioned via `_schema_version` table. Current migrations:
- v1: Initial schema
- v2: Add `model`, `nickname` to `bike_state`
- v3: Add auto-ride columns to `ride_log` (`start_time`, `end_time`, `duration_minutes`,
  `start_battery_v`, `end_battery_v`, `distance_km`, `auto_logged`)

`storage.ts` assembles full `AppState` from all tables + sidecar JSON
(`ebike-config.json` stores `apiKey`, `customGearOptions`, `checklistState`).

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

## Deferred / not yet implemented

- **PiP handlebar mode** — `enterPip()` stub is wired; needs UI trigger (long-press, disconnect event, etc.)
- **Notification year assumption** — `parseDateStr` uses `new Date().getFullYear()` for rides without a year in `date_str`; rides logged in a different calendar year will sort incorrectly (not a current concern)
- **RevenueCat IAP** — Tier 1 (free) / Tier 2 (pro) subscription gating
- **SQLite migration session** — consolidate JSON sidecar fields into main DB
- **TFLite/ONNX range model** — upgrade path after ~200 tagged production rides
- **CUSTOM ride mode input** — currently falls through to CRUISER baseline (1.75)
- **Theme or UI changes** — deferred

---

## Build

```bash
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/ebike-mission-control-release.apk
```
