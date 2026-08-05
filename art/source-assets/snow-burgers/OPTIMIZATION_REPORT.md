# Snow-Burgers asset optimisation

Seven GLBs were supplied from the project owner's local `Downloads` folder and
imported for the Snow-Burgers game layer: five ingredients, the completed
burger, and the rocket chair snowboard.

Every number below was produced by
`tools/snow-burgers/optimize-assets.mjs` and re-measured by
`tools/snow-burgers/validate-assets.mjs`. The machine-readable records are
`IMPORT_AUDIT.json` (the sources as received), `OPTIMIZATION_REPORT.json` (what
the pipeline did) and `VALIDATION.json` (the Khronos validator's verdict on the
results). Source GLBs are preserved on the authoring machine and hashed here,
but are not committed — see *Provenance and what is not known*.

## Result

| Asset | Source | Runtime | Reduction | Tris in | Tris out | Texture in | Texture out |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `cheese` | 0.14 MB | 0.02 MB | 87.3% | 316 | 316 | 0.12 MB | 14 kB |
| `patty` | 2.27 MB | 0.20 MB | 91.0% | 19,628 | 19,628 | 1.64 MB | 149 kB |
| `tomato` | 0.56 MB | 0.08 MB | 86.3% | 1,310 | 1,310 | 0.50 MB | 67 kB |
| `lettuce` | 0.08 MB | 0.02 MB | 80.7% | 476 | 476 | 0.05 MB | 11 kB |
| `onion` | 2.64 MB | 0.57 MB | 78.4% | 1,340 | 1,340 | 2.58 MB | 576 kB |
| `burger` | 89.21 MB | 1.50 MB | 98.3% | 1,500,000 | 220,000 | 45.94 MB | 797 kB |
| `rocket` | 73.27 MB | 0.93 MB | 98.7% | 1,500,000 | 159,996 | 30.45 MB | 415 kB |

Total runtime package: **3.31 MB**, against a preferred budget of 11 MB and a
hard ceiling of 15 MB. Every asset is inside its individual budget with margin;
the largest, the burger, uses 60% of its 2.5 MB allowance.

The headroom was not spent. It could have been — 500,000 triangles on the
burger costs 2.27 MB and still fits — and the comparison below is why it was
not.

## Where the size actually was

The two large files are the ones worth explaining, because their size was not
where a file listing suggests.

`burger.glb` and `rocket snowboard.glb` arrived at 89 MB and 73 MB, and each
contains **exactly 1,500,000 triangles** and three 4096² PNGs. The round
triangle count is the signature of a generator cap rather than an authoring
decision; the texture names (`texture_pbr_20250901`) carry the same date on
both. Roughly half of each file is image data and roughly half is geometry, so
neither could have been brought inside budget by attacking one alone.

Both levers were pulled, and the split matters:

- **Textures** are the free win. 4096² is a resolution for a hero prop filling
  a screen, not for a 1.6 m object seen across a snowfield. Resampling to 2048²
  for base colour and 1024² for normal and metallic-roughness, then encoding
  WebP at quality 90, took the burger's 45.94 MB of images to 797 kB. Nothing
  about that is visible; the source PNGs were storing detail no display path in
  this project can resolve.
- **Geometry** is the one with a real trade, and it was measured rather than
  assumed.

## The decimation, and the evidence for it

The burger's 1.5 M triangles are not padding. Its sesame seeds are individual
raised geometry and its shredded lettuce is a ring of modelled tubes — exactly
the small high-frequency features a quadric simplifier discards first, and
exactly what the brief forbids destroying.

Three states were rendered from identical angles under identical lighting by
`tools/snow-burgers/qa-render.py`:

| State | Triangles | Bytes | Evidence |
| --- | ---: | ---: | --- |
| Source | 1,500,000 | 89.21 MB | `screenshots/snow-burgers/asset-qa/source/burger-*.webp` |
| Shipped | 220,000 | 1.50 MB | `screenshots/snow-burgers/asset-qa/optimized/burger-*.webp` |
| Sweep candidate | 500,000 | 2.27 MB | `screenshots/snow-burgers/asset-qa/sweep/burger500k-*.webp` |

At 220,000 the seeds, the lettuce ring, the cheese drape, the sauce fringe and
the silhouette all survive; the bun's micro-pebbling is marginally softer.
Between 220,000 and 500,000 there is no difference this review could identify
at render resolution, so the extra 770 kB and the extra 280,000 triangles buy
nothing and were declined. The sweep is reproducible:

```
node tools/snow-burgers/optimize-assets.mjs burger --sweep 220000,500000
```

The rocket chair took the same treatment at 160,000 triangles. Its surfaces are
broad and smooth — a board, a moulded seat, a cylinder, four fins — which is
the case a quadric simplifier handles almost perfectly. Panel lines, seat
quilting, fin edges and the board's camber are all intact against the source.
It is also the only one of the seven that is on screen every frame, which is
the reason its triangle count was chosen for frame cost rather than for
download size.

The simplifier ran with `error: 0.0008` and `lockBorder: true` throughout, so
it stops before eating features even where that means missing the triangle
target. The target is a budget, not a quota.

## What else the pipeline does

**Specular-glossiness is converted to metallic-roughness.** The tomato, lettuce
and onion arrived as `KHR_materials_pbrSpecularGlossiness`. The note already
standing in `rockerKaki.js` records what that costs downstream: Babylon
converts the workflow but never populates the metallic-roughness channels, and
this project's `rocker` shader reads exactly those. Left alone, three of the
five ingredients would have lit as fully metallic at roughness 1 — the waxy
tomato the brief specifically warns about. Converting offline is what makes a
tomato read as a tomato.

**Tangents are stripped, not generated.** `rocker.fragment.wgsl` builds its
tangent frame from screen-space derivatives via `cotangentFrame`. An authored
TANGENT attribute is four floats per vertex that nothing samples. `TEXCOORD_1`
goes for the same reason: the shader samples `vUV` only.

**Transforms are baked into geometry.** The five Sketchfab ingredients arrive
under a Z-up wrapper node and the two generated assets under a +90° X rotation.
All of it is applied to the vertices, then each asset is uniformly scaled to a
target size and its pivot moved to the centre of its footprint at ground level.
The result is that no runtime code carries a per-model offset — the failure
`boardSpec.js` exists to argue against.

| Asset | Scale applied | Final size (m, X×Y×Z) |
| --- | ---: | --- |
| `cheese` | ×1.1096 | 0.81 × 0.56 × 1.10 |
| `patty` | ×0.6266 | 1.25 × 0.44 × 1.25 |
| `tomato` | ×0.1769 | 0.94 × 1.00 × 0.94 |
| `lettuce` | ×3.6101 | 1.25 × 0.73 × 1.15 |
| `onion` | ×0.0976 | 0.96 × 1.05 × 0.96 |
| `burger` | ×1.6252 | 1.60 × 1.23 × 1.59 |
| `rocket` | ×2.1149 | 0.58 × 0.72 × 2.52 |

The source scales were wildly inconsistent — the onion arrived 10.8 units tall
and the lettuce 0.35 — which is normal for assets from different origins and is
the reason the pipeline measures rather than trusts. The rocket chair is scaled
to 2.524 m along Z, which is `BOARD_BASE_LENGTH` exactly: the two vehicle
profiles are then directly comparable and the proportions in `boardSpec.js`
stay readable against the new board.

**Compression choices are constrained by what this project can decode.** Draco
is used for geometry because `public/assets/decoders/` already vendors its
decoder for RockerKaki, so it costs no new runtime dependency. Textures are
WebP rather than KTX2 because Babylon's KTX2 transcoder defaults to a Babylon
CDN URL, and a GitHub Pages build that silently fetches a decoder from a third
party is a worse trade than the VRAM an uncompressed format costs at these
sizes. `validate-assets.mjs` enforces this as a check rather than a convention:
it fails any asset whose required extensions are not on the decodable-here
list.

## Validation

All seven pass the Khronos glTF validator with zero errors. Four carry one
warning each; none is a defect in the output. Full messages are in
`VALIDATION.json`.

The validator was run with `externalResourceFunction` set to throw, so any
asset that did not fully embed its images and buffers would fail rather than
silently pass and then 404 in the browser.

## Provenance and what is not known

**No supplied asset carries a licence.** All seven report `copyright: null` and
an empty `extras`. Five have Sketchfab download signatures in their node names;
two are generated assets dated 2025-09-01 in their texture names. That the
files were supplied locally establishes nothing about redistribution rights.

This is recorded, not resolved. `ASSETS.md` carries the same caveat that
RockerKaki already carries. Nothing here should be read as a commercial
clearance.

Source files are preserved on the authoring machine at
`art/source-assets/snow-burgers/*-source.glb` and are excluded from version
control: 176 MB of binaries is permanent in the history of a repository that
publishes to GitHub Pages. Their SHA-256 hashes are recorded in
`IMPORT_AUDIT.json` and below, so a future copy can be verified as the same
file this pipeline measured.

| Asset | Source SHA-256 | Runtime SHA-256 |
| --- | --- | --- |
| `cheese` | `990470f8…d42987d` | `239ef090…949c6a67` |
| `patty` | `1ffee654…526f2c2b` | `aa6246ab…a2ba9134` |
| `tomato` | `33f8f0d8…123f3239` | `c4c15108…641d9cb7` |
| `lettuce` | `60c69d6d…c904a439` | `30736eee…7259b902` |
| `onion` | `78cbe755…861be737` | `bf1bcca9…f1a9bb343` |
| `burger` | `f0cb37a8…b219106d` | `44771fc1…573b37aa` |
| `rocket` | `47610384…b62f7a2b` | `3008f0c4…d55833d02` |

Full-length hashes are in `IMPORT_AUDIT.json` and `OPTIMIZATION_REPORT.json`.

## Reproducing this

```
node tools/snow-burgers/inspect-assets.mjs      # audit the sources
node tools/snow-burgers/optimize-assets.mjs     # produce the runtime GLBs
node tools/snow-burgers/validate-assets.mjs     # validate and budget-check
```

The glTF-Transform SDK and its codecs are resolved from a global
`@gltf-transform/cli` install rather than added to this project's dependencies;
the pipeline is an authoring-machine concern and the shipped bundle must not
grow a dependency on it. `GLTF_TRANSFORM_ROOT` pins an exact copy. Tool versions
used for the numbers above are recorded in each generated JSON.

Blender is used only for QA renders, through `tools/snow-burgers/qa-render.py`.
No geometry is authored or edited in it, so the pipeline has no manual step and
no undocumented export settings.
