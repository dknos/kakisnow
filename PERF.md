# Performance record

## Final integrated candidate

The committed evidence is:

- `screenshots/milestones/capture-report.json`
- `screenshots/milestones/perf-profile.json`

Both records were captured on 2026-07-29 at 2560×1440 in headless Windows
Chrome 150 with Babylon.js 9.18.1. WebGPU reported a non-fallback NVIDIA
Blackwell adapter. The browser did not expose a specific board model, so this
record does not identify the adapter as an RTX 5070 Ti.

The timing numbers below are uncapped `requestAnimationFrame` wall-clock
presentation intervals. The profile launched Chrome with
`--disable-frame-rate-limit` and `--disable-gpu-vsync`; they are useful for
relative headroom and hitch detection, but they are not GPU completion times
or a claim that a display delivered the reciprocal frame rate.

The adapter exposes `timestamp-query`, but Babylon's whole-frame query returned
zero or no usable value in these runs (`gpuMs` is `null` in the accepted
capture). No GPU-millisecond result is therefore claimed.

## 11.1 ms frame target

The 90 FPS target permits 11.1 ms for the complete submitted frame. This is
the engineering allocation, not a set of measured timestamp-query slices:

| System | Target ceiling |
| --- | ---: |
| Terrain geometry and snow shader | 3.2 ms |
| Character, cloth, fur, and contact | 2.2 ms |
| Cascaded shadow work | 1.8 ms |
| Surf, spindrift, and pooled spray | 1.3 ms |
| Active spell and local lighting | 1.0 ms |
| Post-processing, UI, and submission | 1.6 ms |
| **Total** | **11.1 ms** |

Exact certification still requires a headed Chrome Performance trace on the
specified Windows 11 / RTX 5070 Ti / 2560×1440 target. The current evidence
shows substantial uncapped presentation headroom on the available Blackwell
adapter, but it does not replace that hardware-specific gate.

## Acceptance capture

The clean 360-frame steady-state window measured:

| Samples | Median | p95 | p99 | Maximum | Frames above median + 4 ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 360 | 2.2 ms | 3.2 ms | 4.6 ms | 4.8 ms | 0 |

The settled default RockerKaki snapshot submitted 29 draw calls and 1,917,584
triangles. Counts include repeated scene submissions such as shadows and
prepasses rather than only unique visible mesh triangles.

### First user cast after loading

Each 36-frame window begins with the first user-visible cast after loading and
pipeline warm-up:

| Spell | Median | p95 | p99 | Maximum | Frames above median + 4 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sweep | 2.3 ms | 4.1 ms | 4.8 ms | 4.8 ms | 0 |
| Ribbon | 2.0 ms | 3.4 ms | 4.2 ms | 4.2 ms | 0 |
| Bloom | 1.9 ms | 3.4 ms | 3.4 ms | 3.4 ms | 0 |
| Crystallize | 2.3 ms | 4.7 ms | 5.5 ms | 5.5 ms | 0 |
| Vortex | 2.2 ms | 3.4 ms | 3.7 ms | 3.7 ms | 0 |

No first-cast window exceeded its own median by more than 4 ms.

### Submitted scene counts

| Captured state | Draw calls | Submitted triangles |
| --- | ---: | ---: |
| Settled RockerKaki | 29 | 1,917,584 |
| Snow-surf active | 33 | 1,952,128 |
| Snowbound | 26 | 1,732,352 |
| Profile end, Vortex active | 30 | 1,981,984 |

## Uncapped scenario profile

Each scenario contains 480 end-to-end presentation intervals. System-off
scenarios overlap—for example, hiding a character also changes its shadow and
prepass submissions—so differences are diagnostic comparisons, not additive
per-system GPU costs.

| Scenario | Median | p90 | p99 | Maximum | Frames above median + 4 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 2.2 ms | 2.8 ms | 3.5 ms | 4.1 ms | 0 |
| Terrain disabled | 1.3 ms | 2.0 ms | 3.2 ms | 9.1 ms | 3 |
| Procedural mountains disabled | 1.3 ms | 1.9 ms | 2.9 ms | 3.1 ms | 0 |
| Character disabled | 2.1 ms | 2.5 ms | 4.8 ms | 8.6 ms | 3 |
| Shadow updates cached | 1.9 ms | 2.3 ms | 3.1 ms | 3.2 ms | 0 |
| Finishing stages disabled | 2.0 ms | 2.9 ms | 5.0 ms | 5.9 ms | 0 |
| Snowbound | 2.0 ms | 2.4 ms | 3.5 ms | 4.0 ms | 0 |
| Snow-surf active | 2.0 ms | 2.3 ms | 2.8 ms | 2.9 ms | 0 |
| Vortex active | 2.0 ms | 3.1 ms | 4.1 ms | 4.5 ms | 0 |

The isolated terrain-off and character-off runs contain a small number of
wall-clock outliers. Because these are presentation intervals without GPU
completion timestamps, the evidence does not assign them to a particular GPU
pass or to garbage collection. The baseline, Snowbound, surf, and Vortex runs had
zero median-plus-4-ms violations.

## Stability and warm-up

The accepted capture reported:

- zero page errors;
- zero WebGPU validation warnings;
- zero uncaptured WebGPU errors;
- zero device-loss events.

The separate profile also reported zero page errors and zero validation
warnings.

Before the loading screen fades, KAKISNOW initializes the height and auxiliary
targets, deformation ping-pong targets, shadow and prepass targets, hero
variants, post stages, pooled effects, and all five spell pipelines. The
first-cast measurements above exercise the first user-visible activation after
that warm-up.

## Reproduction

With a production preview running:

```bash
"/mnt/c/Program Files/nodejs/node.exe" tools/capture-windows.cjs \
  --url http://127.0.0.1:4195 \
  --out screenshots/milestones

"/mnt/c/Program Files/nodejs/node.exe" tools/profile-windows.cjs \
  --url http://127.0.0.1:4195 \
  --out screenshots/milestones/perf-profile.json \
  --frames 480
```

These commands reproduce the automated browser records. Final RTX 5070 Ti
certification remains an external headed-browser profiling step.

## Snow-Burgers game layer

Two questions, measured separately, because they have different answers.

### Does the snow study still perform as it did?

`tools/profile-windows.cjs` was run against this branch and against the
pre-game baseline `5291330`, both in Free Ride Lab, in headless Windows Chrome
at 2560×1440 with `--disable-frame-rate-limit` and `--disable-gpu-vsync`. The
baseline was served from a separate worktree on port 5174 so the two builds
could be measured in the same session without a checkout between them.

| Scenario | Baseline mean | Snow-Burgers mean | Δ |
| --- | ---: | ---: | ---: |
| baseline | 1.77 ms | 1.79 ms | +0.02 |
| terrain-off | 1.20 ms | 1.21 ms | +0.01 |
| mountains-off | 1.22 ms | 1.25 ms | +0.03 |
| character-off | 1.72 ms | 1.74 ms | +0.02 |
| shadows-cached | 1.60 ms | 1.63 ms | +0.03 |
| finishing-off | 1.66 ms | 1.67 ms | +0.01 |
| snowbound | 1.76 ms | 1.78 ms | +0.02 |
| surf-active | 1.94 ms | 1.95 ms | +0.01 |
| vortex-active | 2.04 ms | 2.04 ms | 0.00 |

Draw calls and triangle counts are identical: 26 and 1,906,008. That is the
expected result rather than a lucky one — in Free Ride Lab every ingredient,
pickup site, base-camp piece and vehicle is disabled, so there is nothing extra
to draw.

The p99 and maximum figures move by whole milliseconds in both directions on
both builds — the baseline records a 6.5 ms maximum on `terrain-off` where this
branch records 2.5, and this branch records 8.8 ms on `mountains-off` where the
baseline records 2.8. These are uncapped `requestAnimationFrame` presentation
intervals on a machine that is not otherwise quiet; the outliers are noise and
are not read as a regression in either direction.

Raw records: `screenshots/snow-burgers/perf/baseline-5291330.json` and
`screenshots/snow-burgers/perf/snow-burgers.json`.

### What does the game layer cost when it is drawing?

The measurement above deliberately says nothing about that, so
`tools/snow-burgers/perf-game-layer-windows.cjs` samples the same build twice
in one session, from the same fixed vantage at z = 240 — once in Free Ride Lab
and once mid-run with the four pickups, their sites and Burger Base Camp all
standing:

| | Mean | p99 |
| --- | ---: | ---: |
| Free Ride Lab | 2.073 ms | 4.1 ms |
| Burger Run | 2.328 ms | 4.6 ms |

**+0.255 ms** for 22,370 triangles across 26 additional meshes, or about 2.3%
of the 11.1 ms frame allocation this document sets out above. The same vantage
is used for both samples because frame time here moves with what is on screen,
and two samples taken in two places would measure the terrain rather than the
change.

Record: `screenshots/snow-burgers/perf/game-layer.json`.

Neither figure is a GPU completion time. Chrome's command-encoder timestamp
path still returns zero on this backend, as the record above already notes, so
no GPU-millisecond result is claimed for the game layer either.
