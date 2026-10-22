# Original architecture PBR maps

Revision `adonis-architecture-pbr-v3-mineral`. Original deterministic mineral/pigment generation with bundled numpy/Pillow. No downloaded textures, source photographs, reference pixels or baked directional light. Repository asset policy applies.

| Surface | Physical tile | High / low |
|---|---:|---:|
| marble | 4m | 1024 / 512 square |
| limestone | 3m | 512 / 256 square |
| bridge-stone | 3m | 1024 / 512 square |
| blue-painted-stone | 2m | 512 / 256 square |
| roof | 2m | 512 / 256 square |
| gold | 1m | 256 / 128 square |
| bronze | 1m | 256 / 128 square |

BaseColor is sRGB. Normal, roughness, AO and metalness are linear data. UVs must divide metre coordinates by `metersPerTile`; the loader records metadata without changing shared geometry or UVs. Normals derive from metre-scale height, with OpenGL +Y and bitmap flipY decoding. Low maps use periodic Lanczos reduction with renormalised normals.

Stone uses irregular mineral facies and correlated pore/cavity masks, without sine-line veins or uniform bedding stripes. Marble is warm ivory, walls pale warm limestone, bridge stone cooler grey. Blue paint remains continuous with small fracture-bound pigment losses. Gold and bronze each have independent colour, relief, roughness, AO and metalness; no stone maps are reused. Nonmetal patina affects metalness as well as colour and roughness.

Repeatable surfaces do not encode geometry-edge wear, bottom-only moisture, masonry joints, structural occlusion, sun or wall orientation. Those require geometry, masks or scene lighting. `contact-sheet.png` and `stone-repeat-check.png` show actual unlit maps. `manifest.json` records physical scales, hashes, bytes, ranges and feature metrics. Close model views remain necessary for visual acceptance.
