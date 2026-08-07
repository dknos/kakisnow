# Big Air Basin — build report

The sixth course: four hundred metres of superpipe that opens onto an iced
in-run and an Olympic-scale jumping hill, in a stadium basin cut into the
snowfield. This is the honest inventory — what was measured, what had to be
rebuilt when the measurement disagreed with the design, and what is still weak.

Everything below was read out of the running build with the committed tools.
No number in this file was estimated.

---

## What shipped

| Piece | Where |
| --- | --- |
| `skiJumps` terrain primitive (kind 4) | `src/shaders/heightBake.fragment.wgsl`, `src/game/courses/encode.js`, `src/game/courses/validate.js` |
| The course | `src/game/courses/bigAirBasin.js` |
| The event, `big-air-basin-stack` | `src/game/courses/eventRegistry.js` |
| The venue | `src/game/venue.js`, `venue` block on the course |
| Venue models (7, CC BY 4.0) | `public/assets/models/big-air/`, provenance in `ASSETS.md` |
| Tools | `tools/big-air/` |

## The design problem, and why the obvious jump does not work

`terrainMacro` carries **no global downhill term**. The descent any course
rides is whatever the dune and swell noise happens to do along its centreline,
and the rider is pushed forward by `SURF_THRUST` rather than by gravity. The
measured centreline on this line rolls ±9 m over 900 m *with uphill in it*
(`tools/big-air/profile-windows.cjs`, committed output in
`screenshots/big-air/profile/`).

So a jump here cannot borrow its drop from the mountain. It has to dig one.
That is what kind 4 is: a whole jumping hill — steepened in-run, takeoff table,
landing hill, outrun, and the climb back onto the natural field behind the camp
— replace-blended through the same accumulators the halfpipe already uses.

Three things had to be true, and each was got wrong first:

1. **The hill cannot follow the running centreline.** The pipe pins its floor
   to `centreHeight`, which is right for a pipe and catastrophic for a landing:
   the first bake put a **10° riser halfway down the landing hill**, four
   metres of dune noise under a rider falling fifty. The profile is now
   anchored to one height — the natural height where the profile begins — so
   the hill is exactly as authored and enters seamlessly, because the profile
   is zero at that point by construction.
2. **The anchor point is a design decision, not a tidy number.** Anchored at
   z=228, where the natural line sits at +3.6 m, the pipe exit climbed 9 m at
   up to 23° immediately before the one takeoff. Moved to z=190, where the
   natural line sits at −4.3 m, that climb is gone.
3. **The basin walls were a quarry.** At a 96 m outer gate they stood at 66°.
   At 140 m they run under 30° at the deepest point, which is a hill cut into a
   snowfield, and puts the grandstand slopes where a crowd could stand.

## The flight, measured

`tools/big-air/showcase-windows.cjs --fly` runs the real physics from the pipe
and traces it. Nothing is scripted past the push.

| | |
| --- | --- |
| Speed into the lip | 19.4 m/s (`SURF_MAX` is 19.5 — the board is capped) |
| Leaves the ground | z = 299.3, one metre before the lip |
| Airtime | **2.51 s** |
| Distance | ~48 m |
| Lands | z = 348, about 31 m below the table |
| Landing hill length | 120 m — so the hill is still falling under a boosted rocket chair |

Two numbers in `controller.js` fix all of this and were read rather than
assumed: `SURF_MAX = 19.5` caps the approach, and grounded vertical velocity is
clamped to 9 m/s, which caps what any lip can give. The table's 31° rise
saturates that clamp at any speed above 15 m/s — a shallower lip metered the
takeoff by how fast the rider happened to arrive, and the autopilot cleared it
without leaving the ground on two runs in three. The landing hill's falloff is
cubic rather than squared for the same reason: with the approach speed capped,
the only lever left on airtime is how fast the ground gets out of the way. That
change alone bought 0.4 s and eleven metres of drop.

## Gates

| Gate | Result |
| --- | --- |
| Summit Line bake fingerprint, before/after the shader edit | **bit-identical**, 381 samples (`screenshots/big-air/bake-profile-summit-after.json` vs `screenshots/full-game/bake-profile-baseline.json`) |
| Unit tests | 87 pass, 0 fail |
| Placement sweep, 100 seeds, all five ingredients | **PASS** — 100/100 routes complete |
| Autopilot, classic board, 4 seeds | 4/4 complete, 45.34–45.40 s, 0 console errors, 0 WebGPU validation |
| Autopilot, rocket chair, 2 seeds | 2/2 complete, 43.32–43.39 s |
| Frame cost (free ride / burger run) | 1.909 ms / 2.178 ms, delta +0.269 ms — Summit's baseline is 1.973 / 2.244, +0.271 |

Medals are set off the measured floor, not guessed: gold 48, silver 62,
bronze 80, against a 43.32 s rocket floor. Gold sits +4.7 over it rather than
the calm courses' +3, because the pressure this course applies is the one the
robot is immune to — a bad landing costs a human the crash-recovery rewind and
the autopilot's landings are graded but never fatal.

## A regression this work introduced and caught

`protectedSpans` was widened to take the whole terrain block, because a
jumping hill is 120 m of falling snow that no `jumps` entry describes. One
internal caller still passed the bare `jumps` array — and because the new
signature reads `terrain.jumps ?? []`, that returned an **empty list rather
than an error**, silently un-protecting every jump on every course. The unit
tests passed, because the one test that called it used the default argument.

Fixed, and `tests/ingredient-placement.test.mjs` now asserts on that exact
failure mode rather than on the happy path.

## Weak points, stated rather than hidden

- **The autopilot does not reliably launch.** On two of four seeds it crossed
  the lip with `airTime` 0 — it steers by writing the camera and arrives at the
  table off-centre and yawed, which costs it the vertical velocity a straight
  approach gets. A rider going straight launches every time (traced above). The
  medal floor is therefore measured against a robot that mostly *skis* the
  hill, which makes the ladder if anything slightly generous.
- **The onion detour is close to the reachability limit.** The 100-seed sweep
  reports the tightest lateral ratio at 0.828 of 0.84. It passes on every seed
  and the router converges in at most 3 attempts, but there is not much room.
  Its first position — on the in-run apron — produced *zero* anchors across
  100 seeds and had to be moved out of the basin entirely.
- **Two thirds of the landing hill is never used.** The flight lands 48 m down
  a 120 m hill. That is deliberate margin for the rocket chair and it is what a
  real hill looks like below the K-point, but nothing rides it.
- **The venue is scenery only.** Nothing in it collides, and the grandstands
  are empty — there are no spectators. At 137k triangles the crowd would have
  to be an impostor sheet, which was out of scope here.
- **The lift line does not move.**
