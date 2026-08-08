# Snow-Burgers social preview generation record

Generated on 2026-08-07 with the OpenAI built-in image-generation tool. The
tool did not expose a more specific model identifier. This is AI-generated
product artwork; it is not a gameplay capture and must not be presented as
one.

## Inputs

- `screenshots/full-game/tricks/01-mid-spin.png` — RockerKaki and in-game snow
  rendering reference; SHA-256
  `29df887b273a1b033a3473b8a1fb443d790abfecaabef38fefe80bb37fd61458`.
- `screenshots/final-gauntlet/ui-builder-round2/1280x720-title.png` — product
  palette and interface-mood reference; SHA-256
  `1a198f5bb9f948aaf93cd447516ecc1513e6fa0eca3a7b4738c6586068391e48`.

No third-party image, commercial brand, named artist, celebrity, or other game
was supplied as a reference.

## Prompt

```text
Use case: stylized-concept
Asset type: Snow-Burgers social preview and credits/title artwork
Input images: Image 1 is the exact RockerKaki hero and in-game snow-rendering reference; Image 2 is the product palette and interface mood reference.
Primary request: Create original premium arcade-game key art for Snow-Burgers, expressing “shred, stack, serve” visually without putting words in the image.
Scene/backdrop: a compact alpine downhill course at blue hour, with sculpted powder, persistent twin board tracks, a signature Big Air jump, distant pines, trail flags, and a small warm amber Burger Base Camp/grill payoff near the finish.
Subject: preserve RockerKaki’s recognizable chibi proportions, purple-and-white hair, small dark horns, black/purple outfit, guitar, and snowboard from Image 1; show RockerKaki carving into a controlled airborne trick, with four giant readable burger ingredients—cheese, patty, tomato, lettuce—forming a restrained route arc down the mountain. A rocket-chair snowboard can appear as one secondary warm-orange speed streak far behind, not a second character.
Style/medium: polished stylized 3D game key art grounded in the actual custom snow-rendered game; toy-like but believable resort infrastructure, crisp readable silhouettes, premium arcade finish, no imitation of any named artist or existing game.
Composition/framing: wide landscape, energetic diagonal downhill flow, hero large enough to read in social crops, landing and warm base camp visible, generous dark-sky negative space near the upper left for optional external HTML/title overlay.
Lighting/mood: cold blue snow and atmospheric depth contrasted with restrained warm diner orange at the base camp; funny, sincere, fast, inviting.
Color palette: ice blue, snow white, charcoal, RockerKaki purple, small controlled amber/orange accents.
Materials/textures: visibly groomed and deformed powder, snow spray, matte fabric, believable board and guitar, warm metal/grill glow.
Constraints: original composition; preserve RockerKaki identity from reference; exactly four airborne ingredient types; no words, letters, typography, UI, logos, real brands, trademarks, watermarks, celebrity likenesses, or copyrighted character/style imitation.
Avoid: generic mobile-game ad, photoreal person, open world, glass-panel UI, cluttered ingredient explosion, malformed hands/limbs, extra riders, unreadable landing, giant city, neon cyberpunk.
```

## Revision and derivative

Independent visual review found one isolated orange circular speck above the
tomato that could read as a fifth pickup. On 2026-08-07 the built-in image-
generation edit tool received the unedited source and this deliberately narrow
instruction:

```text
Remove the single small isolated orange circular dot floating in the blue sky
directly above the tomato slice. Reconstruct only that tiny area as matching
blue-hour sky and faint snow atmosphere. Preserve RockerKaki, the snowboard,
guitar, exactly four ingredient types, rocket streak, snow jump, tracks, flags,
finish structure, lighting, composition, aspect ratio, and absence of text,
logos, and watermarks. Do not change any other subject.
```

The tool did not expose a more specific model identifier. The original is
retained as `social-preview-source-v1.png`; the edited source is the production
lineage head.

| File | Relationship | Dimensions | SHA-256 |
| --- | --- | ---: | --- |
| `art/generated-assets/2d/social-preview-source-v1.png` | Original generated source; retained for audit outside the production bundle | 1672×941 | `e778ce8591e5aecd52a15de7db0b2c52210b42f2eab42b513963e8ef167b26c4` |
| `art/generated-assets/2d/social-preview-source.png` | Image-generation edit with the isolated orange speck removed; archived outside the production bundle | 1672×941 | `75cbc43e31ac5c831db211c91948190bdc1bae99f788e2043fd12634c123c237` |
| `public/assets/ui/snow-burgers/social-preview.webp` | Runtime/social derivative | 1200×630 | `f5c8582750dbe49cbd9f209f10c28ffa5066a28c2513ee7b492dffd005eb222e` |

The derivative was made locally with FFmpeg 7.0.2 using:

```sh
ffmpeg -i art/generated-assets/2d/social-preview-source.png -vf scale=1200:-2,crop=1200:630 \
  -c:v libwebp -quality 88 -compression_level 6 -preset picture \
  social-preview.webp
```

Visual review confirmed four ingredient types, no stray fifth-pickup shape, no
text or brands, a readable RockerKaki silhouette, a visible landing line, and
the warm base-camp payoff. The source files remain outside `public/`; the
111,080-byte WebP is the only production-delivered image.
