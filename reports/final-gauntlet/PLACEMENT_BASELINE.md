# Baseline 100-seed placement matrix

Date: 2026-08-07
Acceptance ceiling: normalized lateral demand ≤ 0.84
Height tolerance: 0.000001 m

These are the current repository's GPU-baked-heightfield reports. Every course
passed 100/100 seeds with zero placement failures and zero height mismatch.
The values are evidence from the named JSON files, not regenerated estimates.

| Course | Ingredients exercised | Passed | Placement attempts | Minimum longitudinal gap | Tightest lateral demand | Evidence |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Summit Line | 4 | 100/100 | 1 | 40.633 m | 0.8225 | [`placement-validation.json`](../../screenshots/snow-burgers/placement-validation.json) |
| Pinecone Pass | 4 | 100/100 | 1 | 78.072 m | 0.5632 | [`placement-pinecone.json`](../../screenshots/full-game/placement-pinecone.json) |
| Glacier Gorge | 4 | 100/100 | 1 | 59.618 m | 0.5552 | [`placement-glacier.json`](../../screenshots/full-game/placement-glacier.json) |
| Midnight Resort | 4 | 100/100 | 1 | 44.046 m | 0.4503 | [`placement-midnight.json`](../../screenshots/full-game/placement-midnight.json) |
| Whiteout Ridge | 5 | 100/100 | 1 | 93.111 m | 0.6992 | [`placement-whiteout.json`](../../screenshots/full-game/placement-whiteout.json) |
| Big Air Basin | 5 | 100/100 | 3 | 51.857 m | 0.8283 | [`placement-big-air.json`](../../screenshots/big-air/placement-big-air.json) |

## Interpretation

- The five-ingredient Whiteout route includes the onion and has 0.1408 of
  normalized headroom below the ceiling. It is no longer the nearly marginal
  0.839 route called out in the release brief.
- Big Air is the current tightest course at 0.8283 and required up to three
  deterministic placement attempts. It passes, but it is the first route to
  revalidate after any placement, lane-width, venue, or terrain change.
- Summit Line's shipped events require either two or four ingredients. The
  separate five-ingredient stress route cited in the gameplay audit is not a
  registered event and must not be substituted for this shipped-event report.
- These reports establish reachable placement on the baked snow surface. They
  do not establish that a human can read the route at speed; that remains a
  world-design and accessibility playtest gate.
