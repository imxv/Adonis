# Natural reference PBR assets

These are locally served material channels for the actual Three.js olive and
limestone models. They are not concept art, model renders, or full-screen scenery.
No pixels were copied from the three generated art references.

## Sources and license

The bark and cliff channels derive from two **CC0-1.0** Poly Haven assets, both by
**Rob Tuytel**. The official pages and the official license were checked on
2026-10-21:

- [Bark Brown 02](https://polyhaven.com/a/bark_brown_02)
- [Rock 06](https://polyhaven.com/a/rock_06)
- [Poly Haven asset license](https://polyhaven.com/license)
- [CC0 legal text](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en)

Poly Haven's asset license allows modification, commercial use, and distribution.
Attribution is not required; the artist and source are retained here for provenance.
`source-assets.json` records each downloaded channel's exact URL, SHA-256, original
byte size and resolution. `bark-source-files.json` and `rock-source-files.json` are
the corresponding official API file listings used to verify the download paths.
The actual source JPG/PNG files are decoded in memory by the generator; only the
derived runtime maps are shipped. There are no runtime requests to Poly Haven.

The olive-spray atlas and moss channels are original numeric/botanical procedural
assets authored for Adonis. They contain no downloaded images or third-party
pixels and impose no additional third-party attribution obligations.

## What changed from the source

- Bark retains photographed fissures, splinters and scales. Its diffuse channel
  is rebalanced from reddish wood to olive's grey-brown weathering, using a
  luminance-preserving desaturation and target mean. It is not a scan of this
  particular fictional olive tree; its large twist and folds are actual geometry.
- `rock_06` retains photographed weathering, bedding, recesses and fine relief.
  Its pigment is rebalanced to warm chalk/ivory grey. The source asset is named
  Rock 06; its geological composition was not laboratory-verified as limestone.
  Rock silhouettes, major fractures and undercuts remain geometry responsibilities.
- Damp rock uses the same physical normal field, lower diffuse reflectance,
  irregular mineral runnels and restrained dark olive algae. Its roughness varies
  approximately .25–.62. It remains a nonmetallic rock surface.
- Roughness is an independent scalar channel. Imported normals are **OpenGL +Y**,
  used as linear tangent-space data. Low-resolution resampling renormalizes vectors.
  Final normal WebP files are **lossless**: decoded RGB bytes equal the encoded
  source bytes, so compression adds **zero angular error**. An earlier Q95 lossy
  trial was rejected because its angular error damaged fine bark relief.
- Dense olive sprays have three crossing boughs, irregular secondary branches,
  lance-shaped blades, a fine midrib and a minority of muted silver leaves.
  Back faces receive a restrained silver-green tint in the material shader.
  Nothing is made emissive to imitate sunlight or transmission.

Color rebalancing is an artistic match to the reference palette, not a claim of
measured spectral albedo or exact photographic matching.

## Internal consumer contract

`src/world3d/reference/nature-materials.ts` exports
`createNatureMaterials(quality: 'low' | 'high')`, returning `bark`, `barkDark`,
`limestone`, `wetLimestone`, `moss`, `foliage`, `ready`, and `dispose()`.

- Await `ready` before taking visual evidence. Required image failures reject it;
  an untextured fallback is not presented as a finished material.
- `dispose()` is idempotent and releases all six materials and their fourteen
  owned textures, including an image that finishes loading after disposal.
- Color maps use sRGB. Normal and roughness maps use no color-space conversion.
- Bark, dry/wet stone and moss enable vertex colors for geometry-authored broad
  variation. With no color attribute, Three.js uses white.
- Bark growth follows **UV.v**. The tree owner controls arc-length and wrap count.
  Repeating rock textures should cover roughly 1.5–3 m per tile; close inspection
  should not show tiled giant macro fractures.
- `foliage` is an alpha-tested, depth-writing, double-sided opaque material, with
  alpha-to-coverage. Do not set `transparent=true` for the whole crown.
- The atlas contains **four horizontal cells**. Map a card directly to one
  quarter of U and the full V range. Leave map repeat at (1,1); the atlas has
  ClampToEdge wrapping and twelve pixels of internal side padding.
- Alpha masks need to be present on shadow materials if a consumer overrides
  Three.js's default shadow/depth material creation.
- **Shader v4 prioritizes a per-vertex ellipsoid normal field.** Supply optional
  `instanceCrownCenter: vec3` and `instanceCrownInvRadius2: vec3` instanced
  attributes in **tree-local space**. The latter contains
  `(1/radiusX², 1/radiusY², 1/radiusZ²)` for a tree-axis-aligned crown ellipsoid.
  When instancing is active and `length(instanceCrownInvRadius2) > .001`, the
  vertex shader evaluates `leafPos = (instanceMatrix * vec4(position, 1)).xyz`,
  converting card-local `position` into tree-local space. It then evaluates
  `field = (leafPos - instanceCrownCenter) * instanceCrownInvRadius2`, adds `.35`
  to tree-local `field.y`, and passes
  `normalize(normalMatrix * normalize(field))` as the view-space crown normal.
  The field is evaluated at each card vertex and interpolated across its surface;
  adjacent cards in the same crown therefore sample the same spatial field.
- `instanceCrownNormal: vec3` remains the fallback for missing/zero field radii
  or a degenerate field vector. This direction is **card-local**: the shader mixes
  it into the ordinary vertex normal at `.80`, then Three.js applies the instance
  transform and mesh `normalMatrix`. All three custom attributes explicitly
  default to zero; without either valid input the ordinary material normal is
  retained. The field path is guarded by `USE_INSTANCING` for noninstanced meshes.
- In the fragment shader the selected view-space crown normal is mixed at `.88`
  after DoubleSide's whole-card flip, with the normal-map step retained afterward.
  Front/back leaf colors remain separate, and no emissive light is added.
  This volume-lighting approximation represents many blade orientations within
  a spray; it is not individually modelled leaves or physically exact subsurface
  scattering. The program cache key ends in `v4`.

## Final resource and verification record

| Quality | Runtime maps | Transfer bytes | Base RGBA8 estimate | With mipmaps estimate |
| --- | ---: | ---: | ---: | ---: |
| High | 14 | 7,118,054 | 45.5 MiB | 60.67 MiB |
| Low | 14 | 2,486,260 | 12.5 MiB | 16.67 MiB |

These count distinct material textures, with shared bark/stone channels counted
once. Transfer bytes are actual files; GPU numbers are **estimates**, assuming
TextureLoader uploads RGBA8 and a full mip chain. WebP disk compression does not
become compressed GPU blocks. They exclude environment maps, shadows, geometry,
renderer buffers, temporary loading/decode overlap and browser implementation
overhead. They are not measured GPU peaks or a full-world memory budget.

Hero bark retains 2048² color; dry/wet rock uses 1024² color. Both bark and rock
retain 1024² imported normals. Moss uses 512² color and 256² data channels. The
high foliage atlas is 2048×1024; low is 1024×512. Its normal and high roughness
are 512×256. High bark/dry-rock/wet-rock roughness maps are 512². This saves
46 MiB of estimated high-quality residency compared with the preceding draft,
while preserving the hero bark color, both imported normals and the leaf alpha.
Color WebP quality is 88, scalar roughness WebP quality is 92, and normals use
lossless WebP. Color/scalar compression can change small pigment/roughness values;
it does not determine model shape. Alpha masks remain PNG with lossless alpha.

At alphaTest .46 the high atlas's four cells cover 46.46%, 47.14%, 46.02%, 46.26%;
low covers 48.34%, 49.19%, 47.94%, 48.18%. Coverage is a pixel-mask measurement,
not a claim about crown volume or reference similarity.

`manifest.json` verifies all 28 output hashes. `compression-report.json` records
byte equality and zero normal compression error. `material-validation.json`
records actual Chrome/WebGL model-page loading, shader execution, correct channel
color spaces, 6 materials / 14 textures per quality and repeated-dispose counts.
No UI unit tests were added. Actual device and final integrated-world acceptance
remain separate work.

## Generate and inspect

The checked-in maps are ready for offline runtime use. Regeneration requires
Python with numpy and Pillow, plus curl for the two documented CC0 sources:

```sh
python3 src/world3d/reference/nature-textures-generate.py
python3 src/world3d/reference/nature-textures-generate.py --foliage-only
```

The second command updates the botanical atlas without redownloading bark or
rock channels. `manifest.json` records actual resolutions, sizes and hashes.
`material-contact-sheet.jpg` is a **material-channel inspection sheet**, not a
render or proof that the world scene matches the references. Model views and
camera/lighting comparisons belong to the nature-model preview and world review.

## Remaining limits

The atlas is an original procedural spray; it does not recover the exact leaf
arrangement in the reference images. Thick crown volume, silhouette gaps and
nonrepeated crown masses must be constructed in 3D. Very close viewing can expose
the cards. Shader v4 already varies its representative normal across card
vertices using the shared crown field, but some large-card patch boundaries
remain visible. Continuous representative normals alone do not remove the finite
card surfaces, alpha-mask overlap, or boundaries between different crown fields.
Those residual patches still require model/layout and lighting review; the
per-vertex field is implemented, not deferred future work.
The moss is procedural and less botanically specific than photographed
micro moss. A roughness-only damp material is not a separate flowing water film.
Final integrated color depends on the shared sun, ambient light, IBL, tone mapping,
exposure, UV scale, vertex color and geometric normals. No similarity percentage
or final visual acceptance is asserted by this material package.
