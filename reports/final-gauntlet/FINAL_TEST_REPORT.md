# Final test report

Date: 2026-08-07
Branch: `feat/final-polish-gauntlet`
Baseline: `121ce4eedf968e381dd2647f6a2b0e923ac41b85`

## Deterministic source/package gates

| Gate | Result | Notes |
| --- | --- | --- |
| `npm ci` | pass | Lockfile install on Node 22.22.1 / npm 10.9.4; zero audit vulnerabilities |
| `npm test` | **182/182 pass** | No skipped, cancelled, or failed tests |
| `npm run build` | pass | Vite 8.1.5 production bundle |
| `npm run validate:registry` | pass | 6 courses, 12 events, 18 tapes |
| `npm run validate:docs` | pass | Required package files and exact registry-count markers |
| `npm run validate:release:report` | exit 0, `report-only-with-blockers` | Exactly one blocker: `assets.hero-provenance` |
| `npm run validate:release` | expected exit 1, `fail` | Exactly the same RockerKaki/remove.bg blocker; fail-closed by design |
| `git diff --check` | pass | No whitespace errors |

The strict failure is the intended release result until the owner confirms the
remove.bg account/plan or replaces that hero-processing step. It is not hidden
as a passing technical report.

## Browser and runtime gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Production boot smoke | pass; ready, zero console/page/request/HTTP failures | [`browser-smoke/report.json`](final-runtime/browser-smoke/report.json) |
| Twelve registered events | **12/12 completed**, full required orders, zero console/WebGPU errors | [`FINAL_RUNTIME_MATRIX.md`](final-runtime/FINAL_RUNTIME_MATRIX.md) |
| Ingredient routes | **600/600 seeds**, zero height mismatch, worst 0.6587 vs 0.84 physical ceiling | [`placement/`](final-runtime/placement/) |
| Camera/cinematics | **20/20 scenarios**, 2,235 frames, zero intersections/snaps/errors | [`FINAL_CAMERA_MATRIX.md`](final-camera/FINAL_CAMERA_MATRIX.md) |
| Responsive UI | required sizes and 125%-equivalent pass | [`release-ui-report.json`](../../screenshots/final-gauntlet/release-ui/release-ui-report.json) |
| Performance | Summit/Big Air/Whiteout Burger Run p99 3.1/5.4/4.3 ms presentation intervals | [`FINAL_PERFORMANCE_MATRIX.md`](FINAL_PERFORMANCE_MATRIX.md) |
| Showreel | 74.560 s, 1280×720 VP8, independent PASS, zero runtime errors | [`snow-burgers-showreel.json`](showreel/snow-burgers-showreel.json) |

The showreel is silent visual evidence and is not cited as an audio-mix test.
The timing values are uncapped `requestAnimationFrame` presentation intervals,
not GPU completion milliseconds.

## Asset gates

- The 13 active procedural Snow-Burgers GLBs pass Khronos validation with zero
  errors and match their reviewed source/runtime SHA-256 records.
- The fixed expected-runtime manifest verifies 31 direct/dynamically assembled
  runtime assets by path, bytes, hashes, source relationship, and rights
  profile.
- Production-preview and Windows Chrome evidence report zero failed requests;
  no runtime CDN, analytics, backend, or external transcoder was introduced.
- The strict rights gate remains red only for RockerKaki/remove.bg.

## Manual and independent review

Independent critics accepted workstreams A–H, the corrected showreel, and the
final integration/smoothing pass. The final critic found no material
cross-system inconsistency. Physical controller/phone ergonomics, human
ride-feel/listening/colour-vision/reduced-motion comfort, and exact target-GPU
certification remain external human/device gates.
