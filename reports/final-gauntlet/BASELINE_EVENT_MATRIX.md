# Historical baseline twelve-event browser matrix

Date: 2026-08-07
Commit: `121ce4eedf968e381dd2647f6a2b0e923ac41b85`
Source state: clean detached worktree after `npm ci`, `npm test`, and
`npm run build`
Runtime: production Vite preview, Windows Chrome 151.0.7922.108, hardware
WebGPU adapter
Harness: `tools/snow-burgers/playthrough-windows.cjs`, seed 1, 2560×1440

This file is a historical baseline captured at the commit above. It is retained
for before/after comparison and must not be packaged as current release
evidence; the final converged package has separate current validation reports.

Every row reached the results state. Across the matrix there were zero page
console errors and zero WebGPU validation errors.

| Event | Course | Vehicle | Time | Medal | Stars | Ingredients | Style | Integrity | Airtime | Landings | Rocket |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| The Summit Stack | Summit Line | Classic snowboard | 31.56 s | Gold | 4 | 4 | 43 | 73 | 1.69 s | 3 | — |
| Summit Gold | Summit Line | Classic snowboard | 31.07 s | Gold | 4 | 2 | 42 | 82 | 1.93 s | 3 | — |
| Rocket Reheat | Summit Line | Rocket chair | 28.17 s | Gold | 4 | 4 | 49 | 64 | 2.43 s | 4 | 44 |
| The Timber Melt | Pinecone Pass | Classic snowboard | 36.37 s | Gold | 4 | 4 | 46 | 83 | 8.22 s | 14 | — |
| Branch Manager | Pinecone Pass | Classic snowboard | 36.38 s | Gold | 4 | 4 | 46 | 83 | 7.02 s | 14 | — |
| The Blue Plate | Glacier Gorge | Classic snowboard | 39.26 s | Gold | 4 | 4 | 39 | 89 | 4.46 s | 10 | — |
| Handle With Care | Glacier Gorge | Classic snowboard | 39.22 s | Gold | 4 | 4 | 31 | 74 | 1.96 s | 3 | — |
| The Night Shift | Midnight Resort | Classic snowboard | 34.76 s | Gold | 4 | 4 | 45 | 91 | 3.85 s | 9 | — |
| Park Order | Midnight Resort | Classic snowboard | 34.82 s | None | 2 | 4 | 38 | 68 | 1.86 s | 4 | — |
| The Avalanche Special | Whiteout Ridge | Classic snowboard | 45.87 s | Gold | 4 | 5 | 47 | 75 | 7.07 s | 14 | — |
| Five Alarm | Whiteout Ridge | Rocket chair | 43.28 s | Gold | 4 | 5 | 46 | 88 | 6.26 s | 16 | 56 |
| The Big Air Stack | Big Air Basin | Classic snowboard | 45.60 s | Gold | 4 | 4 | 54 | 77 | 10.16 s | 16 | — |

## Interpretation

- Completion is not the same as medal success. Park Order correctly completed
  the delivery but awarded no medal because the autopilot's style result did
  not meet the event's trick requirement.
- The displayed stack grades in the raw results are burger-quality labels,
  not event names. They must remain separate from the player-facing event
  identity.
- The historical harness's terminal formatter used a hard-coded `/4`
  ingredient denominator. It therefore printed `2/4` for Summit Gold and
  `5/4` for the two Whiteout events even though the report arrays above contain
  the correct registry-derived counts. The formatter is corrected in the
  current worktree to derive the live placement count; this old observation is
  not a current product defect.
- `airTime` is whole-run airtime. It is useful as a completion smoke signal but
  is not sufficient evidence for one authoritative Big Air flight; the
  signature jump requires its own takeoff/landing telemetry suite.

## Reproduction shape

Each run used a URL of this form:

```text
http://127.0.0.1:4198/?course=<course-id>&event=<event-id>&autopause=off
```

and invoked the installed Windows Node/Chrome path with one seed, a 180-second
limit, and the registry-appropriate vehicle. The original PNG sequence was
kept outside the repository because the twelve one-seed runs total hundreds of
megabytes; the repository already contains representative baseline captures,
and final-candidate evidence is written only under `screenshots/final-gauntlet/`.
