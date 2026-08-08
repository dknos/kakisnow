# Snow-Burgers final gauntlet — playtest findings

Baseline: `121ce4eedf968e381dd2647f6a2b0e923ac41b85` (`origin/main`, verified
2026-08-07). Branch: `feat/final-polish-gauntlet`.

This is the live ranked list. A finding moves to **fixed** only after its
acceptance check has been exercised in the running build. Source inspection is
evidence of a missing system, but never evidence that a replacement feels good.

| Rank | Severity | Player problem | Current evidence | Proposed correction | Acceptance check | Disposition |
| ---: | :---: | --- | --- | --- | --- | :---: |
| 1 | P1 | The tour needs an unmistakable ending, credits, postgame state, and a distinct 100% acknowledgement. | Independent D2 review drove fresh, six-delivery, and complete registry fixtures in Windows Chrome/WebGPU. Tour Complete and 100% Served are distinct, persist their seen flags, change music state, expose credits, and return to continued play with zero console/WebGPU errors. | Keep the accepted registry-derived requirements and skippable finale; the final integration critic found no cross-system regression. | Complete intended final requirements on a migrated and fresh book; see finale once, credits, persistent badge, title return, and continued play. | FIXED · FINAL INTEGRATION PASS |
| 2 | P2 | The responsive product flow must remain legible and fully navigable from 720p/125%-equivalent through native ultrawide. | Independent C3 pixels show clean 1280×720 title/order/results, visible controller-focused Back after the 1024×576 Settings panel scrolls 60 px, and a bounded 1120 px 3440×1440 Big Air result with dominant event identity and horizontal flight metric. All 23 Settings actions are reachable; tests/build pass with zero fixture errors. | Keep the accepted nearest-scroll and bounded responsive system; the final responsive and integration passes cover the converged destinations/settings. | Every range remains reachable; pixel captures at 1280×720, 1920×1080, 2560×1440, 3440×1440, and 125% zoom have readable type, no overlap, and visible reachable actions. | FIXED · FINAL RESPONSIVE PASS |
| 3 | P1 | Obstacle-aware and predictive camera work must preserve the rider, landing context, and player look without clipping or reduced-motion drift. | Independent B4 critique passes 45 focused gates plus real classic 16:9/21:9 and rocket 16:9 WebGPU completions. The final 20-scenario/2,235-frame matrix adds all finishes, five rails, snowcat, avalanche, zoom, two aspects, and reduced motion with zero intersections/snaps/errors. | Keep the accepted dual collision worlds, fast-in/slow-out arm, bounded additive prediction, grounded cue, and restore behavior. | Scripted finish, rail, snowcat, avalanche, and Big Air captures at two aspects and zoom extremes show no intersection, violent pop, or lost landing. | P1 FIXED · FINAL CAMERA PASS |
| 4 | P1 | Big Air must retain and present one authoritative completed flight per vehicle without trusting malformed saves or incomplete attempts. | Fresh accepted flights report 2.53–2.54 s, 49.2–49.3 m, 18.5–18.7 m clearance and distinct vehicle state. Exact-event/completed-run PB trust, corrupt key/payload rejection, legacy compatibility, assembly integration, abandon gates, first-PB, repeat delta, and ordinary-event isolation all pass independent checks. The live HUD now uses a high-contrast two-line broadcast strip and retains an explicit `LAND <GRADE>` read after touchdown. | Keep controller-authoritative telemetry and key-authoritative defensive reads; final camera/showreel/integration evidence confirms the presentation contract. | Classic and rocket scripted runs both take off across the seed set, land controllably, and report internally consistent flight telemetry/PB state; the 720p showreel keeps seconds, distance, peak, and grade legible through runout. | P1 FIXED · FINAL INTEGRATION PASS |
| 5 | P1 | Players need a readable Burger Book for tour progress, records, missing medals, ghosts, tapes, authored tape content, and explicit 100% requirements. | Independent D2 review verifies registry-derived 6-course / 12-event / 18-tape totals, all course tabs, event records and starts, 18 authored tape entries, explicit remaining goals, defensive save import/export, and readable 1280×720/3440×1440 layouts. Cross-course Book → Timber Melt reaches the correct order card. | Keep the accepted Book and save-desk behavior; final accessibility and integration passes preserve glyphs, HUD settings, and focus paths. | Counts equal 6 courses / 12 events / 18 tapes from registries; a found tape unlocks viewable content; missing 100% goals are explicit. | FIXED · FINAL INTEGRATION PASS |
| 6 | P1 | Accessibility and control completion is incomplete: no HUD scale, contrast assists, hazard/ingredient route assists, input remapping/conflict handling, current-input glyphs, or UI-volume control. | Final independent G recheck passes 180/180 tests and build, real Windows Chrome/WebGPU keyboard/touch/settings/tutorial/caption/reduced-motion evidence, and corrected Xbox/generic-pad Book/reset/Credits routes with zero console/WebGPU errors. Physical controller, phone ergonomics, and human colour-vision review were unavailable. | Keep the accepted visual assists, HUD scale, action map/remap conflict protection, input-family prompts, captions, and UI bus volume; complete the device/human review on release hardware. | Muted, reduced-motion, enlarged-HUD, high-contrast, keyboard-only, controller-only, and representative touch paths finish and navigate without stranded actions; device/human limits are recorded honestly. | FIXED · DEVICE/HUMAN GATE |
| 7 | P1 | Central ingredient, burger, rocket-chair, dressing, and hero assets need trustworthy runtime provenance, reproducible source, contract compatibility, and focal visual quality. | F4 independently promoted all 13 deterministic originals after two byte-identical clean generations, 13/13 Khronos validation, 52 four-view renders, exact rocket anchors, and real Summit 16:9/21:9 plus rocket WebGPU runs. The clean RockerKaki replacement adds a Blender primitive source, local palette, exact source/rig hashes, 12,928 triangles, 8,962 exported rig vertices, nine deform bones, Blender turntable review, and full downhill WebGPU smoke with zero console/GPU errors at 60 FPS. | Keep the accepted generated-source/runtime manifests and guarded validator. Preserve the former Grok/remove.bg/Tencent chain as rejected, non-runtime audit history; the clean hero source has no background-removal or imported-input step. | Every active central and hero runtime model has source, terms record, hashes, modifications, date, use, contract validation, and runtime pixels; the historical audit stays byte-identical. | FIXED · CLEAN RUNTIME PROVENANCE |
| 8 | P1 | A validation or browser failure must be incapable of publishing Pages, and hosted software smoke must not masquerade as hardware certification. | Independent H2 recheck passed 4/4 release tests, normal production-preview boot with zero console/page/request/HTTP errors, and two fail-closed synthetic fatal-error runs. Known authored WebGPU-unavailable messages reach the product error state; unrelated device/buffer invariants exit 1. The combined report is always uploaded, candidate ledger hashes are cross-checked against bytes, branch pushes cannot deploy, and Pages revalidates the exact successful main SHA. | Keep the accepted fail-closed mechanism and pair hosted boot evidence with the existing discrete NVIDIA WebGPU release matrix. | Intentionally failing validation prevents deploy; hosted CI records source/browser evidence; accepted Windows release evidence covers all events/WebGPU without being mislabelled as hosted GPU certification. | P1 ACCEPTED · RELEASE GATE |
| 9 | P2 | Results need a strong event/reward hierarchy while preserving the fastest possible retry. | Independent C4 fixtures verify dominant registered-event identity, subordinate burger grade, an unmistakable first `NEW FLIGHT PB`, saved-PB plus signed delta on a slower repeat, no flight callout on Summit, and Retry retained as the first action. D2 fixtures then verify distinct medal, tape, course, tour, and 100% milestone callouts with skip-on-input and continued play. | Keep the accepted result hierarchy and registry-derived progression milestones; preserve Retry as the fastest action and avoid mandatory repeat ceremony. | Each event mode presents the correct event, stack grade, and targets; new-time, medal, tape, course, tour, and 100% states are unambiguous and persist. | FIXED · FINAL INTEGRATION PASS |
| 10 | P2 | Audio must carry the same product identity through every state without masking board, rocket, hazards, or accessibility-critical warnings. | Independent E3 review passes the original 16-node score across menu/order/countdown/run/speed/trick/avalanche/Big Air/finish/results/retry. A 1,120-update/transition stress adds zero nodes; 16,800 parameter writes are finite; filtered pulse/phrase spectra are state-distinct; buses, mute, duck, and focus pass. D2 verifies tour-complete and credits calls. G now supplies visible warning captions; physical Windows speaker/headphone listening remains. | Keep the accepted held graph, finale/credits bridge, and caption equivalents; perform speakers/headphones/low-volume/mix review without calling analyser values LUFS. | Repeated run/retry/pause/focus cycles remain node-stable; all five buses persist; muted play retains critical warnings; sources are legally clear. | CORE + FINALE FIXED · CAPTIONS/HARDWARE GATE |

## Baseline notes

- Clean `npm ci`, 90-test baseline suite, and production build pass at the
  verified baseline commit. D2's historical progression convergence passed
  157 tests; the latest converged package passes 183/183 tests and a production
  build after G accessibility/control completion and the route-safety contract.
  Independent dense/random
  phase testing accepted natural and authored takeoff, crash-input clearing,
  and live gamepad polling; the final integrated matrix remains separate.
- All twelve registered events reached results in fresh Windows Chrome/WebGPU
  runs: 12/12 completed, zero console errors, and zero WebGPU validation
  errors. Park Order correctly completed without a medal when the autopilot
  missed its trick target.
- The corrected playthrough harness prints the live placement count instead of
  a hard-coded `/4`; its exact-production rerun completes all twelve events,
  including two- and five-ingredient orders, with zero console/WebGPU errors.
- Fresh real-heightfield placement evidence passes all six courses at 100/100
  seeds each. Runtime selection is capped at 0.66, independent validation at
  0.70, and the physical carve ceiling remains 0.84. The tightest shipped route
  is Big Air at 0.6587, retaining 0.1813 physical margin; Summit improved from
  the borderline baseline to 0.5380.
- Final 2560×1440 Windows Chrome Burger Run p99 presentation intervals are
  4.4 ms Summit, 6.1 ms Big Air, and 4.7 ms Whiteout. Corresponding submitted
  draw/triangle counts are 382/1,947,155, 635/2,486,449, and 522/2,076,283.
  No GPU completion timer was available, so these are not labelled GPU ms.
- Existing untracked PNG captures predate this branch and are preserved as
  owner work. New evidence is written only below
  `screenshots/final-gauntlet/`.
- Performance evidence reports presentation intervals unless a genuine GPU
  completion timer is available; it is never relabelled as GPU milliseconds.
- Workstream A's first low-frame-rate correction was rejected because a frame
  could cross Big Air's far authored boundary without launching. The accepted
  segment test closes that defect across nine refresh rates and 90,000 random
  probes without widening the capture window.

## Current gauntlet closeout

Independent A–H slices are accepted. The current converged package passes
183/183 tests, the production build, all twelve production event completions,
and 600/600 real-heightfield placement seeds. The final 72.240-second showreel
passes independent frame-by-frame review; its live/runtime/save staging and
silent-video scope are disclosed in
`reports/final-gauntlet/showreel/snow-burgers-showreel.json`. Physical
controller/phone ergonomics, human colour-vision review, and human
speaker/headphone listening remain device gates. The former
Grok/remove.bg/Tencent hero chain is preserved as rejected non-runtime history;
the active clean procedural source passes strict provenance validation.
