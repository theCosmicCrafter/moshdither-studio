#!/usr/bin/env python3
"""Quality audit: does every effect still produce usable, on-purpose output?

WHY THIS EXISTS. `mosh-verify verify-all` answers "did it crash" and "is the
output different from the input". Both can be true of an effect that is
completely broken as ART -- one that blacks the frame out, blows it to white, or
buries the picture under noise. Two real defects shipped past a green suite for
exactly that reason:

  * datamoshing.bloom was a x3.84 gain, so a photographic frame came out PURE
    WHITE (mean 255.0, std 0.3, 100% of pixels near white).
  * noise.fractal defaulted to the MIDPOINT of its slider and buried the image:
    correlation with the source 0.245, 38% of pixels clipped.

Neither crashed. Neither produced an identical frame. Both passed everything.

This script measures three things the existing gates cannot:

  1. CALIBRATION  - is the picture still there? (blackout / blowout / flat /
                    invisible)
  2. TEMPORAL     - do the video outputs hold up across frames, and do temporal
                    effects actually change over time?
  3. ADHERENCE    - does each effect do what its CATEGORY claims? A "dither"
                    that does not quantise is broken however pretty it looks.

USE A PHOTOGRAPHIC TEST IMAGE. `tests/fixtures/test-image.png` is a saturated
colour chart with 46% of its channels pinned at 255. It makes artistic.solarize
look like it blacks out the frame when it is behaving correctly, and its darker
aggregate HID the bloom white-out. This script generates its own photographic
image (fixed seed, reproducible) unless you pass --image.

    python evals/quality-audit.py [--image PATH] [--out DIR] [--quick]

Writes evals/reports/quality-audit.json and quality-audit.md.
Exit code is non-zero if anything is flagged, so it can gate a release.
"""
import argparse
import csv
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit(
        "This audit needs numpy and Pillow.\n"
        "  Use the SAM3 env, e.g.  sam3_env_cpu/Scripts/python.exe evals/quality-audit.py"
    )

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN = os.path.join(ROOT, "src-tauri", "bin")
FFMPEG = os.path.join(BIN, "ffmpeg-x86_64-pc-windows-msvc.exe")
VERIFY = os.path.join(ROOT, "src-tauri", "target", "release", "mosh-verify.exe")

# Effects that cannot demonstrate anything from a bare still frame: they need
# audio, a LUT, an overlay image, a mask, or several frames. Reported, never
# failed. Each entry needs a reason -- "it was failing" is not one.
NEEDS_INPUT = {
    # No audio stream in a still-frame harness.
    "audio_reactive.bass_pulse", "audio_reactive.beat_glitch",
    "audio_reactive.chromatic", "audio_reactive.pixelate",
    "audio_reactive.spectral_shift", "audio_reactive.spectrum",
    "audio_reactive.waveform", "audio_reactive.audio_dither",
    # Need a file or a mask the harness does not supply.
    "color.lut_grading", "composite.overlay", "mask_isolate",
    # Neutral at defaults BY DESIGN: a grading control should start at unity.
    "color.lift_gamma_gain", "color.brightness_contrast",
    # Temporal: they rearrange frames, so one still frame cannot show them.
    "datamoshing.frame_reverse", "datamoshing.frame_hold", "datamoshing.stop",
    "datamoshing.rise", "datamoshing.beat_hold", "datamoshing.beat_smear",
    "datamoshing.cross_video", "datamoshing.frame_sort_by_size",
    "datamoshing.iframe_removal_advanced",
}

# Effects that are static in VIDEO on purpose.
INTENDED_STATIC = {"datamoshing.frame_hold"}


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def make_photo_image(path):
    """A photographic tone distribution, fixed seed, reproducible."""
    H, W = 540, 960
    yy, _ = np.mgrid[0:H, 0:W].astype(np.float64)

    def octaves(seed, n=5):
        r = np.random.default_rng(seed)
        acc, amp = np.zeros((H, W)), 1.0
        for k in range(n):
            h, w = max(2, H >> (n - k)), max(2, W >> (n - k))
            small = (r.random((h, w)) * 255).astype(np.uint8)
            acc += np.asarray(Image.fromarray(small).resize((W, H), Image.BICUBIC)) / 255.0 * amp
            amp *= 0.5
        return acc / acc.max()

    base = 0.35 + 0.45 * (1 - yy / H) + 0.35 * (octaves(1) - 0.5)
    r = base * (1.00 + 0.16 * (octaves(2) - 0.5))
    g = base * (0.96 + 0.14 * (octaves(3) - 0.5))
    b = base * (0.90 + 0.20 * (octaves(4) - 0.5)) + 0.06 * (1 - yy / H)
    img = np.clip(np.stack([r, g, b], -1), 0, 1)
    spec = octaves(5) > 0.88
    img[spec] = np.clip(img[spec] * 1.6, 0, 1)
    img = np.clip(img + np.random.default_rng(7).normal(0, 0.006, img.shape), 0, 1)
    Image.fromarray((img * 255).astype(np.uint8)).save(path)
    return path


def make_audio_bake(path, fps=24.0, n=48):
    """A synthetic 120 BPM bake so audio-reactive effects have something real."""
    import math
    frames = []
    for i in range(n):
        t, beat = i / fps, (i % 12) == 0
        env = 0.5 + 0.5 * math.sin(2 * math.pi * t / 2.0)
        hit = 1.0 if beat else max(0.0, 1.0 - (i % 12) / 6.0)
        frames.append({
            "frame": i, "time": t, "rms": 0.2 + 0.6 * env, "energy": 0.3 + 0.7 * hit,
            "spectral_centroid": 1800 + 900 * env, "spectral_flatness": 0.25,
            "spectral_rolloff": 6200 + 1500 * env, "spectral_flux": 0.4 * hit,
            "zcr": 0.12 + 0.1 * env, "volume": 0.35 + 0.6 * env,
            "sub_bass": 0.85 * hit, "bass": 0.9 * hit, "low_mid": 0.5 * env,
            "mid": 0.55 * env, "high_mid": 0.45 * env, "presence": 0.4 * env,
            "brilliance": 0.3 * env, "beat_bass": beat, "beat_mid": (i % 6) == 0,
            "beat_treble": (i % 3) == 0, "beat_energy": 1.0 if beat else 0.2,
        })
    json.dump({"fps": fps, "total_frames": n, "bpm": 120.0, "frames": frames}, open(path, "w"))
    return path, {i for i in range(n) if (i % 12) == 0}


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def read_report(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        return list(csv.DictReader(fh, delimiter="|"))


def analyse_images(render_dir, src_path, categories):
    src = np.asarray(Image.open(src_path).convert("RGB")).astype(np.int32)
    srcL, out = lum(src), []
    src_pal = palette(src)
    src_hf = hf_energy(srcL)
    for r in read_report(os.path.join(render_dir, "render-report.csv")):
        if r["status"] != "OK" or not r["output"].startswith("images/"):
            continue
        p = os.path.join(render_dir, r["output"])
        if not os.path.exists(p):
            out.append({"effect_id": r["effect_id"], "flags": ["MISSING_OUTPUT"]})
            continue
        o = np.asarray(Image.open(p).convert("RGB")).astype(np.int32)
        oL = lum(o)
        rec = {
            "effect_id": r["effect_id"],
            "mean": float(oL.mean()), "std": float(oL.std()),
            "black_frac": float((oL < 4).mean()), "white_frac": float((oL > 251).mean()),
            "palette_ratio": palette(o) / src_pal,
            "hf_ratio": hf_energy(oL) / src_hf,
        }
        if o.shape == src.shape:
            rec["luma_diff"] = float(np.abs(oL - srcL).mean())
            # Chroma, and the plain share of pixels that moved at all. A
            # luma-only metric called analog.color_bleed invisible when it was
            # changing 49% of the frame -- it shifts COLOUR and leaves
            # luminance almost untouched, which is the whole point of it.
            rec["chroma_diff"] = float(
                np.abs((o - oL[..., None]) - (src - srcL[..., None])).mean()
            )
            rec["pixels_changed"] = float((np.abs(o - src).max(axis=2) > 3).mean())
            a, b = srcL.ravel(), oL.ravel()
            rec["corr"] = float(np.corrcoef(a, b)[0, 1]) if b.std() > 0 else 0.0
        flags = []
        if rec["black_frac"] > 0.90: flags.append("BLACKS_OUT")
        if rec["white_frac"] > 0.90: flags.append("BLOWS_OUT")
        if rec["std"] < 6: flags.append("FLATTENS")
        if r["effect_id"] not in NEEDS_INPUT:
            if (
                rec.get("luma_diff", 1.0) < 0.75
                and rec.get("chroma_diff", 1.0) < 0.5
                and rec.get("pixels_changed", 1.0) < 0.02
                and rec["palette_ratio"] > 0.9
            ):
                flags.append("NO_VISIBLE_CHANGE")
            # Noise that destroys the picture is not noise, it is static.
            #
            # Deliberately NOT applied to Dithering: a 1-bit dither is binary,
            # so low pixel-wise correlation and high HF energy are exactly what
            # it is FOR. Judging it by this rule flagged 16 working dithers.
            # Quantisation is checked by the Dithering category claim instead.
            # Datamoshing joins Dithering here: a block shuffle moves 98.9% of
            # the frame, so of course it decorrelates -- that IS the effect.
            if (
                categories.get(r["effect_id"]) not in ("Dithering", "Datamoshing")
                and "corr" in rec
                and rec["corr"] < 0.4
                and rec["hf_ratio"] > 3
            ):
                flags.append("BURIES_THE_IMAGE")
        rec["flags"] = flags
        out.append(rec)
    return out


def palette(a):
    p = (a[..., 0].astype(np.int64) << 16) | (a[..., 1].astype(np.int64) << 8) | a[..., 2]
    return max(1, len(np.unique(p)))


def hf_energy(L):
    k = L[1:-1, 1:-1] * 4 - L[:-2, 1:-1] - L[2:, 1:-1] - L[1:-1, :-2] - L[1:-1, 2:]
    return max(1e-6, float(np.abs(k).mean()))


def video_frames(path, tag, workdir, n=12):
    """Frames sampled EVENLY across the clip, not the first n.

    Effects that duplicate keyframes -- profile_bloom repeats each one
    `bloom_size` times -- look frozen if you only ever read the opening run of
    identical frames. Decoding the whole clip at thumbnail size is cheap and
    removes the artefact entirely.
    """
    d = os.path.join(workdir, tag)
    os.makedirs(d, exist_ok=True)
    if not os.listdir(d):
        run([FFMPEG, "-v", "error", "-i", path, "-vf", "scale=128:72",
             os.path.join(d, "%04d.png"), "-y"])
    fs = sorted(f for f in os.listdir(d) if f.endswith(".png"))
    if len(fs) > n:
        step = len(fs) / float(n)
        fs = [fs[min(len(fs) - 1, int(i * step))] for i in range(n)]
    return [np.asarray(Image.open(os.path.join(d, f)).convert("L")).astype(float) for f in fs]


def analyse_videos(render_dir, workdir, src_video):
    src = video_frames(src_video, "__source__", workdir)
    src_moves = len(src) > 1 and max(
        float(np.abs(src[i] - src[i - 1]).mean()) for i in range(1, len(src))
    ) > 0.5
    out = []
    for r in read_report(os.path.join(render_dir, "render-report.csv")):
        if r["status"] != "OK" or not r["output"].startswith("videos/"):
            continue
        p = os.path.join(render_dir, r["output"])
        fr = video_frames(p, r["effect_id"].replace(".", "_"), workdir)
        if len(fr) < 2:
            out.append({"effect_id": r["effect_id"], "flags": ["TOO_FEW_FRAMES"]})
            continue
        deltas = [float(np.abs(fr[i] - fr[i - 1]).mean()) for i in range(1, len(fr))]
        rec = {
            "effect_id": r["effect_id"], "frames": len(fr),
            "mean_min": min(f.mean() for f in fr), "mean_max": max(f.mean() for f in fr),
            "std_min": min(f.std() for f in fr),
            "black_max": max(float((f < 4).mean()) for f in fr),
            "white_max": max(float((f > 251).mean()) for f in fr),
            "delta_max": max(deltas),
        }
        flags = []
        if rec["black_max"] > 0.90: flags.append("BLACKS_OUT")
        if rec["white_max"] > 0.90: flags.append("BLOWS_OUT")
        if rec["std_min"] < 6: flags.append("FLATTENS")
        if rec["delta_max"] < 0.5 and src_moves and r["effect_id"] not in INTENDED_STATIC:
            flags.append("FROZEN")
        rec["flags"] = flags
        out.append(rec)
    return out


# Category claims. Each is the defining property of the category -- if it does
# not hold, the effect is not doing what the tool says it does.
CLAIMS = {
    "Dithering": ("palette_ratio", lambda v: v < 0.5, "must quantise the palette"),
    "Noise": ("hf_ratio", lambda v: v > 1.2, "must add high-frequency detail"),
    "PixelGeometry": ("luma_diff", lambda v: v > 1.0, "must rearrange pixels"),
    "Color": ("luma_diff", lambda v: v > 0.75, "must alter colour"),
}


def analyse_adherence(images, categories):
    out = []
    for rec in images:
        eid = rec["effect_id"]
        cat = categories.get(eid)
        claim = CLAIMS.get(cat)
        if not claim or eid in NEEDS_INPUT:
            out.append({"effect_id": eid, "category": cat, "verdict": "not asserted"})
            continue
        key, ok, desc = claim
        v = rec.get(key)
        passed = v is not None and ok(v)
        out.append({"effect_id": eid, "category": cat, "metric": key, "value": v,
                    "claim": desc, "verdict": "OK" if passed else "VIOLATED"})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image")
    ap.add_argument("--out", default=os.path.join(ROOT, "evals", "reports"))
    ap.add_argument("--work", default=os.path.join(ROOT, "outputs", "quality-audit"))
    ap.add_argument("--quick", action="store_true", help="skip animate + audio passes")
    args = ap.parse_args()

    for p, what in ((FFMPEG, "ffmpeg sidecar"), (VERIFY, "mosh-verify")):
        if not os.path.exists(p):
            sys.exit(f"missing {what}: {p}\n  Build it: cargo build --release --bin mosh-verify")

    os.makedirs(args.out, exist_ok=True)
    os.makedirs(args.work, exist_ok=True)
    img = args.image or make_photo_image(os.path.join(args.work, "photo-test.png"))
    video = os.path.join(ROOT, "tests", "fixtures", "test-video.mp4")

    categories = {}
    for line in run([VERIFY, "list-effects"]).stdout.splitlines():
        p = line.split()
        if len(p) >= 2 and ("." in p[0] or p[0] == "mask_isolate"):
            categories[p[0]] = p[1]

    render_dir = os.path.join(args.work, "render")
    print("[1/4] rendering every effect on a photographic image and a video ...")
    run([VERIFY, "render-all", "--image", img, "--video", video, "--output", render_dir])

    print("[2/4] measuring still calibration and category adherence ...")
    images = analyse_images(render_dir, img, categories)
    adherence = analyse_adherence(images, categories)

    print("[3/4] measuring video outputs across frames ...")
    videos = analyse_videos(render_dir, os.path.join(args.work, "frames"), video)

    audio = []
    if not args.quick:
        print("[4/4] rendering audio-reactive effects against a 120 BPM bake ...")
        bake, beats = make_audio_bake(os.path.join(args.work, "audio-bake.json"))
        adir = os.path.join(args.work, "audio")
        run([VERIFY, "audio-render", "--video", video, "--audio-bake", bake, "--output", adir])
        fdir = os.path.join(args.work, "audio-frames")
        for f in sorted(os.listdir(adir)) if os.path.isdir(adir) else []:
            if not f.endswith(".mp4"):
                continue
            fr = video_frames(os.path.join(adir, f), f[:-4], fdir, n=48)
            if len(fr) < 3:
                continue
            d = [float(np.abs(fr[i] - fr[i - 1]).mean()) for i in range(1, len(fr))]
            bd = [d[i - 1] for i in range(1, len(fr)) if i in beats]
            od = [d[i - 1] for i in range(1, len(fr)) if i not in beats]
            audio.append({
                "effect": f[:-4], "frames": len(fr),
                "beat_delta": float(np.mean(bd)) if bd else 0.0,
                "other_delta": float(np.mean(od)) if od else 0.0,
                "reacts": max(d) > 0.5,
            })
    else:
        print("[4/4] skipped (--quick)")

    flagged_img = [r for r in images if r.get("flags")]
    flagged_vid = [r for r in videos if r.get("flags")]
    violations = [r for r in adherence if r["verdict"] == "VIOLATED"]
    dead_audio = [r for r in audio if not r["reacts"]]

    report = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "image": os.path.basename(img),
        "counts": {
            "effects_rendered_still": len(images),
            "effects_rendered_video": len(videos),
            "audio_effects": len(audio),
            "still_flagged": len(flagged_img),
            "video_flagged": len(flagged_vid),
            "adherence_violations": len(violations),
            "audio_not_reacting": len(dead_audio),
        },
        "images": images, "videos": videos, "adherence": adherence, "audio": audio,
    }
    jpath = os.path.join(args.out, "quality-audit.json")
    json.dump(report, open(jpath, "w"), indent=1)

    lines = [
        "# Quality audit", "",
        f"Generated {report['generated']} from `{report['image']}`.",
        "Produced by `evals/quality-audit.py`. Regenerate before any release.", "",
        "| Check | Result |", "|---|---|",
        f"| Effects rendered (still) | {len(images)} |",
        f"| Effects rendered (video) | {len(videos)} |",
        f"| Still calibration flags | **{len(flagged_img)}** |",
        f"| Video calibration flags | **{len(flagged_vid)}** |",
        f"| Category-claim violations | **{len(violations)}** |",
        f"| Audio-reactive effects not reacting | **{len(dead_audio)}** |",
        "",
    ]
    asserted = [r for r in adherence if r["verdict"] in ("OK", "VIOLATED")]
    bycat = {}
    for r in asserted:
        bycat.setdefault(r["category"], []).append(r)
    lines += ["## Category claims upheld", "", "| Category | Claim | Upheld |", "|---|---|---|"]
    for c in sorted(bycat):
        ok = sum(1 for r in bycat[c] if r["verdict"] == "OK")
        lines.append(f"| {c} | {CLAIMS[c][2]} | {ok}/{len(bycat[c])} |")
    lines.append("")

    def section(title, rows, fmt):
        lines.append(f"## {title}")
        lines.append("")
        if not rows:
            lines.append("None.")
        else:
            for r in rows:
                lines.append("- " + fmt(r))
        lines.append("")

    section("Still frames flagged", flagged_img,
            lambda r: f"`{r['effect_id']}` — {', '.join(r['flags'])}")
    section("Video outputs flagged", flagged_vid,
            lambda r: f"`{r['effect_id']}` — {', '.join(r['flags'])}")
    section("Category-claim violations", violations,
            lambda r: f"`{r['effect_id']}` ({r['category']}) {r['claim']}, measured {r['value']:.3f}")
    if audio:
        lines += ["## Audio reactivity", "", "| Effect | delta on beats | delta elsewhere |", "|---|---|---|"]
        for r in sorted(audio, key=lambda x: -x["beat_delta"]):
            lines.append(f"| `{r['effect']}` | {r['beat_delta']:.2f} | {r['other_delta']:.2f} |")
        lines.append("")

    mpath = os.path.join(args.out, "quality-audit.md")
    open(mpath, "w", encoding="utf-8").write("\n".join(lines))

    print(f"\nwrote {jpath}\nwrote {mpath}")
    total = len(flagged_img) + len(flagged_vid) + len(violations) + len(dead_audio)
    print(f"\n{total} issue(s) flagged.")
    for r in flagged_img: print("  still:", r["effect_id"], r["flags"])
    for r in flagged_vid: print("  video:", r["effect_id"], r["flags"])
    for r in violations: print("  claim:", r["effect_id"], r["claim"], r["value"])
    for r in dead_audio: print("  audio:", r["effect"], "does not react")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
