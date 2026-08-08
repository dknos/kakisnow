# Snow-Burgers asset optimization report

Audit date: 2026-08-07. This report covers the 13 locally authored KAKISNOW
Snow-Burgers GLBs promoted into the runtime on 2026-08-07. The former supplied
derivatives and their source measurements remain preserved as historical audit
inputs in `art/source-assets/snow-burgers/OPTIMIZATION_REPORT.md` and were not
overwritten.

## Decision

The former 13 supplied Snow-Burgers/camp GLBs were visually strong but had no embedded licence,
copyright, source URL, or author metadata. Re-exporting, decimating, or
renaming them could not cure that gap, so they remain historical and are not
runtime inputs. A deterministic local replacement set was generated from
Blender primitives and mesh code in an owner-directed AI-assisted Codex
session, then rendered under a neutral four-angle QA rig. The process used no
imported model, texture, or network input. Independent visual/runtime review
approved the replacements and the exact candidate files were promoted
byte-for-byte on 2026-08-07.

The conditional output basis is recorded in `ASSET_LEDGER.md`: the
[OpenAI Terms of Use](https://openai.com/policies/terms-of-use/) address user
ownership of Output as between OpenAI and user, subject to input rights and
non-uniqueness, while the [OpenAI Service Terms](https://openai.com/policies/service-terms/)
warn that code-generation output may be subject to third-party licenses. This
report does not assert copyrightability, exclusivity, or blanket commercial
clearance. No external model, texture, or network input entered this local
pipeline.

The replacement is deliberately compact: it keeps the product's toy-like,
grounded alpine/diner language, preserves all runtime filenames, uses no
textures or external references, and avoids touching the custom WGSL material
path.  The original focal four-view set remains under
`screenshots/final-gauntlet/assets/candidate/qa-round3/`; F4 regenerated the
full 13-asset four-view set under
`screenshots/final-gauntlet/assets/candidate/qa-round4-final/all-assets/`
(contact sheet: `all-assets-contact-sheet.png`), including the changed tomato,
hut, and village. They are not a self-approval or a runtime-promotion claim.
Candidate WebGPU evidence is separate under
`screenshots/final-gauntlet/assets/candidate/runtime-round4/`.
Dressing and camp props are silhouette-first assets intended for their existing
mid/far runtime distances.

## Candidate pipeline

```
generator source
  tools/snow-burgers/generate-original-assets.py
        ↓ Blender 5.1.1 factory startup; no imported files
  GLB candidate (embedded materials, no images, no animations)
        ↓ validate-original-assets.mjs / Khronos validator
  source+runtime hashes and triangle counts
        ↓ neutral four-view Blender QA render
  human/critic approval gate
        ↓ exact-byte promotion on 2026-08-07
  public/assets/models/snow-burgers/
```

There is no runtime transcoder, CDN, procedural network call, or new renderer
path.  The candidates are under the same 4 MB vehicle, 2.5 MB burger, and 1.25
MB ingredient budgets used by the original pipeline by a wide margin.

## Candidate measurements

<!-- GENERATED:ASSET-MEASUREMENTS:START -->
| File | Triangles | Draw calls | Primitives | Materials | Bytes | Optimization |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| ingredient-cheese.glb | 45 | 2 | 2 | 2 | 4,732 | folded/draped cheese slice; no texture |
| ingredient-patty.glb | 516 | 4 | 4 | 2 | 33,248 | solid patty with recessed dark grill grooves; no texture |
| ingredient-tomato.glb | 544 | 7 | 7 | 4 | 45,104 | flesh, calyx, and seed cues; no texture |
| ingredient-lettuce.glb | 528 | 3 | 3 | 2 | 24,984 | three organic layered ruffle discs; no texture |
| ingredient-onion.glb | 504 | 3 | 3 | 1 | 31,304 | authored low-poly purple onion rings; no texture |
| burger-complete.glb | 2628 | 7 | 7 | 7 | 146,504 | authored stack, ruffles, rings, bun seeds; merged material primitives; no texture |
| rocket-chair-snowboard.glb | 1140 | 11 | 11 | 5 | 83,892 | corrected runtime anchors, board, seat, booster, fins, vents; no texture |
| dressing-firs.glb | 1580 | 17 | 17 | 3 | 92,872 | three tiered branch variants, merged at runtime |
| dressing-pine.glb | 544 | 6 | 6 | 3 | 34,544 | tiered hero pine silhouette |
| dressing-bush.glb | 540 | 6 | 6 | 2 | 47,484 | authored clustered shrub and snow caps |
| dressing-rock.glb | 60 | 3 | 3 | 2 | 9,048 | authored faceted rock cluster |
| camp-hut.glb | 6460 | 11 | 11 | 11 | 356,020 | merged warm lodge with log courses, windows, counter, board, awning |
| camp-village.glb | 20468 | 12 | 12 | 12 | 1,101,216 | three merged lodge silhouettes with tiered firs |

Total: 2,010,952 bytes and 35,557 triangles across the candidate set. The original supplied runtime package was 3.31 MB for the seven focal assets before dressing; the candidate focal seven are 369,768 bytes (exact values are machine-readable in `art/generated-assets/snow-burgers/VALIDATION.json`).
<!-- GENERATED:ASSET-MEASUREMENTS:END -->

## Final production-package inventory

The converged 2026-08-07 production build records these delivery sizes:

| Scope | Bytes | Interpretation |
| --- | ---: | --- |
| `public/assets/` | 19,153,380 | Vendored active and archival assets; no runtime CDN |
| Baseline runtime asset tree | 22,713,084 | Pre-gauntlet comparison from the accepted baseline |
| Asset-tree change | -3,559,704 (-15.7%) | Replacement promotion reduced, rather than inflated, the shipped asset tree |
| `dist/` | 37,462,650 | Complete production output including source maps and retained archival assets |
| Main production JavaScript | 2,403,142 | Minified entry chunk; Vite reports 615.92 kB gzip |

The fixed runtime manifest validates 31 direct/dynamically assembled assets by
path, byte count, and SHA-256. Production-preview and Windows Chrome/WebGPU
smokes reported zero failed requests. Source and build inspection found no
runtime CDN, analytics endpoint, telemetry beacon, WebSocket, or external
transcoder; network delivery is same-origin static release content.

## QA evidence and limits

QA captures are four fixed views for each focal asset and the key camp/dressing
silhouettes. They show geometry and base materials under a fixed neutral setup,
not the final KAKISNOW WGSL lighting. The following promotion gates were
required and are now recorded as completed by the F4/F5 evidence:

- Babylon imported each candidate under WebGPU with zero console or validation
  errors;
- ingredient bounds retained the existing pickup size/lift contract;
- the rocket's +Z-forward anchors, contactY, seat, cargo tray, and exhaust
  read correctly in both vehicles;
- the burger remained prominent during the finish presentation;
- camp and dressing remained grounded in the shared renderer smoke.

Those were the deliberate promotion gates. The checksum-isolated production
preview and independent critic approval are recorded in
`screenshots/final-gauntlet/assets/candidate/runtime-round4/RUNTIME_EVIDENCE.md`.
Post-promotion runtime hashes are recorded in
`screenshots/final-gauntlet/assets/candidate/runtime-promoted/runtime-promoted-hashes.sha256`;
they match the candidate hashes and the active 13 runtime paths. The complete
promotion, two-run reproducibility, and shared Windows WebGPU smoke record is
`screenshots/final-gauntlet/assets/candidate/runtime-promoted/RUNTIME_PROMOTION_EVIDENCE.md`.

The F4 checksum-isolated production preview evidence is recorded in
`screenshots/final-gauntlet/assets/candidate/runtime-round4/RUNTIME_EVIDENCE.md`.
The finish assembly frames provide the actual player-facing service-side view;
the separate close probe is labelled as grounded but partially occluded rather
than being presented as a clean close-up approval.

The generator runs a byte canonicalization pass after Blender export: triangle
records are sorted without changing winding, unused texture coordinates are
rounded to six decimal places (five for the rocket chair's exporter-boundary
case), and JSON keys/padding are fixed. The tomato seed primitives use
deliberately distinct sub-pixel topology so Blender cannot opportunistically
share an index accessor in only one clean process. Two clean factory-startup
runs on 2026-08-07 (`/tmp/sb-f4-proof2-a.zKaGJ5` and
`/tmp/sb-f4-proof2-b.vDIqcn`) plus
the candidate directory matched all 13 sorted SHA-256 rows byte for byte.
This is an exact-byte result, not only a semantic-hash claim.

## F4 camp-hut revision

The focal hut now faces the primary piste placement with a legible service
façade: a dark framed serving hatch with warm interior, deep counter shelf,
snow-topped striped awning, wordless three-chip order board, warm door/window
hierarchy, side grill and flue, an oversized snow roof/ridge, and a grounded
snow plinth/bank. The village reuses that authored service language in its three
grouped lodge silhouettes. No text, brand, imported model, or texture was
introduced. The hut is 6,460 triangles / 11 primitives / 11 material draws /
356,020 bytes and the merged village is 20,468 triangles / 12 primitives /
12 material draws / 1,101,216 bytes; these figures are regenerated from the
validator rather than hand-maintained. Both are now active runtime paths.

## Historical supplied asset optimization remains unchanged

The former 13 supplied GLB records (seven ingredient/vehicle/reward files and
six camp/dressing files) were normalized, converted from specular-glossiness
where required, stripped of unused tangents, resampled to WebP, decimated with
an error bound, and Draco-compressed. Those technical optimizations remain
documented for audit; those files were rejected from active runtime because
their source/licence metadata was unresolved. The original source files remain
immutable and ignored, with hashes in
`art/source-assets/snow-burgers/IMPORT_AUDIT.json`.
