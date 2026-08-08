# Asset and source provenance

This inventory covers non-code assets vendored under `public/assets/`. The
archival inventory was measured on 2026-07-28; the active Snow-Burgers runtime
inventory, derivatives, and hashes were refreshed on 2026-08-07. Source
licenses remain controlling; this document does not grant additional rights.

The current procedural renderer does not sample the retained Poly Haven HDRI,
Snow 02 scans, or generated mountain mattes. They remain vendored as archival
art-study inputs and are not deleted or relicensed. The active runtime loads
RockerKaki, the classic snowboard, the shared Draco decoder, the thirteen
procedural Snow-Burgers ingredient/burger/rocket-chair/camp/dressing models,
the Big Air venue models, and the Snow-Burgers UI images listed by
`art/generated-assets/snow-burgers/RUNTIME_MANIFEST.json`. RockerKaki is
initialized during loading as the default playable hero.

## Imported renderer source — MIT

The current KAKISNOW renderer includes a substantially adapted
MIT-licensed renderer foundation imported at commit
`545039733b74eec742862f161990142c7ca7c7ec`.

- Copyright: Copyright (c) 2026 Maksymilian Dendura.
- License: MIT.
- Exact license copy:
  `LICENSES/upstream-renderer-MIT.txt`.
- Distribution notice: `public/THIRD_PARTY_NOTICES.txt`.

This is source-code provenance rather than a claim that the upstream project
authored the separately inventoried KAKISNOW assets below. KAKISNOW is the
product-facing name throughout.

## Poly Haven textures — CC0, archival

Runtime status: retained but unused by the current procedural renderer.

Poly Haven publishes its assets under
[CC0 1.0](https://polyhaven.com/license), including commercial use and
redistribution without required attribution. Credit is retained here for
provenance.

### Approaching Storm HDRI

- Creator: Greg Zaal.
- Official asset page:
  [Approaching Storm](https://polyhaven.com/a/approaching_storm).
- Official 1K download:
  [`approaching_storm_1k.hdr`](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/approaching_storm_1k.hdr).
- Local file: `public/assets/textures/approaching_storm_1k.hdr`
- Size: 1,602,599 bytes.
- SHA-256:
  `916c1e15b924af1bd83e4ba359f163034759ee2f87bb1aa2702963bea7f64fef`
- MD5: `c14623ac2d16651c80546f8e77dd8917` (matches Poly Haven's
  official file record).

### Snow 02 material

- Creator: Rob Tuytel.
- Official asset page: [Snow 02](https://polyhaven.com/a/snow_02).
- License: [CC0 1.0](https://polyhaven.com/license).

| Map | Official 1K download | Local file | Bytes | SHA-256 | Official MD5 |
| --- | --- | --- | ---: | --- | --- |
| Diffuse/albedo | [`snow_02_diff_1k.jpg`](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/snow_02/snow_02_diff_1k.jpg) | `public/assets/textures/snow_02/snow_02_diff_1k.jpg` | 325,497 | `523a4e69c90b96d787dd69b897f29a2b3761a017024405c60aa630d1e8e9009a` | `fc54766c6b36ff298699115a619d440b` |
| OpenGL normal (+Y) | [`snow_02_nor_gl_1k.jpg`](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/snow_02/snow_02_nor_gl_1k.jpg) | `public/assets/textures/snow_02/snow_02_nor_gl_1k.jpg` | 1,081,858 | `9495ec680616b8340e2cbecbd151bff84c690cfad4209e90cc98d2d0ba81f810` | `f16b5701f9ad521cdd6af10c1d6d2b48` |
| Roughness | [`snow_02_rough_1k.jpg`](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/snow_02/snow_02_rough_1k.jpg) | `public/assets/textures/snow_02/snow_02_rough_1k.jpg` | 146,089 | `b6dea8039ac2a5beaed6fd41834fb55540cc76b492edd1d48ba2da2f30f1cb75` | `1dbae0269e53dbf80d4fd1c4335f25a2` |

## Project-generated mountain mattes — archival

Runtime status: retained but unused. The active renderer generates its distant
mountain field inside the custom WGSL sky and applies aerial perspective
procedurally.

These paintings were generated specifically for KAKISNOW with OpenAI's
built-in image-generation tool in new-image mode on 2026-07-28; they are not
third-party downloads. The far prompt requested an ultra-wide,
photorealistic winter alpine ridgeline with two depth layers, sharp geology,
low warm light from the left, cool shadows, and a uniform green key
background. The final near prompt requested a low continuous alpine
foothill chain with sloped snow shoulders, pointed crags, diagonal gullies,
and an explicit ban on mesas, plateaus, horizontal shelves, straight cliffs,
and rectangular ends. Both prompts excluded trees, buildings, people, and
text.

The generated green backgrounds were keyed offline with FFmpeg `chromakey`
and `despill`; the near alpha derivative was then mirrored once into a
seamless panorama. The preceding KAKISNOW renderer placed the near layer on a
1450-unit-diameter cylinder and the far layer on a 2100-unit-diameter
cylinder. The files are not fetched or decoded by the current renderer.

| Local file | Role | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `public/assets/textures/mountains/winter-alpine-foothills-source.png` | Final generated near RGB source | 1,456,418 | `a3f3c308782d8d7d009cd49187625b4863b858fc9d46507807ad85190498b27b` |
| `public/assets/textures/mountains/winter-alpine-foothills-alpha.png` | Keyed and despilled near RGBA derivative | 1,490,222 | `12ae2dce046bd0a1e0f278133377292d46e53aa107cec628b7d87c71f9dccae6` |
| `public/assets/textures/mountains/winter-alpine-foothills-seamless.png` | Final mirrored near-field matte | 2,732,719 | `24d6d762df43af0058f71d68d4745908a1247eeed1bafb8d1539a835b0167350` |
| `public/assets/textures/mountains/winter-ridgeline-source.png` | Generated far RGB source | 2,146,599 | `2ca5cb9681a180d5cdd8eaeb9509245e5acb00bc43726266abc784ced37abeb3` |
| `public/assets/textures/mountains/winter-ridgeline-alpha-v2.png` | Final far-field, edge-contracted matte | 1,890,790 | `217a440de8b559ee2999e47f035f45bbf8ffdcf076edb9a0ca72e4584b515788` |

## RockerKaki character

Status: active project-owned procedural runtime source. RockerKaki remains the
default playable hero and the procedural Snowbound figure remains selectable.
The release runtime now uses a clean local replacement made from Blender
primitives and a repository-local 64×64 palette. The source has no imported
geometry, imported texture, network input, background-removal service, or
third-party model dependency.

The reproducible source is `tools/generate-rockerkaki.py`, run with Blender
5.1.1 using:

```text
blender --background --factory-startup --python tools/generate-rockerkaki.py
```

The generation record is
`art/generated-assets/rockerkaki/GENERATION_RECORD.json`. It records the
palette, source/rig outputs, exact byte counts and hashes, identity notes, and
explicitly empty external-input arrays. The source mesh has one material,
12,928 triangles, 8,962 exported rig vertices, and the recognizable RockerKaki
silhouette: large chibi head, violet/white hair, small horns, dark alpine
outfit, seated boots, and electric guitar.

| Runtime/source | Path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Source GLB | `public/assets/models/rockerkaki.glb` | 366,316 | `c3a4c7325e86db85f43a8bc06694cc4621cec7a1acfb7ea8dbcb6dc01424b602` |
| Rigged GLB | `public/assets/models/rockerkaki-rigged.glb` | 555,636 | `c300cb1a1b581ac07d7f0319a4c0902340ee4d64520294a1ec4ac82fcb658007` |
| Source blend | `art/rockerkaki-source.blend` | 340,075 | `10a73d6a01a10fbd82132ca1605fe478aeb7c526bed2328522fd7314567b086d` |
| Editable rig blend | `art/rockerkaki-rig.blend` | 396,689 | `0cd42b7c301ccf756447b1db9b269259ccd02da9c075b005c00ffec07deb2d08` |
| Palette | `art/generated-assets/rockerkaki/rockerkaki-palette.png` | 248 | `83a80a58ac2f0e34af5537ec6cd577cb5191fda14938eebec5748b0807fd63d7` |

The rigging pass is reproducible with
`blender --background --factory-startup --python tools/rig-rockerkaki.py`.
The rig contains one root control and nine deform bones, with the
`RockerBreath` action. `tools/validate-rockerkaki-rig.py` is the headless
acceptance check. The source is intentionally held in its authored rigid pose
at runtime because the mesh is made from many disconnected surface islands;
ride, carve, jump and landing motion is applied to the complete model so its
face, hair and guitar remain intact through the custom beauty, depth, prepass
and shadow WGSL paths.

The clean replacement passed Blender structure/turntable review, real Windows
Chrome/WebGPU face review, and a full downhill traversal with zero console or
GPU validation errors at 60 FPS. Those checks establish runtime and source
integrity; they do not replace physical-controller, touch-device, human audio,
human colour-vision, or exact target-GPU review.

Two clean Blender 5.1.1 processes produced byte-identical source and rigged
GLBs after canonicalization. Blender's editable `.blend` container metadata is
not claimed byte-deterministic; the table and generation record identify the
exact editable files carried by this release candidate.

### Historical rejected source chain

The former source chain was recovered from browser history, Windows origin
metadata, embedded image metadata, texture comparison, and project Git
history. It is retained for audit only and is not runtime:

1. Grok concept image
   `grok-image-433071f4-1f4b-4b90-a03e-79199adf1239.png`
   (SHA-256 prefix `f860549d`), retaining Grok post ID
   `433071f4-1f4b-4b90-a03e-79199adf1239`.
2. A matching remove.bg derivative (SHA-256 prefix `541bdc25`).
3. Tencent HY 3D Global generation job
   `c8e7eb75-…`, which produced the 84,134,232-byte raw model
   `be4bc75d1891bf746570eb018aad5d36.glb`
   (SHA-256 prefix `c80b8661`).
4. Project optimization commit
   `52ee61982ce66b8c5ad3ab7cd0490c82115991c7`, followed by the
   40,000-triangle former runtime derivative.

- Original local source:
  `/home/nemoclaw/Kaki-Survivors-2/assets/breakroom/rockerkaki.glb`
  - Size: 2,079,928 bytes.
  - SHA-256:
    `8477227784ae7cf4f4683b4561be34b7d2f09c1d8e5dbca8b8acec0fe257c2ed`
- Audited runtime derivative:
  `/home/nemoclaw/Kaki-Survivors-2/assets/breakroom/runtime-avatars/rockerkaki.glb`
  - Size: 512,464 bytes.
  - SHA-256:
    `9fbf425a3d7afd2fb910acdc9faa25e7dc95cbc5b09b7288e7922073533948fe`
- Former shipped KAKISNOW copy (now rejected from runtime): `public/assets/models/rockerkaki.glb`
  - Size: 512,464 bytes.
  - SHA-256:
    `9fbf425a3d7afd2fb910acdc9faa25e7dc95cbc5b09b7288e7922073533948fe`
  - This is byte-identical to the audited runtime derivative.

The donor audit
`/home/nemoclaw/Kaki-Survivors-2/assets/breakroom/runtime-avatars/AVATAR_OPTIMIZATION.json`
records a Blender decimation and Draco-compression pass from 561,393 to
40,000 triangles (92.87% reduction). The original GLB identifies only
`glTF-Transform v4.3.0` as generator; the runtime GLB identifies only
`Khronos glTF Blender I/O v5.1.19`. Inspection found no embedded author,
copyright, license, source URL, or provenance metadata in either file.

A fresh Blender 5.1.1 import audit of the source GLB found one Draco-decoded
mesh with 41,786 vertices and 120,000 indices, no armature, no actions, no
shape keys, and no existing modifiers. `tools/rig-rockerkaki.py` now creates
the authored derivative `art/rockerkaki-rig.blend` and exports
`public/assets/models/rockerkaki-rigged.glb`. The editable rig has one
non-deforming root control plus nine deform bones, deterministic spatial
weights capped at four influences per vertex, zero bone roll, and the
`RockerBreath` action. Because the source is built from 1,901 disconnected
surface islands, runtime holds those deform bones in their authored pose and
applies ride, carve, jump, and landing motion to the complete model. That keeps
the face and guitar intact through the custom beauty, depth, prepass, and shadow
WGSL paths. `tools/validate-rockerkaki-rig.py` is the headless Blender
acceptance check.

The historical reproducible derivative hashes are retained for audit only:

- Source GLB: `9fbf425a3d7afd2fb910acdc9faa25e7dc95cbc5b09b7288e7922073533948fe`
- Rigged GLB: `70e9e944297398013ec65d31af9b1f082b5eb9a3b9e632ac8361961033393d7c`
- Editable BLEND: `c839dc7d3eb1f051b1eb3bfc7ebcc20a3f94245c8e0aa4d3f19c0febbd87201a`

The historical chain's applicable
[xAI terms](https://x.ai/legal/terms-of-service/previous-2026-04-10)
state that users retain ownership of inputs and outputs and request attribution.
The applicable
[Tencent HY 3D terms](https://docs.qq.com/doc/DSHRnRWp2YUVuQXJv)
assign Tencent's output rights to the user subject to input rights and require
AI disclosure. The remove.bg account/plan used in the chain could not be
recovered; its
[commercial-use policy](https://www.remove.bg/help/a/can-i-use-remove-bg-for-commercial-purposes)
limits free/no-account outputs to noncommercial use. That chain was rejected
from the active build; the clean local procedural source above contains no
remove.bg output. Do not describe the historical chain as cleared or extract
either chain as a generally licensed standalone asset.

## Snowboard — CC BY 4.0, runtime

Status: third-party download, redistributed under a licence that permits it.

This is the board RockerKaki sits on. Unlike RockerKaki itself, it carries no
redistribution caveat: CC BY 4.0 grants commercial use, modification, and
redistribution, and asks only for credit and an indication of changes. Both are
given in `public/THIRD_PARTY_NOTICES.txt`, which ships with the production
build.

Provenance was not reconstructed. The glTF carries it in `asset.extras`, written
by Sketchfab's exporter, and the fields below are copied from the shipped file
rather than inferred:

- Title: "Intermediate Advanced Snowboard".
- Author: Final Render Animation Studio
  ([sketchfab.com/cleowillo](https://sketchfab.com/cleowillo)).
- Source:
  [Sketchfab model `267e04a0…`](https://sketchfab.com/3d-models/intermediate-advanced-snowboard-267e04a025434d7d8587ec2ee60ad62e).
- License: [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/).
- Generator: `Sketchfab-12.66.0`.

| Local file | Bytes | SHA-256 |
| --- | ---: | --- |
| `public/assets/models/snowboard.glb` | 1,884,020 | `8c5b2781afbbeea9103678b089e5ff7b4fa14d589824a4f06ff08e017b62efc0` |

The distributed file is byte-identical to the download; no geometry, texture, or
UV data was altered. What the runtime does to it is transform and shading only:
the mesh is re-centred, grounded on its own contact points rather than its
bounding box, and re-shaded by the application's `rocker` WGSL material instead
of its authored `KHR_materials_pbrSpecularGlossiness` one.

Measured contents, 1,664 triangles and 906 vertices in one primitive:

- Authored at real-world scale — 2.524 m tip to tail, 0.533 m at the widest
  point, 0.382 m at the waist, 0.076 m thick.
- Cambered: the base at the waist stands 0.025 m above its two contact patches,
  and the effective edge between them is 2.04 m, or 81% of the length.
- `POSITION`, `NORMAL`, `TANGENT`, `TEXCOORD_0`; three 1024² PNG maps (diffuse,
  specular-glossiness, normal).

Those measurements are not decoration. `src/character/boardSpec.js` is their
single record, and both the visual placement and the trench the board cuts are
derived from it, so the groove is the board's own footprint rather than a shape
chosen to look right.

The runtime scales the asset by `S.boardScale`, which ships at 1.18 — a 2.98 m
board under a 2.58 m chibi, where the authored 2.52 m read short against her
width. The proportions above are the mesh's own at unit scale; every one of them
and the trench derived from them move together with that setting.

## Draco decoder runtime

These files are vendored byte-for-byte from
`@babylonjs/core` version `9.18.1`, under
`node_modules/@babylonjs/core/assets/Draco/`:

| Local file | Bytes | SHA-256 |
| --- | ---: | --- |
| `public/assets/decoders/draco_wasm_wrapper_gltf.js` | 58,569 | `81f4b0efec08cdc233595c5a35a45c4591611b23aa15882f3a0c648af2d2bf49` |
| `public/assets/decoders/draco_decoder_gltf.wasm` | 192,420 | `a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac` |
| `public/assets/decoders/draco_decoder_gltf.js` | 512,600 | `7708de68a2a2476befe1d5c19fa750a1911ae9c8d90ed2dcf116887a30b7ff7f` |

Babylon Core's package metadata licenses Babylon.js under
[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). Its
`NOTICE.md` identifies the bundled decoder as
[Google Draco Compression v1.5.6](https://github.com/google/draco/tree/1.5.6),
also licensed under Apache 2.0. The installed package includes the applicable
license text at
`node_modules/@babylonjs/core/assets/Draco/draco.license`. Redistributed
release packages must retain/provide the Apache 2.0 license and applicable
notices. The production build includes the combined notice and license text as
`THIRD_PARTY_NOTICES.txt`. The decoder is initialized during loading so the
default RockerKaki model can be displayed without a runtime network fetch.

## Historical supplied Snow-Burgers game assets — not runtime

Seven GLBs supplied by the project owner from a local `Downloads` folder on
2026-08-05: five ingredients, the completed burger, and the rocket chair
snowboard. These were the former pickups, reward, and second vehicle of the
Snow-Burgers game layer; they are preserved for audit only and are no longer
loaded by the runtime after the 2026-08-07 procedural replacement promotion.

**None of them carries a licence.** Every one reports `copyright: null` and an
empty `extras`; five have Sketchfab download signatures in their node names and
two are generated assets whose textures are dated 2025-09-01. Being supplied
locally establishes nothing about redistribution rights. These historical files
are not part of the active release asset set; the active replacements and their
conditional output basis are recorded below and in `ASSET_LEDGER.md`.

Source files are preserved on the authoring machine at
`art/source-assets/snow-burgers/*-source.glb` and excluded from version
control — 176 MB of binaries would be permanent in the history of a repository
that publishes to GitHub Pages. Their byte counts and SHA-256 hashes are in
`art/source-assets/snow-burgers/IMPORT_AUDIT.json`, so a future copy can be
verified as the file this pipeline measured.

| Runtime file (`public/assets/models/snow-burgers/`) | Bytes | Source bytes | Source SHA-256 |
| --- | ---: | ---: | --- |
| `ingredient-cheese.glb` | 18,404 | 144,548 | `990470f82f79e53e246a82960fc462d101124e2044270608dcdaa9a0ed42987d` |
| `ingredient-patty.glb` | 213,024 | 2,380,180 | `1ffee654a21562a05d818506c7656e1620ae779fee292292c4138a8d526f2c2b` |
| `ingredient-tomato.glb` | 79,668 | 582,620 | `33f8f0d8e32f1552840e1fada383a3be5a1029efd6cb5d3a13425b83123f3239` |
| `ingredient-lettuce.glb` | 16,604 | 85,820 | `60c69d6dedb3e19c211ce55f59d434a4293f7e0b6ef6c5a02071dc18c904a439` |
| `ingredient-onion.glb` | 596,544 | 2,765,904 | `78cbe755be20419aee503cc1b03cf659d0ab0d52f4cace66fc48b8ca861be737` |
| `burger-complete.glb` | 1,569,000 | 93,547,332 | `f0cb37a809cd2f779ce64e2c140520a1b02fce34dc09f4d9c1625802b219106d` |
| `rocket-chair-snowboard.glb` | 976,300 | 76,827,712 | `476103841d2255db87bd37d4c3473e14678a944144802665827eaaa4b62f7a2b` |

Each runtime file is a derivative, not a copy: transforms baked into geometry,
uniform rescale to a game-world size, pivot moved to the footprint centre at
ground level, specular-glossiness converted to metallic-roughness, unused
attributes stripped, textures resampled and re-encoded WebP, geometry
Draco-compressed. The burger and the rocket chair are additionally decimated
from 1,500,000 triangles to 220,000 and 160,000.

What was done to each file, why, and the rendered before/after evidence for the
decimation are in `art/source-assets/snow-burgers/OPTIMIZATION_REPORT.md`.
Runtime SHA-256 hashes are in `OPTIMIZATION_REPORT.json`; validator results are
in `VALIDATION.json`.

## Historical supplied camp and dressing derivatives — not runtime

Six former runtime GLBs produced by `tools/snow-burgers/optimize-dressing.mjs` from
supplied sources at `art/source-assets/snow-burgers/` (bush/fir-set/hut/pine/
rock/village-source.glb, preserved locally, excluded from git like the seven
ingredient sources). **Provenance: unresolved historical inputs** — these are
not the files loaded by the current build. The active camp/dressing replacements
are the promoted procedural GLBs documented below.

| Runtime file | Bytes | SHA-256 (first 16) | Used by |
| --- | ---: | --- | --- |
| `camp-hut.glb` | 969,572 | `2d37da8862e61495` | base camp lodges (two placements) |
| `camp-village.glb` | 199,644 | `b6abc870231fd85e` | village below the finish |
| `dressing-bush.glb` | 585,108 | `5c04764eaf032d34` | shrub dressing pool |
| `dressing-firs.glb` | 50,032 | `a5616ac2a65e3550` | conifer/bent dressing pool |
| `dressing-pine.glb` | 40,816 | `d8b855c4c124861f` | hero pine variant |
| `dressing-rock.glb` | 407,980 | `295f13e604c06bdc` | rock dressing pool |

Transforms applied: Draco compression, WebP textures, decimation per
`optimize-dressing.mjs` job table. Note for future biome art: that tool lacks
the specular-glossiness conversion `optimize-assets.mjs` performs — a
spec-gloss source run through it will light as raw metal (the tomato trap).
Everything the expansion itself added — rails, ice sheets, snowcats, tapes,
camp primitives — is procedural geometry with no external source, and every
sound remains synthesised at runtime.

## KAKISNOW original replacement set — promoted 2026-08-07

To resolve the rights gap without relying on the supplied files,
`tools/snow-burgers/generate-original-assets.py` builds all thirteen central
and camp/dressing replacement GLBs from Blender primitives and mesh code. It
imports no source asset and embeds no external texture. The generator was
created in an owner-directed AI-assisted Codex session. The independent
critic-approved exact files were promoted into the active runtime on
2026-08-07; `art/generated-assets/snow-burgers/` remains the reproducible source
directory and `public/assets/models/snow-burgers/` is the exact runtime copy.

The conditional output basis is documented in `ASSET_LEDGER.md`: the
[OpenAI Terms of Use](https://openai.com/policies/terms-of-use/) describe user
ownership of Output as between OpenAI and user, subject to input rights and
non-uniqueness; the [OpenAI Service Terms](https://openai.com/policies/service-terms/)
warn that code-generation output may be subject to third-party licenses. This
record does not assert copyrightability, exclusivity, or blanket commercial
clearance. No model, texture, or network input entered the local generator.

- Candidate source: `tools/snow-burgers/generate-original-assets.py`.
- Candidate validation: `tools/snow-burgers/validate-original-assets.mjs`.
- Candidate manifest/hashes: `art/generated-assets/snow-burgers/VALIDATION.json`.
- Neutral turntable QA: `screenshots/final-gauntlet/assets/candidate/qa-round4-final/all-assets-contact-sheet.png` (four reviewed views for all 13 promoted GLBs).
- Pre-promotion measurements and hash proof: `screenshots/final-gauntlet/assets/candidate/runtime-round4/RUNTIME_EVIDENCE.md` and `HASH_PROOF.md`; high-volume raw frames remain local evidence rather than release-package weight.
- Post-promotion runtime hashes: `screenshots/final-gauntlet/assets/candidate/runtime-promoted-hashes.sha256`.
- Runtime status: all 13 active paths match the generated source hashes exactly;
  no external inputs are embedded.
- Rights statement: the no-import process and conditional OpenAI output basis
  are documented without a copyrightability, exclusivity, or blanket
  commercial-clearance conclusion. The clean local RockerKaki source is
  separately hash-locked above; the former remove.bg chain is rejected
  non-runtime history.

The former supplied GLBs remain preserved and untouched as historical audit
inputs. Runtime validation, WebGPU captures, and the exact promoted hashes are
required evidence for this replacement set.

## Snow-Burgers social preview — AI-generated and rights-review gated

`public/assets/ui/snow-burgers/social-preview.webp` is an AI-generated product
artwork derivative, not a gameplay capture or a third-party licensed image.
The built-in image-generation tool did not expose a more specific model
identifier. The source, narrow edit, prompt, and local derivative command are
retained in `art/generated-assets/2d/social-preview-generation.md`. This record
does not assert project ownership or commercial rights; owner review and the
applicable generation-tool terms remain controlling.

| File | Relationship | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| `art/generated-assets/2d/social-preview-source-v1.png` | Original generated source retained for audit | 1672×941 | 2,132,512 | `e778ce8591e5aecd52a15de7db0b2c52210b42f2eab42b513963e8ef167b26c4` |
| `art/generated-assets/2d/social-preview-source.png` | Image-generation edit removing one isolated sky speck | 1672×941 | 2,233,322 | `75cbc43e31ac5c831db211c91948190bdc1bae99f788e2043fd12634c123c237` |
| `public/assets/ui/snow-burgers/social-preview.webp` | Locally encoded runtime/social derivative | 1200×630 | 111,080 | `f5c8582750dbe49cbd9f209f10c28ffa5066a28c2513ee7b492dffd005eb222e` |

The local derivative was encoded from the edited source with FFmpeg 7.0.2
using the command retained in the generation record. It uses no network input,
brand, watermark, or external asset; disclosure remains part of the release
package.

## Big Air Basin venue — CC BY 4.0, runtime

The built things around the jumping hill: grandstands up both bowl walls,
course flags, wind sleeves, the start gantry, floodlight heads, the judges'
tower and a lift line. Pulled from Sketchfab through
`tools/big-air/sketchfab.mjs`, which records bytes and SHA-256 **at download
time** into `art/source-assets/big-air/meta/<uid>.json` — provenance recorded
when it is known rather than reconstructed later, which is the failure this
file already documents seven times over.

Every one of these is **CC Attribution (CC BY 4.0)**, which is a licence this
project can satisfy: attribution is carried here and in
`public/THIRD_PARTY_NOTICES.txt`. None is unresolved.

### Sources — `art/source-assets/big-air/` (excluded from git)

| Source file | Model | Author | Licence | Bytes | SHA-256 |
| --- | --- | --- | --- | ---: | --- |
| `bleacher.glb` | [Sports Bleachers](https://sketchfab.com/3d-models/sports-bleachers-10a22c724d1a4083bab2d64cdbac6f01) | [justice2free](https://sketchfab.com/justice2free) | CC Attribution | 36064 | `ada1565e976b8064f065d2b74217fa196930bc9743bf91566a95828ae4420bfc` |
| `chairlift.glb` | [Chairlift from Poly by Google](https://sketchfab.com/3d-models/chairlift-from-poly-by-google-bd3647efca8f46ebb9b2d1e48571c974) | [IronEqual](https://sketchfab.com/ie-niels) | CC Attribution | 64364 | `8e16f898c30d7eeb57ba8d829f6ace19332194dfc116920f214df907087af94f` |
| `flag.glb` | [Low Poly Red Flag - Wooden Pole Banner](https://sketchfab.com/3d-models/low-poly-red-flag-wooden-pole-banner-8d52d2408ef84046bc0a0f6102ec41be) | [marishka1611](https://sketchfab.com/marishka1611) | CC Attribution | 21688 | `a8ac71da99624af18141bbf31b132f261bd199473fc473fff0bed257d1435947` |
| `floodlight.glb` | [Floodlight](https://sketchfab.com/3d-models/floodlight-bfc9a3305fd344679d3d88a3a9a26e04) | [Dreadler](https://sketchfab.com/Dreadler) | CC Attribution | 406340 | `9c3b79c38b7261cb567ec385c607a7387da3a23deadbf01fb14d4a6574c218f6` |
| `scaffold.glb` | [Steel Scaffolding Structure](https://sketchfab.com/3d-models/steel-scaffolding-structure-d3a5fd33af2a46ada3f1b59fc0ac4584) | [MR.AnyCAD](https://sketchfab.com/MRAnyCAD) | CC Attribution | 1103940 | `b22312a41d16361bc38a69093fe8d341fbf76ec69165d135358679b5e09ef3cf` |
| `watchtower.glb` | [Wooden Watchtower](https://sketchfab.com/3d-models/wooden-watchtower-6ae46294301a480c8c6d4968ec2cdb76) | [MaX3Dd](https://sketchfab.com/MaX3Dd) | CC Attribution | 2539868 | `a6ea48d4fe87589b69f72ea4930690127aaa2e8f17ebca1a252a2b72909407aa` |
| `windsock.glb` | [Wind sleeve](https://sketchfab.com/3d-models/wind-sleeve-3b99ba8bd6c6481687dcc95f2f861e42) | [mira9](https://sketchfab.com/mira9) | CC Attribution | 450296 | `edef2131e525fd676fd57bbdc46d59365f29c39a3c3b3f5e9a054f3998d59119` |

### Runtime derivatives — `public/assets/models/big-air/`

Produced by `tools/big-air/optimize-venue.mjs`: specular-glossiness converted
to metallic-roughness offline, TANGENT and TEXCOORD_1 stripped, node
transforms baked, decimated per the job table, WebP textures, Draco.

| Runtime file | Bytes | SHA-256 (first 16) |
| --- | ---: | --- |
| `venue-bleacher.glb` | 3,000 | `4bdcc241983f8b9a` |
| `venue-chairlift.glb` | 7,140 | `6c6e1118680fadc4` |
| `venue-flag.glb` | 5,620 | `ce684410aac30f95` |
| `venue-floodlight.glb` | 17,412 | `c4e0a7235cede780` |
| `venue-judges.glb` | 118,172 | `f50466384995cbc2` |
| `venue-scaffold.glb` | 44,432 | `c782024f820f1a03` |
| `venue-windsock.glb` | 24,440 | `1cfd4fb683dbb3bc` |

A Blender QA render of each is in `screenshots/big-air/asset-qa/` — one
angle per prop, which is what the licence evidence needs; the four-angle
turntables `tools/snow-burgers/qa-render.py` produces are reproducible and were
not worth 18 MB of permanent git history.

### One model was pulled and deleted

Sketchfab `fc6fd6cf871b48bfab0d81741e0cb917`, an inflatable race arch, was
downloaded as a finish gate and then removed before it reached the runtime: its
texture carries real third-party trademarks (KMC Wheels, Rockstar, "Best in the
Desert"). The model's own CC BY licence says nothing about those marks, and
shipping them in a published game is not a question the licence answers. The
camp keeps its primitive-built arch. Recorded here because a deletion nobody
wrote down is a decision that gets made again.
