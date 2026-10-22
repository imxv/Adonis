#!/usr/bin/env python3
"""Original mineral/pigment PBR authoring in metres (bundled numpy + Pillow).

No photographs, concept pixels, external textures or directional lighting. Wrapped
stochastic fields tile at 1-4 metres; no sine-line marble/bedding pattern is used.
Colour, relief, cavity, roughness and metalness share physical feature masks.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


REVISION = "adonis-architecture-pbr-v3-mineral"
SURFACES = {
    "marble": {"metres": 4.0, "high": 1024, "features": "Warm ivory calcite clouds 0.3-1.5m, broken branching mineral veins 3-14mm, sparse pores 2-6mm."},
    "limestone": {"metres": 3.0, "high": 512, "features": "Pale warm cut limestone, irregular mineral mottling 0.15-0.8m, calcite/ochre inclusions, shallow pores 3-9mm."},
    "bridge-stone": {"metres": 3.0, "high": 1024, "features": "Cool grey masonry, mineral facies 0.08-0.7m, pale calcite islands, sparse iron inclusions and pits 3-12mm."},
    "blue-painted-stone": {"metres": 2.0, "high": 512, "features": "Continuous deep blue pigment, microcrack-bound small paint loss 2-8mm, no broad white islands or geometry-edge masks."},
    "roof": {"metres": 2.0, "high": 512, "features": "Fired terracotta kiln variation 0.1-0.6m, sparse inclusions and cavities, no painted tile layout."},
    "gold": {"metres": 1.0, "high": 256, "features": "Gold leaf, local nonmetallic brown grime, shallow tool texture, independent roughness/metalness."},
    "bronze": {"metres": 1.0, "high": 256, "features": "Warm cast bronze, local green oxide patina, cast pores, independent roughness/metalness."},
}
MATERIALS = tuple(SURFACES)
MAPS = ("baseColor", "normal", "roughness", "ao")


def periodic_noise(size: int, frequency: float, seed: int) -> np.ndarray:
    """Smooth stationary field using only periodic integer Fourier modes."""
    rng = np.random.default_rng(seed)
    frequencies = np.fft.fftfreq(size) * size
    x, y = np.meshgrid(frequencies, frequencies)
    spectrum = np.fft.fft2(rng.standard_normal((size, size)))
    spectrum *= np.exp(-(x * x + y * y) / (2 * frequency * frequency))
    spectrum[0, 0] = 0
    field = np.fft.ifft2(spectrum).real
    field /= max(float(field.std()), 1e-9)
    return field.astype(np.float32)


def smooth_periodic(field: np.ndarray, radius_px: float) -> np.ndarray:
    size = field.shape[0]
    f = np.fft.fftfreq(size)
    x, y = np.meshgrid(f, f)
    kernel = np.exp(-2 * np.pi * np.pi * radius_px * radius_px * (x * x + y * y))
    return np.fft.ifft2(np.fft.fft2(field) * kernel).real.astype(np.float32)


def soft_step(a: float, b: float, field: np.ndarray) -> np.ndarray:
    x = np.clip((field - a) / (b - a), 0, 1)
    return x * x * (3 - 2 * x)


def warp(field: np.ndarray, wx: np.ndarray, wy: np.ndarray, strength: float) -> np.ndarray:
    size = field.shape[0]
    y, x = np.mgrid[:size, :size]
    px, py = (x + wx * size * strength) % size, (y + wy * size * strength) % size
    ix, iy = px.astype(np.int32), py.astype(np.int32)
    fx, fy = px - ix, py - iy
    return ((field[iy, ix] * (1 - fx) + field[iy, (ix + 1) % size] * fx) * (1 - fy)
            + (field[(iy + 1) % size, ix] * (1 - fx) + field[(iy + 1) % size, (ix + 1) % size] * fx) * fy).astype(np.float32)


def branching_veins(size: int, metres: float, seed: int) -> np.ndarray:
    """Sparse non-closing stochastic fracture paths, with narrower side branches.

    Geometry is authored directly; there are no phase contours, nested loops,
    parallel sine waves or reference pixels. Wrapped stamps keep tile boundaries.
    """
    rng = np.random.default_rng(seed)
    supersample = 2
    pixels = size * supersample
    result = np.zeros((pixels, pixels), dtype=np.uint8)

    def path(start: np.ndarray, angle: float, steps: int) -> np.ndarray:
        points = [start.copy()]; turn = 0
        for _ in range(steps):
            turn = turn * .94 + rng.normal(0, .006)
            angle += turn
            points.append(points[-1] + np.array([np.cos(angle), np.sin(angle)]) * rng.uniform(.003, .007))
        return np.asarray(points)

    def stamp(points: np.ndarray, width_metres: float, opacity: float) -> None:
        nonlocal result
        image = Image.new("L", (pixels, pixels)); pen = ImageDraw.Draw(image)
        width_factor, strength = 1.0, opacity
        for a, b in zip(points[:-1], points[1:]):
            width_factor = width_factor * .91 + rng.uniform(.35, 1.5) * .09
            strength = strength * .95 + rng.uniform(.25, opacity) * .05
            # Wrap the segment without drawing a line across the tile interior.
            pa = a % 1; pb = pa + b - a
            width = max(1, round(width_metres * width_factor * pixels / metres))
            for sy in (-1, 0, 1):
                for sx in (-1, 0, 1):
                    pen.line(((pa[0] + sx) * pixels, (pa[1] + sy) * pixels, (pb[0] + sx) * pixels, (pb[1] + sy) * pixels), fill=round(strength * 255), width=width)
        result = np.maximum(result, np.asarray(image))

    for _ in range(4):
        main = path(rng.random(2), rng.uniform(0, np.pi * 2), int(rng.integers(140, 220)))
        width = rng.uniform(.004, .010)
        stamp(main, width, rng.uniform(.65, .95))
        for branch in range(2):
            at = int(rng.integers(20, len(main) - 20))
            tangent = main[at + 1] - main[at]
            angle = np.arctan2(tangent[1], tangent[0]) + (-1 if branch else 1) * rng.uniform(.4, 1.0)
            stamp(path(main[at], angle, int(rng.integers(40, 95))), width * rng.uniform(.35, .6), rng.uniform(.4, .7))
    return np.asarray(Image.fromarray(result).resize((size, size), Image.Resampling.LANCZOS), dtype=np.float32) / 255


def pores(size: int, seed: int, count: int, millimetres: tuple[float, float], metres: float) -> np.ndarray:
    """Sparse, clustered shallow cavities; wrapping stamps preserve tiling."""
    rng = np.random.default_rng(seed)
    density = periodic_noise(size, 3.0, seed + 1)
    field = np.zeros((size, size), dtype=np.float32)
    for _ in range(count):
        cx, cy = rng.integers(0, size, size=2)
        if rng.random() > np.clip(0.62 + density[cy, cx] * 0.18, 0.15, 0.96):
            continue
        rx = max(.45, rng.uniform(*millimetres) * size / (metres * 1000))
        ry = rx * rng.uniform(0.43, 1.35)
        extent = max(2, int(np.ceil(max(rx, ry) * 2.4)))
        xx, yy = np.meshgrid(np.arange(-extent, extent + 1), np.arange(-extent, extent + 1))
        stamp = np.exp(-((xx / rx) ** 2 + (yy / ry) ** 2) * 1.7)
        stamp *= rng.uniform(0.25, 1.0)
        iy = (cy + np.arange(-extent, extent + 1)) % size
        ix = (cx + np.arange(-extent, extent + 1)) % size
        field[np.ix_(iy, ix)] = np.maximum(field[np.ix_(iy, ix)], stamp)
    return field


def maps_for(name: str, size: int) -> tuple[dict[str, np.ndarray], dict]:
    metres = SURFACES[name]["metres"]
    seed = 1100 + MATERIALS.index(name) * 100
    broad, mid, small, fine, grain = [periodic_noise(size, f, seed + i + 1) for i, f in enumerate((2.4, 9, 31, 110, size * .36))]
    metrics, metalness = {}, None
    if name == "marble":
        fracture = branching_veins(size, metres, seed + 11)
        mineral = fracture * soft_step(-1.3, .55, periodic_noise(size, 5.2, seed + 12))
        halo = smooth_periodic(mineral, max(.6, size / metres * .004))
        calcite = soft_step(.25, 1.55, broad + mid * .27)
        pits = pores(size, seed + 14, 3200, (2, 6), metres)
        cloud = broad * 3.7 + mid * 1.7 + small * .55 + fine * .19
        colour = np.array([229, 221, 205], np.float32) + cloud[..., None]
        colour += calcite[..., None] * np.array([4, 4.5, 5.5])
        colour -= mineral[..., None] * np.array([39, 35, 29]) + halo[..., None] * np.array([8, 7, 5])
        colour -= pits[..., None] * np.array([8, 8, 7])
        height = small * .00006 + fine * .000035 + grain * .000012 - mineral * .00015 - pits * .0004
        roughness = np.clip(.61 + mid * .025 + small * .014 + mineral * .12 + pits * .11 - calcite * .045, .47, .88)
        ao = np.clip(1 - pits * .07 - mineral * .025, .9, 1)
        metrics["veinAreaAboveHalf"] = float((mineral > .5).mean())
    elif name in ("limestone", "bridge-stone"):
        bridge = name == "bridge-stone"
        pits = pores(size, seed + 20, 17000 if bridge else 12500, (3, 12) if bridge else (3, 9), metres)
        cavities = pores(size, seed + 21, 240 if bridge else 150, (9, 22) if bridge else (7, 17), metres)
        calcite = soft_step(.55, 1.55, warp(mid, broad, small, .035))
        ochre = soft_step(1.1, 2.2, broad * .5 + small * .65) * soft_step(-.5, .6, mid)
        facies = warp(periodic_noise(size, 5.5, seed + 22), mid, broad, .035)
        base = np.array([183, 188, 182] if bridge else [220, 211, 193], np.float32)
        cloud = broad * (6.8 if bridge else 4.6) + facies * (5 if bridge else 3.4) + small * 1.5 + fine * .7
        colour = base + cloud[..., None] + calcite[..., None] * np.array([14, 12, 10])
        colour += ochre[..., None] * np.array([13, 4, -11])
        colour -= (pits * (19 if bridge else 14) + cavities * 14)[..., None] * np.array([1, .98, .92])
        height = small * (.00035 if bridge else .00019) + fine * .00014 + grain * .000045
        height -= pits * (.0011 if bridge else .00075) + cavities * .0017
        roughness = np.clip((.84 if bridge else .79) + facies * .027 + small * .019 + pits * .095 + cavities * .07 - calcite * .085, .61, .98)
        cavity = np.maximum(0, smooth_periodic(height, 2) - height)
        ao = np.clip(1 - pits * .11 - cavities * .16 - cavity * 28, .72, 1)
        metrics["poreAreaAboveQuarter"] = float((pits > .25).mean())
    elif name == "blue-painted-stone":
        pits = pores(size, seed + 30, 650, (1, 3.5), metres)
        fracture = np.exp(-np.square((mid + broad * .15) / .12))
        exposed = fracture * soft_step(1.2, 2.2, small * .65 + fine * .45)
        pigment = np.array([25, 51, 79], np.float32) + (broad * 1.8 + mid * .8 + fine * .24)[..., None]
        substrate = np.array([205, 195, 174], np.float32) + (mid * 2)[..., None]
        colour = pigment * (1 - exposed[..., None]) + substrate * exposed[..., None] - pits[..., None] * 3
        height = fine * .00004 + grain * .000012 - exposed * .00031 - pits * .00025
        roughness = np.clip(.64 + mid * .021 + fine * .008 + exposed * .19 + pits * .05, .54, .91)
        ao = np.clip(1 - exposed * .035 - pits * .04, .92, 1)
        metrics.update(paintLossAreaAboveHalf=float((exposed > .5).mean()), continuousBlueArea=float((exposed < .12).mean()))
    elif name == "roof":
        pits = pores(size, seed + 40, 2500, (1, 4), metres)
        fired = broad * .7 + mid * .34 + small * .12
        inclusions = soft_step(1.5, 2.5, fine) * soft_step(-.5, .8, mid)
        colour = np.array([162, 94, 65], np.float32) + fired[..., None] * np.array([9.4, 6.7, 4.5])
        colour += fine[..., None] * .8 - pits[..., None] * 7 - inclusions[..., None] * np.array([9, 7, 4])
        height = small * .00015 + fine * .00011 + grain * .000035 - pits * .00045
        roughness = np.clip(.85 + mid * .024 + pits * .07 + inclusions * .04, .73, .98)
        ao = np.clip(1 - pits * .07 - inclusions * .025, .9, 1)
    else:
        gold = name == "gold"
        coverage = soft_step(1.05 if gold else .55, 2.05 if gold else 1.55, broad * .5 + mid * .6 + small * .22)
        pits = pores(size, seed + 50, 350 if gold else 700, (.35, 1.3), metres)
        base = np.array([201, 162, 77] if gold else [143, 102, 57], np.float32)
        patina = np.array([93, 69, 36] if gold else [47, 78, 67], np.float32)
        colour = (base + (mid * 2.2 + fine * .75)[..., None]) * (1 - coverage[..., None]) + patina * coverage[..., None]
        colour -= pits[..., None] * 9
        height = small * .000013 + fine * .000008 + grain * .000003 - pits * .000055 - coverage * .000025
        roughness = np.clip((.29 if gold else .41) + mid * .025 + small * .013 + coverage * (.40 if gold else .42) + pits * .09, .20, .92)
        metalness = np.clip((.98 if gold else .96) - coverage * (.88 if gold else .9), .06, 1)
        ao = np.clip(1 - pits * .035, .96, 1)
        metrics["nonmetalPatinaAreaAboveHalf"] = float((coverage > .5).mean())
    # Tangent-space OpenGL normal. Derivatives use actual physical tile size.
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * size / (2 * metres)
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * size / (2 * metres)
    normal = np.stack((-dx, dy, np.ones_like(height)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    result = {
        "baseColor": np.clip(np.rint(colour), 0, 255).astype(np.uint8),
        "normal": np.clip(np.rint((normal * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8),
        "roughness": np.rint(roughness * 255).astype(np.uint8),
        "ao": np.rint(ao * 255).astype(np.uint8),
    }
    if metalness is not None:
        result["metalness"] = np.rint(metalness * 255).astype(np.uint8)
    luminance = colour @ np.array([.2126, .7152, .0722])
    metrics.update(
        heightMillimetresP01P99=np.percentile(height * 1000, [1, 99]).round(4).tolist(),
        normalSlopeRms=float(np.sqrt(np.mean(dx * dx + dy * dy))),
        luminanceRoughnessCorrelation=float(np.corrcoef(luminance.ravel(), roughness.ravel())[0, 1]),
        oneMetreColourCorrelationX=float(np.corrcoef(luminance.ravel(), np.roll(luminance, round(size / metres), axis=1).ravel())[0, 1]),
    )
    return result, metrics


def downsample(array: np.ndarray, size: int, normal: bool = False) -> np.ndarray:
    def periodic_resize(value: np.ndarray) -> np.ndarray:
        # The scale is exactly 2:1. Wrap the Lanczos footprint across the tile
        # border, rather than allowing Pillow to clamp the outermost samples.
        padding = ((8, 8), (8, 8)) + (((0, 0),) if value.ndim == 3 else ())
        wrapped = np.pad(value, padding, mode="wrap")
        image = Image.fromarray(wrapped).resize((size + 8, size + 8), Image.Resampling.LANCZOS)
        return np.asarray(image.crop((4, 4, size + 4, size + 4)))

    if not normal:
        return periodic_resize(array)
    decoded = array.astype(np.float32) / 127.5 - 1
    channels = [periodic_resize(decoded[..., i]) for i in range(3)]
    value = np.stack(channels, axis=-1)
    value /= np.maximum(np.linalg.norm(value, axis=-1, keepdims=True), 1e-8)
    return np.clip(np.rint((value * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[3] / "public/world3d/reference/architecture")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    manifest: dict = {
        "revision": REVISION,
        "source": "Original deterministic numerical generation; no external assets or reference-image pixels.",
        "generator": "src/world3d/reference/architecture-textures-generate.py",
        "generatorSha256": digest(Path(__file__).resolve()),
        "repeat": "Wrapped stochastic fields / RepeatWrapping; physical tile sizes are per surface. Divide metre UVs by metersPerTile.",
        "normalConvention": "OpenGL tangent +Y; source origin top-left; imageOrientation flipY on decode",
        "colourSpace": {"baseColor": "sRGB", "normal": "linear data", "roughness": "linear data", "ao": "linear data", "metalness": "linear data"},
        "surfaces": {}, "files": [],
    }
    previews = {}
    for name in MATERIALS:
        high_size = SURFACES[name]["high"]
        high_maps, metrics = maps_for(name, high_size)
        manifest["surfaces"][name] = {"metersPerTile": SURFACES[name]["metres"], "physicalFeatures": SURFACES[name]["features"], "metrics": metrics}
        for quality in ("high", "low"):
            size = high_size if quality == "high" else high_size // 2
            directory = output / quality
            directory.mkdir(exist_ok=True)
            for kind in high_maps:
                value = high_maps[kind] if quality == "high" else downsample(high_maps[kind], size, kind == "normal")
                filename = f"{name}-{kind}.png"
                path = directory / filename
                Image.fromarray(value).save(path, optimize=True, compress_level=9)
                flat = value.reshape(-1, value.shape[-1]) if value.ndim == 3 else value.reshape(-1, 1)
                manifest["files"].append({
                    "path": f"{quality}/{filename}", "width": size, "height": size, "metersPerTile": SURFACES[name]["metres"],
                    "channels": flat.shape[-1], "bytes": path.stat().st_size, "sha256": digest(path),
                    "mean": np.round(flat.mean(axis=0), 3).tolist(),
                    "min": flat.min(axis=0).tolist(), "max": flat.max(axis=0).tolist(),
                    "p05": np.percentile(flat, 5, axis=0).tolist(), "p95": np.percentile(flat, 95, axis=0).tolist(),
                })
        previews[name] = high_maps

    cell, gutter, header = 220, 14, 36
    sheet_kinds = MAPS + ("metalness",)
    sheet = Image.new("RGB", (cell * 5 + gutter * 6, (cell + header) * len(MATERIALS) + gutter * (len(MATERIALS) + 1)), (28, 31, 34))
    draw = ImageDraw.Draw(sheet)
    for row, name in enumerate(MATERIALS):
        for col, kind in enumerate(sheet_kinds):
            px, py = gutter + col * (cell + gutter), gutter + row * (cell + header + gutter)
            draw.text((px, py + 4), f"{name} / {kind}\n{SURFACES[name]['metres']:g}m tile", fill=(225, 222, 211))
            if kind in previews[name]:
                thumb = Image.fromarray(previews[name][kind]).convert("RGB").resize((cell, cell), Image.Resampling.LANCZOS)
                sheet.paste(thumb, (px, py + header))
    sheet.save(output / "contact-sheet.png", optimize=True)
    repeat = Image.new("RGB", (1056, 736), (28, 31, 34)); rd = ImageDraw.Draw(repeat)
    for col, name in enumerate(("marble", "limestone", "bridge-stone")):
        rd.text((col * 352 + 8, 8), f"{name}: 2x2 tiles, {SURFACES[name]['metres'] * 2:g}m square", fill=(225, 222, 211))
        tile = Image.fromarray(previews[name]["baseColor"]).resize((172, 172), Image.Resampling.LANCZOS)
        for yy in range(2):
            for xx in range(2): repeat.paste(tile, (col * 352 + 4 + xx * 172, 32 + yy * 172))
        detail = Image.fromarray(previews[name]["baseColor"]).crop((0, 0, 512, 512)).resize((344, 344), Image.Resampling.LANCZOS)
        repeat.paste(detail, (col * 352 + 4, 384))
    repeat.save(output / "stone-repeat-check.png", optimize=True)
    manifest["preview"] = {"path": "contact-sheet.png", "repeatProof": "stone-repeat-check.png", "purpose": "Actual unlit maps, not an in-engine rendered material."}
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (output / "README.md").write_text(
        "# Original architecture PBR maps\n\n"
        f"Revision `{REVISION}`. Original deterministic mineral/pigment generation with bundled numpy/Pillow. "
        "No downloaded textures, source photographs, reference pixels or baked directional light. Repository asset policy applies.\n\n"
        "| Surface | Physical tile | High / low |\n|---|---:|---:|\n"
        + "".join(f"| {name} | {spec['metres']:g}m | {spec['high']} / {spec['high']//2} square |\n" for name, spec in SURFACES.items())
        + "\nBaseColor is sRGB. Normal, roughness, AO and metalness are linear data. UVs must divide metre coordinates by `metersPerTile`; "
        "the loader records metadata without changing shared geometry or UVs. Normals derive from metre-scale height, with OpenGL +Y and bitmap flipY decoding. "
        "Low maps use periodic Lanczos reduction with renormalised normals.\n\n"
        "Stone uses irregular mineral facies and correlated pore/cavity masks, without sine-line veins or uniform bedding stripes. "
        "Marble is warm ivory, walls pale warm limestone, bridge stone cooler grey. Blue paint remains continuous with small fracture-bound pigment losses. "
        "Gold and bronze each have independent colour, relief, roughness, AO and metalness; no stone maps are reused. "
        "Nonmetal patina affects metalness as well as colour and roughness.\n\n"
        "Repeatable surfaces do not encode geometry-edge wear, bottom-only moisture, masonry joints, structural occlusion, sun or wall orientation. "
        "Those require geometry, masks or scene lighting. `contact-sheet.png` and `stone-repeat-check.png` show actual unlit maps. "
        "`manifest.json` records physical scales, hashes, bytes, ranges and feature metrics. Close model views remain necessary for visual acceptance.\n"
    )
    print(json.dumps({"output": str(output), "maps": len(manifest["files"]), "pngBytes": sum(f["bytes"] for f in manifest["files"]), "revision": REVISION}))


if __name__ == "__main__":
    main()
