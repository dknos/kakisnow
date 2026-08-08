# Snow-Burgers audio mix report

Workstream E independent core pass · 2026-08-07

## Scope

This slice completes the audio engine's reusable procedural score and keeps the
existing board, terrain, rocket, hazard, trick, pickup, grill, and UI feedback
voices intact. The game director owns the score state-boundary calls, while the
converged UI persists all five buses and the accessibility pass supplies visible
warning captions. This report records the accepted core; physical listening
remains a release gate.

The score is one Snow-Burgers musical language rather than a folder of songs:
a cold sustained mountain pad, a filtered diner-radio pulse, a small melodic
lift, a low mountain throb, and a deterministic eight-step phrase. Five held
oscillator voices are crossfaded by gain targets; the phrase advances on the
audio clock at four steps per second and schedules only at step boundaries. No
audio files, runtime CDN, external sample, commercial recording, or
third-party audio library was added.

## State contract

`GameAudio.setMusicState(state, { immediate? })` accepts this closed vocabulary:

`menu`, `order`, `countdown`, `run`, `speed`, `trick`, `avalanche`, `big-air`,
`finish`, `results`, `tour-complete`, `credits`.

The director can call `setMusicState("run")` at the state boundary and call
`updateMusic(speed01, trick01, avalanche01, bigAir01)` continuously. The update
API is positional by design: it avoids creating a telemetry object on the render
loop. Values are clamped to 0..1 and only held `AudioParam`s are changed.

Suggested boundaries:

| Player state | API state |
| --- | --- |
| title/attract | `menu` |
| order card | `order` |
| 3-2-1 / drop | `countdown` |
| ordinary downhill | `run` |
| high-speed line | `speed` |
| active combo/trick | `trick` |
| avalanche pressure | `avalanche` |
| Big Air flight | `big-air` |
| grill/finish presentation | `finish` |
| result card | `results` |
| Burger Tour completion | `tour-complete` |
| credits | `credits` |

`setMusicState` returns `false` for an unknown state and never creates a new
node. `immediate: true` is reserved for a hard boot/retry boundary; normal
transitions use a 0.32-second crossfade.

## Bus structure

```text
music ─┐
sfx ───┤
ambience ─┤ → master (0.42 conservative trim) → limiter → destination
ui ────┘
```

The master remains duckable for the existing pause system. `setFocusPaused`
suspends/resumes the context for visibility/blur safety; `audio.js` also
registers those browser listeners defensively. The four category buses retain
the already-wired `setBusVolume` contract and are remembered before `init()`.
The music graph is 16 nodes (five oscillators, five gains, one music trim bus,
and five held tone filters). Repeated state changes, phrase boundaries, and
1,000 steady updates do not add nodes.

Continuous board/rocket/grind/avalanche/snowcat layers continue to use held
sources and gain/filter moves. One-shots intentionally create short-lived
nodes, bounded by player actions; they are not part of the continuous music
allocation contract.

## Mix observations

### Measured

- Fake-context graph check: music `nodeCount` remains 16 after repeated state
  changes and phrase boundaries.
- `node --test tests/audio.test.mjs`: 7/7 pass.
- Focused state-trace test covers order → countdown → run → speed → trick →
  avalanche → Big Air → finish → results, then an immediate retry reset back
  to countdown/run, plus 120 mixed transitions and retry-style resets, with
  the held node count unchanged.
- Browser tooling can read `window.KAKISNOW.game.music()` for a read-only
  state/node/update trace; it does not expose audio controls to gameplay.
- Fake-context steady-update check: 1,000 `updateMusic` calls create no gain
  or oscillator nodes; a guarded context would throw if either were created.
- Non-finite telemetry (`NaN`, `Infinity`, `-Infinity`) clamps to silent-safe
  zero at the audio boundary, including scrape/rocket/avalanche/snowcat
  parameters.
- Fake analyser snapshot after the spectral correction: in the `run` state at
  speed `0.35`, the pulse envelope cycles from `0.01236` to `0.06644` across
  the eight steps (five distinct levels), rather than holding a persistent
  carrier level. The phrase envelope ranges from `0.04080` to `0.07035` over
  the accented steps, while the run-state bass envelope is `0.02610`; phrase
  stays above bass at every sampled step in the fake analyser.
- State spectral separation is measurable in the fake analyser: `run` at the
  same speed routes pulse/lead centers near `715/660 Hz`, while `avalanche`
  routes them near `611/540 Hz`; both remain finite and node-stable.
- Bus and master test: music pre-init level, mute, pause duck (`0.16`), and
  focus suspend/resume all survive the graph lifecycle.
- `npm run build`: pass (Vite production build).

### Subjective / pending on hardware

- The master trim is intentionally conservative so the rocket cannot bury
  board contact, landing grade, avalanche warning, or UI confirmation.
- The pulse is now triangle-wave and low-pass filtered (state center roughly
  `500–900 Hz`) instead of a persistent 344 Hz square carrier. The bass remains
  a restrained low sine under a 180 Hz low-pass; its run-state envelope stays
  below the phrase, including the quietest sampled accent. The pulse envelope
  changes only through held scalar phrase parameters.
- The music voices are deliberately simple and filtered; this is a compact
  broadcast/diner motif, not a claim of a finished loudness-mastered record.
- True LUFS, peak, speaker/headphone masking, and browser-device latency still
  require a real browser session and audio interface. They should be recorded
  here rather than inferred from Web Audio gain values.
- The local Linux headless probe was not accepted as runtime audio evidence:
  its WebGPU adapter was null and KAKISNOW correctly stopped before boot. This
  does not certify or disprove the audio graph; Windows Chrome/WebGPU playback
  remains the required listening path.
- The procedural score is original code and synthesized oscillator output. No
  asset attribution is required for this slice; generated-image provenance is
  tracked separately in the asset ledger and is not audio provenance.

## Known limitations and integration gates

- `gameDirector.js` now calls the score contract at title/order/countdown/run,
  speed/trick/avalanche/Big Air, finish, results, tour-complete, and credits
  boundaries. D2 independently verifies the finale and credits state path.
- Adaptive rhythm is gain-and-filter based rather than sample/stem playback;
  the held eight-step phrase gives the run a repeatable motif while keeping
  startup and retry behavior deterministic and node-stable. A real-speaker
  critic should still listen for whether the pulse and phrase remain distinct
  at low volume without adding a more complex scheduler.
- The existing synthesized one-shots use their established per-hit nodes and
  limiter. A long browser soak should still check that finished short-lived
  nodes are reclaimed by the browser and that repeated retry does not create a
  persistent audio-node leak.
- Hardware loudness, reduced-volume intelligibility, music-off behavior, and
  pause/focus transitions remain release acceptance checks on physical
  speakers/headphones. Automated captions and bus tests do not substitute for
  human listening.
- The packaged 74.560-second gameplay showreel has no audio stream. It proves
  visual state and pacing only and is not cited as mix or soundtrack evidence.
