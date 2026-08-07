# Implementation map — full-game expansion

Phase 0 audit distillation, 2026-08-06, branch `feat/full-game` off `main` @ `282b47e`.
Six parallel subsystem audits (game loop, terrain, character/physics, save/UI,
assets/audio/VFX, tools/tests) produced the facts below. This is the map the
expansion is built against; each phase's commit message points back here.

## Baseline evidence

- `npm test`: 23/23 pass. `npm run build`: clean, 1.31 s, dist 40 MB (index chunk
  2.19 MB / 554 kB gzip). Playthrough: 3/3 seeds complete ~31 s, 0 console errors,
  0 WebGPU validation (`screenshots/snow-burgers/playthrough/playthrough-report.json`).
- Perf baseline: ~2.2 ms median at 2560×1440 against an 11.1 ms / 90 Hz budget
  (`PERF.md`). Course budget: +2 ms max per new course, evidence required.

## Load-bearing facts

**Clock.** One dt for everything, computed in `main.js:334`:
`S.freezeTime ? 0 : dtMs/1000`. dt=0 is a proven whole-app state (freeze-time
overlay toggle); the only guarded divides are `controller.js:264` and
`rocketThrust.js:111`. Pause = a second reason for the same zero.

**Input.** `pollInput()` rebuilds the struct every frame; the only legal place
to impose intent is the poll→`character.update` window (`gameDirector.beforePhysics`
pattern). `endFrame()` clears one-frame flags unconditionally. Escape never
reaches keydown while pointer-locked — the browser exits the lock instead, so
pause-on-lock-loss IS the Escape path when locked.

**Course.** The Summit Line is hardcoded in **three unsynchronized copies**:
`heightBake.fragment.wgsl:33-88` (`summitLine()`, additive over `terrainMacro`,
jump heights ONLY here), `ingredientPlacement.js:43-63` (JUMPS/PIPES/ZONES/
LANE_HALF/BASE_CAMP_Z, mirrors by hand), `courseHud.js:1-11` (finish 520,
features; its pipe windows disagree with `burgerRun._inPipe`). Plus
`index.html` hardcodes "0 / 520 M". Unify before any second course.

**Course primitives strategy (Phase 2).** Feed primitives to the bake the way
`deformSim` already feeds brushes: an N-row RGBA-float `RawTexture` +
`primCount` uniform, `textureLoad` loop in a generalized `summitLine`
(`deformation.js:62-76` is the proven pattern; no storage buffers exist in the
codebase). Primitive schema needs a blend mode — pipes `mix()` toward the
centreline height, they do not add. Surface types (ice/packed) go in a new
small course-mask texture (heightTex RG and auxTex RGBA are both full), read
back once for physics using the heightfield's stride-derived pattern.

**Re-bake lifecycle (Phase 2).** Re-bake is re-dispatch only (textures bound by
reference), but `heightAt` serves the OLD course until the 4096² readback
resolves — gameplay must gate on it. Then: `shadows.setHeightBounds`,
deformation clear (promote `warmUp()`'s far-prevCenter trick to a public
`clear()` — ice decays on a 900 s constant and survives switches otherwise),
dressing/camp/pickups rebuilt only after readback. `heightRes` is a literal
4096 in three `terrain.js` sites (286/343/364) — import `HEIGHT_RES` instead
before per-course anything.

**Tricks (Phase 3).** Full air state already exists on the controller
(`grounded/airborne/airTime/verticalVelocity/landed/landingImpact/jumpCount`)
— build on it, no second detector. Trick attitude goes on a NEW TransformNode
in the chain (the `rocketChairMount` pattern) or additively into `_solveBoard`'s
eased pitch/roll wants. NEVER set `rotationQuaternion` on existing chain nodes
(`snowboardRoot` etc.) — Babylon then ignores euler writes and silently breaks
`_solveBoard` and `capture-board`'s euler reads. There is no air-control model:
`_surfStep` runs full steering/grip/slope-thrust airborne; gating it changes
ballistics and moves smoke-tool assertions (clearance >0.8, traverse ≥520,
natural takeoff >0.03).

**Dressing colliders (Phase 3).** Placement is deterministic but per-prop data
is discarded after vertex merge. Capture a record array
(`{x,y,z,family,height,ry}`) inside `MountainDressing.build` before
`appendTransformed`; capsule/disc colliders from family+height. Re-running the
math instead WILL drift.

**Save (Phase 2).** `snow-burgers.book` v1; `migrate()` rejects ≠1 — bumping to
v2 without a ladder wipes records. Ghost samples carry no interval/event/course
metadata; compatibility is two constants agreeing by hand plus a seed check.
Ghost version is a literal `1` in `completeAssembly`, not the imported
SCHEMA_VERSION. Medal thresholds duplicated in `snowBurgersUi.medalFraction`
(34/58 literals). Settings have zero persistence; player settings get their own
key (`snow-burgers.settings`), hydrated through `set()` so `onChange` fires.

**Audio.** One master gain → limiter; one persistent rocket bus; one-shots
connect straight to master. No pause path, no category buses. Exiting
ROCKET_TEST/BURGER_RUN stops calling `updateRocket` without zeroing the bus —
the engine drone freezes at last throttle (live bug, fix with mode-exit
`updateRocket(0)`). New continuous layers (board/wind/ice) get per-category bus
gains off master, everything stays synthesized (licensing position depends on
it). Pause ducks master and keeps UI one-shots audible; `ctx.suspend()` would
silence the pause menu itself.

**Spells.** Dispatch runs in every mode, gated only by `S.showSpells` —
terrain-deforming spells can alter a scored course. Gate `spellPressed` in
`beforePhysics` during scored runs (Phase 3). Spell light pool is 4 slots
globally, silently drops overflow; SprayField is one 5120-slot pool shared by
everything — new VFX budget against the wake's ~164 grains/frame peak, raise
CAPACITY rather than adding pools.

**Known state leaks (fix in Phase 1/2).** ROCKET_TEST exit leaves
`vehicle=rocket-chair` + `thrust.infinite=true`; `run.abandon()` has no caller
(no quit path — pause adds one); `_lastCount` beep latch never resets between
runs; deformation has no public clear.

## Frozen tool ABI

Do not rename without updating tools/ and tests/ in the same commit:
`window.KAKISNOW` api keys · `__KAKISNOW__.ready` · `game.api`
(`selectMode/start(seed)→seed/run/field/event/RunState` strings
`idle|order|countdown|run|assembly|results`) · `run.{state,time,splits,
placements,blockedReason,result{...}}` · `field.items[].{collected,anchor}` ·
`?mode=free-ride|burger-run` · `rocker` node names (`snowboardRoot`,
`rockerkakiVisual`, `rockerkakiAsset`), `rigBoneCount===9`, `_rigJoints.size===8`,
mesh list `["RockerKaki","Object_2"]` · `terrain.heightfield.{heightCPU,cpuRes,...}`.
`capture-ingredients` writes `run.state="order"` directly. `validate-placement`
imports `/src/game/ingredientPlacement.js` in-page — that module must stay
side-effect-free and dev-server-importable. New asset URLs must use
`import.meta.env.BASE_URL` or they 404 on the Pages subpath.

Course-pinned assertions that must become per-course data, not be deleted:
`tests/ingredient-placement.test.mjs:201` (JUMPS [50,184,496], PIPES
[[292,370],[410,450]]), `smoke-downhill` z-literals (pipes 320/430, finish 520),
`validate-placement`'s deliberately restated limits (restate per course — the
independence is the tool's documented value).

**Medal thresholds are measured, never copied**: autopilot floor per course via
`playthrough-windows.cjs`, gold just above it (Summit: 31 s floor → 34 gold).

## Phase plan deltas vs the brief

- Phase 1 pause uses dt=0 (proven path), not per-system update gating; input
  suppressed in the beforePhysics window; audio ducked not suspended.
- Phase 2 course system: RawTexture primitives + generalized bake shader, one
  shader for all courses; course-mask texture for surfaces; public deform
  clear(); save v2 with ghost metadata; `?course=&event=` QA params alongside
  `?mode=`.
- CI gap: deploy workflow runs zero tests (merge to main = live in ~36 s).
  Add an `npm test` job as a required step before deploy in Phase 10.
