# Mission Control — Claude Context
**Last updated:** June 2026
**Version:** v0.4.4 (build 36)

## What This Is
An e-bike companion app for Android. Not a telemetry mirror — a logging, analysis, and AI advisory layer that works alongside any e-bike's companion app. Target users: Movcan V70 owners as initial beta community, expanding to all e-bike riders. Built in React Native 0.81.5, Expo SDK 53 bare workflow, Android only.

## Current Status
- **Live:** In development. Not yet on Play Store.
- **Version:** v0.4.4 (build 36)
- **Platform:** Android only
- **Release target:** Mid-June or July 2026
- **AI chat:** Wired to Claude API — blocked pending Anthropic account resolution

## Tech Stack
| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | React Native 0.81.5 | Expo SDK 53 bare workflow |
| Platform | Android only | iOS deferred |
| Storage | AsyncStorage → SQLite | Migration pending |
| AI | Claude Sonnet 4.6 API | Tier 3, blocked on account |
| BLE | react-native-ble-plx | Movcan V70 only currently |
| Keep awake / PiP | ScreenModule.kt (native) | FLAG_KEEP_SCREEN_ON full session; enterPip() stub ready for handlebar PiP |

## Architecture Decisions
- **Mission Control complements Movcan companion app — does not compete with it.** Movcan app handles live hardware telemetry. Mission Control handles logging, analysis, AI advisory.
- **GPS speed replaces BLE speed.** GPS via geolocator is universal, works for all bikes, accurate enough for consumption calculations.
- **Battery draw is manual entry model.** User inputs battery % periodically. App calculates draw rate as: (battery_start % - battery_now %) / distance_traveled. This feeds the AI agent.
- **Auto-logging via BLE is a future premium add-on** (~$2.99-4.99 per brand), NOT a v1 feature. Movcan V70 is the first integration when built.
- **Telemetry screen is being reconsidered.** Replace with event-driven popups — motor draw stops → popup shows battery %, miles ridden, draw rate. App runs in background while phone used for navigation/music/dashcam.
- **Baseline consumption rates must be derived from logged rides** — not hardcoded. Hardcoded baselines are a known bug to fix.
- **Gear changes trigger recalibration prompt.** When significant mod logged → ask "recalibrate baseline from this point forward?"

## Feature Tiers
| Tier | Model | Price | Features |
|------|-------|-------|---------|
| 1 | No AI | Free PWYW | Manual logging, charge tracking, gear/mods, service history, mode profiles |
| 2 | Local AI | $4.99 flat | Offline pattern analysis, consumption trends, degradation tracking, efficiency scoring |
| 3 | Claude API | $2.99-4.99/mo | Elevation-adjusted range, weather, commute optimizer, conversational advisor |
| Premium | BLE per brand | $2.99-4.99/brand | Auto-logging. Movcan V70 first. Each brand separate. |

## Theme System
| Mode | Background | Accent | Trigger |
|------|-----------|--------|---------|
| Digital Horizon (Day) | #F1F3F5 | #FF5A00 | Default, system light mode |
| Overland Utility (Night) | #1A1D1A | #FF5A00 | System dark mode |

Theme persists via AsyncStorage. ThemeContext used throughout. Brand mark (MWS gold) appears ONLY on splash screen and About page — never in riding interface.

## Invariants — Never Change These
- **A1 writes MUST use writeCharacteristicWithoutResponseForService**
- **DO NOT add A3 subscription — corrupts Android GATT queue**
- **DO NOT call readStaticInfo() or read A5 — GATT timeout/disconnect**
- **DO NOT call requestConnectionPriority() or requestMTU()**
- **DO NOT use array index for ride operations — use logged_at as unique key**
- **GPS speed is authoritative — never revert to BLE speed for distance/speed**
- **Battery draw = delta over distance, never a point-in-time reading**
- **Mode selection must propagate to ALL calculations that use consumption rate**
- **MWS brand mark never appears in the riding interface**

## Pending Work (Priority Order)
1. Fix calculation bugs — mode not propagating to formulas, draw formula incorrect, averages wrong
2. GPS speed integration via geolocator — replace BLE speed
3. Battery draw formula fix — delta over distance
4. Recalibration feature — manual reset + gear-change trigger
5. Event-driven popup on motor draw stop
6. PiP handlebar mode — wire enterPip() from ScreenModule into UI; stub already in place
7. Telemetry screen reconsideration — replace with popup model
8. Local AI foundation (Tier 2) — data interface design first
9. SQLite migration from AsyncStorage
10. RevenueCat IAP integration
11. Battery threshold notifications (20%, 10% defaults)
12. Terrain-aware range prediction (Tier 2/3)
13. GPX file import
14. Commute optimizer (Tier 3 AI)

## Known Issues
- Baseline consumption rates are hardcoded — not derived from logged rides
- Ghost baseline from development builds (pre-tire change, pre-developer options) still affecting max range estimate
- Mode selection confirmed not propagating to all calculations
- Battery draw formula incorrect — not calculating as delta over distance

## Real Ride Benchmarks (Movcan V70, developer's bike)
- Flat commute out: 21 miles, 1500ft elevation, Max Range mode, 2.47%/mi, 54% battery, ~1hr 20min
- Flat commute home: same route, Cruiser mode, 2.78%/mi, 57% battery, ~45-50min
- Longest logged ride: 42 miles roundtrip, returned with 25% battery
- Current tires: heavy (3lbs total added vs previous set) — explains spike in draw rate vs early baseline

## Claude Code Session Starter
"I'm working on Mission Control — an e-bike companion app in React Native 0.81.5 with Expo SDK 53 bare workflow, Android only. Pull the repo and read CLAUDE.md before making any changes. Respect all invariants. The app complements the Movcan companion app — it does not replace it. Confirm you understand the structure and invariants before I give you the next task."

## Changelog
### v0.4.4 (build 36) — June 2026
- Fix: parseDateStr used new Date(string) which Hermes silently rejects for non-ISO formats — replaced with numeric Date constructor (year, month, day, hour, minute) to parse "May 15, 2:30 PM" reliably
- Fix: week collapse toggle stuck in implicit-open/explicit-open loop — seeded expandedWeeks with first group key via useEffect; removed size===0 early return from isWeekExpanded; toggleWeek now receives currentlyExpanded from render site

### v0.4.5 (build 35) — June 2026
- Fix: ride history sort broken — saveRideLog re-derived logged_at from display string on every save; Hermes rejected the format and fell back to now(), stamping all rides with today's date
- Fix: loadRideLog now parses logged_at from date_str ("May 15, 2:30 PM" → ISO) as the recovery path; corrupted DB rows self-heal on first launch
- Feat: MISSION HISTORY now grouped into collapsible calendar-week sections (Mon–Sun); month dividers between weeks; most recent week open by default
- Fix: edit/delete modal now keys on logged_at instead of date string

### v0.4.4 (build 34) — June 2026
- Sort and grouping work (see v0.4.5 for the underlying timestamp fix that made them fully correct)

### v0.4.3 (build 33) — May 2026
- ScreenModule.kt: native Android module owns FLAG_KEEP_SCREEN_ON + enterPip() stub
- Screen stays on for entire app session (activates in AppContent, cleans up on unmount)
- PiP ready to wire: enterPip(ratioWidth, ratioHeight) — caller controls aspect ratio
- src/utils/ScreenModule.ts: JS wrapper; no expo dependency

### v0.4.1–0.4.2 — May 2026
- BLE mutual authentication complete (~1.5s handshake)
- Binary telemetry flowing at ~150ms
- GPS speed integrated as authoritative source (replaced BLE trip_raw)
- Live draw rate calculating: (battery_start_pct - battery_now_pct) / gps_miles
- Range agent (rangeAgent.ts): 5 rules, confidence scoring, EST RANGE tile live
- Two-mode theme system complete: Digital Horizon (day) + Overland Utility (night)
- ThemeContext + AsyncStorage persistence implemented
- MWS reusable splash screen widget implemented
- Claude API chat panel wired (6 presets, full telemetry context) — blocked on account
- Ride logging, edit, delete, sort, CSV/JSON export working
- Auto-logging moved to future premium brand-specific add-on

## Available Skills
Skills live at github.com/MysterWolf/skills. Pull that repo and read README.md
to see all available skills before starting work.

Relevant skills for this repo:
- edit-component — safe editing protocol, context first, invariants respected
- update-context — update this CLAUDE.md after session, commit and push
- audit-repo — read-only snapshot of repo state
- spinup-app — reference for app architecture patterns

## Updated Claude Code Session Starter
"I'm working on Mission Control — an e-bike companion app in React Native 0.81.5
with Expo SDK 53 bare workflow, Android only at github.com/MysterWolf/ebike-app.
First pull github.com/MysterWolf/skills and read README.md so you know what skills
are available. Then pull this repo and read CLAUDE.md in full. Respect ALL invariants
listed before making any changes. The app complements the Movcan companion app —
it does not replace it. Confirm you understand the structure, invariants, and
available skills before I give you the next task."
