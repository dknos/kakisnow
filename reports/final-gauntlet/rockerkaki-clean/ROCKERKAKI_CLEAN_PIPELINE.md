# RockerKaki clean local pipeline

Status: **runtime-promoted, source-reviewed, and reproducibly validated on 2026-08-08**.

This report covers the replacement of the former uncertain RockerKaki source
chain. The active hero is authored locally from Blender primitives and a tiny
repository-local palette. It is not a re-export, retexture, or derivative of
the former remove.bg path.

## Source and provenance

The authoritative record is [`GENERATION_RECORD.json`](../../../art/generated-assets/rockerkaki/GENERATION_RECORD.json), and the runtime contract is recorded in [`RUNTIME_MANIFEST.json`](../../../art/generated-assets/snow-burgers/RUNTIME_MANIFEST.json).

- Generator: `blender --background --factory-startup --python tools/generate-rockerkaki.py`
- Rig pass: `blender --background --factory-startup --python tools/rig-rockerkaki.py`
- Structural check: `blender --background --factory-startup --python tools/validate-rockerkaki-rig.py`
- Blender version recorded by the generator: 5.1.1.
- `externalGeometryInputs`, `externalTextureInputs`, and `networkInputs` are all empty.
- The generator imports no model, image, texture, or network input. The palette is authored locally as a 64×64 PNG with 16 colours.
- The active manifest rights profile is `clean-local-procedural-character`; the historical remove.bg profile is explicitly rejected and is not used by runtime.

The authored identity is deliberately retained: large chibi head, violet/white
hair, small horns, dark alpine outfit, seated boots, and electric guitar.

## Hash-locked outputs

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| [`rockerkaki.glb`](../../../public/assets/models/rockerkaki.glb) | 366,316 | `c3a4c7325e86db85f43a8bc06694cc4621cec7a1acfb7ea8dbcb6dc01424b602` |
| [`rockerkaki-rigged.glb`](../../../public/assets/models/rockerkaki-rigged.glb) | 555,636 | `c300cb1a1b581ac07d7f0319a4c0902340ee4d64520294a1ec4ac82fcb658007` |
| [`rockerkaki-source.blend`](../../../art/rockerkaki-source.blend) | 340,075 | `10a73d6a01a10fbd82132ca1605fe478aeb7c526bed2328522fd7314567b086d` |
| [`rockerkaki-rig.blend`](../../../art/rockerkaki-rig.blend) | 396,689 | `0cd42b7c301ccf756447b1db9b269259ccd02da9c075b005c00ffec07deb2d08` |
| [`rockerkaki-palette.png`](../../../art/generated-assets/rockerkaki/rockerkaki-palette.png) | 248 | `83a80a58ac2f0e34af5537ec6cd577cb5191fda14938eebec5748b0807fd63d7` |

The source mesh records 6,558 source vertices, 12,928 triangles, one material,
and one palette texture. The exported runtime mesh has 8,962 vertices. The
rig contains 10 bones total: one root control and nine deform bones, eight
runtime joint drivers, and the `RockerBreath` action; the runtime skin carries
indices and weights with no more than three influences per vertex.

Two clean Blender processes were run from the same repository scripts and
produced byte-identical source and rigged GLBs, matching the hashes above.
The editable `.blend` container bytes are recorded for traceability but are
not claimed to be deterministic.

## Format and runtime validation

The installed Khronos `gltf-validator` 2.0.0-dev.3.10 was run directly on both
active GLBs. Each reported **0 errors, 0 warnings, 0 infos, and 0 hints**, with
12,928 triangles, 8,962 vertices, and no extensions requiring a runtime CDN.
The release asset validator and hero-provenance negative tests also pass; a
tampered external-input record is rejected rather than silently promoted.

## Downstream production evidence

- [Front runtime portrait](after-front.webp) and [chase-camera view](after-chase.webp):
  the clean source is visibly present in the actual KAKISNOW renderer, with the
  hair, horns, face, outfit, guitar, board relationship, lighting, fog, and
  shadow integration available for direct review.
- [Final downhill report](final-downhill/report.json): rig and `RockerBreath`
  load in WebGPU; 31 jumps; minimum forward speed 13.167 m/s; zero stalled
  seconds; 59.988 FPS; zero console and GPU errors.
- [All-twelve event reports](../final-runtime/events/): every registered event reaches
  `results`, completes its required ingredient order, uses its registered
  vehicle, and reports zero console/WebGPU errors. This includes both rocket-
  chair events and Big Air telemetry/landing output.
- [Final camera matrix](../final-camera/camera-matrix-report.json): 20 scenarios,
  2,235 sampled frames, all six finishes, five rail areas, snowcat, avalanche,
  Big Air at 16:9/21:9 and reduced motion, and near/far zoom. There are zero
  below-terrain frames, non-finite frames, solid intersections, oscillation
  windows, console errors, WebGPU validation errors, or failed requests. The
  tightest measured solid clearance is 0.306583 m against the 0.30 m threshold.
- The camera regression was closed by increasing the thin-rail probe radius
  from 0.34 m to 0.38 m in [`src/core/camera.js`](../../../src/core/camera.js),
  followed by the clean 20/20 rerun.
- [Final performance samples](../final-performance/): at 2560×1440, Summit is
  2.6/3.6/4.4 ms median/p95/p99 with 382 draws and 1,947,155 submitted
  triangles; Big Air is 3.5/4.8/6.1 ms with 635 draws and 2,486,449 triangles;
  Whiteout is 2.7/3.6/4.7 ms with 522 draws and 2,076,283 triangles. These are
  uncapped rAF presentation intervals, not invented GPU timings; all samples
  have zero console errors.
- [Corrected showreel manifest](../showreel/snow-burgers-showreel.json) and
  [`snow-burgers-showreel.webm`](../showreel/snow-burgers-showreel.webm):
  72.240 seconds, 1280×720 VP8 at 25 fps, 3,985,681 bytes, SHA-256
  `f47257d3de0b0450caed897749d9908274805f329f85b451d31cda42c2c37f57`.
  The Big Air segment is 10.018 seconds and the capture harness waits for
  real flight telemetry, non-crash landing, airborne=false, landing HUD
  distance/height/grade, and a readable post-landing hold before cutting.

## Critic disposition and limitations

Independent source/provenance, runtime, event, camera, and integration critics
accepted the clean hero and the exact downstream evidence. The earlier
showreel critic identified a premature Big Air cut; the capture was corrected
to require touchdown and landing grade, then recaptured and rechecked.

One documented P2 remains: the dark outfit and guitar lose some small detail in
very dark Midnight Resort/Whiteout Ridge chase frames, although the hair,
horns, board, silhouette, and HUD remain readable. Physical gamepad/touch
ergonomics, human audio listening, colour-vision review, reduced-motion comfort,
and exact target-GPU certification remain honest external review gates. No
active RockerKaki provenance blocker remains in the runtime pipeline.
