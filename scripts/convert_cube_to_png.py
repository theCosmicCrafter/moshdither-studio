"""Convert .cube 3D LUTs to 512x512 flat PNGs for MoshDither Studio.

Flat LUT layout: 8x8 grid of 64x64 tiles.
Each tile = one blue slice (b index).
Within a tile: x = red, y = green.
"""

import os
import sys
import re
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
except ImportError:
    print("Install deps: pip install numpy pillow")
    sys.exit(1)


def parse_cube(filepath: str):
    """Parse a .cube file and return a numpy array of shape (size, size, size, 3)."""
    with open(filepath, "r") as f:
        lines = f.readlines()

    size = None
    data = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("LUT_3D_SIZE"):
            size = int(line.split()[-1])
            continue
        if line.startswith("TITLE") or line.startswith("DOMAIN"):
            continue
        # RGB triplet
        vals = line.split()
        if len(vals) >= 3:
            try:
                r, g, b = float(vals[0]), float(vals[1]), float(vals[2])
                data.append([r, g, b])
            except ValueError:
                pass

    if size is None:
        # infer from data length
        size = int(round(len(data) ** (1.0 / 3.0)))

    expected = size * size * size
    if len(data) < expected:
        raise ValueError(f"Not enough data in {filepath}: got {len(data)}, expected {expected}")

    arr = np.array(data[:expected], dtype=np.float32)
    lut = arr.reshape((size, size, size, 3))
    # .cube ordering: typically r varies fastest, then g, then b
    # Ensure shape is (R, G, B, 3) for interpolation
    lut = lut.reshape((size, size, size, 3))
    return lut


def trilinear_sample(lut, r, g, b):
    """Sample a 3D LUT with trilinear interpolation."""
    size = lut.shape[0]
    # scale to [0, size-1]
    rf = r * (size - 1)
    gf = g * (size - 1)
    bf = b * (size - 1)

    r0, g0, b0 = int(np.floor(rf)), int(np.floor(gf)), int(np.floor(bf))
    r1, g1, b1 = min(r0 + 1, size - 1), min(g0 + 1, size - 1), min(b0 + 1, size - 1)

    dr, dg, db = rf - r0, gf - g0, bf - b0

    c000 = lut[r0, g0, b0]
    c100 = lut[r1, g0, b0]
    c010 = lut[r0, g1, b0]
    c110 = lut[r1, g1, b0]
    c001 = lut[r0, g0, b1]
    c101 = lut[r1, g0, b1]
    c011 = lut[r0, g1, b1]
    c111 = lut[r1, g1, b1]

    c00 = c000 * (1 - dr) + c100 * dr
    c10 = c010 * (1 - dr) + c110 * dr
    c01 = c001 * (1 - dr) + c101 * dr
    c11 = c011 * (1 - dr) + c111 * dr

    c0 = c00 * (1 - dg) + c10 * dg
    c1 = c01 * (1 - dg) + c11 * dg

    return c0 * (1 - db) + c1 * db


def cube_to_flat_png(lut, out_path, target_size=64):
    """Convert a 3D LUT to a 512x512 flat PNG."""
    tile_count = 8  # 8x8 grid
    tile_size = target_size  # 64

    flat = np.zeros((tile_count * tile_size, tile_count * tile_size, 3), dtype=np.float32)

    for by in range(tile_size):
        for bx in range(tile_size):
            b_slice = by * tile_count + bx
            if b_slice >= target_size * target_size:
                continue
            # b index in [0, target_size-1]
            b_idx = b_slice / (target_size * target_size - 1) if target_size > 1 else 0.0
            # Actually b_slice goes 0..63 for 64-size
            b = b_slice / (target_size - 1) if target_size > 1 else 0.0
            tile_x_start = bx * tile_size
            tile_y_start = by * tile_size
            for gy in range(tile_size):
                for gx in range(tile_size):
                    r = gx / (target_size - 1)
                    g = gy / (target_size - 1)
                    col = trilinear_sample(lut, r, g, b)
                    flat[tile_y_start + gy, tile_x_start + gx] = col

    # Clamp and convert to uint8
    flat = np.clip(flat * 255.0, 0, 255).astype(np.uint8)
    img = Image.fromarray(flat)
    img.save(out_path)


def sanitize_filename(name):
    """Remove/replace characters not safe for filenames."""
    name = re.sub(r'[<>"/\\|?*]', "_", name)
    name = re.sub(r'\s+', "_", name)
    return name


def main():
    src_dir = sys.argv[1] if len(sys.argv) > 1 else r"D:\models\LUTs"
    dst_dir = sys.argv[2] if len(sys.argv) > 2 else r"public\lut"

    src_path = Path(src_dir)
    dst_path = Path(dst_dir)
    dst_path.mkdir(parents=True, exist_ok=True)

    cube_files = list(src_path.rglob("*.cube"))
    print(f"Found {len(cube_files)} .cube files in {src_dir}")

    success = 0
    failed = 0
    for i, cube_file in enumerate(cube_files):
        rel = cube_file.relative_to(src_path)
        # Flatten: folder1_folder2_filename.png
        parts = list(rel.parent.parts) + [rel.stem]
        out_name = sanitize_filename("_".join(parts)) + ".png"
        out_path = dst_path / out_name

        try:
            lut = parse_cube(str(cube_file))
            cube_to_flat_png(lut, str(out_path))
            success += 1
        except Exception as e:
            print(f"  FAIL: {cube_file} -> {e}")
            failed += 1

        if (i + 1) % 100 == 0:
            print(f"  ...processed {i + 1}/{len(cube_files)} (success={success}, failed={failed})")

    print(f"Done. Success: {success}, Failed: {failed}, Total: {len(cube_files)}")


if __name__ == "__main__":
    main()
