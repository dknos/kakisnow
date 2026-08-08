# Workstream A — gameplay feel round 1

Date: 2026-08-07

Branch: `feat/final-polish-gauntlet`
Baseline gameplay source: `50097a5` (the accepted Big Air launch/refuel slice)
Checked-out reference before this A4 correction: `1c4c4c9036a4162027658fab1c32661dd372b120`
This worktree remains intentionally uncommitted for the parent integration and
fresh critic pass.

## Baseline audit

The controller paths were exercised with fixed-step deterministic probes before
editing. At 1/120, 1/60, and 1/30 seconds, a flat-snow surf reaches 7.37, 7.45,
and 7.61 m/s after one simulated second, respectively. A 1.5-second carve at
full right input reaches 13.88 m/s and turns 0.70 rad; powder/half-ice/ice
reached 12.08/12.25/12.43 m/s over the same interval, confirming that hardness
changes edge grip and drag without stopping forward travel. A held rocket for
two seconds reached 25.86 m/s at 60 Hz and 25.31 m/s at 30 Hz, with 2.13/2.12
seconds of fuel remaining and 77/76 efficiency. These are presentation-step
measurements, not GPU timings.

Fixed-step jump checks reached 1.39/1.36/1.30 m apex at 120/60/30 Hz and
landed after 0.783/0.783/0.767 s. The existing 60 Hz rail probe caught only
when aligned and above the beam, then set `grinding` and the expected 7.5 m/s
rail speed. Crash friction reduced a 5.6 m/s post-impact tumble to 0.42 m/s by
one second and set `needsRecovery`; recovery remains owned by the course safe
spot layer.

## Highest-value correction

Natural and authored takeoffs now consume coyote time at the exact handoff to
ballistic flight. Previously, a Space buffered during the first 110 ms after a
terrain launch could satisfy the still-live coyote gate and apply a second jump
impulse. This made an identical kicker inconsistent: a rider who pressed jump
at the lip got a double launch, while a rider who did not got one authored
launch. The correction is in `src/character/controller.js` and is covered by
`tests/controller-jump.test.mjs`.

Crash start now clears the jump buffer. A Space pressed during a tumble cannot
survive manual/automatic recovery and unexpectedly hop the rider from the safe
spot. This is also covered by the controller test.

The focused regression reports `jumpCount: 1` before and after buffered Space,
with vertical velocity falling from 6.5248 to 6.2165 m/s rather than receiving
another impulse. The current telemetry is emitted by
`tools/snow-burgers/gameplay-feel-telemetry.mjs`.

## A2 correction

The independent re-critique found two input P1s and both are now addressed.
`src/character/controller.js` ignores jump input while crashed and clears the
buffer again in `finishCrash`; the regression presses Space at tumble frame 52
and verifies that the recovered rider remains grounded with `jumpCount: 0`.

`src/core/input.js` now polls the standard gamepad path end to end: radial
deadzoned left stick movement, south-button jump edges, left-trigger ride,
right-trigger boost, bumper spin, west modifier, east recovery, disconnect
release, and radial-deadzoned right-stick look scaled by the real frame dt.
Touch retains priority over keyboard; a weaker pad does not steal a full
keyboard vector; ties prefer the pad's analog intent; external `input.surf`
writes retain their existing idle-poll behavior. No per-frame result objects or
arrays are created by the input merge path.

The deterministic fake-pad tests exercise the actual `pollInput(dt)` path at
30/60/120 Hz, and prove equal one-second look totals, trigger deadzones,
keyboard/touch precedence, edge-only actions, and disconnect release. No
physical or virtual gamepad was available in this environment, so hardware
button feel remains an honest manual gate.

## A3 correction

The independent critic found a real low-refresh P1: a 30 Hz controller step
could cross the existing narrow `KickerTerrain` table in one move. Its endpoint
ground slope was already the downhill drop, so the controller clamped a
negative rate and stayed grounded instead of leaving the lip. The correction
adds one allocation-free midpoint terrain sample only when a grounded endpoint
falls away. If that swept path rose first, its pre-lip slope supplies the
physics-truth vertical takeoff rate; no global substep, render-loop change, or
course authoring constant changed.

The new regression runs the same kicker at 30/45/60/90/120 Hz. All five launch
once with positive vertical velocity and clearance, finish a flight, and keep
apex variance under 0.35 m and airtime variance under 0.08 s:

| Rate | Launch v (m/s) | Clearance (m) | Apex (m) | Airtime (s) |
| ---: | ---: | ---: | ---: | ---: |
| 30 | 6.2295 | 0.5199 | 2.2303 | 0.8333 |
| 45 | 6.4264 | 1.2639 | 2.4116 | 0.8444 |
| 60 | 6.5248 | 0.5253 | 2.3882 | 0.8500 |
| 90 | 6.6320 | 0.5262 | 2.4452 | 0.8667 |
| 120 | 6.6856 | 0.5363 | 2.4739 | 0.8750 |

The Big Air authored capture regression now exercises centered, -18, and +18
lanes at both 30 and 60 Hz. Every lane launched once; the 30 Hz post-step rise
was 7.8833 m/s and the 60 Hz post-step rise was 8.1917 m/s after integrating
the authored 8.5 m/s rise for gravity. `jumpCount` stayed at one in every
probe.

## A4 phase-independent lip correction

The previous midpoint-only repair still had two boundary defects: it depended
on a `dt > 1/60` cutoff, and a frame that started at the crown could lose the
uphill approach that authored the launch. The final controller path now probes
the actual old→new horizontal segment only when a grounded endpoint is a
candidate downhill tangent or has fallen below its old ground sample.

The conditional sweep performs five additional scalar `heightAt` samples:
one bounded approach sample at fraction `-0.5`, then forward samples at
fractions `0.2`, `0.4`, `0.6`, and `0.8`. The already-computed old and endpoint
heights are reused. It retains the maximum positive ground-rise rate over the
sample timing, clamps it to the existing `-5..9 m/s` carried-slope contract,
and allocates no arrays or objects. There is no refresh-rate cutoff and no
course-specific z distance. Sustained downhill snow with a carried negative
vertical rate does not enter the extra sampling path.

The exhaustive deterministic checks now cover:

- 81 KickerTerrain starts from z=1.600 through z=2.000 in 0.005 m steps at
  30 Hz: 81/81 launched exactly once, landed once, and never passed below
  terrain while airborne.
- z=1.840 at 59/60/61 Hz: all three launched and landed exactly once with no
  pass-through.
- Flat, steep-linear, and abrupt-downhill false-launch sweeps: 45/45 terrain,
  rate, and phase probes stayed grounded with zero jumps.
- The canonical 30/45/60/90/120 Hz launch and airtime/apex checks and the six
  Big Air lane/rate probes remain green.

## A4 authored-window segment correction

The fresh critic found one remaining authored-launch edge: the capture helper
was checking only the post-integration `position.z` and `position.x`. A 30/45/60
Hz step that crossed Big Air's `to=304` edge therefore missed even though the
actual movement segment entered the authored window.

`_authoredTakeoffRise(oldX, oldZ)` now performs a scalar slab intersection of
the actual old→new XZ segment against the existing authored rectangle. It keeps
the existing speed, forward-velocity, lane width, and launch-rise contracts;
the window is not widened and no course-specific phase is added. The slab test
is allocation-free and conservative: a segment that never enters either the z
window or x lane remains grounded.

Evidence from the focused regressions and telemetry tool:

- 300 dense centered phase/rate probes (`z=298.0..303.9`, 0.1 m, five rates):
  300/300 launched exactly once.
- 10 lane-edge crossings at `x=±24.1` with directed lateral motion: 10/10
  launched exactly once.
- 15 non-intersecting far/lane segments: 0 false launches.
- Existing centered, ±18 Big Air probes at 30/60 Hz remain green.

## Remaining gates for an independent critic

- Rail visual attitude is solved by `RockerKaki._solveBoard`; because grinding
  intentionally leaves `controller.grounded` false, a board-angle review needs
  the camera/hero integration owner and is not changed in this slice.
- High-speed pickup margins and onion route safety belong to ingredient/course
  validation, not controller physics.
- The landing/trick windows remain unchanged in this round. Human-feel review
  must still cover edge grip, rail catch/exit readability, low/high FPS, and
  classic-versus-rocket flights in the real Windows WebGPU build.

## Verification

- Focused controller/gameplay tests: 17 passed, including the 81-phase sweep,
  59/60/61 boundary probes, false-launch matrix, dense authored-window sweep,
  lane crossings, and non-intersection guards.
- Full `npm test`: 154/154 passed.
- `npm run build`: passed.
- No runtime files, settings, input boundary, camera, UI, audio, or assets were
  changed by this workstream.
