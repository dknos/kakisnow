# Snow-Burgers

SHRED. STACK. SERVE.

Snow-Burgers is a WebGPU-only downhill snowboarding game. The default playable
hero, RockerKaki, takes an order at the summit, rides the 520-metre Summit Line
collecting five giant burger ingredients — cheese, patty, tomato, lettuce and
onion — and builds the order at the grill at Burger Base Camp.

Powered by KAKISNOW Snow Technology. KAKISNOW is the internal name of the snow
rendering and simulation technology the game runs on, and it is why the
mountain behaves as one surface: the ingredients are placed against the same
baked heightfield the snow is drawn from, and every turn taken to reach one is
cut into the same persistent deformation field the trails are.

The renderer includes an MIT-licensed foundation that has been substantially
adapted for KAKISNOW. The upstream author's copyright and exact license text
ship with the production build.

## The run

One order is one run.

1. **Receive the order.** The order card names the ingredients the run has to
   bring back and the sequence the burger is stacked in.
2. **Drop in at the summit.** Summit Line starts at the top of the course and
   finishes 520 metres downhill, through three takeoffs and two halfpipes.
3. **Collect cheese, patty, tomato, lettuce and onion.** Each ingredient has
   its own authored zone along the course rather than a random scatter, so the
   course itself decides how far off a fast line each one sits.
4. **Reach the grill at Burger Base Camp** at the bottom of the course.
5. **Build the burger** out of what the run actually carried down.
6. **Score the run.**
7. **Retry the order, or take the next one.**

What that loop has in the repository today is the course and the pickups: the
five ingredient definitions in `src/game/ingredients.js`, the placement solver
in `src/game/ingredientPlacement.js` that gives each ingredient an authored
zone on Summit Line, validates candidate anchors against the baked terrain and
picks one per ingredient from a seed so the same seed always produces the same
run, the seven optimised runtime models under
`public/assets/models/snow-burgers/`, and the course HUD.

In development: the order card, the HUD chips, Burger Base Camp and its grill,
the assembly sequence, scoring, retry, and the mode menu. The rocket chair
snowboard is in development too — it is imported, optimised and committed, but
the vehicle the hero currently rides is the snowboard described under
[KAKISNOW Snow Technology](#kakisnow-snow-technology).

## FREE RIDE LAB

FREE RIDE LAB is the mode that preserves the original open-ended experience
this project began as. Walk the field, carve persistent trails, ride the
520-metre Summit Line through the original rolling snowfield, jump its three
takeoffs, carve two halfpipes, and cast five snow-and-water spells. Nothing in
it is ordered, timed or scored.

It is also what the build boots into today, because the menu that will name it
is one of the pieces still in development.

## Run locally

Requirements:

- Windows 11
- Current Chrome with WebGPU enabled
- A discrete GPU
- Node.js 22.12 or newer

```bash
npm ci
npm run dev
```

Open the Vite URL in Chrome. The application intentionally has no WebGL or
mobile fallback. If `navigator.gpu` is unavailable, it displays one
explanatory line and stops.

Production bundle:

```bash
npm run build
npm run preview
```

Rebuild and validate the editable RockerKaki Blender rig with:

```bash
blender --background --factory-startup --python tools/rig-rockerkaki.py
blender --background --factory-startup --python tools/validate-rockerkaki-rig.py
```

## Controls

- `WASD` / arrow keys — camera-relative movement
- Mouse drag — orbit
- Mouse wheel — eased zoom
- Hold right mouse button — snow-surf
- `Space` — jump (also works at the lip with input buffering and coyote time)
- `1` — Sweep
- `2` — Ribbon
- `3` — Bloom
- `4` — Crystallize
- `5` — Vortex
- `F1` or backtick — settings and performance overlay

The overlay is hidden by default. It exposes the rolling frame-time graph,
worst-1% rate, scene counts, quality presets, individual system and
post-process toggles, art-direction controls, debug views, and the hero
selector.

## KAKISNOW Snow Technology

KAKISNOW is the renderer the game is built on, and it is the substance of this
project. What follows describes that renderer rather than the game layer.

- One draw renders an eight-ring, player-centred geometry clipmap. The inner
  grid spacing is 8.5 cm, the field reaches roughly 870 m, and the terrain
  contributes approximately 333,000 triangles.
- Summit Line is authored into the same heightfield as the natural terrain:
  the original rolling dunes remain the base while three gentle ballistic lips
  and two local U-profile halfpipes share the renderer's grounding, shadows,
  deformation, camera clearance, and spell collision.
- RockerKaki ships as an editable Blender armature with an authored breathing
  action. Nine deform bones remain embedded for future authored animation;
  runtime ride, carve, jump, and landing poses move the complete authored model
  rigidly so its disconnected face and guitar surfaces never stretch.
- She rides a real snowboard, and the board is solved against the snow rather
  than parented to her. Its pitch is fitted to the terrain sampled at the nose
  and the tail, so it spans ground the way a stiff board does instead of
  following every ripple; its roll comes from the ground normal plus the carve's
  edge angle; and it sinks into the trench it is cutting, planing its nose back
  out of undisturbed snow. The rider hangs off the board and takes part of its
  attitude back toward vertical, because a passenger held square to a board on a
  43-degree face is reclining into the hill. The groove the board leaves is cut
  from the mesh's own measured waist and effective edge — see
  `src/character/boardSpec.js`.
- The board also rides above the CPU height mirror by the height of the
  sastrugi. `heightAt` reconstructs the baked macro heightfield, but the snow
  vertex shader displaces every vertex again by a fine layer whose crests stand
  around 8 cm proud — a layer that is evaluated on the GPU and never read back.
  A 2.58 m character never showed that gap; a 7.6 cm board is thinner than the
  relief it sits in and was being swallowed by ridges the grounding code could
  not see.
- The board can be switched off from the F1 overlay, which puts the rider back
  on the snow itself and returns her contact to a broad seated scuff, and its
  length is a slider. Resizing it moves the mesh and the trench together,
  because both read the same proportions.
- A 4096² GPU-baked heightfield combines broad dunes, medium wind lobes, and
  directional fine ridges. A procedural far-mountain field is integrated into
  the sky rather than projected from a flat card.
- A custom WGSL snow material supplies deformation-derived normals,
  multi-scale detail, wrapped diffuse and back-scatter, stable
  view-dependent glints, compressed-snow and ice response, and spell
  through-lighting.
- A player-following, ping-pong 2048² RGBA16F state field covers 80 m
  (approximately 3.9 cm per texel). Its channels are depression, displaced
  mass, compression, and ice. Footsteps, surf, and all five spells share this
  persistent write path. There is no separate wetness channel in this
  implementation.
- Three custom shadow cascades use PCSS-style filtering. The same displaced
  terrain is used by beauty, depth, shadow, and camera-prepass rendering so
  carved tracks remain grounded in their lighting.
- The atmosphere uses a custom WGSL sky, warm low sun, blue ambient
  spherical-harmonic fill, fog and aerial perspective, procedural distant
  mountains, and ground spindrift.
- The post chain is custom-built around TAA, SSAO, state-masked SSR, restrained
  depth of field and bloom, AgX tonemapping, grain, and sharpening. Major
  stages are individually toggleable.
- RockerKaki is the default playable hero and receives a native KAKISNOW beauty
  shader, custom shadows, fog, spell lighting, and grounded snow contact. The
  procedural Snowbound hero remains selectable with planted-foot IK, cloth
  motion, and shell fur.
- Surf and all five spells use preallocated swept geometry, pooled particles,
  persistent terrain writes, and loading-time pipeline warm-up.

## Project layout

- `src/core/` — engine, settings, input, timing, and camera
- `src/terrain/` — clipmap, heightfield, snow shading, and deformation
- `src/character/` — movement, procedural Snowbound figure, RockerKaki, and
  snow contact
- `src/game/` — ingredient definitions and seeded pickup placement
- `src/spells/` — shared spell systems and crystals
- `src/vfx/` — surf wake, particles, and ground blow
- `src/post/` — post-processing chain
- `src/render/` — sky, cascaded shadows, depth, and prepass rendering
- `src/shaders/` — raw WGSL programs
- `src/ui/` — hidden settings/performance overlay and course HUD
- `tools/` — Windows Chrome capture and profiling helpers
- `tools/snow-burgers/` — game asset import, optimisation, and validation

## Evidence and provenance

- [ASSETS.md](./ASSETS.md) records vendored assets, checksums, use status, and
  the unresolved redistribution caveats: RockerKaki's, and the seven
  Snow-Burgers game assets, none of which arrived carrying a licence.
- [DECISIONS.md](./DECISIONS.md) records deliberate departures from the brief.
- [PERF.md](./PERF.md) records measured runtime evidence and its limits.
- [art/source-assets/snow-burgers/OPTIMIZATION_REPORT.md](./art/source-assets/snow-burgers/OPTIMIZATION_REPORT.md)
  records what the game-asset pipeline measured and did: the texture and
  triangle budgets, the rendered evidence behind each decimation target, and
  what is not known about the sources.
- `LICENSES/upstream-renderer-MIT.txt` preserves the imported renderer's exact
  upstream license.
- `public/THIRD_PARTY_NOTICES.txt` ships dependency and imported-code notices.
- `screenshots/milestones/` contains the committed 2560×1440 runtime capture
  sequence.
- `screenshots/board/` holds the board evidence, kept out of the numbered
  milestone sequence because `capture-report.json` describes that sequence and
  these did not come from it. The two straight-line trench shots are at headings
  ninety degrees apart on purpose: a mirrored brush axis looks correct at
  forty-five degrees, so one heading cannot show it.
- `screenshots/snow-burgers/asset-qa/` holds the source, shipped, and swept
  renders the ingredient and burger decimation targets were chosen from.

The automated Windows capture can be reproduced from WSL with:

```bash
"/mnt/c/Program Files/nodejs/node.exe" tools/capture-windows.cjs \
  --url http://127.0.0.1:5173 \
  --out screenshots/milestones
```

This drives the installed Windows Chrome and its WebGPU/D3D backend. It is
visual and regression evidence, not a substitute for an interactive profile
on the specified RTX 5070 Ti target.

The board and the groove it cuts have their own capture, because the thing it
has to show is heading-dependent and one screenshot cannot show it. The run
drives the same straight descent at two headings ninety degrees apart and
photographs the trench from behind each time:

```bash
"/mnt/c/Program Files/nodejs/node.exe" tools/capture-board-windows.cjs \
  --url http://127.0.0.1:5173 --out screenshots/_scratch/board
```

## Hero selection

RockerKaki is the playable default and Snowbound can be selected from the F1
overlay. The supplied seated RockerKaki asset has no skeleton, skin, morphs,
or animation clips, so its movement is driven by the shared player controller,
terrain contact, surf lean, and effects rather than a fabricated skeletal walk
cycle. The snowboard belongs to RockerKaki: she is authored seated, and the
board is what she is seated on. Snowbound stands and keeps its planted-foot
gait.

[ASSETS.md](./ASSETS.md) records the recovered Grok Imagine to Tencent HY 3D
provenance and required AI disclosure. Do not publish a commercial build
containing this model until the remove.bg account tier in its source chain is
confirmed or that uncertain processing step is replaced. The seven Snow-Burgers
game assets carry a separate unresolved caveat of their own: all seven report
no copyright and no licence, and being supplied locally establishes nothing
about redistribution rights.
