# Python Backend

The MoshDither Python backend provides video processing capabilities via FFglitch and ffmpeg, plus a secure RPC server for neural network integration.

---

## Components

| File | Purpose |
|------|---------|
| `main.py` | Secure HTTP RPC server for renderer-to-Python communication |
| `mosh_cli.py` | Command-line interface for FFglitch-based datamoshing |
| `requirements.txt` | Python dependencies |

---

## Setup

```bash
cd packages/python-backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

---

## Running the RPC Server

### Development (auto token)

```bash
python main.py
```

The server prints the ephemeral port and auto-generated token to stdout:

```
RPC_PORT:49231
RPC_TOKEN:a3f2b1...
```

### Production (pre-shared token)

```bash
export MOSHDITHER_RPC_TOKEN=$(openssl rand -hex 32)
python main.py
```

The server binds to `127.0.0.1` only and accepts connections with a valid `X-RPC-Token` header.

---

## API

See [`../../docs/API_SPEC.md`](../../docs/API_SPEC.md) for the full IPC/RPC contract.

---

## Datamoshing (`mosh_cli.py`)

The CLI wraps FFglitch with safe argument list construction (no shell injection).

```bash
python mosh_cli.py <input> <mode> [--output OUTPUT]
```

**Modes:** `classic`, `gop_corrupt`, `p-frame_repeat`, `i-frame_removal`, `sort`, `buffer_overflow`, `random_noise`, `custom_script`

---

## Security

- Token auth via `X-RPC-Token` header (256-bit, timing-attack resistant comparison)
- Ephemeral port binding (`port=0` by default)
- Input method allowlisting (`neural_downscale` only; expand as needed)
- Payload capped at 1MB
- Binds to `127.0.0.1` only (never `0.0.0.0`)

---

## License

Same as root project (MIT).
