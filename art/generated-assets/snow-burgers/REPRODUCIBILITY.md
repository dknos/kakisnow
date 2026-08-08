# Candidate reproducibility proof

Audit date: 2026-08-07. Two fresh Blender 5.1.1 `--factory-startup` runs were
written to separate temporary directories with the same generator source. The
sorted SHA-256 manifests were compared with `cmp`; all 13 rows matched byte
for byte across both clean temporary runs and the candidate directory. The
active runtime directory was not written. The final F4 proof paths were
`/tmp/sb-f4-proof2-a.zKaGJ5` and `/tmp/sb-f4-proof2-b.vDIqcn`.

Command shape:

```sh
blender --background --factory-startup \
  --python tools/snow-burgers/generate-original-assets.py -- --out <run-a>
blender --background --factory-startup \
  --python tools/snow-burgers/generate-original-assets.py -- --out <run-b>
sha256sum <run-a>/*.glb | sed "s#<run-a>/##" > run-a.sha
sha256sum <run-b>/*.glb | sed "s#<run-b>/##" > run-b.sha
cmp run-a.sha run-b.sha
```

The generator's post-export canonicalizer sorts whole triangle records without
changing winding, rounds unused texture coordinates to six decimal places (five
for the rocket chair's exporter-boundary case), and emits sorted JSON keys with
fixed GLB padding. No texture is embedded, so the UV normalization cannot
affect runtime shading.

| Candidate | SHA-256 in both clean runs |
| --- | --- |
| `ingredient-cheese.glb` | `922fd39cdef8a7f89daed00c490b984033da780fb4e058f163916457820e7f34` |
| `ingredient-patty.glb` | `4cf0e095afe99be10877050744a8b3a6f68ea51604c0dd9fa696fd0bab1be4f3` |
| `ingredient-tomato.glb` | `214e9f04a0b202c8d1caa087eff423cd7f368c2ebd4586fbfd9a55ea5df729a7` |
| `ingredient-lettuce.glb` | `4afc9e8a5d9b7e371027cbed6fa8c93cc440882c041d803c8ffadff9633529dd` |
| `ingredient-onion.glb` | `64d95a71c067768d4908b5adecdfade954691bd939da71d910dbad3d84b5dc57` |
| `burger-complete.glb` | `09153f6dd812cb64fb2f4df7f6afafd00c6a040f436d7e250e7062dde96d7916` |
| `rocket-chair-snowboard.glb` | `4e785130663ec63c650713abfa99703edfb989798196f82a92488561bfe85b0c` |
| `dressing-firs.glb` | `4bc715a32b3e0b5aa1bdb15112693b8c3c0ebd4b042e15c8fcf39be3ee83c5c5` |
| `dressing-pine.glb` | `6b46cfd353c069e5c00803604e5b466a89580f7167a1dd62e96541a11e988ec0` |
| `dressing-bush.glb` | `77a95b10cb0b823ee5e65aa9e502c7b8ffee8591bacae03c35c6d4d53b4b21a5` |
| `dressing-rock.glb` | `258a52840761d4d962de127ed11e228ad17875d52c9866a17d0df15bfcdc2487` |
| `camp-hut.glb` | `13503088e65fd173a39ea803f1156f4ec4bf00fc474faacb48888970fc6d59ce` |
| `camp-village.glb` | `ad945fcf157e9157b98e8b08ce339b751bff048b8975754720bb27f58ffa3230` |

The tomato seeds use deterministic, sub-pixel topology differences to prevent
Blender from sharing one identical index accessor in only one clean process;
the visible seed cues remain unchanged. This proves generator output
reproducibility, not runtime visual approval or commercial rights. Those
remain separate gates.

The durable normalized manifest and checksum-isolated Windows Chrome runtime
evidence are in
`screenshots/final-gauntlet/assets/candidate/runtime-round4/HASH_PROOF.md` and
`RUNTIME_EVIDENCE.md`. The candidate GLBs were not copied into the shared
runtime during that capture.
