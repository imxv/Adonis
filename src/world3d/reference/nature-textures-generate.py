"""Offline PBR maps derived from documented CC0 channels plus original botanical maps for the reference olive and limestone assets.

Photographed CC0 bark/rock channels come from Poly Haven; no concept-image pixels are used.
Run with the bundled Python (numpy + Pillow), from any working directory.
"""
from pathlib import Path
import json
import math
import hashlib
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
DEST = ROOT / 'public/world3d/reference/nature'
SIZE = 2048
SOURCE_RECORDS = []
SOURCE_CACHE = {}
COMPRESSION_RECORDS = []


def noise(w, h, nx, ny, seed):
    """Periodic smooth value noise; independent frequencies, no white-noise base."""
    rng = np.random.default_rng(seed)
    grid = rng.random((ny, nx), dtype=np.float32)
    x = np.arange(w, dtype=np.float32) * nx / w
    y = np.arange(h, dtype=np.float32) * ny / h
    ix, iy = x.astype(int), y.astype(int)
    tx, ty = x - ix, y - iy
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    a = grid[iy[:, None] % ny, ix[None, :] % nx]
    b = grid[iy[:, None] % ny, (ix[None, :] + 1) % nx]
    c = grid[(iy[:, None] + 1) % ny, ix[None, :] % nx]
    d = grid[(iy[:, None] + 1) % ny, (ix[None, :] + 1) % nx]
    return ((a * (1 - tx) + b * tx) * (1 - ty[:, None]) +
            (c * (1 - tx) + d * tx) * ty[:, None]).astype(np.float32)


def normals(height, strength=1.0, periodic=True):
    if periodic:
        dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * strength
        dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * strength
    else:
        dy, dx = np.gradient(height)
        dx, dy = dx * strength, dy * strength
    normal = np.stack((-dx, dy, np.ones_like(height)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1)[..., None]
    return np.uint8(np.clip((normal * .5 + .5) * 255, 0, 255))


def save(name, array, color=False, alpha=False):
    if array.dtype != np.uint8:
        array = np.uint8(np.clip(array, 0, 255))
    image = Image.fromarray(array)
    is_normal = name.endswith('normal')
    filename = name + ('.png' if alpha and not is_normal else '.webp')
    # Fine surface normals/scalars do not need 2K noise on mobile or desktop.
    high_factor = 2 if image.width == SIZE and (name.endswith('normal') or 'roughness' in name) else 1
    if name in ['limestone-color', 'limestone-wet-color']:
        high_factor = image.width // 1024
    if name in ['olive-bark-roughness', 'limestone-roughness', 'limestone-wet-roughness']:
        high_factor = image.width // 512
    if name.startswith('moss-'):
        high_factor = image.width // (512 if name.endswith('color') else 256)
    if name == 'olive-sprays-normal':
        high_factor = 4
    if name == 'olive-sprays-roughness':
        high_factor = 4
    low_factor = 2 if name == 'olive-sprays-color' else (4 if image.width == SIZE else 2)
    if name.startswith('moss-') and not name.endswith('color'):
        low_factor = image.width // 256
    for quality, factor in [('high', high_factor), ('low', low_factor)]:
        folder = DEST / quality
        folder.mkdir(parents=True, exist_ok=True)
        out = image if factor == 1 else image.resize(
            (image.width // factor, image.height // factor), Image.Resampling.LANCZOS)
        if name.endswith('normal') and factor != 1:
            values = np.asarray(out, dtype=np.float32) / 127.5 - 1
            values /= np.maximum(.01, np.linalg.norm(values, axis=-1)[..., None])
            out = Image.fromarray(np.uint8(np.clip((values * .5 + .5) * 255, 0, 255)))
        if filename.endswith('.webp'):
            # Keep higher precision for normals; scalar and colour channels have
            # different roles/budgets. These remain linear data in the runtime.
            out.save(folder / filename, quality=100 if is_normal else (88 if color else 92),
                     method=6, lossless=is_normal)
            decoded = np.asarray(Image.open(folder / filename), dtype=np.float32)
            if is_normal:
                before = np.asarray(out, dtype=np.float32) / 127.5 - 1
                after = decoded / 127.5 - 1
                before /= np.maximum(.001, np.linalg.norm(before, axis=-1)[..., None])
                after /= np.maximum(.001, np.linalg.norm(after, axis=-1)[..., None])
                degrees = np.degrees(np.arccos(np.clip(np.sum(before * after, axis=-1), -1, 1)))
                identical = np.array_equal(np.asarray(out), decoded.astype(np.uint8))
                if identical:
                    degrees[:] = 0
                COMPRESSION_RECORDS.append({'map': f'{quality}/{filename}', 'webp_lossless': True,
                    'normal_bytes_identical': identical,
                    'normal_angle_mean_deg': float(degrees.mean()),
                    'normal_angle_p95_deg': float(np.percentile(degrees, 95)),
                    'normal_angle_max_deg': float(degrees.max())})
                # Only remove the exact previous generated normal, not other art.
                old_normal = folder / f'{name}.png'
                if old_normal.exists():
                    old_normal.unlink()
        else:
            out.save(folder / filename, optimize=True)
    return image


def source_asset(asset, channel, resolution='2k', extension='jpg'):
    """Fetch original CC0 channel to memory; static final maps stay offline."""
    import io
    import subprocess
    key = (asset, channel, resolution, extension)
    if key in SOURCE_CACHE:
        return SOURCE_CACHE[key]
    url = f'https://dl.polyhaven.org/file/ph-assets/Textures/{extension}/{resolution}/{asset}/{asset}_{channel}_{resolution}.{extension}'
    result = subprocess.run(['curl', '-fsSL', '--retry', '3', '--retry-all-errors', '--retry-delay', '1',
                             '--connect-timeout', '12', '--max-time', '60', url], capture_output=True)
    if result.returncode:
        raise RuntimeError(f'CC0 source download failed: {url}: {result.stderr.decode()[-400:]}')
    raw = result.stdout
    image = Image.open(io.BytesIO(raw)).convert('RGB' if channel != 'rough' else 'L')
    SOURCE_RECORDS.append({'asset': asset, 'author': 'Rob Tuytel', 'license': 'CC0-1.0',
        'page': f'https://polyhaven.com/a/{asset}', 'license_url': 'https://polyhaven.com/license',
        'url': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'size': list(image.size), 'bytes': len(raw)})
    data = np.asarray(image, dtype=np.float32)
    SOURCE_CACHE[key] = data
    return data


def bark():
    raw = source_asset('bark_brown_02', 'diff')
    normal = source_asset('bark_brown_02', 'nor_gl', '1k', 'png')
    rough = source_asset('bark_brown_02', 'rough', '1k') / 255
    # Keep the photographed scales/long fissures, neutralise reddish wood into
    # olive's grey-brown weathering. No shading is painted onto the channel.
    lum = raw[..., 0] * .2126 + raw[..., 1] * .7152 + raw[..., 2] * .0722
    gain = 116 / float(lum.mean())
    chroma = (raw - lum[..., None]) * .42
    color = lum[..., None] * gain + chroma + np.array([6, 2, -5])
    rough = np.clip(.60 + rough * .36, .62, .98)
    return [save('olive-bark-color', color, True),
            save('olive-bark-normal', normal),
            save('olive-bark-roughness', rough * 255)]


def limestone():
    raw = source_asset('rock_06', 'diff')
    normal = source_asset('rock_06', 'nor_gl', '1k', 'png')
    raw_rough = source_asset('rock_06', 'rough', '1k') / 255
    n = raw.shape[0]
    lum = raw[..., 0] * .2126 + raw[..., 1] * .7152 + raw[..., 2] * .0722
    # rock_06 is a warm weathered cliff. Preserve its actual strata and pores,
    # rebalance pigment towards the reference's chalk/ivory limestone.
    centered = lum / float(lum.mean())
    # Macro rock shadows belong to actual geometry. Compress the photographed
    # albedo contrast so a small 3 m map does not read as repeated black granite.
    surface = 1 + (centered - 1) * .24
    color = surface[..., None] * np.array([146, 141, 125])
    color += (raw - lum[..., None]) * .10
    broad = noise(n, n, 9, 10, 212)
    grit = noise(n, n, 185, 170, 213)
    color += (broad - .5)[..., None] * np.array([9, 7, 3])
    dry_rough = np.clip(.65 + raw_rough * .31, .65, .97)
    # Streaked, patchy wetness; it follows local material recesses instead of a
    # black horizontal strip. Geometric contact bands are authored by the model.
    runnels = noise(n, n, 31, 5, 218)
    recess = np.clip((1.0 - centered) * 1.4, 0, .5)
    damp = np.clip(.20 + runnels * .57 + recess, .2, .94)
    wet_color = surface[..., None] * np.array([83, 85, 70])
    wet_color *= (1 - damp[..., None] * .17)
    algae = np.clip((broad - .57) * 2.3 + recess * .23, 0, .48) * damp
    wet_color = wet_color * (1 - algae[..., None]) + np.array([62, 69, 36]) * algae[..., None]
    wet_rough = np.clip(.62 - damp * .36 + (grit - .5) * .06, .25, .62)
    return [save('limestone-color', color, True), save('limestone-normal', normal),
            save('limestone-roughness', dry_rough * 255),
            save('limestone-wet-color', wet_color, True),
            save('limestone-wet-roughness', wet_rough * 255)]


def moss():
    n = SIZE
    broad = noise(n, n, 13, 16, 311)
    lobes = noise(n, n, 69, 76, 312)
    fine = noise(n, n, 560, 460, 313)
    grain = noise(n, n, 900, 900, 314)
    # Tiny overlapping star/cushion crowns, varied by larger damp colonies.
    crown = np.power(np.maximum(0, fine), .8)
    height = .25 + broad * .12 + lobes * .18 + crown * .075 + grain * .014
    tone = (broad - .5) * 23 + (lobes - .5) * 18 + (fine - .5) * 21
    color = np.zeros((n, n, 3), np.float32)
    color[:] = [66, 75, 31]
    color += tone[..., None] * np.array([.85, 1, .54])
    dead = np.clip((noise(n, n, 23, 26, 315) - .60) * 2, 0, .4)
    color = color * (1 - dead[..., None]) + np.array([99, 89, 43]) * dead[..., None]
    rough = .86 + (fine - .5) * .15
    return [save('moss-color', color, True), save('moss-normal', normals(height, 24)),
            save('moss-roughness', rough * 255)]


def foliage():
    w, h = 2048, 1024
    rgba = np.zeros((h, w, 4), np.uint8)
    # Opaque colour dilated into padding prevents dark mip halos on thin leaves.
    rgba[..., :3] = [112, 119, 69]
    height = np.zeros((h, w), np.float32)
    rough = np.ones((h, w), np.float32) * .88
    rng = np.random.default_rng(437)
    branch_mask = Image.new('L', (w, h))
    branch_draw = ImageDraw.Draw(branch_mask)
    leaves = []

    def branch(points, width):
        branch_draw.line(points, fill=255, width=width, joint='curve')

    def leaf(x, y, angle, length, width, silver=False):
        # Record in painter order; whole boughs are not identical stamped leaves.
        leaves.append((x, y, angle, length, width, silver, float(rng.random())))

    for cell in range(4):
        ox = cell * 512
        # Three crossing boughs make a connected dense spray, not a symmetric
        # fern or an opaque blob. Every leaf remains a thin lance-shaped blade.
        for stem in range(3):
            root_x = ox + 240 + (stem - 1) * 27
            tip_x = ox + [113, 263, 405][stem] + rng.uniform(-25, 25)
            tip_y = [170, 50, 240][stem] + rng.uniform(-22, 25)
            main = []
            for j in range(41):
                t = j / 40
                x = root_x + (tip_x - root_x) * t + math.sin(t * 3.4) * (cell - 1.5) * 8
                y = 964 + (tip_y - 964) * t
                main.append((x, y))
            branch(main, 5 if stem == 1 else 4)
            for j in range(1, 17):
                t = (j + rng.uniform(-.24, .24)) / 18
                origin = main[round(t * 38)]
                side = -1 if (j + stem) % 2 else 1
                main_angle = math.atan2(tip_y - 964, tip_x - root_x)
                angle = main_angle + side * rng.uniform(.65, 1.08)
                length = rng.uniform(142, 227) * (1.0 - t * .22)
                nodes = []
                for k in range(17):
                    q = k / 16
                    x = origin[0] + math.cos(angle) * length * q + side * 17 * q * q
                    y = origin[1] + math.sin(angle) * length * q + (cell - 1.5) * 10 * q * q
                    x = min(ox + 463, max(ox + 49, x))
                    nodes.append((x, y))
                branch(nodes, 2)
                pairs = 8 + (j + cell + stem) % 4
                for k in range(1, pairs + 1):
                    q = k / (pairs + 1)
                    for leaf_side in [-1, 1]:
                        if rng.random() < .035:
                            continue
                        point = nodes[min(16, max(0, round((q + leaf_side * .018) * 16)))]
                        la = angle + leaf_side * rng.uniform(.55, .95)
                        ll = rng.uniform(48, 73) * (1.06 - .22 * q)
                        leaf(point[0], point[1], la, ll, ll / rng.uniform(5.8, 7.0), rng.random() < .09)
                tip = nodes[-1]
                leaf(tip[0], tip[1], angle + rng.uniform(-.18, .18), 56, 10)
            for j in range(6):
                point = main[35 + j]
                for side in [-1, 1]:
                    angle = main_angle + side * rng.uniform(.45, .85)
                    ll = rng.uniform(46, 61)
                    leaf(point[0], point[1], angle, ll, ll / 5.8, rng.random() < .08)

    twigs = np.asarray(branch_mask) / 255
    rgba[twigs > .1] = [106, 102, 64, 255]
    height += twigs * .19
    rough[twigs > .1] = .9
    for x, y, angle, length, width, silver, seed in leaves:
        radius = int(length + width + 3)
        cell = int(x // 512)
        left, right = max(cell * 512 + 12, int(x) - radius), min((cell + 1) * 512 - 12, int(x) + radius)
        top, bottom = max(12, int(y) - radius), min(h - 12, int(y) + radius)
        yy, xx = np.mgrid[top:bottom, left:right].astype(np.float32)
        dx, dy = xx - x, yy - y
        co, si = math.cos(angle), math.sin(angle)
        along = (dx * co + dy * si) / length
        across = -dx * si + dy * co
        valid_t = np.clip(along, 0, 1)
        half_width = width * .5 * np.power(np.maximum(0, np.sin(valid_t * math.pi)), .78)
        # A slight blade curve stops perfectly mirrored lance shapes.
        center_curve = np.sin(valid_t * math.pi) * width * (seed - .5) * .30
        across -= center_curve
        inside = (along > 0) & (along < 1) & (np.abs(across) < half_width)
        if not np.any(inside):
            continue
        norm = across / np.maximum(half_width, .1)
        shade = np.sin(valid_t * math.pi) * 4 + (1 - norm * norm) * 5
        vein = np.exp(-np.square(norm * 14)) * 7
        fleck = np.sin(xx * 2.3 + yy * 1.9 + seed * 20) * 1.5
        base = np.array([81, 90, 58] if silver else [53, 65, 29])
        base = base + (seed - .5) * 17
        color = base + (shade + vein + fleck)[..., None]
        pixels = rgba[top:bottom, left:right]
        pixels[..., :3][inside] = np.uint8(np.clip(color, 0, 255))[inside]
        pixels[..., 3][inside] = 255
        leaf_height = .3 + .1 * (1 - norm * norm) + .035 * np.sin(valid_t * math.pi)
        height[top:bottom, left:right][inside] = leaf_height[inside]
        rough[top:bottom, left:right][inside] = (.66 if silver else .74) + seed * .08
    # One-pixel smooth edge; no grey alpha sprayed across the empty background.
    alpha = Image.fromarray(rgba[..., 3]).filter(ImageFilter.GaussianBlur(.35))
    rgba[..., 3] = np.asarray(alpha)
    normal = normals(height, 2.4, periodic=False)
    normal[rgba[..., 3] < 64] = [128, 128, 255]
    return [save('olive-sprays-color', rgba, True, True),
            save('olive-sprays-normal', normal, alpha=True),
            save('olive-sprays-roughness', rough * 255)]


def contact_sheet(maps):
    width, tile = 1600, 400
    sheet = Image.new('RGB', (width, 1060), '#e1ded4')
    draw = ImageDraw.Draw(sheet)
    headings = ['OLIVE BARK / ALBEDO', 'LIMESTONE / DRY ALBEDO', 'LIMESTONE / DAMP ALBEDO', 'MOSS / ALBEDO']
    for i, (image, heading) in enumerate(zip([maps[0][0], maps[1][0], maps[1][3], maps[2][0]], headings)):
        sheet.paste(image.convert('RGB').resize((tile, tile)), (i * tile, 34))
        draw.text((i * tile + 12, 12), heading, fill='#302f29')
    for i, (image, heading) in enumerate(zip([maps[0][1], maps[1][1], maps[2][1]], ['BARK / NORMAL', 'LIMESTONE / NORMAL', 'MOSS / NORMAL'])):
        sheet.paste(image.convert('RGB').resize((280, 280)), (i * 280, 470))
        draw.text((i * 280 + 12, 448), heading, fill='#302f29')
    leaves = maps[3][0].resize((1100, 550))
    leaf_bg = Image.new('RGB', leaves.size, '#879285')
    leaf_bg.paste(leaves, mask=leaves.getchannel('A'))
    sheet.paste(leaf_bg.resize((760, 380)), (840, 470))
    draw.text((855, 448), 'OLIVE SPRAYS / 4 ATLAS CELLS / ALPHA', fill='#302f29')
    draw.text((22, 900), 'Documented CC0 bark/rock PBR; original procedural botanical atlas and moss. No concept-image pixels.', fill='#302f29')
    draw.text((22, 929), 'Geometry must supply trunk folds, branches, canopy volume, rock faces and macro fissures.', fill='#302f29')
    draw.text((22, 958), 'Color maps contain pigment / weathering. Lighting and directional shadows belong to the renderer.', fill='#302f29')
    sheet.save(DEST / 'material-contact-sheet.jpg', quality=94)


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    only_foliage = '--foliage-only' in sys.argv
    if not only_foliage:
        from concurrent.futures import ThreadPoolExecutor
        specs = [(asset, channel, resolution, ext) for asset in ['bark_brown_02', 'rock_06']
                 for channel, resolution, ext in [('diff', '2k', 'jpg'), ('nor_gl', '1k', 'png'), ('rough', '1k', 'jpg')]]
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda spec: source_asset(*spec), specs))
    for name, generate in [('bark', bark), ('limestone', limestone), ('moss', moss), ('foliage', foliage)]:
        if only_foliage and name != 'foliage':
            continue
        print(f'Generating {name}', flush=True)
        generate()
    all_maps = [[Image.open(DEST / 'high' / path) for path in group] for group in [
        ['olive-bark-color.webp', 'olive-bark-normal.webp'],
        ['limestone-color.webp', 'limestone-normal.webp', 'limestone-roughness.webp', 'limestone-wet-color.webp'],
        ['moss-color.webp', 'moss-normal.webp'], ['olive-sprays-color.png'],
    ]]
    contact_sheet(all_maps)
    if SOURCE_RECORDS:
        (DEST / 'source-assets.json').write_text(json.dumps({'retrieved': '2026-10-21', 'license': 'CC0-1.0', 'sources': SOURCE_RECORDS}, indent=2) + '\n')
    (DEST / 'compression-report.json').write_text(json.dumps(COMPRESSION_RECORDS, indent=2) + '\n')
    manifest = []
    for path in sorted(DEST.glob('*/*')):
        if not path.is_file():
            continue
        with Image.open(path) as img:
            dims = list(img.size)
            mode = img.mode
        manifest.append({'path': str(path.relative_to(DEST)), 'bytes': path.stat().st_size,
                         'size': dims, 'mode': mode,
                         'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    (DEST / 'manifest.json').write_text(json.dumps({'generator': 'nature-textures-generate.py',
        'source': 'Poly Haven CC0 bark_brown_02 / rock_06 + original botanical atlas / moss',
        'files': manifest}, indent=2) + '\n')
    print(f'{len(manifest)} maps; {sum(row["bytes"] for row in manifest):,} bytes', flush=True)


if __name__ == '__main__':
    main()
