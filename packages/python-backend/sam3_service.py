"""
SAM 3 Service for MoshDither Studio
Wraps Meta's SAM 3 for point-based and text-prompt segmentation.
"""

import os
import io
import base64
import copy
import numpy as np
from PIL import Image
from typing import List, Tuple, Optional, Dict, Any

# ---------------------------------------------------------------------------
# Lazy imports — only load when first used so import-time doesn't crash
# if the user hasn't installed SAM 3 yet.
# ---------------------------------------------------------------------------
_sam3_model = None
_sam3_processor = None

# Image embedding cache: key = (image_path, mtime, size)
# value = inference state dict from processor.set_image()
_image_cache_key = None
_image_cache_state = None


def _ensure_loaded():
    """Load SAM 3 model and processor on first use."""
    global _sam3_model, _sam3_processor
    if _sam3_model is None:
        import torch
        from sam3.model_builder import build_sam3_image_model
        from sam3.model.sam3_image_processor import Sam3Processor
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _sam3_model = build_sam3_image_model(
            device=device,
            eval_mode=True,
            load_from_HF=True,
            enable_segmentation=True,
            enable_inst_interactivity=False,
            compile=False,
        )
        _sam3_processor = Sam3Processor(_sam3_model, resolution=1008, confidence_threshold=0.3, device=device)
    return _sam3_model, _sam3_processor


def _get_image_state(image: Image.Image, image_path: str):
    """Get cached image inference state or compute and cache it.

    Returns a *copy* of the cached state so that processor operations
    (set_point_prompt / set_text_prompt) which mutate the state dict
    do not pollute the cached version for subsequent calls.
    """
    global _image_cache_key, _image_cache_state
    try:
        stat = os.stat(image_path)
        cache_key = (image_path, stat.st_mtime, stat.st_size)
    except Exception:
        cache_key = (image_path, 0, 0)

    if _image_cache_key == cache_key and _image_cache_state is not None:
        # Shallow copy: only backbone_out dict is copied — tensors inside are shared
        # (read-only during inference). This avoids deepcopy of large GPU tensors.
        return {
            "original_height": _image_cache_state["original_height"],
            "original_width": _image_cache_state["original_width"],
            "backbone_out": dict(_image_cache_state["backbone_out"]),
        }

    _ensure_loaded()
    _image_cache_state = _sam3_processor.set_image(image)
    _image_cache_key = cache_key
    return {
        "original_height": _image_cache_state["original_height"],
        "original_width": _image_cache_state["original_width"],
        "backbone_out": dict(_image_cache_state["backbone_out"]),
    }


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

def _load_image(image_path: str) -> Image.Image:
    """Load image from disk."""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")
    return Image.open(image_path).convert("RGB")


def _mask_to_base64(mask: np.ndarray) -> str:
    """Convert a binary mask (H, W) uint8 to a base64 PNG.

    Handles both 0/1 (from SAM inference) and 0/255 (from OpenCV post-processing)
    without overflow.
    """
    binary = (mask > 0).astype(np.uint8)
    img = Image.fromarray((binary * 255).astype(np.uint8), mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _set_point_prompts(state: Dict, points: List[Tuple[float, float]], labels: List[int]) -> Dict:
    """
    Add point prompts to the inference state and run SAM 3 grounding.

    SAM 3 uses a geometric prompt system where points are normalized
    to [0, 1] and stored in a Prompt object.
    """
    import torch
    from sam3.model.geometry_encoders import Prompt

    w = state["original_width"]
    h = state["original_height"]
    device = _sam3_processor.device

    # Normalize points to [0, 1]
    norm_points = [[x / w, y / h] for x, y in points]

    # Build tensors: shape [N_points, B=1, 2]
    points_t = torch.tensor(norm_points, device=device, dtype=torch.float32).unsqueeze(1)
    labels_t = torch.tensor(labels, device=device, dtype=torch.long).unsqueeze(1)
    mask_t = torch.zeros(1, len(points), device=device, dtype=torch.bool)  # False = valid (not masked)

    # Ensure geometric prompt exists
    if "geometric_prompt" not in state:
        state["geometric_prompt"] = _sam3_model._get_dummy_prompt(num_prompts=1)

    # Append points to the prompt
    state["geometric_prompt"].append_points(points_t, labels_t, mask_t)

    # Set dummy text features if not already present (needed for geometric-only prompts)
    if "language_features" not in state["backbone_out"]:
        dummy_text = _sam3_model.backbone.forward_text(["visual"], device=device)
        state["backbone_out"].update(dummy_text)

    # Run forward grounding
    return _sam3_processor._forward_grounding(state)


def predict_point(image_path: str, x: int, y: int) -> Dict[str, Any]:
    """
    Segment at a single point.

    Args:
        image_path: Path to the input image.
        x, y: Pixel coordinates (0-based) in original image space.

    Returns:
        dict with keys: status, mask (base64 PNG), width, height, score
    """
    _ensure_loaded()
    image = _load_image(image_path)
    w, h = image.size

    inference_state = _get_image_state(image, image_path)
    output = _set_point_prompts(inference_state, [(float(x), float(y))], [1])

    masks = output.get("masks", [])
    scores = output.get("scores", [])

    if masks is None or (hasattr(masks, '__len__') and len(masks) == 0):
        return {"status": "error", "error": "No mask generated"}

    best_idx = int(np.argmax(scores.cpu().numpy() if hasattr(scores, 'cpu') else scores))
    best_mask = masks[best_idx]
    best_score = float(scores[best_idx].item() if hasattr(scores[best_idx], 'item') else scores[best_idx])

    if hasattr(best_mask, "cpu"):
        best_mask = best_mask.cpu().numpy()
    # Squeeze out any extra leading dimensions (SAM3 returns [1, H, W] masks)
    if best_mask.ndim == 3 and best_mask.shape[0] == 1:
        best_mask = best_mask[0]
    mask_u8 = (best_mask > 0.5).astype(np.uint8)

    return {
        "status": "success",
        "mask": _mask_to_base64(mask_u8),
        "width": w,
        "height": h,
        "score": best_score,
    }


def predict_batch(
    image_path: str,
    positive_points: List[Tuple],
    negative_points: List[Tuple],
    normalized: bool = False,
) -> Dict[str, Any]:
    """
    Segment with multiple positive and negative points.

    Args:
        image_path: Path to the input image.
        positive_points: List of (x, y) positive clicks (pixel or normalized 0-1).
        negative_points: List of (x, y) negative clicks (pixel or normalized 0-1).
        normalized: If True, points are in [0, 1] range and will be converted to pixels.

    Returns:
        dict with keys: status, mask (base64 PNG), width, height, score
    """
    _ensure_loaded()
    image = _load_image(image_path)
    w, h = image.size

    if normalized:
        positive_points = [(int(x * w), int(y * h)) for x, y in positive_points]
        negative_points = [(int(x * w), int(y * h)) for x, y in negative_points]

    all_points = positive_points + negative_points
    labels = [1] * len(positive_points) + [0] * len(negative_points)

    if not all_points:
        return {"status": "error", "error": "No points provided"}

    inference_state = _get_image_state(image, image_path)
    output = _set_point_prompts(
        inference_state,
        [(float(x), float(y)) for x, y in all_points],
        labels,
    )

    masks = output.get("masks", [])
    scores = output.get("scores", [])

    if masks is None or (hasattr(masks, '__len__') and len(masks) == 0):
        return {"status": "error", "error": "No mask generated"}

    best_idx = int(np.argmax(scores.cpu().numpy() if hasattr(scores, 'cpu') else scores))
    best_mask = masks[best_idx]
    best_score = float(scores[best_idx].item() if hasattr(scores[best_idx], 'item') else scores[best_idx])

    if hasattr(best_mask, "cpu"):
        best_mask = best_mask.cpu().numpy()
    # Squeeze out any extra leading dimensions (SAM3 returns [1, H, W] masks)
    if best_mask.ndim == 3 and best_mask.shape[0] == 1:
        best_mask = best_mask[0]
    mask_u8 = (best_mask > 0.5).astype(np.uint8)

    return {
        "status": "success",
        "mask": _mask_to_base64(mask_u8),
        "width": w,
        "height": h,
        "score": best_score,
    }


def predict_text(image_path: str, text_prompt: str) -> Dict[str, Any]:
    """
    Segment using a text prompt (SAM 3's key feature).

    Args:
        image_path: Path to the input image.
        text_prompt: Natural language description, e.g. "person", "car".

    Returns:
        dict with keys: status, mask (base64 PNG), width, height, score
    """
    _ensure_loaded()
    image = _load_image(image_path)
    w, h = image.size

    inference_state = _get_image_state(image, image_path)
    output = _sam3_processor.set_text_prompt(
        state=inference_state,
        prompt=text_prompt,
    )

    masks = output["masks"]
    scores = output["scores"]

    if masks is None or len(masks) == 0:
        return {"status": "error", "error": f"No mask for prompt: {text_prompt}"}

    scores_np = scores.cpu().numpy() if hasattr(scores, 'cpu') else np.array(scores)
    best_idx = int(np.argmax(scores_np))
    best_mask = masks[best_idx]
    best_score = float(scores_np[best_idx])

    if hasattr(best_mask, "cpu"):
        best_mask = best_mask.cpu().numpy()
    if best_mask.ndim == 3 and best_mask.shape[0] == 1:
        best_mask = best_mask[0]
    if best_mask.dtype == bool:
        mask_u8 = best_mask.astype(np.uint8)
    else:
        mask_u8 = (best_mask > 0.5).astype(np.uint8)

    return {
        "status": "success",
        "mask": _mask_to_base64(mask_u8),
        "width": w,
        "height": h,
        "score": best_score,
    }


# ---------------------------------------------------------------------------
# GroundingDINO text-to-box detection + SAM 3 segmentation
# ---------------------------------------------------------------------------

_grounding_dino_processor = None
_grounding_dino_model = None


def _ensure_groundingdino(device: str = "cpu"):
    """Lazy-load GroundingDINO SwinT OGC model for text-to-box detection."""
    global _grounding_dino_processor, _grounding_dino_model
    if _grounding_dino_processor is None:
        from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection
        from huggingface_hub import snapshot_download

        cache_dir = os.path.join(os.path.expanduser("~"), ".cache", "moshdither", "grounding-dino")
        os.makedirs(cache_dir, exist_ok=True)

        # Download if missing
        if not os.path.exists(os.path.join(cache_dir, "model.safetensors")):
            snapshot_download(
                repo_id="IDEA-Research/grounding-dino-tiny",
                local_dir=cache_dir,
                local_dir_use_symlinks=False,
            )

        _grounding_dino_processor = AutoProcessor.from_pretrained(cache_dir)
        _grounding_dino_model = AutoModelForZeroShotObjectDetection.from_pretrained(cache_dir)
        # Try CUDA first, fall back to CPU if unavailable (e.g., CPU-only PyTorch wheel)
        try:
            _grounding_dino_model.to(device)
        except RuntimeError as e:
            if "cuda" in str(e).lower() and device == "cuda":
                print(f"[GroundingDINO] CUDA not available ({e}), falling back to CPU", flush=True)
                device = "cpu"
                _grounding_dino_model.to(device)
            else:
                raise
        _grounding_dino_model.eval()

    # Ensure model is on the requested device (with CPU fallback)
    try:
        _grounding_dino_model.to(device)
    except RuntimeError as e:
        if "cuda" in str(e).lower() and device == "cuda":
            print(f"[GroundingDINO] CUDA not available ({e}), falling back to CPU", flush=True)
            device = "cpu"
            _grounding_dino_model.to(device)
        else:
            raise
    return _grounding_dino_processor, _grounding_dino_model


def predict_groundingdino(
    image_path: str,
    text_prompt: str,
    threshold: float = 0.3,
    device: str = "cpu",
) -> Dict[str, Any]:
    """
    Text-to-box via GroundingDINO, then box-to-mask via SAM 3.
    This gives more precise masks for objects described by text than
    SAM 3's native text prompt, especially for small or occluded objects.

    Args:
        image_path: Path to the input image.
        text_prompt: Natural language description, e.g. "glasses", "red car".
        threshold: Detection confidence threshold (0-1).
        device: "cuda" or "cpu".

    Returns:
        dict with keys: status, mask (base64 PNG), width, height, boxes, scores
    """
    _ensure_loaded()
    image = _load_image(image_path)
    w, h = image.size

    processor, dino_model = _ensure_groundingdino(device)

    # Normalize prompt: lowercase + period (GroundingDINO convention)
    prompt_str = text_prompt.lower().strip()
    if not prompt_str.endswith("."):
        prompt_str += "."

    inputs = processor(images=image, text=prompt_str, return_tensors="pt").to(device)

    import torch
    with torch.no_grad():
        outputs = dino_model(**inputs)

    # Post-process to get boxes
    results = processor.post_process_grounded_object_detection(
        outputs,
        inputs.input_ids,
        text_threshold=0.25,
        target_sizes=[(h, w)],
    )

    boxes = results[0]["boxes"].cpu().numpy() if len(results) > 0 else []
    box_scores = results[0]["scores"].cpu().numpy() if len(results) > 0 else []

    if len(boxes) == 0:
        return {
            "status": "error",
            "error": f"GroundingDINO found no objects for '{text_prompt}'",
        }

    # Use SAM 3 to segment each detected box and merge masks.
    # NOTE: SAM 3 does not have a native set_box_prompt API.
    # We convert each box to its center point and use set_point_prompt.
    inference_state = _get_image_state(image, image_path)
    combined_mask = np.zeros((h, w), dtype=bool)

    for box in boxes:
        x1, y1, x2, y2 = box.astype(float)
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        output = _sam3_processor.set_point_prompt(
            state=dict(inference_state),
            points=[[cx, cy]],
            labels=[1],
        )
        masks = output.get("masks", [])
        if len(masks) > 0:
            best_idx = int(np.argmax(output.get("scores", [0])))
            best_mask = masks[best_idx]
            if hasattr(best_mask, "cpu"):
                best_mask = best_mask.cpu().numpy()
            m_np = best_mask > 0.5
            combined_mask = np.maximum(combined_mask, m_np)

    mask_u8 = combined_mask.astype(np.uint8)

    return {
        "status": "success",
        "mask": _mask_to_base64(mask_u8),
        "width": w,
        "height": h,
        "boxes": boxes.tolist(),
        "scores": box_scores.tolist(),
    }


# ---------------------------------------------------------------------------
# SAM PRO mode post-processing
# ---------------------------------------------------------------------------

def postprocess_mask_pro(
    mask_np: np.ndarray,
    input_points: Optional[List[Tuple[float, float]]] = None,
) -> np.ndarray:
    """
    SAM PRO mode: advanced post-processing for hair/fine-detail masks.
    1. Median blur to eliminate checkerboard noise
    2. Morphological closing to fill small holes
    3. Connected components: keep only components touched by input points
    4. Final morphological opening to smooth edges

    Args:
        mask_np: Binary uint8 mask (0 or 255).
        input_points: List of (x, y) points from user clicks.

    Returns:
        Cleaned binary uint8 mask.
    """
    try:
        import cv2
    except ImportError:
        # Fallback: skip PRO mode if OpenCV unavailable
        return mask_np

    if mask_np is None or mask_np.size == 0:
        return mask_np

    # 1. Median blur to eliminate checkerboard / salt-and-pepper noise
    mask_np = cv2.medianBlur(mask_np, 5)

    # 2. Morphological closing to fill small holes and gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask_np = cv2.morphologyEx(mask_np, cv2.MORPH_CLOSE, kernel)

    # 3. Connected components analysis — keep only components near input points
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
        mask_np, connectivity=8
    )

    keep_labels = set()
    if input_points and len(input_points) > 0:
        for pt in input_points:
            px, py = int(pt[0]), int(pt[1])
            # Check 5x5 window around the click
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    cx = max(0, min(px + dx, mask_np.shape[1] - 1))
                    cy = max(0, min(py + dy, mask_np.shape[0] - 1))
                    lbl = labels[cy, cx]
                    if lbl > 0:
                        keep_labels.add(lbl)

    if len(keep_labels) > 0:
        mask_pro = np.zeros_like(mask_np)
        for lbl in keep_labels:
            mask_pro[labels == lbl] = 255
        mask_np = mask_pro
    else:
        # For text prompts (no click points): keep large components only
        min_area = int(mask_np.shape[0] * mask_np.shape[1] * 0.001)
        min_area = max(100, min_area)
        mask_pro = np.zeros_like(mask_np)
        for lbl in range(1, num_labels):
            if stats[lbl, cv2.CC_STAT_AREA] >= min_area:
                mask_pro[labels == lbl] = 255
        mask_np = mask_pro

    # 4. Final morphological opening to smooth edges
    mask_np = cv2.morphologyEx(mask_np, cv2.MORPH_OPEN, kernel)

    return mask_np


def predict_point_pro(
    image_path: str,
    x: int,
    y: int,
) -> Dict[str, Any]:
    """
    Point-based segmentation with SAM PRO mode post-processing.
    Ideal for fine details like hair, fur, and semi-transparent objects.
    """
    result = predict_point(image_path, x, y)
    if result.get("status") != "success":
        return result

    # Decode base64 PNG back to numpy array for OpenCV post-processing
    mask_img = Image.open(io.BytesIO(base64.b64decode(result["mask"])))
    mask_np = np.array(mask_img)

    processed = postprocess_mask_pro(mask_np, input_points=[(float(x), float(y))])

    return {
        "status": "success",
        "mask": _mask_to_base64(processed),
        "width": result["width"],
        "height": result["height"],
        "score": result.get("score", 0.0),
    }


def predict_text_pro(
    image_path: str,
    text_prompt: str,
) -> Dict[str, Any]:
    """
    Text-prompt segmentation with SAM PRO mode post-processing.
    """
    result = predict_text(image_path, text_prompt)
    if result.get("status") != "success":
        return result

    mask_img = Image.open(io.BytesIO(base64.b64decode(result["mask"])))
    mask_np = np.array(mask_img)

    processed = postprocess_mask_pro(mask_np, input_points=None)

    return {
        "status": "success",
        "mask": _mask_to_base64(processed),
        "width": result["width"],
        "height": result["height"],
        "score": result.get("score", 0.0),
    }


# ---------------------------------------------------------------------------
# Background Removal (rembg + alpha matting)
# ---------------------------------------------------------------------------

def remove_background(
    image_path: str,
    model: str = "u2net",
    alpha_matting: bool = False,
    alpha_matting_foreground_threshold: int = 240,
    alpha_matting_background_threshold: int = 10,
    alpha_matting_erode_size: int = 10,
) -> Dict[str, Any]:
    """
    Remove background using rembg with optional alpha matting.

    Args:
        image_path: Path to the input image.
        model: rembg model name — "u2net" (default), "u2net_human_seg",
               "u2net_cloth_seg", "isnet-general-use", "silueta", "sam".
        alpha_matting: Enable alpha matting for refined edges (hair/fur).
        alpha_matting_foreground_threshold: Foreground threshold for alpha matting.
        alpha_matting_background_threshold: Background threshold for alpha matting.
        alpha_matting_erode_size: Erosion size for alpha matting.

    Returns:
        dict with keys: status, mask (base64 PNG), width, height
    """
    try:
        from rembg import remove
        from rembg.session_factory import new_session
    except ImportError:
        return {
            "status": "error",
            "error": "rembg not installed. Run: pip install rembg[gpu]",
        }

    image = _load_image(image_path)
    w, h = image.size

    try:
        session = new_session(model_name=model)
    except Exception as e:
        return {
            "status": "error",
            "error": f"Failed to load rembg model '{model}': {e}",
        }

    remove_kwargs = {"session": session}
    if alpha_matting:
        remove_kwargs["alpha_matting"] = True
        remove_kwargs["alpha_matting_foreground_threshold"] = alpha_matting_foreground_threshold
        remove_kwargs["alpha_matting_background_threshold"] = alpha_matting_background_threshold
        remove_kwargs["alpha_matting_erode_size"] = alpha_matting_erode_size

    try:
        output = remove(image, **remove_kwargs)
        # output is RGBA; extract alpha channel as mask
        mask_rgba = np.array(output)
        if mask_rgba.shape[2] >= 4:
            alpha = mask_rgba[:, :, 3]
            mask_u8 = (alpha > 128).astype(np.uint8)
        else:
            mask_u8 = np.ones((h, w), dtype=np.uint8) * 255
    except Exception as e:
        import traceback
        return {
            "status": "error",
            "error": f"Background removal failed: {e}\n{traceback.format_exc()}",
        }

    return {
        "status": "success",
        "mask": _mask_to_base64(mask_u8),
        "width": w,
        "height": h,
    }


def remove_background_batch(
    image_paths: List[str],
    model: str = "u2net",
    alpha_matting: bool = False,
) -> List[Dict[str, Any]]:
    """
    Batch background removal for video frames.
    Returns partial results if individual frames fail.
    """
    results: List[Dict[str, Any]] = []
    for p in image_paths:
        try:
            result = remove_background(p, model=model, alpha_matting=alpha_matting)
            results.append(result)
        except Exception as e:
            results.append({
                "status": "error",
                "error": str(e),
                "image_path": p,
            })
    return results


# ---------------------------------------------------------------------------
# Model management
# ---------------------------------------------------------------------------

def unload_models() -> Dict[str, str]:
    """Unload all models and clear caches to free GPU memory."""
    global _sam3_model, _sam3_processor, _image_cache_key, _image_cache_state
    global _grounding_dino_processor, _grounding_dino_model

    import gc

    _sam3_model = None
    _sam3_processor = None
    _image_cache_key = None
    _image_cache_state = None
    _grounding_dino_processor = None
    _grounding_dino_model = None

    gc.collect()

    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
    except ImportError:
        pass

    return {"status": "success", "message": "All models unloaded"}


def list_models() -> Dict[str, Any]:
    """List available models and their load status."""
    models = {
        "sam3": _sam3_model is not None,
        "groundingdino": _grounding_dino_processor is not None,
    }
    return {"status": "success", "models": models}
