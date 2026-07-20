# Mission Control — Claude Context
**Last updated:** 2026-07-18
**Version:** v0.4.18 (build 49)

> Detailed technical reference (architecture, calculations, DB schema, BLE session
> flow) lives in `mobile/CLAUDE.md` — keep that one current after every session.
> This file is the higher-level product/business context.

## What This Is
An e-bike companion app for Android. Not a telemetry mirror — a logging, analysis, and AI advisory layer that works alongside any e-bike's companion app. Target users: Movcan V70 owners as initial beta community, expanding to all e-bike riders. Built in React Native 0.73.4, bare workflow (no Expo runtime), Android only.

## Current Status
- **Live:** In development. Not yet on Play Store.
- **Version:** v0.4.18 (build 49)
- **Platform:** Android only
- **AI chat:** Wired to Claude API (`claude-sonnet-4-6`), user supplies their own key in-app — works, not blocked
- **BLE:** V70 mutual authentication handshake complete and stable; live telemetry flowing at ~150ms
- **Ride logging:** Fully manual (LOG MISSION form) as of v0.4.12 — the earlier BLE auto-save pipeline was built, then deliberately removed for being unreliable/surprising. BLE now supplies live telemetry only.

## Tech Stack
| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | React Native 0.73.4 | Bare workflow — no Expo dependency in the project |
| Platform | Android only | iOS deferred |
| Storage | SQLite (`ebike.db`) + RNFS sidecar JSON | Migration from AsyncStorage/JSON complete |
| AI | Claude Sonnet 4.6 API | User-supplied key, entered in CHAT tab |
| BLE | react-native-ble-plx | Movcan V70 only currently |
| Keep awake / PiP | ScreenModule.kt (native) | FLAG_KEEP_SCREEN_ON active full session; enterPip() stub ready, not yet wired to UI |

## Architecture Decisions
- **Mission Control complements Movcan companion app — does not compete with it.** Movcan app handles live hardware telemetry. Mission Control handles logging, analysis, AI advisory.
- **GPS speed/distance replaces BLE speed/trip.** GPS via `@react-native-community/geolocation` is universal, works for all bikes, accurate enough for consumption calculations.
- **Battery draw is manual entry model, BLE-assisted.** User logs a mission with distance + end battery %; app computes `drawRate = battUsed / distance`. When BLE is connected, a live draw rate is also computed from GPS distance + live battery % and blended into the range agent — but the ride log itself is always a deliberate manual entry, not an auto-save.
- **Auto-logging on BLE disconnect was tried and removed (v0.4.9–v0.4.12).** It caused phantom rides and UX confusion (unwanted modals popping on reconnect, stale-state bugs). Current position: don't resurrect a silent auto-save pipeline without a strong reason — manual LOG MISSION is the intended UX.
- **Baseline consumption rates are derived from logged rides**, not hardcoded — `overallAvg()` and `runRangeAgent()` are both distance-weighted averages over `rideLog`, anchored by a small fixed virtual-mile prior so early estimates aren't wild.
- **Gear changes update tire spec automatically** when a "Tires" mod is logged (see `tireSizeFromMod` flag) — no separate recalibration prompt exists yet.
- **Charging is tracked separately from riding, and needs no BLE connection.** (v0.4.14–0.4.15) A time-based tiered charge-rate model estimates % while on the charger; user-entered actual readings recalibrate the estimate going forward; a live "ON CHARGER" banner surfaces on every Mission sub-tab. See `mobile/CLAUDE.md` → Charging timer for the algorithm.
- **Starting battery zone is surfaced as UI context, not applied to the estimate.** (v0.4.16 added a high/low-charge draw-rate multiplier; v0.4.17 removed it — the weighted average draw rate already reflects real-world performance across charge levels, so multiplying on top double-penalized the number.) `batteryZone`/`zoneNote` still show as a caveat in the UI. See `mobile/CLAUDE.md` → Range agent.

## Feature Tiers (product plan — not yet gated in code)
| Tier | Model | Price | Features |
|------|-------|-------|---------|
| 1 | No AI | Free PWYW | Manual logging, charge tracking, gear/mods, service history, mode profiles |
| 2 | Local AI | $4.99 flat | Offline pattern analysis, consumption trends, degradation tracking, efficiency scoring |
| 3 | Claude API | $2.99-4.99/mo | Elevation-adjusted range, weather, commute optimizer, conversational advisor |
| Premium | BLE per brand | $2.99-4.99/brand | Deeper hardware integration per bike brand. Movcan V70 first. |

Note: `bike_state.tier`/`sub_expires_at`/`sub_provider`/`sub_receipt` columns exist in the DB schema already, but there's no RevenueCat wiring or tier gating in the app yet — all features are currently unlocked.

## Theme System
| Mode | Background | Accent | Trigger |
|------|-----------|--------|---------|
| Digital Horizon (Day) | #F1F3F5 | #FF5A00 | Default, system light mode |
| Overland Utility (Night) | #1A1D1A | #FF5A00 | System dark mode |

Theme persists via a small RNFS JSON file (`ebike-theme.json`), not AsyncStorage. `ThemeContext` used throughout; `instrC` (instrument colors) stays dark even in Day mode for the Telemetry screen's gauge aesthetic. Brand mark (MWS gold) appears ONLY on the splash screen — never in the riding interface.

## Invariants — Never Change These
- **A1 writes MUST use `writeCharacteristicWithoutResponseForService`**
- **DO NOT add an A3 subscription — corrupts Android GATT queue**
- **DO NOT call `readStaticInfo()` or read A5 — GATT timeout/disconnect**
- **DO NOT call `requestConnectionPriority()` or `requestMTU()`**
- **DO NOT use array index for ride operations — use `logged_at` as unique key**
- **GPS speed/distance is authoritative — never revert to BLE trip/speed values**
- **Battery draw = delta over distance, never a point-in-time reading**
- **Mode selection must propagate to ALL calculations that use consumption rate**
- **MWS brand mark never appears in the riding interface**
- **Files never to touch without explicit instruction:** `src/services/BleService.ts`, `src/services/BleAuth.ts`, `src/services/BleEncryption.ts` — weeks of reverse-engineering went into the working handshake. `BleContext.tsx`'s GPS/draw-rate logic is safe to modify; its BLE status callback structure and service integration are not.

## Known-stale / unused code (do not build on top of these without asking)
- `App.tsx.broken`, `EbikeApp/`, `TempApp/` at repo root — dead leftovers, not referenced anywhere
- Root-level `src/db/` and `backend/` (Node server hitting `localhost:3000`) — an early prototype superseded by the SQLite-in-app approach now used in `mobile/`
- `mobile/src/screens/RideTrackingScreen.tsx`, `mobile/src/components/RideStats.tsx`, `mobile/src/services/rideService.ts`, `mobile/src/types/ride.ts` — an earlier ride-tracking screen that called the same dead `localhost:3000` backend; not imported by `App.tsx`, fully superseded by `MissionControlScreen`/`RideTab`

## Pending / Deferred
- **PiP handlebar mode** — `enterPip()` stub is wired natively; needs a UI trigger (long-press, disconnect event, etc.)
- **RevenueCat IAP / tier gating** — schema supports it, nothing wired in-app yet
- **CUSTOM ride mode** — currently falls through to CRUISER baseline (1.75%/mi); no dedicated UI for user-defined baseline
- **TFLite/ONNX range model** — potential upgrade path after ~200 tagged production rides
- **Notification year assumption** — `parseDateStr` uses current year for rides without an explicit year; rides logged across a year boundary will sort incorrectly (low priority)
- **Battery threshold notifications** (20%, 10% defaults) — not implemented; only the daily preflight-check notification exists
- **Terrain-aware range prediction, GPX import, commute optimizer** — future Tier 2/3 AI ideas, not started

## Known Issues (as of v0.4.17)
- None currently tracked as open bugs. The historical issues below (hardcoded baselines, mode not propagating, incorrect draw formula) were fixed in earlier releases — see `mobile/CLAUDE.md` changelog for the specific fixes if you need the history.

## Real Ride Benchmarks (Movcan V70, developer's bike)
- Flat commute out: 21 miles, 1500ft elevation, Max Range mode, 2.47%/mi, 54% battery, ~1hr 20min
- Flat commute home: same route, Cruiser mode, 2.78%/mi, 57% battery, ~45-50min
- Longest logged ride: 42 miles roundtrip, returned with 25% battery
- Current tires: heavy (3lbs total added vs previous set) — explains spike in draw rate vs early baseline

## Claude Code Session Starter
"I'm working on Mission Control — an e-bike companion app in React Native 0.73.4, bare workflow (no Expo), Android only. Pull the repo and read this CLAUDE.md plus `mobile/CLAUDE.md` in full before making any changes. Respect ALL invariants listed. The app complements the Movcan companion app — it does not replace it. Confirm you understand the current version, structure, and invariants before I give you the next task."

## Available Skills
Skills live at github.com/MysterWolf/skills. Pull that repo and read README.md
to see all available skills before starting work.

Relevant skills for this repo:
- edit-component — safe editing protocol, context first, invariants respected
- update-context — update this CLAUDE.md and `mobile/CLAUDE.md` after a session, commit and push
- audit-repo — read-only snapshot of repo state
- spinup-app — reference for app architecture patterns
