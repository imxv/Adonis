# Scanned cliff geometry experiment

This directory contains real **Poly Haven CC0-1.0 photogrammetry geometry**, not
Adonis-original procedural scans. No source photographic textures are downloaded
or needed by this experiment; the existing independently licensed dry/wet rock
PBR materials remain caller-owned.

| Source | Author / processing | Official page |
| --- | --- | --- |
| Rock Face 01 | Dario Barresi | <https://polyhaven.com/a/rock_face_01> |
| Rock Face 02 | Dario Barresi; Rico Cilliers (processing) | <https://polyhaven.com/a/rock_face_02> |

License: <https://polyhaven.com/license>. It permits modification, commercial use
and redistribution of the CC0 assets. The source stone is not laboratory-verified
as limestone; this is an art-directed limestone-colored cliff experiment.

`manifest.json` records source URLs, authors, SHA-256 hashes, original and derived
counts, and per-quality binary formats. `source/` preserves the official glTF/bin,
official API snapshots and the original UV array. The glTF material images are
intentionally not shipped: the runtime reads only the derived geometry files.

Reproduce from repository root:

```sh
node src/world3d/reference/nature-scan-build.mjs
node src/world3d/reference/nature-scan-check.mjs --record
# Explicit source refresh, geometry only:
node src/world3d/reference/nature-scan-build.mjs --download
```

The build uses the already available meshoptimizer package, welds coincident
positions, removes duplicate/zero-index-area triangles, preserves raw source UVs,
and creates a low LOD with `LockBorder`. Runtime files contain interleaved Float32
position/normal/source-UV (8 floats per vertex), followed by UInt32 triangle indices.
The current rock material is projected at 3 metres per tile during assembly.

The raw exported glTF coordinates, measured without any node transform, are:

| Source | Original XYZ bbox size, metres |
| --- | --- |
| Rock Face 01 | 4.953511 × 3.564049 × 3.827303 |
| Rock Face 02 | 2.711196 × 2.471967 × 2.126700 |

These measurements differ from the dimensions advertised on the website. The
runtime does not claim a hidden scale or silently substitute those advertised
dimensions. Complete original min/max/size values are in `manifest.json`.

The source assets are **open rock-face scans**, not complete boulders. This revision
uses their actual triangle positions to build two 160 × 160 XY maximum-depth
relief fields. Missing projections extend the nearest measured neighbour. Source
01 supplies the front relief and row outlines; source 02 supplies the flanks and
rear relief. A continuous closed circumferential retopology resamples those
fields. It has no independent back plates, cropped hanging scan panels, or long
boundary collars. This is scan-derived geometry, **not the original source mesh
connectivity** and not a manifold repair of the open scans.

The retopology discards undercuts. Its enclosing circumference, lateral envelope,
depth gains, water recess, source crest and midledge are art directed. This trades
source fidelity for a substantial, closed, walk-around body. It still differs
from the reference: some lateral strata are too continuous/parallel, rear end
edges can remain long, and the overall macro mass is more rectangular than a
natural broken cliff. Front/side/back are intended visible; only the flat bottom
cap at local Y=0 must be embedded in terrain. Vegetation or camera placement is
not required to hide an exposed support panel.

Original source UV and normals remain archived. Runtime uses new normals and
3-metre projected UVs on the retopology. High and low use the same macro rules;
low reduces circumference/height samples rather than adding unlimited micro
geometry. All authoring parameters, field coverage, source bounds and actual
output topology counts are recorded in `sample-layout.json` and
`manifest.sampleExperiment`. Source/derived payload hashes remain in the asset
records; the sample record also hashes the factory and shared water data.

## Material ownership

The output has one final geometry and **one owned MeshStandardMaterial clone**.
The clone continuously blends the caller's dry/wet color and roughness maps using
an interpolated vertex mask on the same broad surface. The dry normal map is
shared. No new textures are generated, and no shared material is modified.

Only the final returned geometry has a dispose listener. The first call to that
geometry's `dispose()` releases the owned clone exactly once; repeated calls do
not repeat material disposal. Merge-input geometry disposal cannot release it.
The construction-error path also releases the final clone through that hook.
The caller retains all input materials and all maps; clone disposal never calls
texture disposal. The geometry check covers success, late abort after material
creation, repeated geometry disposal, and untouched borrowed resources.

## Water attachments and world mapping

The module imports and copies the pure `CASCADE_LOCAL_WATER` data. Final local
points remain unchanged:

| Attachment | XYZ, metres | Role |
| --- | --- | --- |
| Upper start | 0.35, 8.72, -1.12 | Source crest in the main closed body itself |
| Upper end | 0.70, 4.90, 0.25 | Landing over the integral midledge |
| Lower start | 1.15, 4.85, 0.58 | Small solid lip intersecting the main midledge |
| Lower end | 1.25, 0.16, 1.69 | Intentional freefall into the integrator-owned pool |

Upper width is 2.05m; lower width is 2.45m. Midledge flow passes through
`[0.88,4.88,0.40]`. The 21 horizontal rays sample each water tier's top/mid/bottom
and three positions across the width, plus three midledge points. A missing ray
means there is no rock behind that width sample at that height; it does not
claim a physical source lip. Separate downward rays prove source/landing/spill
support, and an inside/outside ray test proves the lower lip overlaps the main
body. Upper source is part of that same closed body, without a separate plate.
The lower end claims a pool impact height, never an invented rock platform.

Map by `world = translation + yawRotation(uniformScale * local)`, with **no extra
Z ×0.8**. For a pool at world Y=P, translation.y=P−0.16×uniformScale. Use the common
LOD envelope below for a single placement scale; do not refit each LOD separately.
This roughly 9m local sample must not be fitted to a 33m cliff and called aligned.
Bridge/path clearance must be checked against actual world placement.

## Water departure and bottom-cap regression

The previous 21-point runtime water probe was too sparse: it tested only
`t=0/0.5/1` and missed the first 0.1-0.4 metres after each lip. The frozen previous
factory hash is `7a79451705e9086f4b1ba88fe3479a07a9c4fe261b30a55eca59a260d23df480`.
Its independent report is `validation/dense-water-route-v8-before.json`.

The scan check now measures both entire water routes at <=8cm arc-length spacing,
the first metre at <=2.5cm, and nine width lanes including both full edges:
1,746 rays per LOD. No-hit remains a separate open-air result, never an invented
positive clearance. It also clips **every actual rock triangle** against the
complete XY water ribbon and minimizes affine `waterZ(y)-rockZ` over the clipped
polygons. This continuous check covers spaces between the ray stations/lanes.
It validates the fixed straight baseline, not B's curved/time-varying water mesh.

Before the fix each LOD had 80 rays at or below the 35mm clearance rule. Continuous
minimum gaps were upper -0.061691/-0.066880m (low/high) and lower -0.251066m. The
source crest front was recessed/lowered and the lower solid nose cut back and
tapered below its lip. Anchors, widths, local frame and placement scale stayed
fixed. Both LODs now have zero blocked rays; continuous minima are upper
0.047827/0.042639m and lower 0.036868m. Full records, actual geometry cap audit,
source hash and support heights are in `validation/dense-water-route-final.json`;
the manifest stores a compact summary and a SHA-256 link to the full report.

**Support is not a visual water-contact claim.** The lower start's downward rock
floor is Y=4.688512, leaving a 0.161488m local vertical gap to the fixed water
start. Upper start gaps are 0.138473/0.124046m. These are under the existing 0.17m
support limit, but must be checked with B's actual stream envelope at the same
revision. For the lower fixed line, `dz/d(-y)=1.11/4.69`; even a nose reaching only
to start Z needs about `0.035/(1.11/4.69)=0.14788m` vertical fall to gain 35mm
forward clearance. Moving endpoints or lowering the clearance rule was avoided.
The source crest remains part of the main closed body and the lower lip retains
three unique vertices inside it; there is no new floating support platform.

The former bottom centre fan crossed a nonconvex corner: high had two upward
faces and excess absolute area 0.158653m². It is replaced by Earcut of the true
ordered bottom ring. Low/high now have 94/254 cap triangles, all geometric faces
pointing -Y; their 96/256 boundary edges exactly match the sidewall bottom edges.
Both have one simple boundary loop, no self-intersections/nonmanifold cap edges,
and matching triangle/outline area (27.995692/28.313553m²). The complete body's
edge closure and positive signed volume are checked separately. No bad faces
were removed or hidden by changing only normals.

`validation/b-r3-lip-envelope-input.json` preserves the provided B report, and
`validation/b-r3-conservative-envelope-comparison.json` compares it with this C
revision. On ring-centre horizontal slices it still reports potential overlap
between independent conservative X/Z bounds and rock: 33 low / 43 high samples,
worst rear-bound gaps -0.275009/-0.322196 world metres. Those extrema need not occur
at the same ring angle/phase; this does not certify actual water penetration or
clearance. Dynamic actual water and visual lip continuity remain integration
work. The report records frozen/current B shader hashes and the current closed
lobe displacement-bound review; veils, droplets and moving fragments are outside
that review.

Re-run the frozen geometry checks and refresh only validated summaries:

```sh
node src/world3d/reference/nature-scan-check.mjs
node src/world3d/reference/nature-scan-check.mjs --record
# Optional read-only comparison against a supplied frozen B bound report:
node src/world3d/reference/nature-scan-check.mjs --water-envelope=/path/to/report.json
# Diagnose an immutable prior source without replacing current source/metadata:
node src/world3d/reference/nature-scan-check.mjs --source=/path/to/frozen/nature-scan-formation.ts --dense-report=/path/to/result.json
```

## Frozen geometry snapshot

Factory SHA-256: `fc87710da789be9ab127132e9f1c9a9242f5ac68c7a03321ee2124b197579029`.

Common min: `[-7.356301307678223, 0, -5.811478614807129]`; max: `[6.599999904632568, 8.75, 1.950313925743103]`.

Common XYZ size in metres: `[13.956301212310791, 8.75, 7.761792540550232]`.

| Quality | Triangles | Draws | Min XYZ | Max XYZ | Minimum dense-ray clearance | Continuous upper/lower clearance |
| --- | ---: | ---: | --- | --- | ---: | --- |
| low | 13840 | 1 | -7.356301307678223, 0, -5.810879230499268 | 6.599999904632568, 8.75, 1.9372453689575195 | 0.043525m | 0.047827 / 0.036868m |
| high | 73744 | 1 | -7.356301307678223, 0, -5.811478614807129 | 6.599999904632568, 8.75, 1.950313925743103 | 0.043525m | 0.042639 / 0.036868m |

The runtime 21-point smoke proof remains separately labelled as sparse; all dense and continuous proof details are preserved outside the runtime manifest payload.

| Part | Source | Position XYZ | Yaw | Uniform scale | Depth scale | Authoring / closure |
| --- | --- | --- | ---: | ---: | ---: | --- |
| continuous-scan-derived-closed-volume | rock_face_01 + rock_face_02 | 0, 0, 0 | 0 | 1 | 1 | Closed continuous circumferential surface, original scan relief resampled from actual triangle positions; original source connectivity/undercuts are not retained. |
| lower-spill-integrated-lip | Original manually authored support volume, not scanned surface | 0, 0, 0 | 0 | 1 | 1 | Small irregular solid lip integrated into the full-width scanned midledge; physical lower water start support; forward nose tapers back below the crest so the departing straight water route clears the solid. |

The body part's unit placement does not imply original scan dimensions: all field gains and lateral/depth authoring are explicit under its `authoringParameters`. The factory group remains unit scale.
