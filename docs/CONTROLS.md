# Controls

<!-- snow-burgers-release-counts courses=6 events=12 tapes=18 -->

The controls below describe the current player-facing mapping. The game keeps
one shared intent state for keyboard, gamepad and touch, so the ride systems do
not receive a different set of mechanics by device.

## Keyboard and mouse

| Action | Input |
| --- | --- |
| Steer / camera-relative movement | `WASD` or arrow keys |
| Orbit camera | Mouse movement while pointer lock is held |
| Zoom | Mouse wheel |
| Snow-surf / carve | Hold right mouse button |
| Jump | `Space` |
| Spin left / right | `Q` / `E` |
| Flip front / back | Hold `F` + `W` / `S` while airborne |
| Tweak grab | Hold `F` + `A` / `D` while airborne |
| Recover | `R` |
| Rocket thrust | Hold `Left Shift` when the rocket chair is fitted |
| Pause / resume | `Escape` |
| Spell 1–5 | Number keys `1`–`5` |
| Developer overlay | `F1` or backtick |

`Space` uses the game's jump buffer and coyote window. A takeoff still rewards
anticipation; an input on the lip is not a guarantee against an intentionally
bad line.

## Standard gamepad

| Action | Input |
| --- | --- |
| Steer | Left stick |
| Look | Right stick |
| Snow-surf / carve | Left trigger |
| Rocket thrust | Right trigger, analog |
| Jump | South face button (A on Xbox-style layout) |
| Recover | East face button (B on Xbox-style layout) |
| Trick modifier / grab | West face button (X on Xbox-style layout) |
| Spin left / right | Left / right bumper |
| Pause | Start |
| Menu move | D-pad or left stick |
| Menu confirm / back | South / east face buttons |

The input layer applies a radial left/right-stick deadzone and an edge-trigger
for jump and recover. A disconnected controller releases held ride, boost and
edge-button state. Controller glyphs are described by face position rather than
assuming one manufacturer's labeling.

## Touch

When touch controls are `auto` or `on`, the screen presents a virtual movement
pad, ride/trick/boost/jump controls and a pause corner button. Dragging the
world remains the touch look gesture. `Touch controls: off` hides the overlay.
The touch path is smoke-tested in the browser; physical-device feel remains a
manual gate.

## Menu and safety behavior

Menus can be operated with keyboard arrows plus Enter, or a gamepad's d-pad and
south/east buttons. Escape/pointer-lock loss and browser focus loss pause an
active run by default. `?autopause=off` is reserved for browser automation.
Pause freezes simulation time and suppresses buffered gameplay input before
resume.

## Current settings

The title and pause settings screens persist:

- quality preset, master/music/effects/ambience/interface volume, mouse
  sensitivity and invert-Y;
- camera-shake scale, reduced motion, HUD scale (`80%`–`160%`), high-contrast
  cues, route assist, ingredient beacon, hazard captions, ghost visibility and
  ghost strength;
- forgiving landings and touch-controls mode (`auto`, `on`, `off`).

The settings screen also exposes the player-facing keyboard bindings listed in
the `Keyboard bindings` section. A remap captures one primary key for an
action; the default movement aliases are restored by reset. Standard gamepad
and touch layouts are intentionally fixed and use family-appropriate prompts.

Binding safety is fail-closed: `Escape`, Enter, Space, Tab, Backspace, F1,
backquote, browser navigation keys and modifier keys are reserved for pause,
menus, diagnostics or browser behavior. A key already assigned to another
action is rejected without mutating the existing map; `Escape` cancels a
capture. `Reset keyboard bindings` and `Reset settings` are separate confirmed
actions. The normal player map never exposes the developer overlay bindings.

Meaningful warnings (snowcat, avalanche, fuel, crash, landing, pickup and the
finish) have visible non-colour captions/labels so muted play retains state
information. Captions are event feedback, not a full subtitle track. High
contrast and beacons are visual assists and do not change run physics or
invalidate records; route/ingredient assists remain optional.

The Burger Book's player desk can export `snow-burgers-save.json`, import a
local JSON file, clear ghosts separately and reset Burger Tour progress after
confirmation. Settings and keyboard bindings are separate local records and
are not included in the book export. Physical controller feel, touch hardware,
screen-reader coverage beyond the visible/ARIA status surfaces and human
accessibility approval remain release gates.
