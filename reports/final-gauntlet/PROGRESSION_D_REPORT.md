# Workstream D — Progression and Endgame

Status: **D2 independent PASS**; final integration regression review remains
separate. No progression/endgame P0/P1 remains in the accepted slice.

## Implemented

- `completionStats()` derives 6 courses, 12 events, 18 Recipe Tapes, served
  events, medals, stars, burgers, open courses, completion percentage, Tour
  Complete, and 100% directly from the registries and save records.
- The six main deliveries are exactly `summit-stack`, `timber-melt`,
  `blue-plate`, `night-shift`, `avalanche-special`, and `big-air-basin-stack`.
- Burger Book is reachable from title/results and exposes course tabs, event
  rules and medal thresholds, saved time/vehicle/style/integrity/rocket/trick,
  ghost presence, start actions, and 18 authored tape titles and notes.
- Unopened course pages remain readable but their event start actions are
  locked by the same Burger Tour gate as the title.
- Tour Complete and distinct 100% celebrations persist only a seen bit; the
  completion state remains derived and continued play stays available.
- Credits disclose KAKISNOW, shipped asset/license notices, open-source license
  documentation, and AI-assisted promotional art provenance without inventing
  people or licenses.
- How to Ride uses the actual current bindings: Space/A jump, Q/E or bumpers
  spin, F/X trick modifier, R/B recovery, Shift/right trigger rocket, and 1–5
  spells.
- Save export/import, malformed/future-save rejection, ghost clearing, and
  optional best-trick persistence are defensive and schema-v2 compatible.
- Medal rank now upgrades independently of the time PB and never downgrades.

## Evidence

- D-focused tests (`tests/progression.test.mjs`, `tests/save-v2.test.mjs`): 26
  passed, 0 failed. The full suite at D2 time was 157 passed, 0 failed; the
  final converged package rerun passes 182/182.
- `npm run build`: passed; only the existing large Babylon chunk warning.
- Historical D2 browser smoke snapshot: `reports/browser-smoke-local/report.json`
  recorded zero console/page errors for that accepted boot/presentation scope;
  it is retained for traceability and is not current release evidence. The
  latest accessibility recheck provides current Windows Chrome/WebGPU browser
  evidence in
  `screenshots/final-gauntlet/accessibility-g-recheck2/g-critic-report.json`
  and the corrected controller route in
  `screenshots/final-gauntlet/accessibility-g-pad-recheck3/g-pad-reset-report.json`.
- DOM interaction check: title → Book → Tour Complete → Credits, 6 course
  tabs, authored tape titles, locked-state gate, and zero console errors.
- Manual captures at 1280×720 and 3440×1440:
  `screenshots/final-gauntlet/progression-d/02-book-overview-1280-new.png`,
  `04-tour-complete-1280-final.png`, `05-credits-1280-fixed.png`,
  `06-postgame-book-1280-fixed.png`, and `07-postgame-book-3440-fixed.png`.

The completion and finale frames use a labelled deterministic UI fixture for
the six-delivery milestone; no player save was altered by the capture.

## Fresh critic revision evidence

- `startBookEvent()` now emits the exact validated URL
  `?course=pinecone-pass&event=timber-melt&mode=burger-run`. The boot pipeline
  also accepts a valid event query without a mode for old links, while an
  event/course mismatch falls back to title. Pure coverage lives in
  `tests/progression.test.mjs` through `src/game/bootIntent.js`.
- Real Chromium/WebGPU flow from Summit Burger Book → Pinecone Pass → Timber
  Melt reached the order card after the page reload:
  `screenshots/final-gauntlet/progression-d/11-cross-course-timber-melt-order-1280.png`.
  Captured state was `eventId=timber-melt`, `order=true`, `title=false`, with
  zero console errors and zero failed requests.
- The same-course mode-less URL
  `?course=summit-line&event=summit-stack` also reached its order card;
  evidence is `12-same-course-order-1280.png`.
- Clear ghosts and Reset progress no longer call native `window.confirm`.
  Both use the in-game Confirm/Cancel screen, whose buttons are in the normal
  menu focus list. A browser probe replaced `window.confirm` with a throwing
  sentinel, navigated ArrowDown + Enter to Cancel, and returned to Burger Book
  without mutating the save. Evidence:
  `13-clear-ghosts-confirm-3440.png`.
- The focused probe also checked title → Book overview → Pinecone course page,
  six course tabs, authored tape UI, cross-course order, same-course order,
  and Cancel return at 1280×720 plus the confirmation at 3440×1440. Full
  machine-readable state was printed by the probe; the result was `pass`.

## Final integration gate

The independent D2 critic accepted keyboard/pad focus order, ultrawide density,
the transition from a newly completed main delivery through the finale, the
cross-course start, and destructive-action confirmation. A separate final
integration critic still owns the converged product pass; this report does not
claim commercial READY.
