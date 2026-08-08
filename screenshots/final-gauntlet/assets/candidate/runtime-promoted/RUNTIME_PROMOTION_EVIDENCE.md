# Promoted Snow-Burgers runtime evidence

Date: 2026-08-07
Scope: the 13 reviewed procedural replacement GLBs only

## Controlled promotion

The promotion was performed after an exact filename and pre-promotion hash
guard. Each reviewed file in `art/generated-assets/snow-burgers/` was copied
byte-for-byte to its matching path in `public/assets/models/snow-burgers/`
using a local `cp --reflink=auto` copy. No source assets, ignored supplied
assets, renderer files, or unrelated runtime files were changed.

The source and runtime manifests are:

- `source-candidate-hashes.sha256`
- `runtime-promoted-hashes.sha256`
- `historical-runtime-before-hashes.sha256` (the pre-promotion runtime set)

The source and promoted runtime manifests contain 13 entries and are byte
identical (`cmp` passed). The post-promotion validator also reports
`sourceRuntimeHashesMatch: true` in `runtime-VALIDATION.json`.

The generator's default output is the ignored candidate directory. A direct
attempt to target `public/assets/models/snow-burgers/` without
`--allow-runtime-output` was rejected by the guard, and a subsequent hash
check confirmed that the runtime was unchanged; promotion therefore required
the explicit copy step above.

For a fresh reproducibility check after promotion, Blender 5.1.1 generated
the full set twice into isolated temporary directories with the same factory
startup command and no inputs. The sorted 13-file manifests are
`generator-pass-a-hashes.sha256` and `generator-pass-b-hashes.sha256`; both
contain the same hashes and their manifest hashes are identical. This is an
exact-byte result, not a semantic-only comparison.

## Runtime validation

`runtime-VALIDATION.json` was generated with:

```text
node tools/snow-burgers/validate-original-assets.mjs \
  --dir public/assets/models/snow-burgers \
  --out screenshots/final-gauntlet/assets/candidate/runtime-promoted/runtime-VALIDATION.json
```

Result: 13/13 valid, 0 errors, 0 asset validation failures, 2,010,952 bytes,
35,557 triangles. The validator identifies the scope as
`promoted-runtime`, records the 2026-08-07 promotion date, and cross-checks
every runtime hash against the candidate source directory.

The structural runtime asset validator was run separately with an explicit
non-historical output path:
`asset-VALIDATION.json`. It passed all seven focal runtime budget/Khronos
checks (0 errors, 0 warnings, 369,768 bytes). Its default now writes under
`reports/snow-burgers/`; it refuses the immutable historical
`art/source-assets/snow-burgers/VALIDATION.json` path unless an explicit
`--allow-archival-output` override is supplied. The historical file remained
byte-identical at SHA-256
`38b502c83cb402617f0afb41b5411f1518d6d65e79166b720f1b7afb47b3bd84`.

## Shared production runtime smoke

The shared repository was built with `npm run build`, served from the local
production preview at `http://127.0.0.1:5185`, and driven by Windows Chrome
with WebGPU enabled. These captures use the promoted shared runtime, not a
temporary candidate copy:

- `shared-summit-16x9/` — 1280x720, Summit Line, complete order, all 4
  ingredients, results, 31.48 s, gold, 4 stars.
- `shared-summit-21x9/` — 3440x1440, same deterministic seed and completion
  path; all 4 ingredients, results, 31.48 s, gold, 4 stars.
- `shared-rocket-16x9/` — 1280x720 Free Ride Lab rocket smoke; ignition,
  sustained boost, airborne boost, landing, and shutdown frames.

Both Summit reports record `ok: true`, an empty `consoleErrors` array, and an
empty `webgpuValidation` array. The rocket report records `nan: false`,
`maxSpeed: 26.59`, `boostSeconds: 9.35`, and empty console/WebGPU error arrays.
The captures also provide pickup, completed burger assembly, result, and
rocket-chair evidence at the requested 16:9 and 21:9 sizes.

The high-volume raw PNG directories remain in the local gauntlet workspace and
are intentionally excluded from the review branch. The compact release evidence
under `screenshots/final-gauntlet/release-evidence/`, the all-assets contact
sheet, the JSON/hash records beside this file, and this measured report are the
shipped review set.

## Measurement boundary

These runs prove import, gameplay completion, material loading, fog/shadow
integration, and absence of console/WebGPU validation errors in the shared
Windows Chrome/WebGPU build. No GPU milliseconds are inferred from browser
presentation timing. Any frame-pacing measurements in the candidate evidence
remain explicitly rAF/presentation intervals, not GPU timings; hardware GPU
certification is outside this local smoke.

The remaining strict release validation blocker is the pre-existing
RockerKaki/remove.bg provenance record. The 13 central replacement GLBs now
have local generator/source/hash records and are no longer classified as
unresolved runtime assets. No external model, texture, or network input was
used for this replacement set.
