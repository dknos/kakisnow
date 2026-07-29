# KAKISNOW

KAKISNOW is a WebGPU-only Babylon.js snow-rendering and elemental-bending
tech demo. It is deliberately a single scene rather than a game: walk the
field, carve persistent trails, surf the dunes, and cast five snow-and-water
spells.

The renderer includes an MIT-licensed foundation that has been substantially
adapted for KAKISNOW. The upstream author's copyright and exact license text
ship with the production build.

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

## Controls

- `WASD` / arrow keys — camera-relative movement
- Mouse drag — orbit
- Mouse wheel — eased zoom
- Hold right mouse button — snow-surf
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

## Rendering architecture

- One draw renders an eight-ring, player-centred geometry clipmap. The inner
  grid spacing is 8.5 cm, the field reaches roughly 870 m, and the terrain
  contributes approximately 333,000 triangles.
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
- `src/spells/` — shared spell systems and crystals
- `src/vfx/` — surf wake, particles, and ground blow
- `src/post/` — post-processing chain
- `src/render/` — sky, cascaded shadows, depth, and prepass rendering
- `src/shaders/` — raw WGSL programs
- `src/ui/` — hidden settings/performance overlay
- `tools/` — Windows Chrome capture and profiling helpers

## Evidence and provenance

- [ASSETS.md](./ASSETS.md) records vendored assets, checksums, use status, and
  the unresolved RockerKaki redistribution caveat.
- [DECISIONS.md](./DECISIONS.md) records deliberate departures from the brief.
- [PERF.md](./PERF.md) records measured runtime evidence and its limits.
- `LICENSES/upstream-renderer-MIT.txt` preserves the imported renderer's exact
  upstream license.
- `public/THIRD_PARTY_NOTICES.txt` ships dependency and imported-code notices.
- `screenshots/milestones/` contains the committed 2560×1440 runtime capture
  sequence.

The automated Windows capture can be reproduced from WSL with:

```bash
"/mnt/c/Program Files/nodejs/node.exe" tools/capture-windows.cjs \
  --url http://127.0.0.1:5173 \
  --out screenshots/milestones
```

This drives the installed Windows Chrome and its WebGPU/D3D backend. It is
visual and regression evidence, not a substitute for an interactive profile
on the specified RTX 5070 Ti target.

## Hero selection

RockerKaki is the playable default and Snowbound can be selected from the F1
overlay. The supplied seated RockerKaki asset has no skeleton, skin, morphs,
or animation clips, so its movement is driven by the shared player controller,
terrain contact, surf lean, and effects rather than a fabricated skeletal walk
cycle.

[ASSETS.md](./ASSETS.md) records the recovered Grok Imagine to Tencent HY 3D
provenance and required AI disclosure. Do not publish a commercial build
containing this model until the remove.bg account tier in its source chain is
confirmed or that uncertain processing step is replaced.
