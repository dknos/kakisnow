# Final runtime matrix

Date: 2026-08-07
Branch: `feat/final-polish-gauntlet`
Build source: current working tree after the release-route safety correction,
course definition version 2, and `npm run build`.
Preview: Vite production preview at `http://127.0.0.1:5192`
Placement server: Vite development server at `http://127.0.0.1:5191` (the
placement harness requires source-module imports and explicitly rejects a
production bundle).
Windows runtime: Windows Node at `C:\Program Files\nodejs\node.exe`,
installed Windows Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`,
hardware WebGPU path, 2560x1440, seed 1 for event runs.
WSL runner: Ubuntu 22.04, Node `v22.22.1`, Vite `8.1.5`.

## Commands and exit codes

| Check | Command | Exit | Evidence |
| --- | --- | ---: | --- |
| Production build | `npm run build` | 0 | command output; `dist/` |
| Production boot smoke | `npm run smoke:browser -- --url http://127.0.0.1:5192 --out reports/final-gauntlet/final-runtime/browser-smoke` | 0 | [`browser-smoke/report.json`](browser-smoke/report.json) |
| Summit placement | `node.exe tools/snow-burgers/validate-placement-windows.cjs --url http://127.0.0.1:5191 --course summit-line --seeds 100 --out reports/final-gauntlet/final-runtime/placement/summit.json` | 0 | [`placement/summit.json`](placement/summit.json) |
| Pinecone placement | same harness, `--course pinecone-pass` | 0 | [`placement/pinecone.json`](placement/pinecone.json) |
| Glacier placement | same harness, `--course glacier-gorge` | 0 | [`placement/glacier.json`](placement/glacier.json) |
| Midnight placement | same harness, `--course midnight-resort` | 0 | [`placement/midnight.json`](placement/midnight.json) |
| Whiteout placement | same harness, `--course whiteout-ridge --required cheese,onion,patty,tomato,lettuce` | 0 | [`placement/whiteout.json`](placement/whiteout.json) |
| Big Air placement | same harness, `--course big-air-basin --required cheese,onion,patty,tomato,lettuce` | 0 | [`placement/big-air.json`](placement/big-air.json) |
| Twelve event runs | `node.exe tools/snow-burgers/playthrough-windows.cjs --url "http://127.0.0.1:5192/?course=<course>&event=<event>&autopause=off" --out reports/final-gauntlet/final-runtime/events/<event> --seeds 1 --limit 180 --vehicle <registered vehicle> --width 2560 --height 1440` | 0 for all 12 | per-event reports and captures below |

The placement sweep intentionally uses the development server because its
independent validator imports the source placement module after the real GPU
heightfield bake. Event completion uses the production bundle. All six route
sweeps and all twelve production event runs passed on the exact final tree.
The route correction was present in the working tree before these captures and
was recorded afterward as commit `84229db`: every placement JSON contains the
new `0.70` validator ceiling, `0.84` physical ceiling and `0.04` required
selection reserve emitted only by that corrected harness. The event reports'
seed-one pickup coordinates also match the corrected placement output. The
later commit timestamp is therefore not the capture's source timestamp.

## Registered event completion

Every registered event started from its course/event query, reached the
`results` state, completed its order, and reported zero console errors, failed
requests, page errors, and WebGPU validation errors. The `flightHud` column is
the run report's observation of the live Big Air flight HUD, not a claim that
every event contains a signature jump.

| Course | Event | Vehicle | Ingredients | Time | Medal | Flight HUD | Evidence |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| Summit Line | The Summit Stack (`summit-stack`) | classic | 4/4 | 31.48 s | Gold | no | [`event report`](events/summit-stack/playthrough-report.json) |
| Summit Line | Summit Gold (`summit-gold`) | classic | 2/2 | 31.04 s | Gold | no | [`event report`](events/summit-gold/playthrough-report.json) |
| Summit Line | Rocket Reheat (`rocket-reheat`) | rocket chair | 4/4 | 28.00 s | Gold | no | [`event report`](events/rocket-reheat/playthrough-report.json) |
| Pinecone Pass | The Timber Melt (`timber-melt`) | classic | 4/4 | 36.25 s | Gold | no | [`event report`](events/timber-melt/playthrough-report.json) |
| Pinecone Pass | Branch Manager (`branch-manager`) | classic | 4/4 | 36.25 s | none | no | [`event report`](events/branch-manager/playthrough-report.json) |
| Glacier Gorge | The Blue Plate (`blue-plate`) | classic | 4/4 | 39.14 s | Gold | no | [`event report`](events/blue-plate/playthrough-report.json) |
| Glacier Gorge | Handle With Care (`handle-with-care`) | classic | 4/4 | 39.14 s | Gold | no | [`event report`](events/handle-with-care/playthrough-report.json) |
| Midnight Resort | The Night Shift (`night-shift`) | classic | 4/4 | 34.69 s | Gold | no | [`event report`](events/night-shift/playthrough-report.json) |
| Midnight Resort | Park Order (`park-order`) | classic | 4/4 | 34.69 s | none | no | [`event report`](events/park-order/playthrough-report.json) |
| Whiteout Ridge | The Avalanche Special (`avalanche-special`) | classic | 5/5 | 45.64 s | Gold | no | [`event report`](events/avalanche-special/playthrough-report.json) |
| Whiteout Ridge | Five Alarm (`five-alarm`) | rocket chair | 5/5 | 43.12 s | Gold | no | [`event report`](events/five-alarm/playthrough-report.json) |
| Big Air Basin | The Big Air Stack (`big-air-basin-stack`) | classic | 4/4 | 45.42 s | Gold | no | [`event report`](events/big-air-basin-stack/playthrough-report.json) |

Raw event screenshots are retained in the local gauntlet workspace beside each
matching `events/<event-id>/` report, including title, pickups, assembly,
results, and live airborne context where observed. They are intentionally not
all part of the review branch: the curated, compressed representative pixels
ship under `screenshots/final-gauntlet/release-evidence/` so hundreds of
megabytes of redundant PNGs do not bloat the repository. The two no-medal rows
are completed runs whose registered
event-specific target was not met by the autopilot; this is completion
evidence, not a claim of universal medal success.

## 100-seed placement results

All sweeps used fresh browser GPU heightfield readback (`2048²`, `1.00 m`
texels), completed 100/100 seeds, measured zero height mismatch, and reported
zero console/GPU errors. Runtime route selection is capped at `0.66`, this
independent validator rejects anything above `0.70`, and the measured physical
carve ceiling remains `0.84`. The margin column is therefore the player-error
reserve `0.84 - tightest lateral`, not merely validation slack.

| Course | Routed ingredients | Seeds | Tightest lateral | Margin | Max attempts | Max height error | Evidence |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Summit Line | 4 | 100/100 | 0.5380 | 0.3020 | 2 | 0 m | [`summit.json`](placement/summit.json) |
| Pinecone Pass | 4 | 100/100 | 0.5162 | 0.3238 | 1 | 0 m | [`pinecone.json`](placement/pinecone.json) |
| Glacier Gorge | 4 | 100/100 | 0.5358 | 0.3042 | 1 | 0 m | [`glacier.json`](placement/glacier.json) |
| Midnight Resort | 4 | 100/100 | 0.4503 | 0.3897 | 1 | 0 m | [`midnight.json`](placement/midnight.json) |
| Whiteout Ridge | 5 | 100/100 | 0.5450 | 0.2950 | 2 | 0 m | [`whiteout.json`](placement/whiteout.json) |
| Big Air Basin | 5 | 100/100 | 0.6587 | 0.1813 | 6 | 0 m | [`big-air.json`](placement/big-air.json) |

## Scope and limits

- The event matrix is real Playwright control of the shipped WebGPU runtime;
  the autopilot steers through the existing rig boundary and does not write
  velocities, positions, or run completion state.
- The portable boot smoke uses WSL Chromium/software-capable WebGPU and is
  explicitly only a boot/presentation check. The event and placement matrices
  use installed Windows Chrome with hardware WebGPU.
- No GPU milliseconds are reported. This run did not have a GPU timestamp
  query; presentation timing and GPU timing are separate measurements.
- Physical gamepad, phone/touch hardware, color-vision, and human-feel gates
  require device or human review and are not silently inferred from this
  matrix.
