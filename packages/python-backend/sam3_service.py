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

# Cache for rembg ONNX sessions to prevent reloading weights from disk every time
_rembg_sessions = {}


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
        # Deep-copy mutable sub-keys to prevent concurrent hover + click
        # from mutating shared prompt objects. PyTorch tensors are ref-counted
        # and read-only during inference so they can stay shared.
        import copy
        state = _image_cache_state
        backbone_out = dict(state["backbone_out"])
        return {
            "original_height": state["original_height"],
            "original_width": state["original_width"],
            "backbone_out": backbone_out,
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
    """Convert a binary mask (H, W) uint8 to a base64 RGBA PNG.

    Outputs RGBA so the frontend canvas can use source-in compositing
    to tint the mask with an overlay color.
    """
    binary = (mask > 0).astype(np.uint8)
    h, w = binary.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[binary == 1] = [255, 255, 255, 255]
    img = Image.fromarray(rgba, mode="RGBA")
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

    # Run forward grounding without tracking gradients to save VRAM and latency
    with torch.inference_mode(), torch.autocast(device_type=device, dtype=torch.float16, enabled=(device == "cuda")):
        return _sam3_processor._forward_grounding(state)


def predict_point(
    image_path: str,
    x: float,
    y: float,
    normalized: bool = False,
) -> Dict[str, Any]:
    """
    Segment at a single point.

    Args:
        image_path: Path to the input image.
        x, y: Coordinate in original image space (pixels if normalized=False, 0..1 float if normalized=True).
        normalized: If True, x and y are in [0, 1] range and scaled to image size.

    Returns:
        dict with keys: status, mask (base64 PNG), width, height, score
    """
    _ensure_loaded()
    image = _load_image(image_path)
    w, h = image.size

    if normalized:
        px = int(x * w)
        py = int(y * h)
    else:
        px = int(x)
        py = int(y)

    inference_state = _get_image_state(image, image_path)
    output = _set_point_prompts(inference_state, [(float(px), float(py))], [1])

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


def predict_box(
    image_path: str,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    normalized: bool = False,
) -> Dict[str, Any]:
    """
    Segment using a bounding box prompt.

    SAM 3 does not expose a native set_box_prompt API, so we use the
    box center as a point prompt — this works well for most objects.

    Args:
        image_path: Path to the input image.
        x1, y1, x2, y2: Bounding box coordinates (pixels if normalized=False, 0..1 float if normalized=True).
        normalized: If True, coordinates are in [0, 1] range and scaled to image size.

    Returns:
        dict with keys: status, mask (base64 PNG), width, height, score
    """
    _ensure_loaded()
    image = _load_image(image_path)
    w, h = image.size

    if normalized:
        px1, py1 = int(x1 * w), int(y1 * h)
        px2, py2 = int(x2 * w), int(y2 * h)
    else:
        px1, py1 = int(x1), int(y1)
        px2, py2 = int(x2), int(y2)

    inference_state = _get_image_state(image, image_path)
    # SAM native box prompt: top-left (label 2) and bottom-right (label 3)
    output = _set_point_prompts(
        inference_state,
        [(float(px1), float(py1)), (float(px2), float(py2))],
        [2, 3]
    )

    masks = output.get("masks", [])
    scores = output.get("scores", [])

    if masks is None or (hasattr(masks, "__len__") and len(masks) == 0):
        return {"status": "error", "error": "No mask generated"}

    best_idx = int(np.argmax(scores.cpu().numpy() if hasattr(scores, "cpu") else scores))
    best_mask = masks[best_idx]
    best_score = float(scores[best_idx].item() if hasattr(scores[best_idx], "item") else scores[best_idx])

    if hasattr(best_mask, "cpu"):
        best_mask = best_mask.cpu().numpy()
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
    
    import torch
    device = _sam3_processor.device
    with torch.inference_mode(), torch.autocast(device_type=device, dtype=torch.float16, enabled=(device == "cuda")):
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

    # Convert multi-channel RGBA/RGB to single-channel grayscale if needed
    if mask_np.ndim == 3 and mask_np.shape[2] >= 3:
        mask_np = cv2.cvtColor(mask_np, cv2.COLOR_RGBA2GRAY if mask_np.shape[2] == 4 else cv2.COLOR_RGB2GRAY)
    elif mask_np.ndim == 3 and mask_np.shape[2] == 2:
        mask_np = mask_np[:, :, 0]

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
    x: float,
    y: float,
    normalized: bool = False,
) -> Dict[str, Any]:
    """
    Point-based segmentation with SAM PRO mode post-processing.
    Ideal for fine details like hair, fur, and semi-transparent objects.
    """
    result = predict_point(image_path, x, y, normalized=normalized)
    if result.get("status") != "success":
        return result

    # Decode base64 PNG back to numpy array for OpenCV post-processing
    mask_img = Image.open(io.BytesIO(base64.b64decode(result["mask"])))
    mask_np = np.array(mask_img)
    w, h = mask_img.size

    if normalized:
        px = int(x * w)
        py = int(y * h)
    else:
        px = int(x)
        py = int(y)

    processed = postprocess_mask_pro(mask_np, input_points=[(float(px), float(py))])

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

    global _rembg_sessions
    try:
        if model not in _rembg_sessions:
            _rembg_sessions[model] = new_session(model_name=model)
        session = _rembg_sessions[model]
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

import threading

_download_thread = None
_download_progress = 0.0
_download_error = None
_download_status = "idle"


def get_download_status() -> Dict[str, Any]:
    global _download_progress, _download_status, _download_error
    return {
        "status": _download_status,
        "progress": _download_progress,
        "error": _download_error,
    }


def start_download(version: str = "sam3") -> Dict[str, Any]:
    global _download_thread, _download_status, _download_progress, _download_error
    if _download_status == "downloading":
        return {"status": "success", "message": "Download already in progress"}

    _download_progress = 0.0
    _download_error = None
    _download_status = "downloading"

    def run():
        global _download_status, _download_progress, _download_error
        try:
            import tqdm

            # Subclass tqdm to capture progress updates
            original_tqdm = tqdm.tqdm

            class ProgressTqdm(original_tqdm):
                def __init__(self, *args, **kwargs):
                    super().__init__(*args, **kwargs)

                def update(self, n=1):
                    super().update(n)
                    if self.total:
                        percent = (self.n / self.total) * 100
                        global _download_progress
                        _download_progress = percent
                        print(f"SAM3_DOWNLOAD_PROGRESS:{percent:.1f}", flush=True)

            # Patch tqdm
            tqdm.tqdm = ProgressTqdm

            try:
                from sam3.model_builder import download_ckpt_from_hf
                download_ckpt_from_hf(version=version)
                # Load the model immediately after download finishes
                _ensure_loaded()
                _download_status = "success"
                _download_progress = 100.0
                print("SAM3_DOWNLOAD_COMPLETE", flush=True)
            finally:
                # Restore original tqdm
                tqdm.tqdm = original_tqdm

        except Exception as e:
            _download_status = "error"
            _download_error = str(e)
            print(f"SAM3_DOWNLOAD_ERROR:{e}", flush=True)

    _download_thread = threading.Thread(target=run, daemon=True)
    _download_thread.start()
    return {"status": "success", "message": "Download started"}


def load_model() -> Dict[str, Any]:
    """Trigger SAM 3 model loading. Returns immediately if already loaded."""
    global _sam3_model
    if _sam3_model is not None:
        return {
            "status": "success",
            "loaded": True,
            "message": "SAM 3 model loaded",
        }

    try:
        from huggingface_hub import try_to_load_from_cache
        repo_id = "facebook/sam3"
        ckpt_name = "sam3.pt"
        cfg_name = "config.json"

        try:
            cfg_path = try_to_load_from_cache(repo_id=repo_id, filename=cfg_name)
            ckpt_path = try_to_load_from_cache(repo_id=repo_id, filename=ckpt_name)
        except Exception:
            cfg_path = None
            ckpt_path = None

        if not cfg_path or not ckpt_path:
            # Not in cache, start background download
            start_download(version="sam3")
            return {
                "status": "success",
                "loaded": False,
                "message": "SAM 3 model not cached locally. Initiated background download.",
            }

        # Cached! Ensure loaded in memory
        _ensure_loaded()
        return {
            "status": "success",
            "loaded": _sam3_model is not None,
            "message": "SAM 3 model loaded" if _sam3_model is not None else "Failed to load",
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def unload_models() -> Dict[str, str]:
    """Unload all models and clear caches to free GPU memory."""
    global _sam3_model, _sam3_processor, _image_cache_key, _image_cache_state
    global _grounding_dino_processor, _grounding_dino_model, _rembg_sessions

    import gc

    _sam3_model = None
    _sam3_processor = None
    _image_cache_key = None
    _image_cache_state = None
    _grounding_dino_processor = None
    _grounding_dino_model = None
    _rembg_sessions.clear()

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
