"""Convert a curated selection of .cube LUTs to 512x512 flat PNGs."""

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

LUT_ROOT = Path(r"D:\models\LUTs")
OUT_DIR = Path(r"public\lut")

# Curated list: (relative path under LUT_ROOT, output base name)
CURATED = [
    # Film / Movie looks
    (r"1-Film-Movie-Looks\Analog\Analog_Film_LUTS (1).cube", "analog_film_01"),
    (r"1-Film-Movie-Looks\Analog\Dramatic_LUTS (1).cube", "dramatic_01"),
    (r"1-Film-Movie-Looks\Analog\Motion_Picture_LUTS (1).cube", "motion_picture_01"),
    (r"1-Film-Movie-Looks\Analog\High_Contrast_LUTS (1).cube", "high_contrast_01"),
    (r"1-Film-Movie-Looks\CinePrint\Alexa 160T OSM.cube", "cineprint_160t"),
    (r"1-Film-Movie-Looks\CinePrint\Alexa 250D OSM.cube", "cineprint_250d"),
    (r"1-Film-Movie-Looks\CinePrint\Alexa 500T OSM.cube", "cineprint_500t"),
    (r"1-Film-Movie-Looks\Kodak\Dehancer-Rec.709-Kodak_Vision3_250D-33.cube", "kodak_250d"),
    (r"1-Film-Movie-Looks\Movie-Looks\28 Days Later - LOG.cube", "movie_28_days"),
    (r"1-Film-Movie-Looks\Movie-Looks\300 - LOG.cube", "movie_300"),
    (r"1-Film-Movie-Looks\Movie-Looks\3h10 to Yuma - LOG.cube", "movie_yuma"),

    # Cinematic
    (r"4-Creative-Styles\Cinematic\TPF - Cinematica 1 - LOG.CUBE", "cinematica_01"),
    (r"4-Creative-Styles\Cinematic\Hollywood Tones LUT #1.cube", "hollywood_tones"),

    # Sci-Fi / Futuristic
    (r"4-Creative-Styles\Sci-Fi-Futuristic\Back To The Future 3 - LOG.cube", "back_to_future"),
    (r"4-Creative-Styles\Sci-Fi-Futuristic\Futuristic LUT #1.cube", "futuristic_01"),
    (r"4-Creative-Styles\Sci-Fi-Futuristic\Sci-Fi LUT #1.cube", "sci_fi_01"),

    # Moody / Dark / Cyber
    (r"4-Creative-Styles\Moody-Dark\08_Midnight.cube", "midnight"),
    (r"4-Creative-Styles\Moody-Dark\4E_Cyber_Night_A.cube", "cyber_night"),

    # Vintage
    (r"4-Creative-Styles\Vintage\Action_Movie_Free_LM (1).cube", "vintage_action"),
    (r"4-Creative-Styles\Vintage\BlockBuster_Tint_Free_LM (1).cube", "vintage_blockbuster"),
]


def parse_cube(filepath: Path):
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
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
        vals = line.split()
        if len(vals) >= 3:
            try:
                data.append([float(vals[0]), float(vals[1]), float(vals[2])])
            except ValueError:
                pass

    if size is None:
        size = int(round(len(data) ** (1.0 / 3.0)))

    expected = size * size * size
    if len(data) < expected:
        raise ValueError(f"Not enough data: got {len(data)}, expected {expected}")

    arr = np.array(data[:expected], dtype=np.float32)
    lut = arr.reshape((size, size, size, 3))
    return lut


def trilinear_sample(lut, r, g, b):
    size = lut.shape[0]
    rf = r * (size - 1)
    gf = g * (size - 1)
    bf = b * (size - 1)

    r0, g0, b0 = int(np.floor(rf)), int(np.floor(gf)), int(np.floor(bf))
    r1 = min(r0 + 1, size - 1)
    g1 = min(g0 + 1, size - 1)
    b1 = min(b0 + 1, size - 1)

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
    tile_count = 8
    tile_size = target_size
    flat = np.zeros((tile_count * tile_size, tile_count * tile_size, 3), dtype=np.float32)

    for by in range(tile_count):
        for bx in range(tile_count):
            b_slice = by * tile_count + bx
            b = b_slice / (target_size - 1) if target_size > 1 else 0.0
            tile_x_start = bx * tile_size
            tile_y_start = by * tile_size
            for gy in range(tile_size):
                for gx in range(tile_size):
                    r = gx / (target_size - 1)
                    g = gy / (target_size - 1)
                    col = trilinear_sample(lut, r, g, b)
                    flat[tile_y_start + gy, tile_x_start + gx] = col

    flat = np.clip(flat * 255.0, 0, 255).astype(np.uint8)
    Image.fromarray(flat).save(out_path)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    success = 0
    failed = 0
    converted_names = []

    for rel_path, out_base in CURATED:
        src = LUT_ROOT / rel_path
        out = OUT_DIR / f"{out_base}.png"
        if not src.exists():
            print(f"MISSING: {src}")
            failed += 1
            continue
        try:
            lut = parse_cube(src)
            cube_to_flat_png(lut, str(out))
            print(f"OK: {out_base}")
            converted_names.append(out_base)
            success += 1
        except Exception as e:
            print(f"FAIL: {out_base} -> {e}")
            failed += 1

    print(f"\nDone. Success: {success}, Failed: {failed}")
    print("Converted LUTs:")
    for name in converted_names:
        print(f"  - {name}.png")


if __name__ == "__main__":
    main()
