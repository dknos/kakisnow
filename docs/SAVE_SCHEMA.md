# Save schema

<!-- snow-burgers-release-counts courses=6 events=12 tapes=18 -->

Snow-Burgers uses two independent `localStorage` records. A failed settings
write must not overwrite a completed burger book, and a completed run must not
rewrite renderer/debug tuning.

## `snow-burgers.book` — schema 2

The record is a JSON object with `version: 2`, `burgers`, `runs`,
`seenAssembly`, `seenTourComplete`, `seenHundredPercent`, `unlockedCourses`,
`secrets`, `tutorial`, `lastSelected` and an `events` object keyed by the
registered event id. Each event record stores completions, best time/style/
integrity/rocket/trick/stars/medal, seed, course/event identity versions,
vehicle identity and an optional matching best ghost. Big Air may additionally
store independent classic-board and rocket-chair flight records.

Ghost identity is strict: seed, course id/version, event id/version and
vehicle id all have to match the active run. A ghost from a different course,
event, vehicle or terrain revision is ignored rather than shown as a false
comparison.

## `snow-burgers.settings` — schema 1

The settings envelope is `{ "version": 1, "values": { ... } }`. The
player-facing whitelist currently includes `audio`, master/music/effects/
ambience/UI volume, mouse sensitivity, `invertY`, `shakeScale`,
`reducedMotion`, `hudScale`, `highContrast`, `routeAssist`,
`ingredientBeacon`, `hazardWarnings`, `ghostOpacity`, `showGhost`,
`forgivingLanding`, `touchControls` and the quality `preset`. Invalid values
and unknown keys are dropped on load. HUD scale is bounded to `0.8`–`1.6`,
ghost strength to `0.25`–`1`, and the other numeric values have their own
finite ranges in `src/core/playerSettings.js`.

## `snow-burgers.bindings` — schema 1

Keyboard remapping is stored separately as
`{ "version": 1, "values": { "jump": ["Space"], ... } }`. It contains only
the fifteen player actions in `src/core/playerBindings.js`; a successful
capture replaces one action's primary key and persists asynchronously. The
sanitizer drops unknown/invalid keys, reserved menu/browser/debug keys and
colliding assignments while restoring a usable default map. Standard gamepad
and touch bindings are not serialized or remappable.

## Migration and failure behavior

- A valid schema-1 book is lifted to schema 2 with the known v1 Summit/classic
  identity and ghost interval.
- Unknown/future book versions become a fresh book; they are not guessed into
  the current schema.
- Invalid JSON or malformed optional ghosts do not take down the game. A bad
  ghost is discarded while the surrounding valid records remain usable.
- Storage unavailable or quota failure keeps the run playable and reports a
  warning; it does not fabricate a successful save.

`BurgerBook.exportSave()`, `BurgerBook.importSave(serialized)`,
`BurgerBook.clearGhosts()` and `BurgerBook.reset()` are defensive code APIs
used by the runtime and the player-facing Burger Book desk. `Export save`
downloads a JSON file; `Import save` opens a local JSON file and leaves the
current book untouched when parsing, migration, version or storage validation
fails. A future-version save receives a readable error rather than being
guessed into the current schema. `Clear ghosts` and `Reset progress` have
separate keyboard/controller-navigable confirmations; reset progress does not
clear settings or bindings. The export contains the Burger Book only, not
settings or keyboard bindings.

Totals shown by progression and the Burger Book derive from the six-course,
twelve-event and eighteen-tape registries. They are not hand-maintained save
fields.
