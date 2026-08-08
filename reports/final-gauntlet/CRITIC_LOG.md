# Independent critic log

This log records the largest player-facing defect from each build → run →
capture → critique loop. Builders do not approve their own work.

## A1 — gameplay launch and rocket landing contract

Intent: make Big Air's authored headline jump reliable without altering the
ordinary mountain, and make a clean rocket-chair landing refill exactly once.

Independent runtime evidence:

- Windows Chrome/WebGPU, zero runtime console errors.
- Classic Big Air seeds 1–3 launched at z 298.25–300.20 and x −8.55 to +13.92,
  remained airborne through approximately z 339, and reached assembly.
- Observed flight time was approximately 2.03–2.07 seconds.
- A rocket-chair run launched, remained airborne beyond z 346.51, and reached
  assembly.
- Exact x 0/−18/+18 authored-capture tests pass.
- Short, unclean, and hard landing checks do not refill; a clean landing
  consumes the refill latch once.
- 97/97 tests and production build passed during the critic run.

Largest remaining defect: the launch itself has no remaining P0/P1 issue in
this slice, but landing grade and signature-flight metrics are not retained as
a persistent browser-observable event. A 100 ms probe can miss the one-frame
landing signal. This is a P2 evidence gap and a P1 presentation dependency.

Disposition: targeted P1 accepted and committed as `671dc56`. Persistent Big
Air telemetry remains open.

## A4 — frame-phase takeoff and analogue input parity

Intent: make natural and authored takeoffs reliable across render phases while
preserving coyote/buffer behavior, avoiding false launches, and carrying the
same riding intent through keyboard, standard gamepad, and touch inputs.

The first independent pass rejected the builder candidate: an old-to-new frame
segment that crossed Big Air's far `z = 304` boundary could miss the authored
launch at every tested refresh rate. The correction tests the actual XZ segment
against the authored lane rectangle without widening it or allocating hot-path
objects.

Independent re-test evidence:

- 154/154 tests and the production build pass.
- The former `z = 303.9` far-edge miss now launches at
  24/30/45/59/60/61/90/120/144 Hz.
- Dense full-window and natural-kicker phase sweeps pass at all nine rates;
  10,000 randomized segment probes per rate produced zero rectangle-contract
  mismatches.
- Lane-entry segments launch once; non-intersecting lane/far segments, flat
  snow, sustained steep descent, abrupt descent, and carried negative vertical
  velocity do not invent launches.
- Buffered jump, coyote, late-crash clearing, recovery, radial deadzones,
  analogue steering/look/throttle, button edges, and disconnect release pass.
- Source inspection found no new per-frame JavaScript allocations in the
  segment test, conditional terrain sweep, or pad poll path.

Disposition: PASS. No A4 P0/P1 remains. Physical-controller button feel and
close visual rail-attitude review remain honest integration/hardware gates.

## C1 — responsive title, order, HUD, results and settings

Intent: replace the flat renderer-demo navigation with a responsive cold
alpine / warm diner product flow, while preserving keyboard and gamepad menu
semantics.

Independent runtime evidence:

- Real 1280×720 and 3440×1440 title → order → run → pause captures.
- Real 2560×1440 completed-run results capture.
- Summit Stack reached results with 4/4 ingredients, zero console errors, and
  zero WebGPU errors.
- 97/97 tests and production build passed during the first critic run.

Largest defect: controller navigation selected only buttons and could not focus
or adjust the range inputs controlling volume, sensitivity, or camera shake.
This was P1 because a gamepad-only player could enter Settings but could not
operate it.

Builder correction under re-critique:

- enabled range inputs join DOM focus order;
- d-pad/keyboard left and right adjust by the declared step and dispatch the
  normal input/change path;
- simulated controller evidence changed master volume from 100% to 99% and
  persisted `masterVolume: 0.99` in `snow-burgers.settings`.

Secondary findings deliberately remain open until the P1 recheck completes:
the boot/free-ride hint leaks under title/order, ultrawide secondary labels are
too small, and “One mountain. Twelve orders.” contradicts the visible six-
mountain tour.

Focused C1 recheck: PASS. A simulated standard gamepad traversed a 23-item
focus order and reached all six visible ranges; d-pad adjustment persisted,
confirm retained focus harmlessly, east returned to title, and reopening
Settings retained the value. No console error or keyboard regression was found.

## B1 — obstacle arm, focal colliders and assembly framing

Intent: stop camera intersection without changing player collision, keep the
eye above terrain, improve the burger reveal, and honor reduced motion.

Independent evidence:

- 99/99 tests and production build passed.
- Real Windows Chrome/WebGPU Big Air showcase at 1920×1080 emitted zero
  console errors.
- A direct finish-arch probe settled the arm near 4.08 m and relaxed back to
  6.20 m after clearing; the camera-only and gameplay worlds remained separate.
- Finish pixels show rider and completed burger together with no visible
  arch, grill, or lodge intersection.
- Source inspection confirms terrain clearance after the solid sweep, saved
  assembly yaw/pitch/distance, and reduced-motion suppression of shake,
  presentation pitch, burger rotation, and speed streaks.

Largest defect: Big Air still fails its broader camera acceptance. The lip
frame faces a snow ridge and hides the landing; there is no predictive active-
control landing look-ahead or persistent signature-flight presentation. This
is missing scope around the structurally sound obstruction slice, not an
obstruction regression.

Other open evidence: fresh 21:9, snowcat/rail, reduced-motion, and complete
post-assembly restore captures were not certified because repeated Windows
Chrome probes timed out and were terminated. Current scalar tests also do not
cover full `CameraRig.update`, world separation, terrain-floor behavior, or
assembly restoration.

## F1 — original model replacement candidate

Intent: replace thirteen provenance-unresolved runtime GLBs through a clean,
reversible local pipeline without lowering the premium arcade art bar.

Independent evidence:

- All thirteen candidate GLBs passed Khronos validation with zero errors.
- Four-view QA pixels were inspected asset by asset.
- The generator was rerun from identical inputs and hashes were compared.
- Rocket-chair geometry was compared with the runtime vehicle anchor profile.
- Ledger, optimization report, notices, generator defaults, and generation
  claims were audited against what was actually done.

Largest defect: multiple focal replacements read as primitive placeholders.
Cheese, patty, pine, camp hut, and camp village were rejected; tomato, lettuce,
burger, rocket chair, firs, bush, and rock require revision. Onion may proceed
only after runtime import/scale proof.

The set also fails delivery safety: five outputs changed hashes on rerun, the
rocket seat anchor disagrees with the runtime profile, the generator defaults
to the active runtime directory, report hashes are stale, and
“project-owner-authored” overstates the documented AI-assisted process.

Disposition: rejected. Runtime assets remain untouched and unresolved; no
candidate may be promoted until reproducibility, contract, provenance, and
fresh visual critique all pass.

## C2 — responsive and legacy-hint follow-up

Intent: preserve the accepted controller Settings path while fixing the stale
tour claim, native-ultrawide scale, and boot-timer hint leak.

Independent evidence:

- 100/100 tests and production build passed.
- Fresh Windows Chrome/WebGPU 1280×720, 3440×1440, and
  1024×576/125%-equivalent flows produced no console or GPU errors.
- The title displays registry-derived six-mountain/twelve-order scope.
- Title, order, pause, and settings suppress the legacy hint; active Free Ride
  shows it.
- Simulated controller navigation reaches all six ranges and Back.

Largest defect: at the closest 125%-zoom layout, Back is below the visible
settings panel while `_focusMenuItem()` uses `preventScroll`. Controller focus
can therefore move to an off-screen action without revealing it.

Disposition: P1 accepted. One P2 focus-scroll fix remains; native ultrawide is
clean but intentionally conservative in scale.

## H1 — validation-before-deploy

Intent: make a failing source, registry, asset-rights, documentation, or build
gate incapable of publishing GitHub Pages.

Independent evidence:

- 107/107 tests and production build passed against the concurrent candidate.
- Registry validation derived six courses, twelve events, and eighteen tapes.
- Strict validation exited nonzero for thirteen unresolved runtime models,
  RockerKaki's remove.bg chain, and stale README totals.
- Branch workflow runs use read-only repository permissions and cannot deploy.
- Pages deployment listens only to a successful main validation, checks out
  `workflow_run.head_sha`, and re-runs strict validation/build before upload.

Largest defect: hosted CI has no Playwright production boot smoke, and the
existing Windows/WebGPU suite is not represented as an automated or explicit
manual release job. Reports are not uploaded, and candidate `ok` flags are
trusted without cross-checking stale ledger hashes.

Disposition: deploy safety structure accepted; browser/evidence integrity
follow-up required. The release remains NOT READY while strict rights checks
correctly fail.

## H2 — hosted boot evidence and fail-closed release reporting

Intent: close H1 without pretending a software renderer certifies the target
discrete GPU.

Independent evidence:

- Focused release-validation suite passed 4/4; production build passed.
- A normal production preview reached the authored ready state with zero
  console, page, request, and HTTP errors.
- The classifier accepts only the authored WebGPU-unavailable/device-init/no-
  adapter phrases. Synthetic `fatal device invariant` and `GPU buffer bounds
  invariant failed` runs both exited 1 and remained ordinary errors.
- The combined validation report runs even after an earlier failure, preserves
  an artifact, and exits nonzero for current candidate-ledger and documentation
  defects. A failed browser job also prevents the successful workflow result
  required by Pages.
- Candidate ledger hashes are checked against the files' actual bytes. Pages
  still checks out and revalidates the exact successful main SHA.

Largest remaining limitation: hosted Playwright/software evidence proves boot
and error presentation only. It cannot certify discrete WebGPU gameplay,
event completion, or the 11.1 ms frame contract; the Windows NVIDIA matrix
remains an explicit manual release gate.

Disposition: H CI/deploy P0/P1 PASS. The overall release remains blocked by
the legitimate asset-rights/hash/documentation failures, not by a workflow
mechanism defect.

## C3 — close-zoom focus and Big Air result hierarchy

Intent: close the two C2 presentation defects without moving ordinary layouts.

Independent evidence:

- Fresh 1280×720 title, order, and result frames are readable and stable.
- At 1024×576, keyboard/pad focus traverses all Settings controls and scrolls
  the focused Back action into view; the measured screen scroll is 60 px.
- A live 3440×1440 result fixture uses a bounded 1120 px card, leads with The
  Big Air Stack, subordinates the Summit Stack burger grade, and keeps the full
  flight metric horizontal without overflow.
- 117 tests and production build passed; fixture console, page, and WebGPU
  error lists were empty.

Largest remaining limitation: the bounded Windows autopilot did not complete a
fresh native-ultrawide run before its capture window ended. Existing Big Air
gameplay pixels and the current live result fixture cover UI presentation, but
that exact end-to-end frame remains an integration capture gate.

Disposition: C3 PASS. No C3 P0/P1 remains; Burger Book and Credits are still
absent title destinations and belong to Workstream D.

## C4 — Big Air personal-best result states

Intent: make the signature flight record immediately understandable without
polluting ordinary event results or demoting Retry.

Independent evidence:

- Focused pause/save coverage passed 35/35 with no console or page errors.
- A fresh 1280×720 first record leads with `NEW FLIGHT PB`, distance, and the
  vehicle that set it; a slower repeat shows the saved record plus the current
  attempt's signed delta.
- An ordinary Summit result contains no Big Air callout, and the registered
  event remains the dominant identity above the burger-stack grade.
- Retry remains the first action. A 640×360 stress fixture remains operable
  after Escape without clipping or a crash.

Largest remaining limitation: 640×360 is below the shipping target and the
results card scrolls there, leaving Retry below the initial viewport. The
required 1280×720 presentation fits fully.

Disposition: C4 PASS. No P0/P1 remains in the Big Air PB presentation slice.

## B4 — predictive Big Air landing read and trusted flight records

Intent: make the signature jump readable during active control, retain one
controller-authoritative flight per vehicle, and prevent malformed save data
or incomplete attempts from manufacturing a record.

Independent evidence:

- Camera, Big Air, save, and UI gates pass 45/45; production build passes.
- Fresh classic 16:9, classic 21:9, and rocket 16:9 WebGPU runs all completed
  with the rider, landing gate/stripes, venue, and accumulating telemetry in
  frame. All three reports contain zero console or WebGPU validation errors.
- Classic flights measured 2.53 s / 49.2–49.3 m / 18.5–18.7 m clearance;
  rocket measured 2.54 s / 49.3 m / 18.7 m with 48 rocket efficiency.
- The landing cue's center/end terrain differs by 0.049 m and the transverse
  beam is grounded within its 0.22 m radius; pixels show no floating or clip.
- Active player look remains live while additive yaw/pitch stay below their
  0.46/0.36 caps. Reduced motion produces exact zero additive offsets, and
  ordinary Summit play clears the context.
- The save map key is authoritative, a mismatched embedded vehicle is dropped,
  legacy records without an embedded vehicle remain readable, and only a
  completed exact Big Air event can award a per-vehicle PB.

Largest remaining limitations: native-ultrawide telemetry is conservative in
scale; repeat-PB UI is fixture/test-proven rather than a two-run WebGPU reload;
and a full motion time-series obstruction matrix remains an integration gate.

Disposition: B4 PASS. No P0/P1 remains in this camera/Big Air slice.

## E3 — adaptive procedural score core and existing runtime states

Intent: complete one original Snow-Burgers musical language whose intensity
tracks play without loading samples, leaking nodes, masking critical feedback,
or leaving state transitions as an unwired API.

Independent evidence:

- Audio coverage passes 7/7; the full candidate suite passed 143/143 and the
  production build completed with only the existing bundle-size warning.
- A real preview/browser probe traversed menu, order, countdown, run, speed,
  trick, avalanche, Big Air, finish, results, and retry with no page/console
  errors. The held graph remained exactly 16 nodes.
- 1,000 updates plus 120 mixed transitions generated no new nodes; all 16,800
  inspected AudioParam writes were finite.
- The formerly dominant 344 Hz square drone has been replaced by a filtered,
  rhythmically gated triangle pulse. Analyser evidence exposes the advancing
  eight-step phrase, restrained run/speed states, lifted trick and Big Air
  voices, and a quieter/lower avalanche state.
- Mute, four category buses, master duck, focus/visibility suspension, retry,
  finite scrape/rocket/hazard inputs, and ordinary-state resets pass.

Largest remaining limitations: Workstream D must call the already-available
tour-complete and credits states. Windows speakers/headphones still require a
human loudness, masking, latency, and low-volume pass; analyser evidence is not
subjective approval.

Disposition: E3 PASS for the audio core and existing integrated states.

## F2 — deterministic replacement candidate recheck

Intent: establish whether the corrected set is safe, reproducible, visually
credible, and contract-compatible enough to earn runtime testing.

Independent evidence:

- Two fresh Blender 5.1.1 factory runs generated all thirteen files with
  byte-identical hashes; runtime GLB hashes and mtimes did not change.
- Candidate output is the default and direct runtime output refuses to run
  without an explicit override. All thirteen GLBs pass Khronos validation with
  no external resources, textures, animation, or skin payload.
- Candidate process wording is factual and makes no ownership or commercial-
  license conclusion.
- Onion, completed burger, firs, pine, bush, and rock pass visual review subject
  to candidate-only WebGPU placement/camera/performance smoke.
- Cheese, patty, tomato, lettuce, rocket chair, camp hut, and camp village need
  revision. The rocket cargo tray is 0.30 m away from its runtime anchor; the
  validator missed that contract. Hut/village retain a focal placeholder read,
  and actual primitive/draw counts disagree with the optimization table.
- The generated social preview fits the product and reproduces exactly, but a
  stray orange speck above the tomato required a narrow image-generation edit;
  both source generations and the optimized derivative remain documented.

Largest remaining F2 player-facing defect: the rocket cargo-anchor mismatch.
Largest release blocker: all thirteen unresolved supplied GLBs remain active;
RockerKaki's remove.bg plan is separately unresolved.

Disposition: F2 P1 NOT ACCEPTED. Determinism and delivery safety pass; F3 owns
the concrete contract, focal quality, and report corrections before any
runtime promotion decision.

## F4/F5 — replacement promotion and immutable-audit recheck

Intent: accept the replacement set only after its corrected visual forms,
runtime contracts, deterministic source chain, real renderer integration, and
validation-report safety are independently exercised.

Independent evidence:

- Two clean Blender 5.1.1 runs produced the same thirteen hashes; every GLB
  passed Khronos validation and the runtime files match the reviewed manifest.
- All thirteen assets passed four-view critique. Corrected ingredients, burger,
  rocket-chair anchors, huts/village, foliage, and rocks read coherently under
  the KAKISNOW material, fog, snow-contact, and camera path.
- Real Windows Chrome/WebGPU Summit runs at 1280×720 and 3440×1440 collected
  all four ingredients and served a gold burger; the rocket smoke reached the
  finish with finite state and zero console/WebGPU errors.
- The default seven-focal validator now writes
  `reports/snow-burgers/runtime-assets-validation.json`. It refuses the
  immutable historical source-audit path without explicit archival opt-in.
- The historical `VALIDATION.json` SHA-256 remained
  `38b502c83cb402617f0afb41b5411f1518d6d65e79166b720f1b7afb47b3bd84`
  before and after the critic run. Sixteen focused checks, 178 full tests, and
  the production build passed.

Largest remaining release-facing defect: RockerKaki's separate remove.bg
account/plan provenance is unresolved. It is not attributed to the now-clean
thirteen-model Snow-Burgers replacement set.

Disposition: F4/F5 PASS for central runtime assets and validation safety.
Commercial publication remains blocked on the hero processing-chain decision.

## D2 — progression, Burger Book, and endgame recheck

Intent: prove that registry-derived progression forms a complete player journey,
including the formerly broken cross-course Book start and destructive save
actions that never depend on a native browser confirmation.

Independent evidence:

- Fresh, six-main-delivery, and full-book fixtures were exercised in Windows
  Chrome/WebGPU. Tour Complete, distinct 100% Served, credits music, seen-state
  persistence, title return, and continued play all passed.
- The Burger Book reports 6 courses, 12 events, and 18 Recipe Tapes from the
  registries at 1280×720 and 3440×1440.
- Burger Book → Pinecone Pass → Timber Melt now reloads directly into the
  Timber Melt order card with `mode=burger-run`; the same-course mode-less link
  also reaches its order card.
- Simulated controller navigation cancelled and confirmed the game-owned clear
  ghosts/reset panels. Cancel preserved the save; clear removed only ghosts;
  reset removed progress. A throwing `window.confirm` sentinel was never called.
- The full suite passed 157/157 and the production build passed. Browser review
  recorded zero console, request, or WebGPU errors.

Largest remaining defect: a short loading-wordmark fade can overlap the first
order card. The bounded 1180 px ultrawide Book is intentionally restrained but
leaves generous side space.

Disposition: D2 PASS. No progression/endgame P0/P1 remains.

## G2 — accessibility and controller-route recheck

Intent: re-grade the revised accessibility/control slice after the initial
critic found controller-back and ordinary-touch prompt-family defects.

Independent evidence:

- The full suite passed 180/180 and the production build passed.
- Windows Chrome/WebGPU loading, tutorial, remap/conflict, HUD scale, contrast,
  captions, ghost visibility, touch prompt, and source-release checks passed
  with zero console or WebGPU errors.
- Deterministic Xbox and generic mapped-pad routes proved distinct glyphs,
  Book/Credits return, focus scrolling through the tall settings docket, and
  game-owned reset confirmation cancellation without state mutation.
- Defensive pointer capture removed the prior synthetic-harness error.

Physical controller/phone and human color/listening review remain honest
device gates rather than inferred browser approvals.

Disposition: G2 PASS. No reproducible accessibility/control P0/P1 remains.

## Final route-safety matrix — real heightfield recheck

Intent: replace merely physical ingredient reachability with a deliberate
player-error reserve, then prove every shipped course still forms a valid
deterministic order on the surface that actually renders.

Evidence:

- Runtime route selection is capped at 0.66, an independent harness rejects
  above 0.70, and the measured physical carve ceiling remains 0.84.
- Fresh Windows Chrome/WebGPU 2048² heightfield readbacks pass 100/100 seeds on
  each of six courses: 600/600 total, zero height mismatch, zero console or
  WebGPU validation errors.
- Worst normalized demand is 0.6587 on Big Air Basin, leaving 0.1813 physical
  reserve. Summit's prior 0.8225 borderline line is now 0.5380.
- All course identities advance to version 2, preventing stale version-1
  ghosts from pretending to match changed pickup lines while preserving the
  surrounding save and records.

Disposition: PASS. No shipped route remains close to the 0.84 ceiling.

## Final showreel — builder/critic correction loop

Intent: deliver one concise visual proof of the product journey without hiding
loading, stale progress, or staged state.

The first 74.560-second cut was rejected because a 0.3-second title handoff
briefly showed stale `3/6 MOUNTAINS OPEN` progress before the completed Burger
Book. The builder imported the completed fixture before title paint and
recaptured the exact course-version-2 build. Independent frame-by-frame review
then verified SHA-256
`53de313f0e45e95c67fa1a5bd9643d72ef63b4569d0597acc1a40da70e26d096`:

- 74.560 seconds, 1280×720 VP8 at 25 fps, 3,947,768 bytes;
- title, order, carve, pickup, trick/crash/recovery, finish, results, avalanche,
  rocket, Big Air, Burger Book, and 100% Served all readable;
- both gameplay cuts are free of boot/loading flashes;
- the corrected handoff shows 6/6, 12/12, 18/18, and 100%;
- zero console errors, failed requests, WebGPU validation errors, or device
  loss.

The WebM has no audio stream and is not mix evidence.

Disposition: PASS after one independent rejection and correction. No material
player-facing showreel defect remains.

## Final camera matrix — exact production build

Intent: screen finish, obstruction, hazard, signature-flight, aspect-ratio,
reduced-motion, and zoom paths on the converged camera.

The Windows Chrome/WebGPU harness sampled 2,235 frames across 20 scenarios:
all six finishes, five rail areas, snowcat, avalanche, Big Air at two aspect
ratios and motion modes, a 21:9 finish, and near/far zoom. It reports zero
below-terrain frames, non-finite frames, solid intersections, violent snaps,
oscillation windows, console errors, WebGPU validation errors, or failed
requests. Exact-build finish and Big Air pixels were inspected separately.

Disposition: PASS for the scripted matrix. Free-camera human play and physical
reduced-motion comfort remain honest human gates.

## Final integration/smoothing critic — converged candidate

Intent: ignore subsystem ownership and find incoherence, clutter, pacing
problems, or technically working features that do not belong together.

The independent critic reviewed the live final title pixel and real Summit
title → order → drop-in/countdown → HUD → pause/settings path, the
12/12 production event matrix, 600/600 route matrix, final responsive pixels,
20-scenario camera record, performance matrix, and corrected full-journey
showreel. The title, Burger Tour, Labs, Burger Book, Settings, How to Ride,
Credits, cold-alpine/warm-diner treatment, event/result hierarchy, and finale
read as one product. The critic found no material cross-system inconsistency or
player-facing defect requiring revision.

Disposition: PASS. Physical gamepad/touch, human ride-feel/listening/
colour-vision/reduced-motion comfort, and exact target-GPU certification remain
external gates. RockerKaki/remove.bg remains a rights blocker, not an
integration defect.
