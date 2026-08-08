# Workstream A2 — active gamepad riding

Date: 2026-08-07
Branch: `feat/final-polish-gauntlet`

The re-critique P1 was real: before this pass `pollInput()` read pad bumpers,
the west/east buttons, and the right trigger, but never read the standard left
stick. A controller could navigate menus and recover, yet could not steer a
run.

## Implemented contract

- Left stick axes 0/1 use a radial `0.18` deadzone and remap axis-1 up to
  camera-relative `moveZ = +1`; output remains a unit-bounded analog vector.
- South/A button is a rising-edge jump action, not a held jump stream.
- Left trigger is a held ride/surf source with the existing `0.08` trigger
  deadzone.
- Right trigger remains the analog rocket request, with the same `0.08` noise
  rejection as the prior implementation.
- Bumpers, west modifier, and east recovery remain mapped; east is also an
  edge action.
- Disconnect clears movement, ride, and edge-state latches on the next poll.
- Right stick uses the same radial deadzone and contributes a rate of 3 rad/s
  multiplied by the actual `pollInput(dt)` timestep. `main.js` now passes the
  render/simulation dt, so 30/60/120 Hz produce the same one-second look.
- Touch remains the highest-priority movement source while active. A weaker
  gamepad vector does not steal a full keyboard vector; equal-strength pad
  input wins. External `input.surf = true` writes still survive an idle poll,
  while a pad-owned surf source is correctly released on disconnect.
- The poll path reuses module-scope scratch objects and does not construct
  per-frame user arrays/results.

## Deterministic evidence

`tests/input.test.mjs` drives the actual `navigator.getGamepads()` →
`pollInput(dt)` path with fake standard snapshots:

| Probe | Result |
|---|---|
| `.10/.10` left-stick noise | zeroed by radial deadzone |
| `.6/-.8` left stick | `moveX=.6`, `moveZ=.8`, magnitude `1.0` |
| South held for two polls | one jump edge only |
| LT `.7`, RT `.45` | surf true, boost `.45` |
| LT/RT `.03` | surf false, boost `0` |
| right stick `.8/-.6` for one second | yaw `2.4` rad and pitch `-1.8` rad at 30, 60, and 120 Hz |
| inverted Y | pitch sign reverses |
| pad disconnect | movement/surf false and button latches released |
| keyboard W + weaker pad | keyboard forward retained |
| active touch stick | touch vector retained over keyboard/pad |

The full suite passes 140 tests and the production build passes. No physical or
virtual gamepad was available in this environment; hardware stick feel,
Bluetooth disconnect timing, and platform-specific button labeling remain
manual acceptance gates.
