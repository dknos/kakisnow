# Changelog

<!-- snow-burgers-release-counts courses=6 events=12 tapes=18 -->

## 1.0.0-rc — final polish gauntlet

Snow-Burgers is being prepared as a reviewable release candidate on
`feat/final-polish-gauntlet`. This entry records the work that is in the
branch; production deployment and merge remain owner-authorized steps.

### Player-facing work in the candidate

- Kept the KAKISNOW WebGPU renderer, persistent snow deformation, six-course
  registry, twelve events, classic board, rocket chair, ghosts, tricks,
  hazards, Recipe Tapes and Free Ride Lab intact.
- Tightened natural takeoff handling, buffered jumps, crash input clearing,
  standard gamepad polling, analogue deadzones and controller-authoritative
  Big Air records.
- Tightened deterministic ingredient-route selection from the physical 0.84
  carve limit to a 0.66 release budget. All six course definitions advance to
  version 2 so stale version-1 ghosts cannot be replayed against changed pickup
  lines; records and progress remain intact.
- Added the title, order, results, Burger Book, credits, How to Ride and
  finale presentation surfaces already described in the running build.
- Added event-specific result hierarchy and Big Air airtime, distance, height,
  trick, landing-grade and personal-best feedback.
- Added adaptive procedural music states and retained separate music, effects,
  ambience, UI and master controls.
- Promoted thirteen local procedural ingredient, burger, rocket-chair, camp and
  dressing derivatives with exact runtime/source hashes, source records and a
  fixed expected-runtime manifest. Their conditional output terms are recorded
  without asserting copyrightability, exclusivity or blanket commercial
  clearance; the RockerKaki/remove.bg record remains the known strict blocker.
- Added structured social-preview source/edited/runtime hashes, generation
  command record, terms links, disclosure and owner visual-review state.

### Validation and release engineering

- Added registry-derived documentation-count checks, candidate hash checks,
  runtime reference checks and fail-closed asset-rights checks.
- Added a CI boundary so validation must pass before a Pages deployment job can
  publish. This branch has not been deployed by this work.
- Split report-only and strict validation artifacts so a report with rights
  blockers is never represented as a plain release `pass`.
- Recorded Windows Chrome/WebGPU event, camera, placement and presentation-
  interval evidence. See `GAUNTLET_PROGRESS.html` and `reports/`.
- Revalidated the converged package with 182/182 tests, twelve of twelve
  production event completions, 600/600 real-heightfield placement seeds, and
  a 74.560-second independently accepted gameplay showreel.
- Refreshed the transitive Vite/PostCSS `nanoid` lock from 3.3.16 to 3.3.18;
  the final clean install reports zero npm audit vulnerabilities.

### Remaining before a commercial-ready release

- The RockerKaki remove.bg processing step is still an unresolved commercial
  redistribution gate.
- Exact target GPU profiling, physical controller/touch review, human audio
  listening, and human colour-vision review remain documented gates.
