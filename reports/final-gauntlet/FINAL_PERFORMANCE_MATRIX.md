# Final performance matrix

Date: 2026-08-07
Branch: `feat/final-polish-gauntlet`
Build: converged production preview at `http://127.0.0.1:5192`
Capture: installed Windows Chrome/WebGPU, 2560×1440, uncapped/vsync-disabled,
ten seconds per state after warm-up.

## Result

The final Summit, Big Air, and Whiteout samples report zero console errors and
stay below the 11.1 ms engineering target at p99. These are end-to-end
`requestAnimationFrame` presentation intervals, **not GPU completion times**.
Chrome exposed no usable whole-frame timestamp query, so this report makes no
GPU-ms claim and does not replace headed target-hardware certification.

| Course/state | Median | p95 | p99 | Max | Draws | Submitted triangles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Summit Free Ride Lab | 1.7 ms | 2.7 ms | 3.0 ms | 7.8 ms | 286 | 2,018,916 |
| Summit Burger Run | 2.1 ms | 2.5 ms | 3.1 ms | 9.2 ms | 382 | 2,055,443 |
| Big Air Free Ride Lab | 2.5 ms | 3.1 ms | 3.6 ms | 5.1 ms | 577 | 2,583,404 |
| Big Air Burger Run | 3.5 ms | 4.4 ms | 5.4 ms | 10.4 ms | 635 | 2,594,737 |
| Whiteout Free Ride Lab | 1.8 ms | 2.6 ms | 3.2 ms | 8.5 ms | 402 | 2,165,896 |
| Whiteout Burger Run | 2.7 ms | 3.5 ms | 4.3 ms | 10.3 ms | 522 | 2,184,571 |

The fixed-vantage game-layer mean deltas were +0.276 ms on Summit, +0.971 ms
on Big Air, and +0.889 ms on Whiteout. The tool parks Free Ride and Burger Run
at the same course coordinate in one browser session so each delta measures
the active game layer rather than two different terrain views. Active imported
game-layer payloads at that point were 2,417 source triangles / 44 meshes on
Summit and Big Air, and 3,117 / 54 on Whiteout; submitted-triangle counts above
include shadows, prepasses, post work, instancing, and venue/environment work.

## Reproduction

With the production preview running:

```bash
"/mnt/c/Program Files/nodejs/node.exe" \
  tools/snow-burgers/perf-game-layer-windows.cjs \
  --url http://127.0.0.1:5192 \
  --out reports/final-gauntlet/final-performance/summit.json \
  --seconds 10

"/mnt/c/Program Files/nodejs/node.exe" \
  tools/snow-burgers/perf-game-layer-windows.cjs \
  --url 'http://127.0.0.1:5192/?course=big-air-basin&mode=free-ride' \
  --out reports/final-gauntlet/final-performance/big-air.json \
  --seconds 10

"/mnt/c/Program Files/nodejs/node.exe" \
  tools/snow-burgers/perf-game-layer-windows.cjs \
  --url 'http://127.0.0.1:5192/?course=whiteout-ridge&mode=free-ride' \
  --out reports/final-gauntlet/final-performance/whiteout.json \
  --seconds 10
```

Raw reports are in `reports/final-gauntlet/final-performance/`. Exact Windows
11 / RTX 5070 Ti, physical display pacing, audio-device load, and human-play
profiling remain external device gates.
