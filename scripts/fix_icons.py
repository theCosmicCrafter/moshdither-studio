#!/usr/bin/env python3
"""
Fix the MoshDither Studio icon set:
  - Replace the light/white background border with pure black.
  - Crop to the logo content and scale it back up so the logo fills the icon.

Processes:
  public/favicon.png
  src-tauri/icons/32x32.png
  src-tauri/icons/128x128.png
  src-tauri/icons/128x128@2x.png
"""

from pathlib import Path

from PIL import Image


PROJECT_ROOT = Path(__file__).parent.parent
PUBLIC_FAVICON = PROJECT_ROOT / "public" / "favicon.png"
ICONS = [
    PROJECT_ROOT / "src-tauri" / "icons" / "32x32.png",
    PROJECT_ROOT / "src-tauri" / "icons" / "128x128.png",
    PROJECT_ROOT / "src-tauri" / "icons" / "128x128@2x.png",
]
ICON_ICO = PROJECT_ROOT / "src-tauri" / "icons" / "icon.ico"


def is_logo_pixel(r, g, b, a):
    """Heuristic: logo pixels are bright and saturated; background is dark, white, or desaturated."""
    if a < 128:
        return False
    brightness = max(r, g, b)
    saturation = max(r, g, b) - min(r, g, b)
    # Near-white/light-gray border pixels are background.
    if brightness > 200 and saturation < 40:
        return False
    # Logo colors are bright and moderately saturated.
    return brightness > 120 and saturation > 50


def find_content_box(im: Image.Image):
    """Find the bounding box of logo pixels."""
    pixels = im.load()
    width, height = im.size
    min_x, min_y = width, height
    max_x, max_y = -1, -1
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if is_logo_pixel(r, g, b, a):
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y
    if max_x < min_x:
        return None
    return (min_x, min_y, max_x + 1, max_y + 1)


def make_black_background(im: Image.Image) -> Image.Image:
    """Set every pixel that is not part of the logo to black."""
    result = im.copy()
    pixels = result.load()
    width, height = result.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if not is_logo_pixel(r, g, b, a):
                pixels[x, y] = (0, 0, 0, 255)
    return result


def fix_favicon(path: Path):
    """For the favicon, simply replace the white/light border with black."""
    im = Image.open(path).convert("RGBA")
    out = make_black_background(im)
    out.save(path)
    print(f"[OK] {path}")


def fix_icon(path: Path):
    """Crop to the logo and scale it up so the logo fills the icon."""
    im = Image.open(path).convert("RGBA")

    # First make the background black.
    im = make_black_background(im)

    # Find the content box and crop with a small padding.
    box = find_content_box(im)
    if box is None:
        print(f"[WARN] Could not find logo content in {path}")
        im.save(path)
        return

    min_x, min_y, max_x, max_y = box
    content_w = max_x - min_x
    content_h = max_y - min_y

    # Add a small padding so the logo isn't touching the edge.
    padding = max(1, int(min(content_w, content_h) * 0.05))
    min_x = max(0, min_x - padding)
    min_y = max(0, min_y - padding)
    max_x = min(im.width, max_x + padding)
    max_y = min(im.height, max_y + padding)

    cropped = im.crop((min_x, min_y, max_x, max_y))
    # Scale back to the original size.
    scaled = cropped.resize(im.size, Image.Resampling.LANCZOS)
    scaled.save(path)
    print(f"[OK] {path}")


def main():
    try:
        from PIL import Image
    except ImportError as e:
        print(f"[ERROR] Pillow is required: {e}")
        print("Install with: pip install Pillow")
        raise SystemExit(1)

    print("Fixing icon set...")
    fix_favicon(PUBLIC_FAVICON)
    for icon_path in ICONS:
        fix_icon(icon_path)

    # Rebuild the Windows .ico file from the fixed PNGs.
    ico_images = [Image.open(p).convert("RGBA") for p in ICONS]
    ico_images[0].save(ICON_ICO, format="ICO", sizes=[(32, 32), (128, 128), (256, 256)])
    print(f"[OK] {ICON_ICO}")
    print("Done. Restart the app to see the updated icons.")


if __name__ == "__main__":
    main()
