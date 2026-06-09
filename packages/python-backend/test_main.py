"""
Unit tests for the Python RPC backend (main.py).

Run with: python -m pytest test_main.py -v
"""

import json
import os
import secrets
import threading
import time
import urllib.request

import pytest

from main import RPCRequestHandler, run, _get_env_token, _generate_token


class DummyRequest:
    """Minimal HTTP request fixture for testing RPCRequestHandler."""

    def __init__(self, headers=None, body=b"{}"):
        self.headers = headers or {}
        self._body = body

    def read(self, length: int) -> bytes:
        return self._body[:length]


class DummyClient:
    """Captures HTTP response data from BaseHTTPRequestHandler."""

    def __init__(self):
        self.wfile = BytesCollector()
        self.sent_headers = []
        self.status = None

    def send_response(self, code: int) -> None:
        self.status = code

    def send_header(self, key: str, value: str) -> None:
        self.sent_headers.append((key, value))

    def end_headers(self) -> None:
        pass


class BytesCollector:
    def __init__(self):
        self.data = b""

    def write(self, data: bytes) -> None:
        self.data += data


import io

def make_handler(headers=None, body=b"{}"):
    """Factory: create an RPCRequestHandler wired to a DummyClient."""
    client = DummyClient()
    handler = RPCRequestHandler.__new__(RPCRequestHandler)
    handler.client_address = ("127.0.0.1", 12345)
    handler.request = DummyRequest(headers=headers, body=body)
    # BaseHTTPRequestHandler expects headers as an email.message.Message-like object
    from http.client import HTTPMessage
    handler.headers = HTTPMessage()
    for key, value in (headers or {}).items():
        handler.headers[key] = value
    # rfile is where do_POST reads the body from
    handler.rfile = io.BytesIO(body)
    handler.wfile = client.wfile
    handler.sent_headers = client.sent_headers

    # Wrap send_response so tests can read handler.status directly
    def _send_response(code: int) -> None:
        handler.status = code
        client.send_response(code)

    handler.send_response = _send_response
    handler.send_header = client.send_header
    handler.end_headers = client.end_headers
    return handler


# ---------------------------------------------------------------------------
# Token generation & environment
# ---------------------------------------------------------------------------

def test_generate_token_length():
    token = _generate_token()
    assert len(token) == 64  # 32 bytes hex = 64 chars


def test_generate_token_randomness():
    t1 = _generate_token()
    t2 = _generate_token()
    assert t1 != t2


def test_get_env_token_reads_env():
    os.environ["MOSHDITHER_RPC_TOKEN"] = "test_token_123"
    assert _get_env_token() == "test_token_123"
    del os.environ["MOSHDITHER_RPC_TOKEN"]


def test_get_env_token_missing_returns_none():
    if "MOSHDITHER_RPC_TOKEN" in os.environ:
        del os.environ["MOSHDITHER_RPC_TOKEN"]
    assert _get_env_token() is None


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

def test_missing_token_rejected():
    os.environ["MOSHDITHER_RPC_TOKEN"] = "secret"
    body = json.dumps({"jsonrpc": "2.0", "method": "neural_downscale", "id": 1}).encode()
    handler = make_handler(headers={}, body=body)
    handler.do_POST()
    assert handler.status == 403
    response = json.loads(handler.wfile.data)
    assert "Invalid RPC token" in response["error"]
    del os.environ["MOSHDITHER_RPC_TOKEN"]


def test_wrong_token_rejected():
    os.environ["MOSHDITHER_RPC_TOKEN"] = "secret"
    body = json.dumps({"jsonrpc": "2.0", "method": "neural_downscale", "id": 1}).encode()
    headers = {"X-RPC-Token": "wrong"}
    handler = make_handler(headers=headers, body=body)
    handler.do_POST()
    assert handler.status == 403
    del os.environ["MOSHDITHER_RPC_TOKEN"]


def test_valid_token_accepted():
    os.environ["MOSHDITHER_RPC_TOKEN"] = "secret"
    body = json.dumps({
        "jsonrpc": "2.0",
        "method": "neural_downscale",
        "params": {"input_path": "/tmp/in.png", "scale": 0.5, "output_path": "/tmp/out.png"},
        "id": 1,
    }).encode()
    handler = make_handler(headers={"X-RPC-Token": "secret", "Content-Length": str(len(body))}, body=body)
    handler.do_POST()
    assert handler.status == 200
    response = json.loads(handler.wfile.data)
    assert response["jsonrpc"] == "2.0"
    assert "result" in response
    del os.environ["MOSHDITHER_RPC_TOKEN"]


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

def test_content_length_required():
    os.environ["MOSHDITHER_RPC_TOKEN"] = "secret"
    handler = make_handler(headers={"X-RPC-Token": "secret"}, body=b"{}")
    # Simulate missing Content-Length by not having it in headers
    handler.request.headers = {"X-RPC-Token": "secret"}
    handler.do_POST()
    assert handler.status == 411
    del os.environ["MOSHDITHER_RPC_TOKEN"]


def test_payload_too_large():
    os.environ["MOSHDITHER_RPC_TOKEN"] = "secret"
    big_body = b'{"x": "' + b"A" * 2_000_000 + b'"}'
    handler = make_handler(
        headers={"X-RPC-Token": "secret", "Content-Length": str(len(big_body))},
        body=big_body,
    )
    handler.do_POST()
    assert handler.status == 413
    del os.environ["MOSHDITHER_RPC_TOKEN"]


def test_malformed_json_rejected():
    os.environ["MOSHDITHER_RPC_TOKEN"] = "secret"
    body = b"not json"
    handler = make_handler(
        headers={"X-RPC-Token": "secret", "Content-Length": str(len(body))},
        body=body,
    )
    handler.do_POST()
    assert handler.status == 400
    del os.environ["MOSHDITHER_RPC_TOKEN"]


def test_unknown_method_rejected():
    os.environ["MOSHDITHER_RPC_TOKEN"] = "secret"
    body = json.dumps({"jsonrpc": "2.0", "method": "evil_method", "id": 1}).encode()
    handler = make_handler(
        headers={"X-RPC-Token": "secret", "Content-Length": str(len(body))},
        body=body,
    )
    handler.do_POST()
    assert handler.status == 404
    del os.environ["MOSHDITHER_RPC_TOKEN"]


def test_unexpected_params_rejected():
    os.environ["MOSHDITHER_RPC_TOKEN"] = "secret"
    body = json.dumps({
        "jsonrpc": "2.0",
        "method": "neural_downscale",
        "params": {"input_path": "/tmp/in.png", "scale": 0.5, "output_path": "/tmp/out.png", "evil": True},
        "id": 1,
    }).encode()
    handler = make_handler(
        headers={"X-RPC-Token": "secret", "Content-Length": str(len(body))},
        body=body,
    )
    handler.do_POST()
    assert handler.status == 400
    response = json.loads(handler.wfile.data)
    assert "Unexpected params" in response["error"]
    del os.environ["MOSHDITHER_RPC_TOKEN"]


# ---------------------------------------------------------------------------
# Timing-attack resistance (secrets.compare_digest)
# ---------------------------------------------------------------------------

def test_compare_digest_used():
    """Verify that secrets.compare_digest is used for token comparison."""
    import inspect
    source = inspect.getsource(RPCRequestHandler.do_POST)
    assert "secrets.compare_digest" in source or "compare_digest" in source
