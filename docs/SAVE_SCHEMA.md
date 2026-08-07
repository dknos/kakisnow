# Save schema

Two localStorage keys, deliberately separate: records are precious, sliders
are not, and `BurgerBook.record()` rewrites its whole JSON (ghost included)
on every finished run — settings must not ride along.

## `snow-burgers.book` — records. Version 2.

```jsonc
{
  "version": 2,
  "burgers": 12,                  // total completed orders
  "runs": 31,                     // total attempts, finished or not
  "seenAssembly": true,           // unlocks Space-to-skip on the cinematic
  "unlockedCourses": ["summit-line"],
  "secrets": { "summit-line": ["tape-1"] },      // recipe tapes found, per course
  "tutorial": { "steer": true },                 // prompts already completed
  "lastSelected": { "courseId": "summit-line", "eventId": "summit-stack" },
  "events": {
    "summit-stack": {
      "completions": 12,
      "bestTime": 33.4,           // seconds; null until first completion
      "bestStyle": 61, "bestIntegrity": 92, "bestRocket": 0, "bestStars": 4,
      "bestMedal": "gold",        // "gold" | "silver" | "bronze" | null
      "bestSeed": 7,
      "courseId": "summit-line",  // identity of the run that set bestTime
      "courseVersion": 1,
      "eventVersion": 1,
      "bestVehicle": "classic-snowboard",
      "bestGhost": {
        "version": 2,
        "seed": 7,
        "interval": 0.25,         // seconds per sample — data, not a constant
        "courseId": "summit-line", "courseVersion": 1,
        "eventId": "summit-stack", "eventVersion": 1,
        "vehicleId": "classic-snowboard",
        "samples": [x0, y0, z0, x1, y1, z1, ...]
      }
    }
  }
}
```

**Ghost compatibility** is `ghostMatches(stored, expect)` in `burgerBook.js`:
every identity field must match — seed, courseId, courseVersion, eventId,
eventVersion, vehicleId. A course definition that deliberately changes its
terrain bumps `version` in the same commit, which retires old ghosts against
the new mountain instead of letting them clip through it. A rocket ghost never
races a classic board.

**Migration** is a ladder in `migrate()`: v1 saves upgrade in place (records
kept; v1 ghosts gain `interval: 0.25` and the summit identity, because v1
could only have been summit on the classic board). Unknown or future versions
fall back to a fresh book rather than guessing. Every read is defensive; a
corrupt ghost is dropped without rejecting the save around it.

## `snow-burgers.settings` — player settings. Version 1.

```jsonc
{ "version": 1, "values": {
  "audio": true, "masterVolume": 1, "mouseSensitivity": 1, "invertY": false,
  "shakeScale": 1, "reducedMotion": false, "touchControls": "auto",
  "preset": "ultra"
} }
```

Whitelist-validated on load (`sanitize()` in `playerSettings.js`); unknown
keys and out-of-range values are dropped. Values hydrate through `set()` so
every `onChange` listener fires. The F1 overlay's renderer tuning is
deliberately NOT persisted — a debugging session must not permanently change
the game.
