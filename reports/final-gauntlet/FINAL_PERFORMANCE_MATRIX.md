# Final performance matrix

Date: 2026-08-08
Branch: `feat/final-polish-gauntlet`
Build: clean-hero final production preview at `http://127.0.0.1:5193`
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
| Summit Free Ride Lab | 1.7 ms | 2.8 ms | 3.3 ms | 9.0 ms | 286 | 1,910,628 |
| Summit Burger Run | 2.6 ms | 3.6 ms | 4.4 ms | 9.9 ms | 382 | 1,947,155 |
| Big Air Free Ride Lab | 2.5 ms | 3.2 ms | 3.8 ms | 4.9 ms | 577 | 2,475,116 |
| Big Air Burger Run | 3.5 ms | 4.8 ms | 6.1 ms | 11.3 ms | 635 | 2,486,449 |
| Whiteout Free Ride Lab | 1.8 ms | 2.6 ms | 3.2 ms | 9.0 ms | 402 | 2,057,608 |
| Whiteout Burger Run | 2.7 ms | 3.6 ms | 4.7 ms | 10.4 ms | 522 | 2,076,283 |

The fixed-vantage game-layer mean deltas were +0.843 ms on Summit, +1.049 ms
on Big Air, and +0.883 ms on Whiteout. The tool parks Free Ride and Burger Run
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
  --url http://127.0.0.1:5193 \
  --out reports/final-gauntlet/final-performance/summit.json \
  --seconds 10

"/mnt/c/Program Files/nodejs/node.exe" \
  tools/snow-burgers/perf-game-layer-windows.cjs \
  --url 'http://127.0.0.1:5193/?course=big-air-basin&mode=free-ride' \
  --out reports/final-gauntlet/final-performance/big-air.json \
  --seconds 10

"/mnt/c/Program Files/nodejs/node.exe" \
  tools/snow-burgers/perf-game-layer-windows.cjs \
  --url 'http://127.0.0.1:5193/?course=whiteout-ridge&mode=free-ride' \
  --out reports/final-gauntlet/final-performance/whiteout.json \
  --seconds 10
```

Raw exact-build reports are in
`reports/final-gauntlet/final-performance/`. Exact Windows
11 / RTX 5070 Ti, physical display pacing, audio-device load, and human-play
profiling remain external device gates.
