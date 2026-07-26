#!/usr/bin/env python3
"""SAM3 inference bridge — JSON IPC over stdin/stdout.

Rust spawns this process and communicates via JSON lines.
The model stays loaded in memory for fast interactive use.

Supported modes:
  • text_prompt   — open-vocabulary segmentation via Sam3Processor
  • point_prompt  — interactive point-click via Sam3Image.predict_inst
  • box_prompt    — interactive box via Sam3Image.predict_inst
"""

import base64
import hmac
import io
import json
import logging
import os
import struct
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image

_ACCELERATORS = []

try:
    import torch.nn.functional as F
    from sageattention import sageattn

    _orig_sdpa = F.scaled_dot_product_attention

    def _sage_sdpa(query, key, value, attn_mask=None, dropout_p=0.0, is_causal=False,
                   scale=None, enable_gqa=False):
        # Route to SageAttention for unmasked, non-causal attention (the common case in SAM3)
        if attn_mask is None and not is_causal and dropout_p == 0.0:
            try:
                return sageattn(query, key, value, is_causal=False, sm_scale=scale)
            except Exception:
                pass  # Fall through to original SDPA on any error
        return _orig_sdpa(query, key, value, attn_mask=attn_mask, dropout_p=dropout_p,
                          is_causal=is_causal, scale=scale, enable_gqa=enable_gqa)

    F.scaled_dot_product_attention = _sage_sdpa
    _ACCELERATORS.append("SageAttention 2.2")
    logging.info("SageAttention 2.2 patched (SDPA monkey-patch).")
except ImportError:
    logging.warning("SageAttention not installed — attention will use PyTorch SDPA.")

try:
    import xformers
    import xformers.ops
    _ACCELERATORS.append(f"xFormers {xformers.__version__}")
    logging.info("xFormers %s imported.", xformers.__version__)
except ImportError:
    logging.warning("xFormers not installed.")

try:
    import triton
    _ACCELERATORS.append(f"Triton {triton.__version__}")
    logging.info("Triton %s available.", triton.__version__)
except ImportError:
    logging.warning("Triton not installed — SageAttention CUDA kernels will be unavailable.")
# Resolve the sam3_repo location. The Rust side sets SAM3_REPO for both dev
# (pointing at packages/python-backend/sam3_repo) and production sidecars.
# PyInstaller bundles extract to a temporary _MEIPASS directory.
def _resolve_sam3_repo() -> Path:
    if repo := os.environ.get("SAM3_REPO"):
        return Path(repo)
    if hasattr(sys, "_MEIPASS"):
        # In a PyInstaller one-file bundle, the repo was added at the bundle root.
        return Path(sys._MEIPASS)
    # Dev layout: src-tauri/sam3_bridge.py -> project-root/sam3_repo
    return Path(__file__).parent.parent / "sam3_repo"


SAM3_REPO = _resolve_sam3_repo()
sys.path.append(str(SAM3_REPO))

from sam3.model.sam3_image_processor import Sam3Processor
from sam3.model_builder import build_sam3_image_model
from sam3.model_management import ModelManager

# ── Configuration ──────────────────────────────────────────────
_DEFAULT_CHECKPOINT = Path.home() / ".moshdither" / "models" / "sam3" / "sam3.pt"
CHECKPOINT_PATH = os.environ.get("SAM3_CHECKPOINT", str(_DEFAULT_CHECKPOINT))
DEVICE = os.environ.get("SAM3_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
USE_AMP = os.environ.get("SAM3_USE_AMP", "1") == "1"

MAX_SAM3_DIM = int(os.environ.get("SAM3_MAX_DIM", "1024"))
scale_x = 1.0
scale_y = 1.0
model = None
processor = None         # Sam3Processor (text / box grounding)
model_manager = None     # Manages GPU/CPU offloading
current_image = None
orig_hw = None
_raw_stdout = sys.stdout.buffer
sys.stdout = sys.stderr

logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.info

_AUTH_TOKEN: str | None = None


def _write_frame(data: bytes):
    """Write a length-prefixed frame to raw stdout: 4-byte LE length + payload."""
    _raw_stdout.write(struct.pack("<I", len(data)))
    _raw_stdout.write(data)
    _raw_stdout.flush()


def send_response(response: dict):
    """Write JSON response as a length-prefixed frame."""
    _write_frame(json.dumps(response).encode("utf-8"))


def _read_frame() -> bytes | None:
    """Read a length-prefixed frame from stdin."""
    len_bytes = sys.stdin.buffer.read(4)
    if len(len_bytes) < 4:
        return None
    payload_len = struct.unpack("<I", len_bytes)[0]
    if payload_len > 512 * 1024 * 1024:  # 512 MiB safety limit
        raise ValueError(f"Frame size {payload_len} exceeds 512 MiB safety limit")
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
    global model, processor, model_manager
    if model is not None:
        if model_manager:
            model_manager.touch()
        return
    log("Loading SAM3 model from %s on CPU (pinned) ...", CHECKPOINT_PATH)
    if not Path(CHECKPOINT_PATH).exists():
        raise FileNotFoundError(
            f"Checkpoint not found: {CHECKPOINT_PATH}\n"
            "To use SAM3, either:\n"
            "  1. Request access at https://huggingface.co/facebook/sam3, then run:\n"
            "       python scripts/setup_sam3.py --download-hf\n"
            "  2. Provide a direct URL: python scripts/setup_sam3.py --checkpoint-url <url>\n"
            "  3. Set SAM3_CHECKPOINT env var to an existing sam3.pt file."
        )
    # torch.compile can cause inaccurate results on some Windows/GPU combos.
    # Enable only if explicitly requested via env var.
    use_compile = DEVICE == "cuda" and os.environ.get("SAM3_ENABLE_COMPILE", "0") == "1"

    try:
        model = build_sam3_image_model(
            checkpoint_path=CHECKPOINT_PATH,
            device="cpu",  # Load to CPU by default, ModelManager handles GPU offload
            eval_mode=True,
            load_from_HF=False,
            enable_segmentation=True,
            enable_inst_interactivity=True,
            compile=use_compile,
        )
    except RuntimeError as e:
        if "out of memory" in str(e).lower():
            raise RuntimeError(
                "Out of memory while loading SAM3 model on CPU."
            ) from e
        raise

    if DEVICE == "cuda":
        # Throughput knobs similar to high-performance inference stacks.
        torch.backends.cudnn.benchmark = True
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        # Pin memory for faster CPU->GPU transfer
        for param in model.parameters():
            param.data = param.data.pin_memory()
        for buf in model.buffers():
            buf.data = buf.data.pin_memory()

    processor = Sam3Processor(model, device="cpu", confidence_threshold=0.05)
    model_manager = ModelManager(target_device=DEVICE, min_free_vram_gb=1.0, idle_timeout=30.0)
    model_manager.register(model, processor)
    log("SAM3 model loaded on CPU and pinned.")
    log("Active accelerators: %s", ", ".join(_ACCELERATORS) if _ACCELERATORS else "none")
    if use_compile:
        log("torch.compile enabled (mode=default) for vision encoder.")
    if DEVICE == "cuda":
        log("TF32: enabled, cuDNN benchmark: enabled")


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
    """Encode a boolean/float mask as base64 PNG, resizing back to orig_hw if needed."""
    if mask.dtype == bool:
        mask_u8 = (mask * 255).astype(np.uint8)
    elif mask.dtype in (np.float32, np.float64):
        mask_u8 = (mask * 255).astype(np.uint8)
    else:
        mask_u8 = mask.astype(np.uint8)
    img = Image.fromarray(mask_u8, mode="L")
    if orig_hw and (img.height != orig_hw[0] or img.width != orig_hw[1]):
        img = img.resize((orig_hw[1], orig_hw[0]), Image.Resampling.NEAREST)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


# ── Command Handlers ─────────────────────────────────────────

def cmd_load_image(image_b64: str):
    global current_image, orig_hw, inference_state, scale_x, scale_y
    try:
        ensure_model_loaded()
        if model_manager:
            model_manager.move_to_target()
    except Exception as e:
        return {"status": "error", "message": f"Model load failed: {e}"}

    try:
        image = pil_from_base64(image_b64)
    except ValueError as e:
        return {"status": "error", "message": str(e)}

    orig_hw = (image.height, image.width)
    w, h = image.width, image.height
    max_dim = max(w, h)
    if max_dim > MAX_SAM3_DIM:
        scale = MAX_SAM3_DIM / float(max_dim)
        new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
        scale_x = new_w / float(w)
        scale_y = new_h / float(h)
        log("Downscaling SAM3 backbone image from %dx%d to %dx%d for high performance", w, h, new_w, new_h)
        sam_image = image.resize((new_w, new_h), Image.Resampling.BILINEAR)
    else:
        scale_x = 1.0
        scale_y = 1.0
        sam_image = image

    current_image = sam_image

    try:
        # Set image in the text/grounding processor and capture inference state.
        # Point/box prompts reuse the detector backbone features via model.predict_inst.
        with torch.inference_mode():
            if DEVICE == "cuda" and USE_AMP:
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    inference_state = processor.set_image(sam_image)
            else:
                inference_state = processor.set_image(sam_image)
    except RuntimeError as e:
        if "out of memory" in str(e).lower():
            return {"status": "error", "message": f"CUDA out of memory during image encoding: {e}"}
        return {"status": "error", "message": f"Image encoding failed: {e}"}

    return {"status": "ok", "width": orig_hw[1], "height": orig_hw[0]}


def cmd_text_prompt(prompt: str):
    global inference_state
    if inference_state is None:
        return {"status": "error", "message": "No image loaded"}

    if model_manager:
        model_manager.move_to_target()

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
    if model is None:
        return {"status": "error", "message": "Model not loaded"}
    if inference_state is None:
        return {"status": "error", "message": "No image loaded — call load_image first"}

    if model_manager:
        model_manager.move_to_target()

    points_np = np.array(points, dtype=np.float32)   # shape [N, 2]
    if scale_x != 1.0 or scale_y != 1.0:
        points_np[:, 0] *= scale_x
        points_np[:, 1] *= scale_y
    labels_np = np.array(labels if labels else [1] * len(points), dtype=np.int32)

    try:
        with torch.inference_mode():
            if DEVICE == "cuda" and USE_AMP:
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    masks, scores, _ = model.predict_inst(
                        inference_state,
                        point_coords=points_np,
                        point_labels=labels_np,
                        multimask_output=True,
                    )
            else:
                masks, scores, _ = model.predict_inst(
                    inference_state,
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

    if masks.ndim == 3:
        sorted_indices = np.argsort(scores)[::-1]
        all_masks = [masks[i] for i in sorted_indices]
        all_scores = [float(scores[i]) for i in sorted_indices]
    else:
        all_masks = [masks[0] if masks.ndim >= 2 else masks]
        all_scores = [float(scores[0]) if hasattr(scores, '__len__') else float(scores)]

    return {
        "status": "ok",
        "count": len(all_masks),
        "masks": [mask_to_base64(m) for m in all_masks],
        "scores": all_scores,
    }

def cmd_refine_mask(mask_b64: str, points: list, labels: list = None):
    if model is None:
        return {"status": "error", "message": "Model not loaded"}
    if inference_state is None:
        return {"status": "error", "message": "No image loaded"}

    if model_manager:
        model_manager.move_to_target()

    try:
        mask_img = pil_from_base64(mask_b64)
        mask_np = np.array(mask_img.convert("L"), dtype=np.uint8) > 127
    except Exception as e:
        return {"status": "error", "message": f"Invalid mask: {e}"}
    points_np = np.array(points, dtype=np.float32)
    if scale_x != 1.0 or scale_y != 1.0:
        points_np[:, 0] *= scale_x
        points_np[:, 1] *= scale_y
    labels_np = np.array(labels if labels else [1] * len(points), dtype=np.int32)
    try:
        with torch.inference_mode():
            if DEVICE == "cuda" and USE_AMP:
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    masks, scores, _ = model.predict_inst(
                        inference_state,
                        point_coords=points_np,
                        point_labels=labels_np,
                        multimask_output=True,
                    )
            else:
                masks, scores, _ = model.predict_inst(
                    inference_state,
                    point_coords=points_np,
                    point_labels=labels_np,
                    multimask_output=True,
                )
    except RuntimeError as e:
        if "out of memory" in str(e).lower():
            if DEVICE == "cuda":
                torch.cuda.empty_cache()
            return {"status": "error", "message": f"CUDA out of memory during refine: {e}"}
        raise
    ious = []
    for i in range(masks.shape[0]):
        m = masks[i]
        ious.append(mask_iou(mask_np, m.astype(bool)))
    sorted_idx = np.argsort(ious)[::-1]
    sorted_masks = [masks[i] for i in sorted_idx]
    sorted_scores = [float(scores[i]) for i in sorted_idx]
    return {
        "status": "ok",
        "count": len(sorted_masks),
        "masks": [mask_to_base64(m) for m in sorted_masks],
        "scores": sorted_scores,
    }


def cmd_box_prompt(boxes: list):
    if model is None:
        return {"status": "error", "message": "Model not loaded"}
    if inference_state is None:
        return {"status": "error", "message": "No image loaded — call load_image first"}

    if model_manager:
        model_manager.move_to_target()

    results = []
    all_scores = []
    for box in boxes:
        box_np = np.array(box, dtype=np.float32)  # [x0, y0, x1, y1]
        if scale_x != 1.0 or scale_y != 1.0:
            box_np[0] *= scale_x
            box_np[1] *= scale_y
            box_np[2] *= scale_x
            box_np[3] *= scale_y
        try:
            with torch.inference_mode():
                if DEVICE == "cuda" and USE_AMP:
                    with torch.autocast(device_type="cuda", dtype=torch.float16):
                        masks, scores, _ = model.predict_inst(
                            inference_state,
                            box=box_np,
                            multimask_output=True,
                        )
                else:
                    masks, scores, _ = model.predict_inst(
                        inference_state,
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


def cmd_video_predictor(frames: list, prompt: str = None):
    """Run video prediction over a list of base64 frames.
    Returns masks for each frame.
    """
    # Ensure model is loaded
    try:
        ensure_model_loaded()
        if model_manager:
            model_manager.move_to_target()
    except Exception as e:
        return {"status": "error", "message": f"Model load failed: {e}"}

    all_frame_masks = []
    all_frame_scores = []
    for idx, frame_b64 in enumerate(frames):
        # Load frame as image
        load_resp = cmd_load_image(frame_b64)
        if load_resp.get("status") != "ok":
            return {"status": "error", "message": f"Failed to load frame {idx}: {load_resp.get('message')}"}
        # Apply prompt if provided
        if prompt:
            pred_resp = cmd_text_prompt(prompt)
        else:
            # fall back to auto mask for each frame
            pred_resp = cmd_auto_mask()
        if pred_resp.get("status") != "ok":
            return {"status": "error", "message": f"Prediction failed on frame {idx}: {pred_resp.get('message')}"}
        all_frame_masks.append(pred_resp.get("masks", []))
        all_frame_scores.append(pred_resp.get("scores", []))
    return {"status": "ok", "frame_masks": all_frame_masks, "frame_scores": all_frame_scores}


def cmd_postprocess_mask(mask_b64: str, grow: int = 0, shrink: int = 0, feather: int = 0, fill_holes: bool = False):
    """Apply morphological post-processing to a mask."""
    try:
        mask_img = pil_from_base64(mask_b64)
    except ValueError as e:
        return {"status": "error", "message": str(e)}

    # Convert to grayscale preserving alpha or L channel data
    if mask_img.mode == "RGBA":
        mask_np = np.array(mask_img.split()[-1], dtype=np.uint8)
    else:
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


def cmd_auto_mask(grid_size: int = 8, iou_threshold: float = 0.7, min_mask_region_area: int = 100):
    """Generate automatic masks by sampling a grid of points across the image."""
    if model is None:
        return {"status": "error", "message": "Model not loaded"}
    if inference_state is None:
        return {"status": "error", "message": "No image loaded — call load_image first"}

    if model_manager:
        model_manager.move_to_target()

    grid_size = min(grid_size, 8)  # Cap grid to 8x8 (64 points max) for responsive performance
    h, w = current_image.height, current_image.width
    all_masks = []
    all_scores = []

    try:
        with torch.inference_mode():
            ys = np.linspace(0, h - 1, grid_size)
            xs = np.linspace(0, w - 1, grid_size)
            for y in ys:
                for x in xs:
                    points = np.array([[x, y]], dtype=np.float32)
                    labels = np.array([1], dtype=np.int32)
                    if DEVICE == "cuda" and USE_AMP:
                        with torch.autocast(device_type="cuda", dtype=torch.float16):
                            masks, scores, _ = model.predict_inst(
                                inference_state,
                                point_coords=points,
                                point_labels=labels,
                                multimask_output=True,
                            )
                    else:
                        masks, scores, _ = model.predict_inst(
                            inference_state,
                            point_coords=points,
                            point_labels=labels,
                            multimask_output=True,
                        )
                    for i in range(masks.shape[0]):
                        all_masks.append(masks[i])
                        all_scores.append(float(scores[i]))
    except RuntimeError as e:
        if "out of memory" in str(e).lower():
            if DEVICE == "cuda":
                torch.cuda.empty_cache()
            return {"status": "error", "message": f"CUDA out of memory during auto mask: {e}"}
        raise

    # Deduplicate by IoU threshold
    unique_masks = []
    unique_scores = []
    for i, (m, s) in enumerate(zip(all_masks, all_scores)):
        keep = True
        for j, m2 in enumerate(unique_masks):
            inter = np.logical_and(m, m2).sum()
            union = np.logical_or(m, m2).sum()
            if union > 0 and inter / union > iou_threshold:
                if s > unique_scores[j]:
                    unique_masks[j] = m
                    unique_scores[j] = s
                keep = False
                break
        if keep:
            unique_masks.append(m)
            unique_scores.append(s)

    # Filter small regions
    filtered = [(m, s) for m, s in zip(unique_masks, unique_scores) if m.sum() >= min_mask_region_area]

    # Sort by score descending
    filtered.sort(key=lambda x: -x[1])

    return {
        "status": "ok",
        "count": len(filtered),
        "masks": [mask_to_base64(m) for m, _ in filtered],
        "scores": [s for _, s in filtered],
    }


def cmd_get_mask(index: int = 0):
    return {"status": "error", "message": "get_mask not implemented; masks returned with each prompt"}


def cmd_clear():
    """Clear all image state and free GPU memory."""
    global current_image, orig_hw, inference_state
    current_image = None
    orig_hw = None
    inference_state = None

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
    if model_manager:
        model_manager.shutdown()
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
            elif cmd == "refine_mask":
                resp = cmd_refine_mask(req["mask_b64"], req["points"], req.get("labels"))
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
            elif cmd == "video_predictor":
                resp = cmd_video_predictor(req.get("frames", []), req.get("prompt"))
                cmd_clear()  # Free image state after video prediction, but don't overwrite resp
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
