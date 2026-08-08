# Snow-Burgers final polish report

<!-- snow-burgers-release-counts courses=6 events=12 tapes=18 -->

Status: reviewable release-candidate draft on
`feat/final-polish-gauntlet`. This is an honest handoff snapshot, not a
commercial-release declaration. The branch has not been merged or deployed.

## Product target

Snow-Burgers is a compact arcade snowboard game: RockerKaki collects up to five
burger ingredients downhill, performs tricks, survives course hazards and
serves the order at Burger Base Camp. The running product contains six
registered courses, twelve registered events and eighteen Recipe Tapes. Free
Ride Lab remains the renderer playground; the Burger Tour supplies the
structured progression.

Recommended repository description: **Snow-Burgers — a compact WebGPU arcade
snowboarding Burger Tour powered by KAKISNOW Snow Technology.**

## Implemented in this candidate

- Preserved the custom KAKISNOW WebGPU renderer, persistent deformation,
  data-driven course/event registries, classic board, rocket chair, tricks,
  rails, crashes, ghosts, hazards, Recipe Tapes and touch/gamepad paths.
- Hardened jump/takeoff input and crash-state input clearing. Standard
  gamepad polling now handles analog stick deadzones, trigger thrust, edge
  jump/recover, bumpers, trick modifier and disconnect release.
- Added obstacle-aware camera collision, predictive signature-flight framing,
  reduced-motion camera behavior and finish/Big Air presentation states.
- Delivered the title/order/HUD/results/pause/settings/Burger Book/credits/
  How-to-Ride/finale UI surfaces represented by the current source tree.
- Added controller-authoritative Big Air telemetry, per-vehicle personal-best
  comparison, and a 720p-readable two-line flight/landing-grade strip, plus an
  adaptive procedural audio score with separate music, effects, ambience, UI
  and master controls.
- Promoted thirteen local procedural Snow-Burgers GLB derivatives for
  ingredients, the served burger, rocket chair, camp and dressing. The
  machine-readable runtime manifest records each exact path, byte count,
  runtime/source SHA-256, generation record and conditional rights profile;
  the social preview has separate source/edited/runtime hashes and a
  generation-command record.
- Replaced the historical RockerKaki Grok/remove.bg/Tencent runtime chain with
  a clean local Blender primitive source and 64×64 palette. The active hero is
  one material, 12,928 triangles, 8,962 exported rig vertices, nine deform
  bones, and the `RockerBreath` action; source and rig hashes are recorded in
  `art/generated-assets/rockerkaki/GENERATION_RECORD.json`.
- Added release validation and CI gating for registry integrity, direct asset
  references, the fixed dynamic-runtime inventory, exact hashes, candidate
  ledger/provenance state, and documentation-count consistency. Strict and
  report-only JSON artifacts are separate.

## Measured

- Baseline source commit: `121ce4eedf968e381dd2647f6a2b0e923ac41b85`.
- Historical baseline `npm ci`, unit tests and production build passed. The
  converged package rerun passes `npm ci` with zero audit vulnerabilities,
  `npm test` **183/183**, and `npm run build`.
- The exact production bundle completed all twelve registered events in
  Windows Chrome/WebGPU at 2560×1440 with full required orders, zero console
  errors, and zero WebGPU validation errors. The two style/trick-specialist
  events completed without medals; the harness proves completion, not perfect
  automated play.
- Six fresh GPU-heightfield placement sweeps complete **600/600** seeds with
  zero surface error. Worst normalized lateral demand is 0.5380 Summit, 0.5162
  Pinecone, 0.5358 Glacier, 0.4503 Midnight, 0.5450 Whiteout, and 0.6587 Big
  Air. The independent validator rejects above 0.70 and the physical carve
  ceiling is 0.84, so even the tightest route retains 0.1813 player-error
  margin.
- Final 2560×1440 Burger Run presentation intervals remain below the 11.1 ms
  engineering target at p99: Summit 2.6/3.6/4.4 ms median/p95/p99, Big Air
  3.5/4.8/6.1 ms, and Whiteout 2.7/3.6/4.7 ms. Submitted counts are 382/
  1,947,155, 635/2,486,449, and 522/2,076,283 draws/triangles respectively.
  GPU timestamp data was unavailable, so no GPU-ms claim is made.
- Signature-flight evidence covered classic 16:9/21:9 and rocket 16:9 paths,
  with approximately 2.53–2.54 s airtime, 49.2–49.3 m distance and
  18.5–18.7 m height in the accepted capture set.
- The final camera matrix sampled 2,235 frames across 20 exact-production
  scenarios: all six finishes, five rail areas, snowcat, avalanche, Big Air,
  reduced motion, 16:9/21:9, and near/far zoom. It reports zero below-terrain,
  non-finite, solid-intersection, violent-snap, oscillation, console, WebGPU,
  or failed-request findings.
- Current bounded validation rerun: `npm test` 183/183 passed and `npm run
  build` passed. `validate:registry`, `validate:docs`, report-only release
  validation, and strict asset validation pass; the active hero record is
  `clean-local-procedural-source` and no runtime asset provenance failure
  remains.

## Manually inspected

- Title, order, results, pause/settings, responsive 720p/ultrawide surfaces,
  Big Air states and Windows WebGPU completion captures were inspected during
  the independent UI and camera passes.
- Audio state transitions, finite parameter writes, mute/duck/focus handling
  and stress node counts were inspected by the audio critic. Physical
  speaker/headphone listening remains open.
- Candidate generated asset turntables and isolated runtime-style captures were
  inspected by the asset critic; thirteen local procedural derivatives were
  promoted with the recorded hashes. F4's real WebGPU Summit/rocket smoke and
  the corrected camp runtime paths pass.
- RockerKaki's Blender source/rig structure and turntable, real Windows
  Chrome/WebGPU face readability, and full downhill traversal were inspected;
  the traversal reported 60 FPS with zero console or GPU validation errors.
- Natural takeoff phase sweeps and real `navigator.getGamepads()` polling were
  inspected by the gameplay critic. Physical controller feel remains open.
- A final independent integration/smoothing critic reviewed the live title and
  Summit title/order/drop-in/HUD/pause/settings path together with the final
  event, route, responsive, camera, performance, and full-journey showreel
  package. It found no material incoherence, clutter, pacing defect, or
  cross-system regression requiring revision.

## Generated and imported

- Generated original replacement GLBs come from the repository's Blender
  primitive generator and retain source files, manifests and hashes under
  `art/generated-assets/snow-burgers/`. The thirteen runtime derivatives are
  promoted, but their conditional terms do not assert copyrightability,
  exclusivity or blanket commercial clearance.
- The former thirteen supplied Snow-Burgers/camp GLBs are retained only as
  immutable historical audit inputs and were rejected from the active runtime
  because their source/licence metadata could not be established. They were
  not silently relicensed or overwritten.
- The social preview is a generated/edited 2D derivative with its source and
  provenance record. It contains no real commercial brand.
- Existing Big Air venue derivatives remain subject to their CC BY 4.0 notices;
  all other runtime/imported provenance is represented in the asset ledger and
  notices.
- The former Grok/remove.bg/Tencent hero files remain documented as rejected,
  non-runtime audit history. The active hero has no imported geometry, texture,
  network input, or background-removal step.

## Open gates and unresolved issues

- Independent D2 progression/endgame, F4/F5 asset, G accessibility/control, H
  release-gating, and showreel critiques are accepted. The final camera and
  cross-system integration findings are recorded in the linked gauntlet
  evidence; no physical-device or human listening/colour-vision approval is
  inferred from automated evidence.
- The package and player-facing title/credits surfaces both display `v1.0.0`.
- The clean local RockerKaki source supersedes the historical remove.bg chain;
  the former chain remains rejected and non-runtime. It is not an active
  release blocker.
- Exact target-GPU certification is unavailable in this environment. Recorded
  rAF presentation intervals are not GPU completion times.
- Physical controller and touch-device QA plus human audio and colour-vision
  review remain external release gates. The final 72.240-second 1280×720 VP8
  showreel passes independent frame-by-frame critique with no loading flash,
  stale save state, console error, failed request, WebGPU validation error, or
  device loss. It is intentionally a silent visual evidence reel; it does not
  substitute for the open hardware listening gate.

## Deliberately rejected

- No new course, biome, backend, multiplayer, live service, shop, currency or
  second renderer was added.
- No undocumented external asset, runtime CDN, commercial recording or
  artist/character imitation was introduced.
- No decorative feature is being used to hide unresolved rights, input,
  progression, integration or performance evidence.

## Release recommendation

**READY WITH DOCUMENTED LIMITATIONS.** The automated, browser, camera,
performance, placement, responsive-UI, showreel, asset, and independent-critic
evidence is packaged, and strict runtime provenance validation passes. Physical
controller/phone ergonomics, human audio listening, human colour-vision review,
and exact target-GPU certification remain explicit owner/device sign-offs. This
branch is reviewable and has not been merged or deployed.
