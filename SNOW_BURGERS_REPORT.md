# Snow-Burgers — build report

Branch `feat/snow-burgers`. Baseline commit `5291330`. Nothing has been pushed
to `main`; that repository publishes to GitHub Pages on push, so a merge is a
release and is the owner's call.

The twenty items below are the report the brief asks for. Where something is
not done, it says so.

## 1. Final game-loop description

Title screen → **Burger Run** → order card for THE SUMMIT STACK (patty, cheese,
tomato, lettuce; buns come from the grill) → 3-2-1 countdown at the summit gate
→ descend the Summit Line collecting the four ingredients from their authored
zones → pass under the finish arch and cross the gate at Burger Base Camp →
assembly sequence stands the finished burger up → results, medal and star
rating → retry the same seed, take a new order, or return to the menu.

Two other modes: **Free Ride Lab**, the original open mountain unchanged and
unscored, and **Rocket Board Test**, the Summit Line on the rocket chair with
an infinite tank and nothing recorded.

## 2. Asset paths

Sources, preserved on the authoring machine and excluded from version control:

```
art/source-assets/snow-burgers/cheese-source.glb
art/source-assets/snow-burgers/patty-source.glb
art/source-assets/snow-burgers/tomato-source.glb
art/source-assets/snow-burgers/lettuce-source.glb
art/source-assets/snow-burgers/onion-source.glb
art/source-assets/snow-burgers/burger-complete-source.glb
art/source-assets/snow-burgers/rocket-chair-snowboard-source.glb
```

Runtime derivatives, committed:

```
public/assets/models/snow-burgers/ingredient-cheese.glb
public/assets/models/snow-burgers/ingredient-patty.glb
public/assets/models/snow-burgers/ingredient-tomato.glb
public/assets/models/snow-burgers/ingredient-lettuce.glb
public/assets/models/snow-burgers/ingredient-onion.glb
public/assets/models/snow-burgers/burger-complete.glb
public/assets/models/snow-burgers/rocket-chair-snowboard.glb
public/assets/ui/snow-burgers/*.webp          (order-card icons)
```

No absolute or Downloads path appears in anything under `src/`.

## 3. Before and after

| Asset | Source | Runtime | Reduction | Budget |
| --- | ---: | ---: | ---: | ---: |
| `cheese` | 144,548 | 18,404 | 87.3% | 1.25 MB |
| `patty` | 2,380,180 | 213,024 | 91.0% | 1.25 MB |
| `tomato` | 582,620 | 79,668 | 86.3% | 1.25 MB |
| `lettuce` | 85,820 | 16,604 | 80.7% | 1.25 MB |
| `onion` | 2,765,904 | 596,544 | 78.4% | 1.25 MB |
| `burger` | 93,547,332 | 1,569,000 | 98.3% | 2.5 MB |
| `rocket` | 76,827,712 | 976,300 | 98.7% | 4.0 MB |

Total runtime package **3.31 MB** against a preferred budget of 11 MB and a
ceiling of 15 MB. Every asset is inside its individual budget.

## 4. Triangles and textures

| Asset | Tris in | Tris out | Texture in | Texture out |
| --- | ---: | ---: | ---: | ---: |
| `cheese` | 316 | 316 | 0.12 MB | 14 kB |
| `patty` | 19,628 | 19,628 | 1.64 MB | 149 kB |
| `tomato` | 1,310 | 1,310 | 0.50 MB | 67 kB |
| `lettuce` | 476 | 476 | 0.05 MB | 11 kB |
| `onion` | 1,340 | 1,340 | 2.58 MB | 576 kB |
| `burger` | 1,500,000 | 220,000 | 45.94 MB | 797 kB |
| `rocket` | 1,500,000 | 159,996 | 30.45 MB | 415 kB |

Extensions used: `KHR_draco_mesh_compression` and `EXT_texture_webp`
throughout, plus `KHR_materials_specular` / `KHR_materials_ior` where the
spec-gloss conversion produced them. KTX2 was rejected because Babylon's
transcoder defaults to a Babylon CDN this project does not vendor.

The 220,000-triangle burger was chosen from rendered evidence, not from a size
target: a 500,000-triangle candidate is indistinguishable at render resolution
and both are committed under `screenshots/snow-burgers/asset-qa/`.

## 5. Provenance

**Unresolved.** All seven supplied assets report `copyright: null` and an empty
`extras`. Five carry Sketchfab download signatures in their node names; two are
generated assets whose textures are dated 2025-09-01. Being supplied locally
establishes nothing about redistribution rights. `ASSETS.md` records this as
unresolved rather than permissive, alongside the same caveat RockerKaki already
carries.

## 6. Ingredient placement

Five authored zones read off `heightBake.fragment.wgsl`, one per ingredient.
Candidates are generated on a jittered stratified grid inside each zone and
rejected for: sitting in a jump's approach or landing (derived from the lip,
run-in and drop, plus a 16 m margin past where the ramp ends because that is
not where the rider ends), sitting up a halfpipe wall, exceeding the zone's
slope limit, or exceeding a roughness limit measured against the local tangent
plane. One survivor per ingredient is chosen from a seed, then the set is
checked for downhill ordering, minimum separation, and a lateral reach no
greater than 0.84 of the along-course gap.

The module never computes a terrain height itself; it takes an injected field,
because the only authoritative heights come from reading back the GPU bake.

## 7. Seeds tested

**100 of 100 complete** against the real GPU-baked heightfield
(`tools/snow-burgers/validate-placement-windows.cjs`), on a field confirmed
non-flat at −14.6 to 17.0 m, with 16 to 41 valid anchors per zone. The tightest
lateral demand any seed produced was 0.8225 of the 0.84 limit. A separate
100-seed unit test runs against a synthetic field and proves the rules without
a GPU.

## 8. Rocket physics

Thrust is added inside `CharacterController._surfStep` along the board's
heading and nowhere else, so vertical flight is structurally impossible rather
than limited. 22 m/s² at full throttle on the ground, 35% of that airborne.
Above the unboosted top speed an extra quadratic drag term grows with the
overspeed; thrust and drag balance at a measured **26.5 m/s** against a base of
19.4, with a hard ceiling at 32 that should never be reached. The throttle
ramps through a frame-rate-independent ease, faster up than down, guarded
against the zero timestep `S.freezeTime` produces.

## 9. Seat transform and attachment nodes

The GLB is one unnamed mesh; splitting by loose parts gives 4,500 islands and
no semantics. Anchors were measured by slicing the mesh along its length
(`tools/snow-burgers/measure-rocket-chair.py`) and are recorded in
`src/vehicles/vehicleProfiles.js`, in model space, metres:

```
seatAnchor        0,  0.390,  0.180      frontContact  0, 0.0295,  0.900
backrestTop       0,  0.725, -0.100      rearContact   0, 0.0300, -0.730
cameraTarget      0,  0.560, -0.060      leftEdge   -0.215, 0.070, 0.080
cargoTrayAnchor   0,  0.420, -0.320      rightEdge   0.215, 0.070, 0.080
mainNozzle        0,  0.226, -1.285      contactY = 0.0295
leftVent      -0.105, 0.223, -1.010      exhaustDirection = 0, 0, -1
rightVent      0.105, 0.223, -1.010
```

`contactY` is the underside of the contact patches, not the bounding box: the
model's lowest point is a fin hanging below the deck. The rider is seated by
`rocker.vehicleDeckHeight`, derived from the seat anchor and the measured
grounding offset rather than tuned. Chair scale is `S.boardScale ×
S.rocketChairScale`, the latter shipping at 1.8 — chosen from the committed
sweep under `screenshots/snow-burgers/rocket-seat/`.

The brief's `leftNozzle`/`rightNozzle` pair does not exist on this asset: it
has one central booster. The two vents are derived from its measured radius to
give the plume width, and are documented as derived.

## 10. Controls

Unchanged from the base project, plus: **Left Shift** or a **gamepad right
trigger** (analogue) for rocket thrust. Right mouse to ride, WASD to steer,
Space to jump, F1 for the settings overlay. `?mode=free-ride` and
`?mode=burger-run` select a mode at boot, which is how the headless tools reach
the mountain without pressing a button.

## 11. Scoring

Order (four collected, burger completed), Time (total, per-ingredient splits,
medal at 34 / 44 / 58 s), Style (air share, carve, pace, pipe time and the
authored risk of the route's zones), Stack Integrity (hard-landing rate and
worst impact), Rocket Efficiency (ground distance under thrust, discounted by
thrust held airborne at a speed where it bought nothing), and an overall one to
five stars gated on completion.

Medal thresholds were measured, not guessed: the autopilot rides a near-optimal
line in 31 s on the classic board and 28 s on the rocket. The first thresholds
written were more than twice that and were golded on the first attempt.

The screen names what it did not measure. The controller has no trick system,
no obstacle collision and no crash state, so there are no trick scores and no
crash counts, and printing zeroes for them would read as a bad run.

## 12. Save schema

`localStorage` key `snow-burgers.book`, version 1: total burgers, total runs,
whether the assembly cinematic has been seen, and per-event records (completions,
best time, best style, best integrity, best rocket, best stars, best medal, best
seed, best ghost). Every read is defensive — unavailable storage, another tool's
data and a truncated write all fall back to a fresh book rather than taking the
boot down. `migrate` rejects anything that is not the current version.

## 13. Test results

23 unit tests pass (`npm test`), covering the controller, the brush-yaw
convention and 14 placement tests including the 100-seed completability sweep.
`tools/smoke-downhill-windows.cjs` passes with zero console errors and zero
GPU errors. `tools/snow-burgers/playthrough-windows.cjs` completes four of four
ingredients on both vehicles with zero console errors and zero WebGPU
validation messages.

## 14. Performance

Measured against the pre-game baseline `5291330`, served from a separate
worktree so both builds could be profiled in one session.

**Free Ride Lab is not regressed.** Across all nine profiled scenarios the mean
frame time differs by 0.00 to 0.03 ms, and draw calls and triangle count are
identical at 26 and 1,906,008 — which is the expected result, because in Free
Ride Lab every game asset is disabled. The p99 and maximum figures swing by
whole milliseconds in both directions on both builds; those are uncapped
`requestAnimationFrame` intervals and are read as noise.

**The game layer costs +0.255 ms mean** when it is actually drawing — 2.073 ms
in Free Ride Lab against 2.328 ms mid-run from the same fixed vantage, for
22,370 triangles across 26 additional meshes. That is about 2.3% of the 11.1 ms
frame allocation in `PERF.md`.

Neither figure is a GPU completion time; Chrome's timestamp path still returns
zero on this backend. Full tables are in `PERF.md`; raw records are under
`screenshots/snow-burgers/perf/`.

## 15. WebGPU validation

Clean. Every playthrough, smoke run and capture reports zero validation errors,
zero uncaptured GPU errors and zero device-loss events.

## 16. Capture locations

```
screenshots/snow-burgers/asset-qa/{source,optimized,sweep}/   asset before/after
screenshots/snow-burgers/ingredients/                          pickups in world
screenshots/snow-burgers/playthrough/                          a full classic run
screenshots/snow-burgers/playthrough-rocket/                   a full rocket run
screenshots/snow-burgers/rocket-seat/                          seat-scale sweep
screenshots/snow-burgers/rocket-run/                           thrust and exhaust
screenshots/snow-burgers/placement-validation.json             100-seed sweep
```

## 17. Known limitations

- **The burger is small in frame at the finish.** Three framings were tried and
  all put the camera inside a prop; a camera that stages the reward properly
  wants collision awareness in the rig.
- **No audio at all.** There is no `src/audio/`, and the brief's rocket,
  ingredient, grill and interface sound is not started.
- **No ghost playback.** Ghost samples are recorded and persisted; nothing
  replays them.
- **`skipAssembly()` is unreachable** — written, but no input calls it.
- **The onion is loaded and placed-capable but not in any order.** THE SUMMIT
  STACK stays at the four the brief specifies; the onion is the variant-order
  ingredient and has a zone, an icon and a validated placement.
- **No procedural environment population** — no trees, rocks or fencing beyond
  the base camp itself.
- **No heat distortion, ignition flare or exhaust illumination on the snow.**
- **Pickup sites have a pad and stakes but no beacon or frost**; the beacon
  needs an emissive material this renderer does not currently have.
- **Provenance is unresolved** for all seven supplied assets (item 5).

## 18. Production build

```
npm run build
```

## 19. Deployment

`.github/workflows/deploy-pages.yml` builds and publishes on push to `main`.
There is no staging step, so a merge is a release.

## 20. Deployed commit SHA

**None.** Nothing has been deployed. All work is on `feat/snow-burgers`, and
the owner has not been asked for a merge yet.
