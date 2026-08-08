# Accessibility and control gauntlet — Workstream G

Status: **independent PASS — automated/runtime evidence accepted; live device and human review remain release gates**

## Implemented in this slice

- Data-driven keyboard action map (`src/core/playerBindings.js`) with versioned
  persistence, sanitisation, duplicate/conflict errors, reserved browser/menu
  keys, reset-to-default, and corruption recovery.
- Keyboard polling now reads the action map for steering, jump, spin, trick
  modifier, recover, rocket boost, and spells. Standard and generic gamepad
  layouts remain fixed and are not accidentally remapped.
- Input-family tracker (`src/core/inputFamily.js`) exposes keyboard/mouse,
  Xbox-style standard pad, generic pad, and touch families with 140 ms
  hysteresis. Xbox-style classification uses the controller ID heuristic
  rather than trusting `mapping: standard`; unlocked mouse movement is ignored
  for prompt-family changes, and menu/touch actions participate in switching.
- One `releaseAllInputSources()` path now clears keyboard, mouse, pad edge
  state, touch pointers, one-frame edges, and holds on blur, hidden tab,
  pointer-lock exit, and cancelled pointer events.
- Accessibility setting bounds and persistence were added for HUD scale,
  high contrast, route/ingredient/hazard assists, and ghost opacity. The
  player-settings reset helper restores only player-facing options; the UI
  volume bus is exposed as a persisted player slider.
- Pure prompt and caption helpers provide family-aware labels and compact
  non-colour state strings with per-kind cooldowns.
- Snow-Burgers HUD now has persisted scale, high-contrast ingredient/finish
  cues, ghost strength, explicit fuel/landing/avalanche/collection ARIA state,
  and visible captions for pickup, landing, crash, snowcat, avalanche, low
  fuel, and rocket ignition/shutdown. Reduced motion suppresses UI transitions
  in addition to camera motion.
- Settings exposes keyboard remap capture with reserved-key/conflict feedback,
  reset keyboard bindings, reset player settings through the existing
  game-owned confirmation screen, and family-aware order/tutorial/How-to copy.
  Visible order/How-to prompts refresh when the debounced input family changes.
- The legacy Course HUD receives the same bounded HUD scale and high-contrast
  treatment.
- Ingredient sites gain an allocation-free faceted pole/crossbar silhouette
  when route assist, ingredient beacon, or high contrast is enabled; Base Camp
  gains a matching optional stacked finish beacon. These are world cues rather
  than colour-only overlays and reuse the existing custom material path. The
  tall ingredient guide is disabled after collection while the pad remains.
- Ghost strength is applied to the actual shaded mesh visibility values rather
  than the non-rendering TransformNode, so the persisted slider changes pixels.

## Deterministic evidence

The focused G critic run passed 180/180 tests and build. The later converged
package rerun passes 181/181; `npm run build` passes.
Focused coverage includes radial pad behavior,
keyboard conflicts and reserved keys, corrupt-map recovery, reset, input-family
hysteresis and identity classification, settings bounds, source-release clearing,
prompt families, guide/ghost visibility, and non-colour caption cooldowns.

Windows Chrome/WebGPU evidence also passes with zero console and WebGPU validation
errors:

- `screenshots/final-gauntlet/accessibility-g-recheck2/g-critic-report.json` —
  1280×720 keyboard/touch/settings/tutorial/muted-caption/reduced-motion pass.
- `screenshots/final-gauntlet/accessibility-g-pad-recheck2/g-pad-critic-report.json` —
  3440×1440 and simulated Xbox/generic/touch menu coverage; its lone reset result
  is a harness sequencing error because it tests Book back, returns to title, then
  walks for Reset without reopening Book. Other pad back paths pass.
- `screenshots/final-gauntlet/accessibility-g-pad-recheck3/g-pad-reset-report.json` —
  corrected controller-only Book → Reset confirmation → East cancel path, passing
  with zero console/WebGPU errors.

The initial runtime critic report in
`reports/final-gauntlet/ACCESSIBILITY_G_CRITIC_RUNTIME.md` is retained as a
chronological REVISE record. Its three findings were corrected and independently
rechecked: ordinary menu touch now changes the prompt family, controller East
backs out of Book/Credits/confirm routes, and pointer capture is defensive. The
recheck2/recheck3 evidence above is the current G acceptance record.

## Remaining device and integration checks

The independent G acceptance evidence includes Windows Chrome/WebGPU
keyboard-only, standard/generic controller simulation, touch, muted warning
captions, reduced motion, high contrast, large HUD, 1280×720, 3440×1440, and
125%-equivalent settings captures with zero console/WebGPU errors. The final
converged integration pass should repeat representative paths after all other
workstreams settle.

Physical gamepad feel, phone touch ergonomics, and human colour-vision review
remain honest device/human gates even after automated tests pass.
