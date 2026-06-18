import pytest
from unittest.mock import patch, MagicMock
from PIL import Image
import numpy as np
import base64
import sam3_service

@patch('sam3_service._ensure_loaded')
@patch('sam3_service._load_image')
@patch('sam3_service._get_image_state')
@patch('sam3_service._set_point_prompts')
@patch('sam3_service._mask_to_base64')
def test_predict_point_coordinates(mock_mask_to_base64, mock_set_point_prompts, mock_get_image_state, mock_load_image, mock_ensure_loaded):
    # Setup mock image size (width=1000, height=500)
    mock_image = MagicMock()
    mock_image.size = (1000, 500)
    mock_load_image.return_value = mock_image
    
    # Real numpy array for mask (1, 500, 1000)
    mock_mask = np.zeros((1, 500, 1000), dtype=np.float32)
    
    mock_output = {
        "masks": [mock_mask],
        "scores": [0.9]
    }
    mock_set_point_prompts.return_value = mock_output
    mock_mask_to_base64.return_value = "mock_base64_mask"
    
    # 1. Test normalized=True
    sam3_service.predict_point("dummy_path", 0.5, 0.2, normalized=True)
    mock_set_point_prompts.assert_called_with(mock_get_image_state.return_value, [(500.0, 100.0)], [1])

    # 2. Test normalized=False
    sam3_service.predict_point("dummy_path", 200.0, 300.0, normalized=False)
    mock_set_point_prompts.assert_called_with(mock_get_image_state.return_value, [(200.0, 300.0)], [1])


@patch('sam3_service._ensure_loaded')
@patch('sam3_service._load_image')
@patch('sam3_service._get_image_state')
@patch('sam3_service._set_point_prompts')
@patch('sam3_service._mask_to_base64')
def test_predict_box_coordinates(mock_mask_to_base64, mock_set_point_prompts, mock_get_image_state, mock_load_image, mock_ensure_loaded):
    # Setup mock image size (width=1000, height=500)
    mock_image = MagicMock()
    mock_image.size = (1000, 500)
    mock_load_image.return_value = mock_image
    
    # Real numpy array for mask (1, 500, 1000)
    mock_mask = np.zeros((1, 500, 1000), dtype=np.float32)
    
    mock_output = {
        "masks": [mock_mask],
        "scores": [0.9]
    }
    mock_set_point_prompts.return_value = mock_output
    mock_mask_to_base64.return_value = "mock_base64_mask"
    
    # 1. Test normalized=True
    sam3_service.predict_box("dummy_path", 0.1, 0.2, 0.8, 0.9, normalized=True)
    mock_set_point_prompts.assert_called_with(
        mock_get_image_state.return_value,
        [(100.0, 100.0), (800.0, 450.0)],
        [2, 3]
    )

    # 2. Test normalized=False
    sam3_service.predict_box("dummy_path", 150.0, 120.0, 750.0, 430.0, normalized=False)
    mock_set_point_prompts.assert_called_with(
        mock_get_image_state.return_value,
        [(150.0, 120.0), (750.0, 430.0)],
        [2, 3]
    )


@patch('sam3_service.predict_point')
@patch('sam3_service.postprocess_mask_pro')
@patch('sam3_service._mask_to_base64')
@patch('PIL.Image.open')
def test_predict_point_pro_coordinates(mock_image_open, mock_mask_to_base64, mock_postprocess_mask_pro, mock_predict_point):
    # Setup mock predict_point output
    mock_predict_point.return_value = {
        "status": "success",
        "mask": base64.b64encode(b"dummy_png").decode("utf-8"),
        "width": 1000,
        "height": 500,
        "score": 0.9
    }
    
    # Mock PIL image size returned when decoding mask
    mock_mask_img = MagicMock()
    mock_mask_img.size = (1000, 500)
    mock_image_open.return_value = mock_mask_img
    
    mock_postprocess_mask_pro.return_value = MagicMock()
    
    # 1. Test normalized=True
    sam3_service.predict_point_pro("dummy_path", 0.5, 0.2, normalized=True)
    # Check that predict_point is called with normalized=True
    mock_predict_point.assert_called_with("dummy_path", 0.5, 0.2, normalized=True)
    
    # Get the mock's call arguments
    args, kwargs = mock_postprocess_mask_pro.call_args
    assert kwargs['input_points'] == [(500.0, 100.0)]

    # 2. Test normalized=False
    sam3_service.predict_point_pro("dummy_path", 200.0, 300.0, normalized=False)
    # Check that predict_point is called with normalized=False
    mock_predict_point.assert_called_with("dummy_path", 200.0, 300.0, normalized=False)
    
    # Get the mock's call arguments
    args, kwargs = mock_postprocess_mask_pro.call_args
    assert kwargs['input_points'] == [(200.0, 300.0)]
