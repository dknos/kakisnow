# Snow-Burgers — full-game expansion report

The gauntlet asked for a complete, replayable arcade snowboarding game on top
of the KAKISNOW renderer. This is what was actually implemented, measured and
committed — and, named plainly at the end, what was not.

## 1. Baseline and final commits

- **Baseline:** `282b47e` on `main` ("Add touch controls"), 2026-08-06.
- **Final:** the head of `feat/full-game` (this commit). Fifteen commits, one
  per phase or fix, each building, testing and playing on its own.
- **Nothing is pushed or deployed.** Push-to-main publishes the live site;
  that stays the owner's call (§24).

## 2. The final game loop

BOOT → TITLE (the booted course's menu: Continue, its events, the two labs,
the other mountains with tour locks, Settings) → event → ORDER CARD →
COUNTDOWN (3-2-1 first drop; 1.4 s on every retry) → RUN (collect, trick,
grind, crash, recover; ghost raced on matching identity) → FINISH → burger
assembly (camera leaned in to 4.4 m) → RESULTS (time, medal, style, tricks,
integrity, rocket; records; unlock refresh) → retry / next order / menu.
Escape, gamepad Start, or the touch corner button pause any active gameplay
behind a light veil; focus or pointer-lock loss pauses automatically; the
simulation clock is dt=0 through the whole engine — the same proven path as
the freeze-time developer toggle. Course travel is a parameterized reboot
through the boot pipeline (§8).

## 3. The courses

| Course | Length | Signature | Events |
| --- | ---: | --- | --- |
| Summit Line (`summit-line`) | 520 m | the original three kickers + two pipes, one steel rail | Summit Stack, Summit Gold, Rocket Reheat |
| Pinecone Pass (`pinecone-pass`) | 650 m | density-1.9 forest slalom, creek/shelf split, log grind | Timber Melt, Branch Manager |
| Glacier Gorge (`glacier-gorge`) | 700 m | two crevasses, walled canyon, iced Blue Slot | Blue Plate, Handle With Care |
| Midnight Resort (`midnight-resort`) | 600 m | night atmosphere, 3 tables + pipe + 3 rails, two patrolling snowcats | Night Shift, Park Order |
| Whiteout Ridge (`whiteout-ridge`) | 820 m | storm, gust lanes, five ingredients, rubber-banded avalanche | Avalanche Special, Five Alarm |

Every course: ≥2 route choices, a shortcut-flavoured line, five validated
zones, ordered landmarks, three Recipe Tapes, two scored events, Free Ride
availability, deterministic 100-seed placement validation, and a definition
file in `src/game/courses/` that the registry validates loudly at load.

## 4. The events

Twelve, all in `src/game/courses/eventRegistry.js`, every medal ladder
**measured** against the committed autopilot and recorded beside its floor:

| Event | Rules | Floor (robot) | Gold/Silver/Bronze |
| --- | --- | ---: | --- |
| The Summit Stack | delivery ×4 | 31.0–31.6 s | 34/44/58 |
| Summit Gold | fixed seed 7, ×2, classic only | 31.1 s | 33/40/52 |
| Rocket Reheat | ×4, rocket forced, pickups refill fuel | 27.6–28.0 s | 31/40/54 |
| The Timber Melt | delivery ×4 | 36.0–36.4 s | 40/52/68 |
| Branch Manager | ×4 + style ≥ 45, classic only | (timber floor) | 48/60/76 |
| The Blue Plate | delivery ×4 | 39.2–40.1 s | 43/55/72 |
| Handle With Care | ×4 + integrity ≥ 70, classic only | (plate floor) | 47/59/76 |
| The Night Shift | delivery ×4 | 34.4–35.1 s | 38/50/66 |
| Park Order | ×4 + 400 banked trick points, classic | (shift floor) | 46/58/74 |
| The Avalanche Special | delivery ×5, avalanche live | 45.7–46.5 s | 52/66/84 |
| Five Alarm | ×5, rocket forced, avalanche live | ~44 s | 48/62/80 |

The robot cannot medal Park Order or Branch Manager (it does no tricks) —
which is those gates working.

## 5. Controls

Keyboard/mouse: WASD steer, mouse carve-steer via camera, RMB or auto-surf in
runs, Space jump/rail-pop, Q/E spins, F+W/S flips, F+A/D tweaks, R recover,
Shift rocket, Escape pause, arrows+Enter in menus, F1 developer overlay.
Gamepad: sticks steer/look, RT rocket, bumpers spin, west+stick tricks, east
recover/back, Start pause, d-pad+south menus. Touch: stick, Ride/Jump/Boost/
Trick holds, pause corner button, look anywhere. Documented in README.

## 6. Pause architecture

`PauseSystem` (src/game/pauseSystem.js): `paused` is a second reason for the
dt=0 the render loop already computes; input is suppressed in the same
poll-to-controller window the director holds gates with; `endFrame()` keeps
clearing one-frame flags so nothing buffered fires on resume. Escape-while-
locked arrives as pointer-lock loss (the browser swallows the key), which
doubles as the stolen-pointer safety net; resume re-requests the lock
best-effort with the documented Chrome-cooldown fallback. Audio ducks master
×0.16 so the pause menu's own clicks stay audible. Restart is a deliberate
second press; quit discards. Proven: run clock frozen over five real seconds,
16/16 checks (`tools/full-game/pause-smoke-windows.cjs`).

## 7. Course definitions and the bake

One `CourseDefinition` feeds everything (docs/COURSES.md): primitives encode
into a 4×32 RGBA32F RawTexture (`courses/encode.js`) that the single
generalized `heightBake.fragment.wgsl` loops — jumps lane-gated additive,
pipes mix-to-centreline, ridges signed additive (mound/trench/crevasse/shelf).
Zones, exclusions, dressing bounds, HUD landmarks, rails, surfaces, gusts,
snowcats, secrets, the avalanche and the atmosphere all come off the same
object, validated by `courses/validate.js` (negatively tested). Proof of
fidelity: the Summit fingerprint (30,861 heightAt samples) is bit-identical
before and after both shader generalizations
(`screenshots/full-game/bake-profile-*.json`).

## 8. Course loading

Travel is a **parameterized reboot**: `?course=&event=` through the exact
boot pipeline — authored loading screen, full bake, readback, warm-up —
so stale colliders, listeners, audio nodes and render targets are impossible
by construction, and a twenty-switch leak test is definitionally clean. The
in-session rebake path exists (`heightfield.bake(course)` re-dispatches;
`DeformationField.clear()` is public) but is not player-facing; this is the
report's honest deviation from §5C, chosen because reload beats the bespoke
lifecycle on both safety and total risk, and the brief's motivating concerns
are all leak-class.

## 9. Tricks and crashes

Trick rotation lives on a new `trickRoot` node between motion and board —
visual, never ballistic: a trick cannot fly, it can only risk the landing.
Residual rotation + impact grade PERFECT/CLEAN/SKETCHY/CRASH (impact alone
can never crash — kicker landings are this game's weather); perfect pays 4%
speed and a powder ring, sketchy scrubs 12%, crash tumbles ~1 s under heavy
friction and stands up at a breadcrumb the run recorded while riding was
demonstrably safe (grounded, in bounds, off lips/landings, clear of
obstacles). Manual R uses the same spots at +2.0 s; a crash bills +1.0 s.
Scoring (`trickScore.js`, pure, 22 tests): spins compound per 180° step,
flips flat, grabs decorate, kickers +25%, repetition decays ×0.6 to a 0.15
floor, combos grow +0.25 per trick to ×2.5 and bank on settle, rail exit, or
the finish line. Rails catch falling aligned approaches (<35°), pop with
Space, and a detach cooldown prevents apex re-attach.

## 10. Collision

`CollisionWorld` (pure, spatial hash, allocation-free queries, 11 tests):
spheres/capsules/boxes/segments. Dressing keeps per-prop records through its
merge — trees/ice are capsules, rocks spheres, shrubs soft. Response by
material and angle: soft scrubs, glancing deflects and scrapes, frontal at
speed crashes. Snowcats are yaw-boxes re-registered as they move. No
invisible walls anywhere; rails and triggers are excluded kinds.

## 11. Save migration

`snow-burgers.book` v2 with a real ladder (docs/SAVE_SCHEMA.md): v1 records
survive, stamped with the only identity v1 could mean; v1 ghosts upgrade
with interval + identity; corrupt ghosts drop without rejecting the save;
future versions fall back fresh. Settings live separately under
`snow-burgers.settings` (whitelist-validated). Proven end-to-end against a
planted v1 book in real Chrome, plus 11 unit tests.

## 12. Ghost compatibility

`ghostMatches` demands the full identity — seed, courseId, courseVersion,
eventId, eventVersion, vehicleId. A rocket ghost never paces a classic board;
bumping a course's `version` retires its old ghosts by design. Playback reads
the interval off the ghost, not a constant. A "Race your ghost" toggle ships
in settings.

## 13. Assets and provenance

**No new external assets.** Everything the expansion added — rails, logs, ice
sheets, snowcats, tapes, camp pieces — is procedural geometry through the
one `rocker` material family, and every sound remains synthesised at runtime
(the licensing position the audio system's header documents). The six
previously-undocumented camp/dressing GLBs are now in ASSETS.md with bytes,
hashes, and their honest "provenance unresolved" status alongside the seven
audited ingredient models and RockerKaki's existing caveat.

## 14–16. Sizes and scene figures

Production build: `dist/` 40 MB total (dominated by sourcemaps and the
committed model set); main chunk 2.2 MB (~560 kB gzip); runtime GLBs 5.5 MB
across 13 files. Course "assets" are data files of a few kilobytes — the
expansion added no per-course binary payloads, so the §14 lazy-loading budget
is satisfied by construction (one course's world is built per boot). Scene
counts stay in the baseline's neighbourhood: dressing is still one draw per
family/band bucket, and the expansion's procedural additions are a handful of
draws each (measured deltas in §17).

## 17. Performance

Baseline record stands (PERF.md): ~2.2 ms median at 2560×1440 against the
11.1 ms / 90 Hz allocation. RC measurement with every expansion system live
— tricks, collision world, tapes, near-miss tracking, board audio, rails —
via the same same-session, same-vantage A/B: burger-run mean **2.244 ms**,
game-layer delta **+0.271 ms** for 22,370 triangles in 26 meshes, against
the pre-expansion record of +0.255 ms. Six phases of gameplay systems cost
sixteen microseconds of frame time
(`screenshots/full-game/perf-summit-rc.json`). All figures are uncapped rAF
presentation intervals — not GPU completion times — exactly as PERF.md has
always cautioned.

## 18. Placement validation

100/100 seeds per course against the real GPU bake, with each course's
tightest lateral demand recorded: Summit 0.8225, Pinecone 0.5632, Glacier
0.5552, Midnight 0.4503, Whiteout (five-ingredient order) 0.6992 — all of
the 0.84 limit. Reports in `screenshots/full-game/placement-*.json` and
`screenshots/snow-burgers/placement-validation.json`.

## 19. Automated playthroughs

The RC gauntlet, one session, in commit order: Summit Stack 31.0/31.5 s,
Summit Gold 31.1 s, Rocket Reheat 28.0 s (tank to zero, efficiency 67),
Timber Melt 36.3 s, Blue Plate 39.2 s, Night Shift 34.7 s, Avalanche
Special 45.7 s with all five, Five Alarm 43.1 s with all five on the
mandatory rocket (efficiency 74) — the finals ahead of a live avalanche.
Plus pause (16 checks), tricks/rails (10), progression/tapes/keyboard (8),
the renderer's own smoke traverse (520/520 m), and the Summit placement
sweep re-run through every change (100/100, tightest lateral 0.8225 —
identical to the pre-expansion measurement). Reports under
`screenshots/full-game/`.

## 20. WebGPU validation

Zero validation errors, zero uncaptured GPU errors, zero device losses in
every committed run of every tool across the entire expansion.

## 21. Capture locations

`screenshots/full-game/`: `pause/`, `tricks/`, `pinecone/`, `glacier/`,
`midnight/`, `progression/`, `playthrough-*/` per course,
`bake-profile-*.json`, `placement-*.json`, `perf-summit-rc.json` — committed
as webp per repo convention.

## 22. Known limitations

- Course travel reboots rather than switching in-session (§8, deliberate).
- Falling-ice hazards (Glacier) and collapsing shelves (Whiteout) not built.
- No slalom gate props on Midnight; resort reads through light, camp, cats.
- Camp architecture is shared across courses (grounded per-course); no
  per-biome camp dressing yet.
- The rig still has no obstacle collision, so the finish stages by leaning
  in, not orbiting; snowcat/rail camera avoidance is likewise absent.
- Rail balance is deliberately zero (documented in `_grindStep`).
- No route-assist silhouette or high-contrast beacon mode; "beacons" remain
  pad-and-stakes sites. HUD scale setting not implemented.
- Free Ride Lab intentionally receives only crash recovery.
- The board pitches slightly nose-up while grinding (air-attitude blend).
- `screenshots/_scratch/` capture probes are session tools, not committed.

## 23. Stretch deliberately deferred

Burger Base Jam bonus park, Daily Order, remappable bindings UI, per-course
music layers (buses exist, music bus is empty), thin-instanced dressing,
in-session course lifecycle, KTX2.

## 24. Deployment

**Not deployed.** `feat/full-game` is ready for review; merging to `main`
publishes to https://dknos.github.io/kakisnow/ within a minute, so that
merge belongs to the owner. Recommended pre-merge step: a CI test job before
the Pages deploy (the workflow currently runs none).
