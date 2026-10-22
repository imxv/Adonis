# Lion Head — modified geometry

Source: [Poly Haven / Lion Head](https://polyhaven.com/a/lion_head), creator **Tina**.
License: **CC0-1.0**; [provider statement](https://polyhaven.com/license), [legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode).
Downloaded on 2026-10-21. The source has no published semantic revision; `manifest.json` records exact glTF/BIN download URLs, byte sizes and SHA-256 hashes.

Only model geometry is used. No source textures, web preview renders, logos, or site copy are included. Appearance uses the project's existing bronze material.

## Modifications

Removed the separate plinth and simplified the original carved head before fitting it to the fountain. Opened the closed muzzle vertically; widened and advanced the original muzzle/jaw geometry around the fixed pipe lip. Extended the left mane and compressed the crowded right side. Swept the actual carved solid backwards to the existing D wall, then monotonically fitted its rear volume within the support. Intersected the wall plane and boolean-subtracted a 0.305 m guard around the original straight and offset duct. Applied 0.5 mm manifold simplification and collapsed five short sliver edges per quality, checking the manifold edge-link condition and preserving face orientation. Both processed meshes remain watertight.

The original physical 0.30 m spout, source point and direction remain unchanged. The larger guard belongs to the sculptural shell; it does not enlarge the physical spout.

`manifest.json` records exact transforms, knots, mesh counts, bounds, hashes and tool versions. Binaries contain little-endian Float32 positions followed by Uint32 triangle indices. Coordinates are canonical U/across, V/up, W/forward in metres, with the origin at the fixed mouth. The runtime module embeds identical processed bytes to preserve the synchronous geometry factory; each build creates and owns private geometry buffers. The cached byte templates own no materials or textures.

This is a modified derivative, not an unmodified Poly Haven download. Licensing and geometry checks do not establish art acceptance.
