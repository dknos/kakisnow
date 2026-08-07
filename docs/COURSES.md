# Course and event definitions

A course is a validated data object in `src/game/courses/`; an event is the
rules of one scored descent on it. Nothing about a course's shape lives in
shader literals, placement constants or HUD tables any more — those were three
unsynchronised copies, and the pipes' windows had already drifted between two
of them when this system replaced them.

## How a course becomes a mountain

1. `courses/index.js` validates every definition at load and holds the active
   one. Boot picks it from `?course=` or the default.
2. `courses/encode.js` flattens `terrain` into primitive rows — four RGBA
   texels each — that `heightfield.bake(course)` uploads as a tiny RawTexture
   (the deformation brushes' proven pattern).
3. `heightBake.fragment.wgsl` loops the primitives inside the one bake shader
   every course shares. Jumps are lane-gated additive; pipes MIX toward a
   centreline-pinned target, because a pipe floor crossed by dunes is not a
   pipe. The natural snowfield outside the course gate is untouched.
4. The CPU mirror reads back, and placement, grounding, camera and camp all
   stand on exactly what was baked.

`tools/full-game/bake-profile-windows.cjs` fingerprints `heightAt` over the
course; the Summit Line's fingerprint is bit-identical before and after the
data-driven refactor (30,861 samples, zero differing).

## CourseDefinition shape

See `courses/summitLine.js` for the annotated reference. Fields:

- `id`, `version` — identity. **Bump `version` on any deliberate terrain
  change**: ghosts and records carry it, and a stale ghost must refuse a new
  mountain.
- `title`, `subtitle`, `difficulty`, `description` — course-select copy.
- `startZ`, `finishZ`, `baseCampZ`, `runLength`.
- `terrain.gate` — where the course fades in/out of the natural field along z.
- `terrain.laneHalf/laneFeather` — lateral extent.
- `terrain.jumps[]` — `{lip, runIn, drop, height}`, additive kickers.
- `terrain.pipes[]` — `{from, to, featherIn, featherOut, wallFrom, wallTo,
  amp, pack, packFalloff, gateXFrom, gateXTo}`, replace-blend halfpipes.
- `terrain.features[]` — reserved for further primitives (banks, bowls,
  ridges, chutes, surface strips) as new courses need them.
- `zones` — ingredient zones. `pipeZone: true` gets the softer wall rule;
  `excludeInnerX` carves an annulus.
- `features[]` — ordered landmarks for the trail HUD (and, later,
  checkpoints); `insideSpans[]` — where the HUD names the feature the rider
  is inside.
- `dressing` — biome + deterministic seed.
- `events[]` — event ids offered, menu order.

Validation lives in `courses/validate.js` and runs at registry load: a
malformed course throws in development with the list of problems. The rules
are tested negatively in `tests/courseDefinitions.test.mjs`.

## EventDefinition shape

See `courses/eventRegistry.js`. `mode` is one of `delivery`, `time-trial`,
`style-delivery`, `rocket-rush`, `final`. `required` ingredients must have
zones on the course. `gold/silver/bronze` are seconds and **must be measured**
— run `tools/snow-burgers/playthrough-windows.cjs` on the finished course,
record the autopilot floor next to the ladder, set gold just above it. The
Summit Stack's 34/44/58 stands on a measured 31 s floor.

## QA parameters

`?course=<id>&event=<id>` select at boot, exactly as `?mode=` always has —
the headless tools cannot press buttons. Unknown ids fall back to defaults
rather than failing the boot.
