# Final camera matrix

Date: 2026-08-08
Branch: `feat/final-polish-gauntlet`
Build: clean-hero final production preview at `http://127.0.0.1:5193`
Runtime: installed Windows Chrome/WebGPU
Result: **PASS**

## Coverage

`tools/snow-burgers/capture-camera-matrix-windows.cjs` drove 20 named
production-camera scenarios and sampled 2,235 presented frames:

- all six Burger Base Camp finish/assembly presentations at 16:9;
- five authored rail areas: Summit, Pinecone, Midnight, Whiteout, and Big Air;
- the live Midnight snowcat patrol and a staged 18 m Whiteout avalanche lead;
- classic-board Big Air takeoff/flight/landing at 16:9 and exact 21:9;
- the same signature flight with reduced motion at both aspect ratios;
- a Summit finish at exact 21:9;
- near (`2.6 m`) and far (`11 m`) camera-distance springs.

The harness stages the real rider at named authored coordinates, then lets the
production character, camera, director, collision worlds, terrain, finish,
hazard, and Big Air systems update normally. It does not synthesize camera
transforms or render a test scene. This is deterministic regression evidence,
not a claim that scripted staging replaces unrestricted human play.

## Machine-screening result

| Check | Observed worst | Acceptance threshold | Result |
| --- | ---: | ---: | --- |
| Non-finite frames | 0 | 0 | pass |
| Camera below terrain | 0 frames | 0 | pass |
| Camera inside sampled solid | 0 frames | 0 | pass |
| Alternating arm-distance windows | 0 | 0 | pass |
| Camera translation rate | 112.683 m/s, Midnight rail correction | 140 m/s | pass |
| Yaw rate | 0.248 rad/s | 16 rad/s | pass |
| Pitch rate | 1.421 rad/s | 16 rad/s | pass |
| Spring distance rate | 19.464 m/s, Big Air finish | 90 m/s | pass |
| Obstacle-arm compression | 8.494 m, Midnight rail | measured, no intersection | pass |
| Console errors | 0 | 0 | pass |
| WebGPU validation errors | 0 | 0 | pass |
| Failed requests | 0 | 0 | pass |

The live snowcat reached a normalized proximity of `0.664` (approximately
20.2 m from the rider under the harness's 60 m scale). The staged avalanche
held a minimum measured lead of `18.019 m`. All four Big Air aspect/motion
scenarios entered both authoritative flight and predictive-framing states;
the minimum sampled camera clearance above terrain was `0.367 m`. The nearest
sampled solid clearance was `0.3066 m` against the `0.30 m` rejection volume.

## Pixel inspection

The exact-build finish sheet was inspected for all six courses. Every assembly
frame keeps RockerKaki and the completed burger readable without placing the
camera inside the burger, rider, lodge, or terrain. Big Air's exact 21:9 frame
retains the rider, landing structure, venue scale, track reference, and flight
telemetry. The Midnight rail case visibly retracts around the authored solid
without a captured intersection. Reduced-motion frames retain the landing line
without trauma-driven movement.

Representative compressed evidence:

- [Summit finish](16x9-finish-summit-line.webp)
- [Whiteout finish](16x9-finish-whiteout-ridge.webp)
- [Midnight rail correction](16x9-rail-midnight-resort-153.webp)
- [Snowcat pass](16x9-snowcat-pass-midnight.webp)
- [Avalanche proximity](16x9-avalanche-proximity-whiteout.webp)
- [Big Air flight](16x9-big-air-flight.webp)
- [Big Air reduced motion](16x9-big-air-reduced-motion.webp)
- [Big Air exact 21:9](21x9-big-air-21x9.webp)
- [Near zoom](16x9-zoom-near.webp) and [far zoom](16x9-zoom-far.webp)

The complete per-frame record is
[`camera-matrix-report.json`](camera-matrix-report.json). Raw PNGs remain local
under the exact-build report's `captures/`; the review
branch carries compact representative WebPs rather than all redundant source
frames.

## Limits

- The matrix screens deterministic named locations. Physical free-camera play
  can still discover a line outside these samples.
- The snowcat pass proves live proximity and stable framing, not a deliberate
  vehicle collision.
- Reduced-motion acceptance here is visual/camera behavior; vestibular comfort
  remains a human review.
- No GPU-completion timing is inferred from camera sample cadence.
