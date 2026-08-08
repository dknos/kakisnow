# Snow-Burgers asset ledger

Audit date: 2026-08-07. This ledger separates the promoted procedural runtime
set from the preserved historical supplied inputs. Possession of a GLB is
never treated as permission to redistribute it.

## Release gate summary

| Set | Runtime use | Provenance status | Count |
| --- | --- | --- | ---: |
| KAKISNOW procedural Snow-Burgers GLBs (5 ingredients, burger, rocket chair) | current `public/assets/models/snow-burgers/` | promoted local generation; conditional output basis recorded | 7 |
| KAKISNOW procedural camp/dressing GLBs (firs, pine, bush, rock, hut, village) | current `public/assets/models/snow-burgers/` | promoted local generation; conditional output basis recorded | 6 |
| Big Air venue GLBs | current `public/assets/models/big-air/` | CC BY 4.0, notice shipped | 7 |
| Historical supplied Snow-Burgers/camp GLBs | not runtime; preserved in ignored source archive | unresolved historical inputs | 13 |

The current runtime therefore has **0 unresolved historical supplied-model provenance records in active runtime**. The
13 active files were promoted on 2026-08-07 from the exact-byte candidate set
under `art/generated-assets/snow-burgers/` after independent visual/runtime
approval. Every row below was built by
`tools/snow-burgers/generate-original-assets.py` in Blender 5.1.1 from local
procedural geometry in an owner-directed AI-assisted Codex session. No model,
texture, or network input was imported. The generator source, exact hashes,
validator output, and runtime captures remain linked for review.

The conditional output basis is documented rather than overstated: the
[OpenAI Terms of Use](https://openai.com/policies/terms-of-use/) say that, as
between OpenAI and the user, the user owns Output, subject to input rights and
non-uniqueness; the [OpenAI Service Terms](https://openai.com/policies/service-terms/)
warn that code-generation output may be subject to third-party licenses. This
ledger does not assert copyrightability, exclusivity, or blanket commercial
clearance. The no-import procedural pipelines and the clean hero source below
are recorded without asserting copyrightability or exclusivity. Physical
controller/touch, human audio/colour, and exact target-GPU review remain
product gates; no runtime asset rights blocker is asserted for the clean local
hero source.

The machine-readable [expected runtime manifest](art/generated-assets/snow-burgers/RUNTIME_MANIFEST.json)
is the release contract for dynamically assembled ingredient, rocket-chair,
camp, dressing, Big Air venue, hero, UI and social-preview files. It is checked
for exact runtime/source bytes and SHA-256 values by `npm run validate:assets`;
the prose tables below are an audit companion, not a substitute for that
strict file inventory.

## Current runtime supplied files — promoted procedural replacements

These are the 13 files loaded by the current build. Each source/runtime hash
below is exact and matches the corresponding candidate file. The runtime path
is `public/assets/models/snow-burgers/<filename>`; the historical supplied
inputs remain preserved separately and are no longer runtime assets.

| Runtime file | Title / role, runtime path and usage | Source/runtime SHA-256 | Rights basis | Modifications / inputs |
| --- | --- | --- | --- | --- |
| `ingredient-cheese.glb` | Folded cheese slice / pickup; `public/assets/models/snow-burgers/ingredient-cheese.glb` | `922fd39cdef8a7f89daed00c490b984033da780fb4e058f163916457820e7f34` | Conditional local output basis; no external inputs; no blanket clearance | Blender procedural slice with fold/drape; no model or texture input |
| `ingredient-patty.glb` | Grill-marked patty / pickup; `public/assets/models/snow-burgers/ingredient-patty.glb` | `4cf0e095afe99be10877050744a8b3a6f68ea51604c0dd9fa696fd0bab1be4f3` | Conditional local output basis; no external inputs; no blanket clearance | Solid patty with recessed dark grooves; no model or texture input |
| `ingredient-tomato.glb` | Calyx tomato / pickup; `public/assets/models/snow-burgers/ingredient-tomato.glb` | `214e9f04a0b202c8d1caa087eff423cd7f368c2ebd4586fbfd9a55ea5df729a7` | Conditional local output basis; no external inputs; no blanket clearance | Authored flesh, calyx, and seed cues; deterministic seed topology; no model or texture input |
| `ingredient-lettuce.glb` | Layered lettuce / pickup; `public/assets/models/snow-burgers/ingredient-lettuce.glb` | `4afc9e8a5d9b7e371027cbed6fa8c93cc440882c041d803c8ffadff9633529dd` | Conditional local output basis; no external inputs; no blanket clearance | Organic ruffle layers; no model or texture input |
| `ingredient-onion.glb` | Purple onion rings / pickup; `public/assets/models/snow-burgers/ingredient-onion.glb` | `64d95a71c067768d4908b5adecdfade954691bd939da71d910dbad3d84b5dc57` | Conditional local output basis; no external inputs; no blanket clearance | Authored low-poly rings; no model or texture input |
| `burger-complete.glb` | Completed burger / served order; `public/assets/models/snow-burgers/burger-complete.glb` | `09153f6dd812cb64fb2f4df7f6afafd00c6a040f436d7e250e7062dde96d7916` | Conditional local output basis; no external inputs; no blanket clearance | Authored stack, ruffles, rings, bun seeds; merged material primitives; no model or texture input |
| `rocket-chair-snowboard.glb` | Rocket-chair snowboard / vehicle; `public/assets/models/snow-burgers/rocket-chair-snowboard.glb` | `4e785130663ec63c650713abfa99703edfb989798196f82a92488561bfe85b0c` | Conditional local output basis; no external inputs; no blanket clearance | Authored board, seat, booster, fins, vents, and runtime anchors; no model or texture input |
| `dressing-firs.glb` | Tiered fir set / forest dressing pool; `public/assets/models/snow-burgers/dressing-firs.glb` | `4bc715a32b3e0b5aa1bdb15112693b8c3c0ebd4b042e15c8fcf39be3ee83c5c5` | Conditional local output basis; no external inputs; no blanket clearance | Three authored branch variants; merged runtime dressing; no model or texture input |
| `dressing-pine.glb` | Hero pine / forest dressing; `public/assets/models/snow-burgers/dressing-pine.glb` | `6b46cfd353c069e5c00803604e5b466a89580f7167a1dd62e96541a11e988ec0` | Conditional local output basis; no external inputs; no blanket clearance | Tiered authored silhouette; no model or texture input |
| `dressing-bush.glb` | Clustered bush / shrub dressing pool; `public/assets/models/snow-burgers/dressing-bush.glb` | `77a95b10cb0b823ee5e65aa9e502c7b8ffee8591bacae03c35c6d4d53b4b21a5` | Conditional local output basis; no external inputs; no blanket clearance | Authored clustered shrub and snow caps; no model or texture input |
| `dressing-rock.glb` | Faceted rock cluster / rock dressing pool; `public/assets/models/snow-burgers/dressing-rock.glb` | `258a52840761d4d962de127ed11e228ad17875d52c9866a17d0df15bfcdc2487` | Conditional local output basis; no external inputs; no blanket clearance | Authored faceted rock cluster; no model or texture input |
| `camp-hut.glb` | Burger Base Camp service hut / finish lodge; `public/assets/models/snow-burgers/camp-hut.glb` | `13503088e65fd173a39ea803f1156f4ec4bf00fc474faacb48888970fc6d59ce` | Conditional local output basis; no external inputs; no blanket clearance | Warm hatch, counter, awning, order board, grill/flue, roof and snow grounding; no model or texture input |
| `camp-village.glb` | Grouped alpine village / distant camp; `public/assets/models/snow-burgers/camp-village.glb` | `ad945fcf157e9157b98e8b08ce339b751bff048b8975754720bb27f58ffa3230` | Conditional local output basis; no external inputs; no blanket clearance | Three merged lodge silhouettes and firs; no model or texture input |

## Original replacement candidate — promoted 2026-08-07 source and audit manifest

Generator: `tools/snow-burgers/generate-original-assets.py` (Blender 5.1.1,
factory startup, no imported source files). The source was created in an
owner-directed AI-assisted Codex session. These exact candidate files were
promoted byte-for-byte into the runtime on 2026-08-07. Validation:
`tools/snow-burgers/validate-original-assets.mjs`, with the machine-readable
result in `art/generated-assets/snow-burgers/VALIDATION.json`.
Two-run exact-byte proof: `art/generated-assets/snow-burgers/REPRODUCIBILITY.md`.

| Candidate file | Role | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `ingredient-cheese.glb` | pickup | 4,732 | `922fd39cdef8a7f89daed00c490b984033da780fb4e058f163916457820e7f34` |
| `ingredient-patty.glb` | pickup | 33,248 | `4cf0e095afe99be10877050744a8b3a6f68ea51604c0dd9fa696fd0bab1be4f3` |
| `ingredient-tomato.glb` | pickup | 45,104 | `214e9f04a0b202c8d1caa087eff423cd7f368c2ebd4586fbfd9a55ea5df729a7` |
| `ingredient-lettuce.glb` | pickup | 24,984 | `4afc9e8a5d9b7e371027cbed6fa8c93cc440882c041d803c8ffadff9633529dd` |
| `ingredient-onion.glb` | pickup | 31,304 | `64d95a71c067768d4908b5adecdfade954691bd939da71d910dbad3d84b5dc57` |
| `burger-complete.glb` | served order | 146,504 | `09153f6dd812cb64fb2f4df7f6afafd00c6a040f436d7e250e7062dde96d7916` |
| `rocket-chair-snowboard.glb` | vehicle | 83,892 | `4e785130663ec63c650713abfa99703edfb989798196f82a92488561bfe85b0c` |
| `dressing-firs.glb` | forest pool | 92,872 | `4bc715a32b3e0b5aa1bdb15112693b8c3c0ebd4b042e15c8fcf39be3ee83c5c5` |
| `dressing-pine.glb` | hero pine | 34,544 | `6b46cfd353c069e5c00803604e5b466a89580f7167a1dd62e96541a11e988ec0` |
| `dressing-bush.glb` | shrub pool | 47,484 | `77a95b10cb0b823ee5e65aa9e502c7b8ffee8591bacae03c35c6d4d53b4b21a5` |
| `dressing-rock.glb` | rock pool | 9,048 | `258a52840761d4d962de127ed11e228ad17875d52c9866a17d0df15bfcdc2487` |
| `camp-hut.glb` | finish lodge | 356,020 | `13503088e65fd173a39ea803f1156f4ec4bf00fc474faacb48888970fc6d59ce` |
| `camp-village.glb` | distant camp | 1,101,216 | `ad945fcf157e9157b98e8b08ce339b751bff048b8975754720bb27f58ffa3230` |

Total candidate size: 2,010,952 bytes. The table and total are cross-checked
by `tools/validate-release.mjs` against the generated
`art/generated-assets/snow-burgers/VALIDATION.json`; `validate-original-assets.mjs`
also regenerates the measured optimization table from the same records. Every
candidate passed the Khronos validator with zero errors, has no external
resources, and has no animation or skin payload. The validator deliberately
records the conditional output basis rather than making a copyrightability,
exclusivity, or blanket commercial-license conclusion. Two clean Blender runs
produced byte-identical hashes after the exporter canonicalization pass, and
the rocket contract record includes measured deck, seat, backrest, cargo tray,
vent, length, and nozzle checks. The runtime promotion hash manifest is
`screenshots/final-gauntlet/assets/candidate/runtime-promoted/runtime-promoted-hashes.sha256`;
the full post-promotion runtime and Windows WebGPU evidence is in
`screenshots/final-gauntlet/assets/candidate/runtime-promoted/RUNTIME_PROMOTION_EVIDENCE.md`.

F4 revision notes: the focal hut now faces the piste with a dark framed serving
hatch, warm interior, deep counter, snow-topped awning, wordless order-board
chips, warm door/window hierarchy, grill/flue, oversized roof/ridge and snow
grounding. The same authored service language is grouped into the village
silhouettes. Tomato seed primitives use deliberately distinct sub-pixel
topology to prevent Blender's inconsistent index-accessor sharing; the
candidate remains visually equivalent while the all-13 exact-byte proof is
stable. The rocket's cargo tray still measures to the live profile's
`z=-0.320` anchor. The accepted onion, firs, pine, bush, and rock candidates
remain byte-identical to their prior hashes. The promoted runtime files remain
identical to the candidate hashes above; the historical supplied inputs remain
separate and preserved for audit only.

## Snow-Burgers social preview — AI-generated, review-gated

The title/social artwork is an AI-generated image-generation output, not a
gameplay capture and not a third-party licensed asset. The generation record
and prompt are retained in `art/generated-assets/2d/social-preview-generation.md`;
the tool did not expose a more specific model identifier. No ownership or
commercial-rights conclusion is asserted here; owner review and the applicable
tool terms remain controlling.

| File | Relationship | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `art/generated-assets/2d/social-preview-source-v1.png` | Original generated source retained for audit | 2,132,512 | `e778ce8591e5aecd52a15de7db0b2c52210b42f2eab42b513963e8ef167b26c4` |
| `art/generated-assets/2d/social-preview-source.png` | Narrow image-generation edit removing one isolated sky speck | 2,233,322 | `75cbc43e31ac5c831db211c91948190bdc1bae99f788e2043fd12634c123c237` |
| `public/assets/ui/snow-burgers/social-preview.webp` | Local FFmpeg 7.0.2 runtime/social derivative, 1200×630 | 111,080 | `f5c8582750dbe49cbd9f209f10c28ffa5066a28c2513ee7b492dffd005eb222e` |

The production WebP is derived from the edited source with the documented
scale/crop/WebP command. It contains no words, brands, watermarks, or external
asset input; disclosure is retained for release review.

## Historical supplied files — not runtime

These are the previously supplied runtime derivatives retained for audit and
recovery only. They are no longer loaded by the build after the 2026-08-07
promotion. Their source GLBs remain ignored in
`art/source-assets/snow-burgers/`; source metadata, hashes, and the old
optimization records remain in `IMPORT_AUDIT.json` and `OPTIMIZATION_REPORT.json`.
Possession is not permission to redistribute.

| Historical file (former runtime path) | Role | Historical runtime SHA-256 | Status |
| --- | --- | --- | --- |
| `ingredient-cheese.glb` | pickup | `239ef0903b1754207bb2a05dab150480fb873491727660d506b629a6949c6a67` | supplied derivative; preserved, not runtime |
| `ingredient-patty.glb` | pickup | `aa6246abd1e0125d36a59e68a158aff59334fe776030029a6674fd56a2ba9134` | supplied derivative; preserved, not runtime |
| `ingredient-tomato.glb` | pickup | `c4c15108f3759327bc0fb1abbb4fa2b69480abff0f074e9c775fcde9641d9cb7` | supplied derivative; preserved, not runtime |
| `ingredient-lettuce.glb` | pickup | `30736eeec0bfbd8b5c2757707493378f6a062c4f98f021a09d1261aa7259b902` | supplied derivative; preserved, not runtime |
| `ingredient-onion.glb` | pickup | `bf1bcca910abb78f778b13e73816a9adfee1868b3f1c7fab4fc8d48f1a9bb343` | supplied derivative; preserved, not runtime |
| `burger-complete.glb` | served order | `44771fc1e9169c617998d43893a12abb93f2f0209fe1fb02da4295a5573b37aa` | supplied derivative; preserved, not runtime |
| `rocket-chair-snowboard.glb` | vehicle | `3008f0c43ee74512a9fff6cee64cea5ded2cac026a9a417de866e47d55833d02` | supplied derivative; preserved, not runtime |
| `dressing-firs.glb` | forest pool | `a5616ac2a65e35505e0108173b4219982d8e28cf06d617ed706645a2f08ca378` | supplied derivative; preserved, not runtime |
| `dressing-pine.glb` | hero pine | `d8b855c4c124861fd504138a6b63c188fcd3c162ece0dd5a5ab72f721dde288a` | supplied derivative; preserved, not runtime |
| `dressing-bush.glb` | shrub pool | `5c04764eaf032d345e9b772206e3c9dd007282eb5dc95edf7cb0c64f9aa2559f` | supplied derivative; preserved, not runtime |
| `dressing-rock.glb` | rock pool | `295f13e604c06bdc3b048f425bc2a0bab9ef5b5ac7bcb6f6519d46f8652142ee` | supplied derivative; preserved, not runtime |
| `camp-hut.glb` | finish lodge | `2d37da8862e61495118bb7b519cb2f2f24898e87bc329f445f77cc39be5c4a7e` | supplied derivative; preserved, not runtime |
| `camp-village.glb` | distant camp | `b6abc870231fd85efff3d4570fe7de46c7d725623bd81be23f07412cbc801bf0` | supplied derivative; preserved, not runtime |

## RockerKaki — clean local procedural runtime source

RockerKaki is now a project-owned procedural source generated by
`tools/generate-rockerkaki.py` with Blender primitives and a repository-local
64×64 palette. It has no imported geometry, imported texture, network input,
background-removal service, or third-party model dependency. The structured
record is `art/generated-assets/rockerkaki/GENERATION_RECORD.json`; its source
and rig outputs are hash-locked below.

| Output | Bytes | SHA-256 | Runtime role |
| --- | ---: | --- | --- |
| `public/assets/models/rockerkaki.glb` | 366,316 | `c3a4c7325e86db85f43a8bc06694cc4621cec7a1acfb7ea8dbcb6dc01424b602` | default hero source |
| `public/assets/models/rockerkaki-rigged.glb` | 555,636 | `c300cb1a1b581ac07d7f0319a4c0902340ee4d64520294a1ec4ac82fcb658007` | runtime rig |
| `art/rockerkaki-source.blend` | 340,075 | `10a73d6a01a10fbd82132ca1605fe478aeb7c526bed2328522fd7314567b086d` | exact editable source; container bytes are not claimed deterministic |
| `art/rockerkaki-rig.blend` | 396,689 | `0cd42b7c301ccf756447b1db9b269259ccd02da9c075b005c00ffec07deb2d08` | exact editable rig; container bytes are not claimed deterministic |

The source mesh records one material, 12,928 triangles and 8,962 exported rig
vertices. The rig has one root control, nine deform bones and the
`RockerBreath` action. Blender structure/turntable review, real Windows
Chrome/WebGPU face review, and a full downhill traversal passed with zero
console or GPU validation errors at 60 FPS.

### Historical rejected source chain

The former Grok concept → remove.bg derivative → Tencent HY 3D Global chain is
retained as historical audit evidence only. Its old runtime derivatives are
not loaded by this build and remain rejected because the remove.bg account/plan
could not be verified for commercial redistribution. The clean local source
above supersedes that chain without silently erasing it. Details, old hashes,
and the source record remain in `ASSETS.md` and Git history.

## Big Air venue and shared dependencies

The Big Air venue models remain CC BY 4.0 and are attributed in
`public/THIRD_PARTY_NOTICES.txt`.  Babylon.js, Draco, the imported renderer,
Poly Haven archival inputs, and other dependencies remain governed by their
existing notices.  No new third-party dependency was introduced by the
candidate generator.
