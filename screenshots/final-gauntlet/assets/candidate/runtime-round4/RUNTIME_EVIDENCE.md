# F4 temporary-runtime evidence

Audit date: 2026-08-07. This report covers a checksum-isolated candidate
runtime only. No candidate GLB was promoted to the shared
`public/assets/models/snow-burgers/` directory, and no shared runtime GLB was
edited. `runtime-original-hashes.sha256` matches a fresh post-capture hash of
the shared directory.

## Exact temporary method

The repository was copied to `/tmp/kakisnow-f4-runtime.VAVh1e` with the Git
metadata, screenshots, reports, source-asset archive, and previous `dist`
excluded. The candidate GLBs from
`art/generated-assets/snow-burgers/` were then copied only into that temporary
tree's `public/assets/models/snow-burgers/` paths. The temporary tree used a
local copy of `node_modules`; no runtime CDN or network asset was used.
The generator's attempted `--out public/assets/models/snow-burgers` invocation
was also run without its explicit opt-in flag and exited 1 with the expected
runtime-output refusal.

Inside the temporary tree:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 5184
```

The build passed. Windows Chrome at
`C:\Program Files\Google\Chrome\Application\chrome.exe` drove the preview
with WebGPU enabled. The browser harnesses recorded empty `consoleErrors` and
`webgpuValidation` arrays on the successful runs below.

## Player-facing KAKISNOW frames

The accepted player-facing service evidence is from the real Burger Run finish
presentation, not the neutral Blender turntable:

- `playthrough-16x9/001-assembly.png` is the 1280×720 in-game finish frame. The
  service façade is visible at the upper-right with the large warm hatch,
  counter, red awning, three-chip order board, roof, and grill-side language.
- `playthrough-21x9/001-assembly.png` is the corresponding 3440×1440 frame and
  shows the same service side in the ultrawide composition.
- `camp-16x9/hut-service-front-player-facing-detail.png` is a direct crop and
  Lanczos scale of the hut from the first accepted assembly frame. It is not a
  separately staged camera and is retained only to make the service details
  legible to a critic while preserving the parent frame as evidence.

The controlled camera probes are deliberately labelled with their limits:

- `camp-16x9/hut-service-side.png` proves that the imported candidate exposes
  the service side in KAKISNOW, but snow and a foreground green scenery object
  occlude the lower façade. It is acceptable as grounded placement evidence,
  not as a clean close-up approval frame.
- `camp-16x9/hut-finish-approach.png` is a route-aligned diagnostic whose
  terrain/approach angle does not present the service façade cleanly. It is not
  used to claim that the rear or an occluded angle proves the service face.
- `camp-16x9/village-distant.png` is a distant visibility diagnostic and is not
  used as detailed hut-quality evidence.

The final 13-asset neutral four-view set is under
`../qa-round4-final/all-assets/` with the reviewed contact sheet at
`../qa-round4-final/all-assets-contact-sheet.png`. Those frames establish
geometry/material detail. A fresh independent critic is still required to
decide whether the grounded distance framing needs a cleaner close service shot
before promotion.

## Import, scale, and integration measurements

The temporary WebGPU capture imported the candidates without missing-file or
loader errors:

| Runtime instance | Meshes | Triangles | Root scale | World bounds size |
| --- | ---: | ---: | --- | --- |
| `camp-hut.glb` | 11 | 6,460 | `[1.5, 1.5, 1.5]` | `[10.371, 7.230, 9.360]` |
| second `camp-hut.glb` instance | 11 | 6,460 | `[1.15, 1.15, 1.15]` | `[8.442, 7.230, 10.021]` |
| `camp-village.glb` | 12 | 20,468 | `[1, 1, 1]` | `[27.549, 7.645, 18.004]` |

The complete candidate import probe reports `available: true` for each
requested candidate, with no console or WebGPU validation errors. The real
finish and ultrawide runs collected all four Summit Line ingredients and
reached results with the candidate burger present. The burger result frames
also show the candidate hut under the production snow, fog, and shadow path.

## Runtime captures

- `playthrough-16x9/`: classic snowboard, seed 1, 4/4 ingredients, results,
  gold medal, 31.48 s, zero console/WebGPU errors.
- `playthrough-21x9/`: same candidate run at 3440×1440, 4/4 ingredients,
  results, gold medal, 31.49 s, zero console/WebGPU errors.
- `rocket-run-16x9/`: rocket-chair ignition, sustained boost, boosted air,
  landing, and shutdown. `nan: false`, max speed 26.58, zero console/WebGPU
  errors.
- `perf-16x9.json`: same-session 2560×1440 game-layer comparison. Free Ride
  mean 2.388 ms / p99 6.6 ms; Burger Run mean 2.666 ms / p99 6.5 ms; reported
  mean delta +0.278 ms, 2,273 game-layer triangles and 36 meshes.

The performance harness measures uncapped `requestAnimationFrame`
presentation intervals in headless Windows Chrome. These are comparative
presentation measurements, not GPU milliseconds and not hardware
certification. No GPU timestamp query was available in this capture.

## Evidence boundary

`HASH_PROOF.md` records the exact-byte two-clean-run proof. `camp-16x9` and
the two playthrough directories contain the pixel evidence. The temporary
runtime build and this report establish candidate import/integration evidence;
they do not establish asset rights, final promotion, or independent visual
approval. The current supplied 13 runtime GLBs remain unresolved in
`ASSET_LEDGER.md` until owner review and the fresh critic gate are complete.
