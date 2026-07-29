# Asset and source provenance

This inventory covers non-code assets vendored under `public/assets/`. Byte
counts and SHA-256 hashes were measured from the local files on 2026-07-28.
Source licenses remain controlling; this document does not grant additional
rights.

The current procedural renderer does not sample the retained Poly Haven HDRI,
Snow 02 scans, or generated mountain mattes. They remain vendored as archival
art-study inputs and are not deleted or relicensed. RockerKaki and its Draco
decoder are the only assets in this inventory loaded by the current runtime;
RockerKaki is initialized during loading as the default playable hero.

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

Status: project-owner-supplied, AI-generated runtime derivative. Created with
Grok Imagine and Tencent HY 3D Global. It is not CC0 and is not offered as a
standalone reusable asset. It is loaded as the default playable, unrigged hero;
the procedural Snowbound figure remains selectable.

The local source chain was recovered from browser history, Windows origin
metadata, embedded image metadata, texture comparison, and project Git
history:

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
   40,000-triangle runtime derivative used here.

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
- Shipped KAKISNOW copy: `public/assets/models/rockerkaki.glb`
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
`RockerBreath` action. At runtime eight joints respond to riding, carving,
jumping, and landing through the custom beauty, depth, prepass, and shadow WGSL
paths. `tools/validate-rockerkaki-rig.py` is the headless Blender acceptance
check.

The current reproducible derivative hashes are:

- Source GLB: `9fbf425a3d7afd2fb910acdc9faa25e7dc95cbc5b09b7288e7922073533948fe`
- Rigged GLB: `70e9e944297398013ec65d31af9b1f082b5eb9a3b9e632ac8361961033393d7c`
- Editable BLEND: `c839dc7d3eb1f051b1eb3bfc7ebcc20a3f94245c8e0aa4d3f19c0febbd87201a`

The applicable
[xAI terms](https://x.ai/legal/terms-of-service/previous-2026-04-10)
state that users retain ownership of inputs and outputs and request attribution.
The applicable
[Tencent HY 3D terms](https://docs.qq.com/doc/DSHRnRWp2YUVuQXJv)
assign Tencent's output rights to the user subject to input rights and require
AI disclosure. The remove.bg account/plan used in the chain could not be
recovered; its
[commercial-use policy](https://www.remove.bg/help/a/can-i-use-remove-bg-for-commercial-purposes)
limits free/no-account outputs to noncommercial use. Accordingly, this local
demo records the generator disclosure and keeps commercial redistribution
gated on confirming a qualifying remove.bg plan or replacing that uncertain
step. Do not describe RockerKaki as CC0 or extract it as a generally licensed
asset.

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
