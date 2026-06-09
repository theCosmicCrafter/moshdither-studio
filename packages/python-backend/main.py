import sys
import os
import json
import secrets
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer

# ---------------------------------------------------------------------------
# Security Constants
# ---------------------------------------------------------------------------
MAX_CONTENT_LENGTH = 1_048_576  # 1 MB
ALLOWED_METHODS = {"neural_downscale"}


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

    def _reject(self, status: int, message: str) -> None:
        self._send_json(status, {"jsonrpc": "2.0", "error": message})

    def do_POST(self) -> None:
        # --- 1. Token authentication ---
        env_token = _get_env_token()
        if env_token is None:
            # Dev mode: if no token is configured, we still require one to be
            # present in the request to prevent accidental exposure.
            self._reject(403, "RPC token not configured")
            return

        client_token = self.headers.get("X-RPC-Token")
        # Use secrets.compare_digest to prevent timing attacks
        if not client_token or not secrets.compare_digest(client_token, env_token):
            self._reject(403, "Invalid RPC token")
            return

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
            self._reject(400, "Method must be a string")
            return
        if method not in ALLOWED_METHODS:
            self._reject(404, f"Method not found: {method}")
            return
        if not isinstance(params, dict):
            self._reject(400, "Params must be an object")
            return

        # --- 5. Execute allowed method ---
        try:
            result = None
            if method == "neural_downscale":
                # Placeholder for PyTorch Dither Pie integration
                # Validate expected params (example: ensure no extra keys)
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

            self._send_json(
                200,
                {"jsonrpc": "2.0", "result": result, "id": req_id},
            )
        except Exception as e:
            self._reject(500, str(e))


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
