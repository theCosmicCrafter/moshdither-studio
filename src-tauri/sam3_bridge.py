#!/usr/bin/env python3
"""SAM3 inference bridge — JSON IPC over stdin/stdout.

Rust spawns this process and communicates via JSON lines.
The model stays loaded in memory for fast interactive use.

Supported modes:
  • text_prompt   — open-vocabulary segmentation via Sam3Processor
  • point_prompt  — interactive point-click via SAM3InteractiveImagePredictor
  • box_prompt    — interactive box via SAM3InteractiveImagePredictor
"""

import sys
import json
import base64
import io
import os
import logging
import struct
import hmac
import hashlib
import secrets
from pathlib import Path

import numpy as np
from PIL import Image
import torch

# Add the cloned repo to path
SAM3_REPO = Path(__file__).parent.parent / "sam3_repo"
sys.path.insert(0, str(SAM3_REPO))

from sam3.model_builder import build_sam3_image_model
from sam3.model.sam3_image_processor import Sam3Processor

# ── Configuration ──────────────────────────────────────────────
_DEFAULT_CHECKPOINT = Path.home() / ".moshdither" / "models" / "sam3" / "sam3.pt"
CHECKPOINT_PATH = os.environ.get("SAM3_CHECKPOINT", str(_DEFAULT_CHECKPOINT))
DEVICE = os.environ.get("SAM3_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
USE_AMP = os.environ.get("SAM3_USE_AMP", "1") == "1"

# ── Globals ────────────────────────────────────────────────────
model = None
processor = None         # Sam3Processor (text / box grounding)
inter_predictor = None   # SAM3InteractiveImagePredictor (point / box interactive)
current_image = None
orig_hw = None
inference_state = None   # state returned by processor.set_image()

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.info

_AUTH_TOKEN: str | None = None


def _write_frame(data: bytes):
    """Write a length-prefixed frame to stdout: 4-byte LE length + payload."""
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def send_response(response: dict):
    """Write JSON response as a length-prefixed frame."""
    _write_frame(json.dumps(response).encode("utf-8"))


def _read_frame() -> bytes | None:
    """Read a length-prefixed frame from stdin."""
    len_bytes = sys.stdin.buffer.read(4)
    if len(len_bytes) < 4:
        return None
    payload_len = struct.unpack("<I", len_bytes)[0]
    if payload_len > 64 * 1024 * 1024:  # 64 MiB sanity limit
        raise ValueError(f"Frame size {payload_len} exceeds 64 MiB safety limit")
    payload = sys.stdin.buffer.read(payload_len)
    if len(payload) < payload_len:
        return None
    return payload


def _verify_auth(token: str) -> bool:
    """Verify the shared auth token delivered by Rust during handshake."""
    return _AUTH_TOKEN is not None and hmac.compare_digest(_AUTH_TOKEN, token)


def _do_auth_handshake():
    """Expect the first frame from Rust to be the auth handshake."""
    global _AUTH_TOKEN
    payload = _read_frame()
    if payload is None:
        raise RuntimeError("EOF before auth handshake")
    req = json.loads(payload.decode("utf-8"))
    token = req.get("auth_token", "")
    _AUTH_TOKEN = token
    send_response({"status": "auth_ok"})


def ensure_model_loaded():
    """Lazy-load SAM3 model on first use."""
    global model, processor, inter_predictor
    if model is not None:
        return
    log("Loading SAM3 model from %s on %s ...", CHECKPOINT_PATH, DEVICE)
    if not Path(CHECKPOINT_PATH).exists():
        raise FileNotFoundError(
            f"Checkpoint not found: {CHECKPOINT_PATH}\n"
            f"Set SAM3_CHECKPOINT env var or run scripts/setup_sam3.py to download the model."
        )
    try:
        model = build_sam3_image_model(
            checkpoint_path=CHECKPOINT_PATH,
            device=DEVICE,
            eval_mode=True,
            load_from_HF=False,
            enable_segmentation=True,
            enable_inst_interactivity=True,
        )
    except RuntimeError as e:
        if "out of memory" in str(e).lower():
            raise RuntimeError(
                f"CUDA out of memory while loading SAM3 model on {DEVICE}. "
                f"Try setting SAM3_DEVICE=cpu or closing other GPU applications."
            ) from e
        raise
    if DEVICE == "cuda":
        # Throughput knobs similar to high-performance inference stacks.
        torch.backends.cudnn.benchmark = True
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
    processor = Sam3Processor(model, device=DEVICE, confidence_threshold=0.05)
    if model.inst_interactive_predictor is not None:
        inter_predictor = model.inst_interactive_predictor
    log("SAM3 model loaded on %s.", DEVICE)


def pil_from_base64(data_url: str) -> Image.Image:
    """Convert a base64 data URL to PIL Image (RGB)."""
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    try:
        raw = base64.b64decode(data_url, validate=True)
    except Exception as e:
        raise ValueError(f"Invalid base64 image data: {e}") from e
    try:
        img = Image.open(io.BytesIO(raw))
    except Exception as e:
        raise ValueError(f"Cannot open image from base64: {e}") from e
    return img.convert("RGB")


def mask_to_base64(mask: np.ndarray) -> str:
    """Encode a boolean/float mask as base64 PNG."""
    if mask.dtype == bool:
        mask_u8 = (mask * 255).astype(np.uint8)
    elif mask.dtype in (np.float32, np.float64):
        mask_u8 = (mask * 255).astype(np.uint8)
    else:
        mask_u8 = mask.astype(np.uint8)
    img = Image.fromarray(mask_u8, mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


# ── Command Handlers ─────────────────────────────────────────

def cmd_load_image(image_b64: str):
    global current_image, orig_hw, inference_state
    try:
        ensure_model_loaded()
    except Exception as e:
        return {"status": "error", "message": f"Model load failed: {e}"}

    try:
        image = pil_from_base64(image_b64)
    except ValueError as e:
        return {"status": "error", "message": str(e)}

    current_image = image
    orig_hw = (image.height, image.width)

    try:
        # Set image in the text/grounding processor and capture inference state.
        with torch.inference_mode():
            if DEVICE == "cuda" and USE_AMP:
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    inference_state = processor.set_image(image)
            else:
                inference_state = processor.set_image(image)

        # CRITICAL: also prime the interactive predictor so point/box prompts work.
        # inter_predictor keeps its own internal image state separate from processor.
        if inter_predictor is not None:
            with torch.inference_mode():
                if DEVICE == "cuda" and USE_AMP:
                    with torch.autocast(device_type="cuda", dtype=torch.float16):
                        inter_predictor.set_image(image)
                else:
                    inter_predictor.set_image(image)
    except RuntimeError as e:
        if "out of memory" in str(e).lower():
            return {"status": "error", "message": f"CUDA out of memory during image encoding: {e}"}
        return {"status": "error", "message": f"Image encoding failed: {e}"}

    return {"status": "ok", "width": image.width, "height": image.height}


def cmd_text_prompt(prompt: str):
    global inference_state
    if inference_state is None:
        return {"status": "error", "message": "No image loaded"}

    try:
        with torch.inference_mode():
            if DEVICE == "cuda" and USE_AMP:
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    state = processor.set_text_prompt(prompt=prompt, state=inference_state)
            else:
                state = processor.set_text_prompt(prompt=prompt, state=inference_state)
    except RuntimeError as e:
        if "out of memory" in str(e).lower():
            if DEVICE == "cuda":
                torch.cuda.empty_cache()
            return {"status": "error", "message": f"CUDA out of memory during text inference: {e}"}
        raise

    masks = state["masks"].to(torch.float32).cpu().numpy()   # float array [N, 1, H, W]
    scores = state["scores"].to(torch.float32).cpu().numpy()  # float array [N]

    # Update global state so subsequent prompts build on this
    inference_state = state

    # Squeeze extra channel dim
    mask_list = [masks[i].squeeze() for i in range(masks.shape[0])]
    return {
        "status": "ok",
        "count": len(mask_list),
        "masks": [mask_to_base64(m) for m in mask_list],
        "scores": [float(s) for s in scores],
    }


def cmd_point_prompt(points: list, labels: list = None):
    if inter_predictor is None:
        return {"status": "error", "message": "Interactive predictor not available"}
    if current_image is None:
        return {"status": "error", "message": "No image loaded — call load_image first"}

    points_np = np.array(points, dtype=np.float32)   # shape [N, 2]
    labels_np = np.array(labels if labels else [1] * len(points), dtype=np.int32)

    try:
        with torch.inference_mode():
            if DEVICE == "cuda" and USE_AMP:
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    masks, scores, _ = inter_predictor.predict(
                        point_coords=points_np,
                        point_labels=labels_np,
                        multimask_output=True,
                    )
            else:
                masks, scores, _ = inter_predictor.predict(
                    point_coords=points_np,
                    point_labels=labels_np,
                    multimask_output=True,
                )
    except RuntimeError as e:
        if "out of memory" in str(e).lower():
            if DEVICE == "cuda":
                torch.cuda.empty_cache()
            return {"status": "error", "message": f"CUDA out of memory during point inference: {e}"}
        raise

    # inter_predictor.predict() returns:
    #   masks  — np.ndarray [num_masks, H, W]  (3 masks when multimask_output=True)
    #   scores — np.ndarray [num_masks]
    # Return all masks sorted by score (highest first) so the user can pick.
    if masks.ndim == 3:
        sorted_indices = np.argsort(scores)[::-1]
        all_masks = [masks[i] for i in sorted_indices]
        all_scores = [float(scores[i]) for i in sorted_indices]
    else:
        # Fallback for unexpected shape
        all_masks = [masks[0] if masks.ndim >= 2 else masks]
        all_scores = [float(scores[0]) if hasattr(scores, '__len__') else float(scores)]

    return {
        "status": "ok",
        "count": len(all_masks),
        "masks": [mask_to_base64(m) for m in all_masks],
        "scores": all_scores,
    }


def cmd_box_prompt(boxes: list):
    if inter_predictor is None:
        return {"status": "error", "message": "Interactive predictor not available"}
    if current_image is None:
        return {"status": "error", "message": "No image loaded — call load_image first"}

    results = []
    all_scores = []
    for box in boxes:
        box_np = np.array(box, dtype=np.float32)  # [x0, y0, x1, y1]
        try:
            with torch.inference_mode():
                if DEVICE == "cuda" and USE_AMP:
                    with torch.autocast(device_type="cuda", dtype=torch.float16):
                        masks, scores, _ = inter_predictor.predict(
                            box=box_np,
                            multimask_output=True,
                        )
                else:
                    masks, scores, _ = inter_predictor.predict(
                        box=box_np,
                        multimask_output=True,
                    )
        except RuntimeError as e:
            if "out of memory" in str(e).lower():
                if DEVICE == "cuda":
                    torch.cuda.empty_cache()
                return {"status": "error", "message": f"CUDA out of memory during box inference: {e}"}
            raise
        # masks shape: [num_masks, H, W] — return all masks sorted by score
        if masks.ndim == 3:
            sorted_indices = np.argsort(scores)[::-1]
            for i in sorted_indices:
                results.append(masks[i])
                all_scores.append(float(scores[i]))
        else:
            results.append(masks[0] if masks.ndim >= 2 else masks)
            all_scores.append(float(scores[0]) if hasattr(scores, '__len__') else float(scores))

    return {
        "status": "ok",
        "count": len(results),
        "masks": [mask_to_base64(m) for m in results],
        "scores": all_scores,
    }


def mask_iou(a: np.ndarray, b: np.ndarray) -> float:
    """Compute IoU between two boolean masks."""
    inter = np.logical_and(a, b).sum()
    union = np.logical_or(a, b).sum()
    return float(inter / union) if union > 0 else 0.0


def deduplicate_masks(masks: list[np.ndarray], scores: list[float], iou_threshold: float = 0.7):
    """Sort by score descending and drop masks that overlap too much with a higher-scoring mask."""
    indexed = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
    keep_masks = []
    keep_scores = []
    keep_indices = []
    for idx, score in indexed:
        m = masks[idx]
        duplicate = False
        for kept in keep_masks:
            if mask_iou(m, kept) > iou_threshold:
                duplicate = True
                break
        if not duplicate:
            keep_masks.append(m)
            keep_scores.append(score)
            keep_indices.append(idx)
    return keep_masks, keep_scores, keep_indices


def cmd_auto_mask(grid_size: int = 16, iou_threshold: float = 0.7, min_mask_region_area: int = 100):
    """Generate masks automatically by sampling a grid of point prompts."""
    if inter_predictor is None:
        return {"status": "error", "message": "Interactive predictor not available"}
    if current_image is None:
        return {"status": "error", "message": "No image loaded — call load_image first"}

    w, h = current_image.size
    xs = np.linspace(0, w - 1, grid_size)
    ys = np.linspace(0, h - 1, grid_size)

    all_masks = []
    all_scores = []

    try:
        for y in ys:
            for x in xs:
                point = np.array([[x, y]], dtype=np.float32)
                label = np.array([1], dtype=np.int32)
                with torch.inference_mode():
                    if DEVICE == "cuda" and USE_AMP:
                        with torch.autocast(device_type="cuda", dtype=torch.float16):
                            masks, scores, _ = inter_predictor.predict(
                                point_coords=point,
                                point_labels=label,
                                multimask_output=True,
                            )
                    else:
                        masks, scores, _ = inter_predictor.predict(
                            point_coords=point,
                            point_labels=label,
                            multimask_output=True,
                        )
                if masks.ndim == 3:
                    for i in range(masks.shape[0]):
                        all_masks.append(masks[i])
                        all_scores.append(float(scores[i]))
                else:
                    all_masks.append(masks[0] if masks.ndim >= 2 else masks)
                    all_scores.append(float(scores[0]) if hasattr(scores, "__len__") else float(scores))
    except RuntimeError as e:
        if "out of memory" in str(e).lower():
            if DEVICE == "cuda":
                torch.cuda.empty_cache()
            return {"status": "error", "message": f"CUDA out of memory during auto-mask: {e}"}
        raise

    # Deduplicate by IoU
    keep_masks, keep_scores, _ = deduplicate_masks(all_masks, all_scores, iou_threshold=iou_threshold)

    # Filter tiny masks
    if min_mask_region_area > 0:
        keep_masks, keep_scores = zip(
            *[(m, s) for m, s in zip(keep_masks, keep_scores) if m.sum() >= min_mask_region_area]
        ) if keep_masks else ([], [])

    return {
        "status": "ok",
        "count": len(keep_masks),
        "masks": [mask_to_base64(m) for m in keep_masks],
        "scores": list(keep_scores),
    }


def cmd_postprocess_mask(mask_b64: str, grow: int = 0, shrink: int = 0, feather: int = 0, fill_holes: bool = False):
    """Apply morphological post-processing to a mask."""
    try:
        mask_img = pil_from_base64(mask_b64)
    except ValueError as e:
        return {"status": "error", "message": str(e)}

    mask_np = np.array(mask_img.convert("L"), dtype=np.uint8)
    # Threshold to boolean
    binary = mask_np > 127

    try:
        import cv2
        have_cv2 = True
    except ImportError:
        have_cv2 = False

    if have_cv2:
        binary_u8 = binary.astype(np.uint8) * 255

        # Grow (dilate)
        if grow > 0:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (grow * 2 + 1, grow * 2 + 1))
            binary_u8 = cv2.dilate(binary_u8, kernel, iterations=1)

        # Shrink (erode)
        if shrink > 0:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (shrink * 2 + 1, shrink * 2 + 1))
            binary_u8 = cv2.erode(binary_u8, kernel, iterations=1)

        # Fill holes
        if fill_holes:
            h, w = binary_u8.shape
            # Invert so background becomes white; flood fill outer background from border,
            # leaving only holes as white; then OR with original to fill them.
            inv = cv2.bitwise_not(binary_u8)
            mask_ff = np.zeros((h + 2, w + 2), dtype=np.uint8)
            cv2.floodFill(inv, mask_ff, (0, 0), 0)
            # inv now has holes=255, everything else=0
            binary_u8 = cv2.bitwise_or(binary_u8, inv)

        # Feather (Gaussian blur)
        if feather > 0:
            binary_u8 = cv2.GaussianBlur(binary_u8, (feather * 2 + 1, feather * 2 + 1), 0)

        binary = binary_u8 > 127
    else:
        # Fallback: pure NumPy/scipy-less implementations
        from scipy import ndimage
        if grow > 0:
            binary = ndimage.binary_dilation(binary, iterations=grow)
        if shrink > 0:
            binary = ndimage.binary_erosion(binary, iterations=shrink)
        if fill_holes:
            binary = ndimage.binary_fill_holes(binary)
        if feather > 0:
            # Simple box blur via repeated uniform_filter
            float_mask = binary.astype(np.float32)
            for _ in range(feather):
                float_mask = ndimage.uniform_filter(float_mask, size=3)
            binary = float_mask > 0.5

    return {
        "status": "ok",
        "mask": mask_to_base64(binary),
    }


def cmd_get_mask(index: int = 0):
    return {"status": "error", "message": "get_mask not implemented; masks returned with each prompt"}


def cmd_clear():
    """Clear all image state and free GPU memory."""
    global current_image, orig_hw, inference_state
    current_image = None
    orig_hw = None
    inference_state = None

    # Reset the interactive predictor if it has been primed.
    if inter_predictor is not None:
        try:
            inter_predictor.reset_predictor()
        except Exception:
            pass  # safe to ignore if predictor was never set

    # Release unreferenced CUDA tensors so VRAM isn't silently leaked between
    # sessions. gc.collect() sweeps Python cycles first.
    import gc
    gc.collect()
    if DEVICE == "cuda":
        try:
            torch.cuda.empty_cache()
        except Exception:
            pass

    return {"status": "ok"}


def cmd_shutdown():
    return {"status": "ok", "message": "shutting_down"}


# ── Main Loop ────────────────────────────────────────────────

def main():
    log("SAM3 bridge started. Waiting for commands...")

    # ── Auth handshake ─────────────────────────────────────────
    try:
        _do_auth_handshake()
    except Exception as e:
        send_response({"status": "error", "message": f"Auth handshake failed: {e}"})
        log("Auth handshake failed: %s", e)
        return

    # ── Command loop (length-prefixed frames) ──────────────────
    while True:
        payload = _read_frame()
        if payload is None:
            break

        try:
            req = json.loads(payload.decode("utf-8"))
        except json.JSONDecodeError as e:
            send_response({"status": "error", "message": f"Invalid JSON: {e}"})
            continue

        # Verify auth token on every request except handshake (already done)
        token = req.get("auth_token", "")
        if not _verify_auth(token):
            send_response({"status": "error", "message": "Auth token mismatch"})
            continue

        cmd = req.get("cmd")
        try:
            if cmd == "load_image":
                resp = cmd_load_image(req["image_b64"])
            elif cmd == "text_prompt":
                resp = cmd_text_prompt(req["prompt"])
            elif cmd == "point_prompt":
                resp = cmd_point_prompt(req["points"], req.get("labels"))
            elif cmd == "box_prompt":
                resp = cmd_box_prompt(req["boxes"])
            elif cmd == "auto_mask":
                resp = cmd_auto_mask(
                    req.get("grid_size", 16),
                    req.get("iou_threshold", 0.7),
                    req.get("min_mask_region_area", 100),
                )
            elif cmd == "postprocess_mask":
                resp = cmd_postprocess_mask(
                    req["mask_b64"],
                    req.get("grow", 0),
                    req.get("shrink", 0),
                    req.get("feather", 0),
                    req.get("fill_holes", False),
                )
            elif cmd == "get_mask":
                resp = cmd_get_mask(req.get("index", 0))
            elif cmd == "clear":
                resp = cmd_clear()
            elif cmd == "shutdown":
                send_response(cmd_shutdown())
                break
            else:
                resp = {"status": "error", "message": f"Unknown command: {cmd}"}
        except RuntimeError as e:
            msg = str(e)
            if "out of memory" in msg.lower():
                msg = f"CUDA out of memory: {msg}. Try setting SAM3_DEVICE=cpu."
            resp = {"status": "error", "message": msg}
            logging.exception("RuntimeError processing %s", cmd)
        except Exception as e:
            resp = {"status": "error", "message": str(e)}
            logging.exception("Error processing %s", cmd)

        send_response(resp)

    log("SAM3 bridge exiting.")


if __name__ == "__main__":
    main()
