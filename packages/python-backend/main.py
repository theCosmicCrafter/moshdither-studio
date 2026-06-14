import sys
import os
import json
import secrets
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer

try:
    import jwt
except ImportError:
    jwt = None  # type: ignore

# ---------------------------------------------------------------------------
# Security Constants
# ---------------------------------------------------------------------------
MAX_CONTENT_LENGTH = 1_048_576  # 1 MB
ALLOWED_METHODS = {
    "neural_downscale",
    "sam3_predict_point",
    "sam3_predict_batch",
    "sam3_predict_text",
    "sam3_predict_point_pro",
    "sam3_predict_text_pro",
    "sam3_predict_groundingdino",
    "sam3_remove_background",
    "sam3_remove_background_batch",
    "sam3_unload_models",
    "sam3_list_models",
}


def _get_env_token() -> str | None:
    """Return the RPC auth token from the environment, or None if not set."""
    return os.environ.get("MOSHDITHER_RPC_TOKEN")


def _generate_token() -> str:
    """Generate a 256-bit hex token for RPC authentication."""
    return secrets.token_hex(32)


class RPCRequestHandler(BaseHTTPRequestHandler):
    """Secure JSON-RPC handler with token auth and input validation."""

    def log_message(self, format: str, *args) -> None:
        # Suppress default HTTP logging; we log selectively
        pass

    def _send_json(self, status: int, data: dict) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _reject(self, status: int, message: str, req_id: str | None = None) -> None:
        self._send_json(status, {"jsonrpc": "2.0", "error": message, "id": req_id})

    def do_POST(self) -> None:
        # --- 1. Token authentication ---
        env_token = _get_env_token()
        if env_token is None:
            # Dev mode: if no token is configured, we still require one to be
            # present in the request to prevent accidental exposure.
            self._reject(403, "RPC token not configured")
            return

        # Prefer JWT session token (AUD-009 hardening). Fall back to raw token.
        session_jwt = self.headers.get("X-RPC-Session")
        if session_jwt and jwt is not None:
            try:
                decoded = jwt.decode(session_jwt, env_token, algorithms=["HS256"])
                if decoded.get("sub") != "rpc-session":
                    raise jwt.InvalidTokenError("Invalid subject")
            except jwt.ExpiredSignatureError:
                self._reject(403, "Session expired")
                return
            except jwt.InvalidTokenError:
                self._reject(403, "Invalid session token")
                return
        else:
            client_token = self.headers.get("X-RPC-Token")
            # Use secrets.compare_digest to prevent timing attacks
            if not client_token or not secrets.compare_digest(client_token, env_token):
                self._reject(403, "Invalid RPC token")
                return

        print(f"[RPC] Authenticated request from {self.client_address[0]}", flush=True)

        # --- 2. Content-Length validation ---
        content_length_hdr = self.headers.get("Content-Length")
        if not content_length_hdr:
            self._reject(411, "Content-Length required")
            return
        try:
            content_length = int(content_length_hdr)
        except ValueError:
            self._reject(400, "Invalid Content-Length")
            return
        if content_length > MAX_CONTENT_LENGTH:
            self._reject(413, f"Payload too large (max {MAX_CONTENT_LENGTH} bytes)")
            return

        # --- 3. Read and parse body ---
        try:
            post_data = self.rfile.read(content_length)
            req = json.loads(post_data.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._reject(400, "Malformed JSON body")
            return
        except Exception as e:
            self._reject(500, f"Internal error: {e}")
            return

        # --- 4. Validate RPC envelope ---
        if not isinstance(req, dict):
            self._reject(400, "Request must be a JSON object")
            return

        method = req.get("method")
        params = req.get("params", {})
        req_id = req.get("id")

        if not isinstance(method, str):
            self._reject(400, "Method must be a string", req_id)
            return
        if method not in ALLOWED_METHODS:
            self._reject(404, f"Method not found: {method}", req_id)
            return
        if not isinstance(params, dict):
            self._reject(400, "Params must be an object", req_id)
            return

        print(f"[RPC] method={method}", flush=True)

        # --- 5. Execute allowed method ---
        try:
            result = None
            if method == "neural_downscale":
                # Placeholder for PyTorch Dither Pie integration
                allowed_keys = {"input_path", "scale", "output_path"}
                unknown = set(params.keys()) - allowed_keys
                if unknown:
                    self._reject(400, f"Unexpected params: {unknown}")
                    return
                result = {
                    "status": "success",
                    "message": "Neural downscale complete",
                    "params": params,
                }

            elif method == "sam3_predict_point":
                import sam3_service
                image_path = params.get("image_path")
                x = params.get("x")
                y = params.get("y")
                if not image_path or x is None or y is None:
                    self._reject(400, "Missing image_path, x, or y")
                    return
                result = sam3_service.predict_point(image_path, int(x), int(y))

            elif method == "sam3_predict_batch":
                import sam3_service
                image_path = params.get("image_path")
                positive = params.get("positive_points", [])
                negative = params.get("negative_points", [])
                normalized = params.get("normalized", False)
                if not image_path:
                    self._reject(400, "Missing image_path")
                    return
                # Convert [[x, y], ...] to [(x, y), ...]; keep float if normalized
                if normalized:
                    pos_tuples = [(float(p[0]), float(p[1])) for p in positive if len(p) >= 2]
                    neg_tuples = [(float(p[0]), float(p[1])) for p in negative if len(p) >= 2]
                else:
                    pos_tuples = [(int(p[0]), int(p[1])) for p in positive if len(p) >= 2]
                    neg_tuples = [(int(p[0]), int(p[1])) for p in negative if len(p) >= 2]
                result = sam3_service.predict_batch(image_path, pos_tuples, neg_tuples, normalized=normalized)

            elif method == "sam3_predict_text":
                import sam3_service
                image_path = params.get("image_path")
                text_prompt = params.get("text_prompt")
                if not image_path or not text_prompt:
                    self._reject(400, "Missing image_path or text_prompt")
                    return
                result = sam3_service.predict_text(image_path, text_prompt)

            elif method == "sam3_predict_point_pro":
                import sam3_service
                image_path = params.get("image_path")
                x = params.get("x")
                y = params.get("y")
                if not image_path or x is None or y is None:
                    self._reject(400, "Missing image_path, x, or y")
                    return
                result = sam3_service.predict_point_pro(image_path, int(x), int(y))

            elif method == "sam3_predict_text_pro":
                import sam3_service
                image_path = params.get("image_path")
                text_prompt = params.get("text_prompt")
                if not image_path or not text_prompt:
                    self._reject(400, "Missing image_path or text_prompt")
                    return
                result = sam3_service.predict_text_pro(image_path, text_prompt)

            elif method == "sam3_predict_groundingdino":
                import sam3_service
                image_path = params.get("image_path")
                text_prompt = params.get("text_prompt")
                threshold = params.get("threshold", 0.3)
                device = params.get("device", "cpu")
                if not image_path or not text_prompt:
                    self._reject(400, "Missing image_path or text_prompt")
                    return
                result = sam3_service.predict_groundingdino(
                    image_path, text_prompt, float(threshold), str(device)
                )

            elif method == "sam3_remove_background":
                import sam3_service
                image_path = params.get("image_path")
                model = params.get("model", "u2net")
                alpha_matting = params.get("alpha_matting", False)
                if not image_path:
                    self._reject(400, "Missing image_path")
                    return
                result = sam3_service.remove_background(
                    image_path,
                    model=str(model),
                    alpha_matting=bool(alpha_matting),
                    alpha_matting_foreground_threshold=int(
                        params.get("alpha_matting_foreground_threshold", 240)
                    ),
                    alpha_matting_background_threshold=int(
                        params.get("alpha_matting_background_threshold", 10)
                    ),
                    alpha_matting_erode_size=int(
                        params.get("alpha_matting_erode_size", 10)
                    ),
                )

            elif method == "sam3_remove_background_batch":
                import sam3_service
                image_paths = params.get("image_paths", [])
                model = params.get("model", "u2net")
                alpha_matting = params.get("alpha_matting", False)
                if not image_paths:
                    self._reject(400, "Missing image_paths")
                    return
                result = sam3_service.remove_background_batch(
                    image_paths, model=str(model), alpha_matting=bool(alpha_matting)
                )

            elif method == "sam3_unload_models":
                import sam3_service
                result = sam3_service.unload_models()

            elif method == "sam3_list_models":
                import sam3_service
                result = sam3_service.list_models()

            self._send_json(
                200,
                {"jsonrpc": "2.0", "result": result, "id": req_id},
            )
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._reject(500, str(e), req_id)


def run(port: int = 0) -> None:
    """
    Start the secure RPC server.

    Args:
        port: TCP port to bind. 0 (default) picks an ephemeral port.
    """
    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, RPCRequestHandler)

    # If port was 0, get the actual ephemeral port
    actual_port = httpd.server_address[1]

    # Print port on stdout so the parent process can capture it
    print(f"RPC_PORT:{actual_port}", flush=True)

    # If no token was provided via env, generate one and print it (dev fallback)
    if _get_env_token() is None:
        dev_token = _generate_token()
        os.environ["MOSHDITHER_RPC_TOKEN"] = dev_token
        print(f"RPC_TOKEN:{dev_token}", flush=True)

    httpd.serve_forever()


if __name__ == "__main__":
    # Accept an optional port argument; default to 0 (ephemeral)
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    run(port)
