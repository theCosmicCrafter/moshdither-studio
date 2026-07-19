#!/usr/bin/env python3
"""
MoshDither Studio — CrewAI Multi-Agent Audit Orchestrator
Uses local Ollama backend for LLM inference.
"""
import os
import sys
import json
import time
from pathlib import Path

# Configure Ollama via LiteLLM for CrewAI
os.environ["OLLAMA_API_BASE"] = "http://localhost:11434"

from crewai import Agent, Task, Crew, Process
from crewai.llm import LLM

PROJECT_ROOT = Path("c:/Users/richk/CascadeProjects/moshdither-studio")

# Initialize LLM pointing to local Ollama
llm = LLM(model="ollama/huihui_ai/lfm2.5-abliterated:latest", base_url="http://localhost:11434")

# ── Agent Definitions ───────────────────────────────────────────────

rust_architect = Agent(
    role="RustBackendAuditor",
    goal="Audit the Rust backend for logic errors, memory safety, concurrency bugs, API violations, and missing error handling.",
    backstory="""You are a senior Rust systems engineer with 10+ years of experience in unsafe-free systems programming.
You specialize in spotting ownership issues, missing bounds checks, unwrap/panic paths, and IPC protocol mismatches.
You have zero tolerance for unwrap() in production code and always flag hardcoded paths or missing resource cleanup.""",
    llm=llm,
    verbose=True,
)

ml_engineer = Agent(
    role="MLBackendEngineer",
    goal="Audit the SAM3 Python bridge, ONNX/ML integration, model loading, inference correctness, and GPU resource management.",
    backstory="""You are a machine learning infrastructure engineer who has shipped PyTorch/ONNX pipelines to production.
You specialize in spotting race conditions in model lazy-loading, memory leaks during inference, incorrect tensor shapes,
missing error recovery when CUDA OOMs, and hardcoded model paths that break portability.""",
    llm=llm,
    verbose=True,
)

frontend_specialist = Agent(
    role="FrontendSpecialist",
    goal="Audit the React/TypeScript frontend for logic bugs, state management issues, race conditions, UI misalignment, and API contract violations.",
    backstory="""You are a senior frontend architect with deep expertise in React concurrent features, Zustand state management,
and Tauri IPC patterns. You spot stale closures, missing cleanup, event listener leaks, and coordinate-system mismatches
between canvas overlays and displayed media.""",
    llm=llm,
    verbose=True,
)

security_auditor = Agent(
    role="SecurityAuditor",
    goal="Audit for security vulnerabilities, CSP issues, path traversal, injection risks, secret leakage, and unsafe deserialization.",
    backstory="""You are an application security engineer with expertise in desktop application security, Electron/Tauri sandboxing,
and Python RPC security. You flag every instance where user input touches the filesystem or spawns processes without validation.""",
    llm=llm,
    verbose=True,
)

test_analyst = Agent(
    role="TestCoverageAnalyst",
    goal="Audit test coverage, identify missing tests for critical paths, and evaluate test quality and correctness.",
    backstory="""You are a QA engineer who believes untrusted code is broken code. You map every public API to its test coverage,
flag missing edge-case tests, and identify tests that pass but assert nothing meaningful.""",
    llm=llm,
    verbose=True,
)

devops_integrator = Agent(
    role="DevOpsIntegrator",
    goal="Audit build configuration, CI/CD, dependency management, containerization readiness, and deployment scripts.",
    backstory="""You are a DevOps engineer who ensures builds are reproducible, dependencies are pinned, and CI pipelines catch regressions.
You flag missing lockfiles, outdated dependencies, and build scripts that assume developer-machine state.""",
    llm=llm,
    verbose=True,
)

# ── Context Files (summaries injected into tasks) ───────────────────

RUST_CONTEXT = """
=== CRITICAL FILES ===

src-tauri/Cargo.toml: Dependencies include tauri, image, rayon, serde, thiserror, rand, base64. MISSING: ort (ONNX Runtime) despite README claiming SAM3 uses ONNX.

src-tauri/src/lib.rs: Registers Tauri commands. AppState holds EffectRegistry, current_frame, Sam3Engine.

src-tauri/src/commands.rs: apply_effect and apply_effect_stack BOTH apply the mask — once inside effect.process_frame (if the effect supports masking) and again AFTER the effect returns. This causes double-mask application for effects that already handle masks internally. Line ~300-350.

src-tauri/src/sam3_engine.rs: Spawns sam3_bridge.py with hardcoded fallback project_root. Uses Mutex on child stdin/stdout — if the Python bridge panics, the Mutex may be poisoned and all future SAM3 calls will deadlock. No timeout on IPC reads. No health check. No zombie process reaping.

src-tauri/src/ffmpeg/mod.rs: FFmpeg binary path hardcoded to "assets/bin/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe". No fallback if sidecar missing. decode_video allocates frames into Vec — could OOM on large files.

src-tauri/src/effects/types.rs: Mask struct has data: Vec<u8> but no width/height. How is mask stride determined? No documentation.

src-tauri/src/effects/registry.rs: Many effects registered but several video effects (datamoshing) are stubs that just clone frames.

src-tauri/src/segmentation/mod.rs: EMPTY MODULE. Segmentation engine not implemented in Rust.

src-tauri/src/optical_flow/mod.rs: EMPTY MODULE. Optical flow not implemented.

src-tauri/src/error.rs: AppError covers basic cases but missing variants for: SAM3 IPC timeout, model not found, CUDA OOM, FFmpeg missing.

src-tauri/src/utils/image_io.rs: load_image silently resizes images >2048px. This destroys resolution for users working with 4K/8K media. No warning. No opt-out.
"""

PYTHON_CONTEXT = """
=== SAM3 BRIDGE ===

sam3_bridge.py: Hardcoded SAM3_CHECKPOINT = "D:\\models\\sam3\\sam3.pt". This path will not exist on any other machine.
Uses torch.cuda.is_available() but never handles CUDA OOM or falls back gracefully.
The model is loaded lazily on first command — if the model file is missing, the error is only surfaced at first prompt time, not init time.
JSON IPC over stdin/stdout: No length-prefix framing. If Python prints a traceback to stdout (instead of stderr), the Rust side will parse garbage JSON and fail.
No validation that the input base64 image decodes correctly before running inference.
No timeout on inference. A slow model could block the Rust Mutex indefinitely.
"""

FRONTEND_CONTEXT = """
=== FRONTEND ===

src/components/PreviewViewport.tsx: Mask overlay <img> uses absolute inset-0 but the parent <div className="relative"> sizes to the base image. However, the mask base64 PNG may have different dimensions than the displayed scaled image, causing distortion. The mask overlay lacks explicit object-fit: contain or matching maxWidth/maxHeight styling.

src/components/PreviewViewport.tsx: screenToImageCoords maps screen pixels to image coordinates, but if the image is letterboxed inside the container, the coordinates may be off. Need to verify letterboxing math.

src/components/MaskPanel.tsx: No error boundary around SAM3 operations. If sam3Init fails, the UI doesn't show a clear error state.

src/store/index.ts: Undo/redo stack is in-memory only. No persistence. A page reload loses all work.

src/store/index.ts: activeMask stored as base64 string. Large masks on high-res images will bloat memory and Zustand snapshots.

src/lib/tauri.ts: Type definitions for SAM3 commands don't match the Rust return shapes exactly. e.g., sam3PointPrompt returns { count, masks, scores } but TypeScript types should be verified.

vite.config.ts: target chrome105. Tauri v2 typically needs newer targets. Check if this causes polyfill issues.

tauri.conf.json: CSP allows img-src * data: blob: asset: — very permissive. Should restrict to necessary sources.
"""

SECURITY_CONTEXT = """
=== SECURITY ===

tauri.conf.json: CSP img-src includes wildcard '*'. If the app loads remote images, this is needed, but it also allows exfiltration via image requests.

src-tauri/sam3_bridge.py: No authentication on the Python bridge. Any process that can write to the stdin pipe can execute arbitrary SAM3 commands.

src-tauri/src/sam3_engine.rs: The Python script path is resolved relative to CARGO_MANIFEST_DIR. In a packaged Tauri app, this might point inside the ASAR/app bundle. The binary might not be extractable or executable from there.

src/components/PreviewViewport.tsx: handleDrop accepts files from HTML5 drag-and-drop but only logs the filename — it doesn't validate file type or size before passing to backend.
"""

TEST_CONTEXT = """
=== TESTING ===

src-tauri/src/effects/dithering/floyd_steinberg.rs: Has inline unit tests.
src-tauri/src/effects/dithering/bayer.rs: Has inline unit tests.
src-tauri/src/utils/image_io.rs: Has inline unit tests.

MISSING TESTS:
- No tests for mask application in apply_effect / apply_effect_stack
- No tests for SAM3 bridge IPC protocol
- No tests for FFmpeg decode/encode roundtrip
- No tests for effect stack ordering and parameter passing
- No tests for undo/redo state management
- No tests for drag-and-drop file validation
- No tests for image_io resize behavior (silent downscale)
- No integration tests between frontend and backend
"""

DEVOPS_CONTEXT = """
=== BUILD / DEVOPS ===

package.json: Missing @testing-library/dom peer dependency (caused test failures in prior audit).
No playwright browser tests configured despite docs claiming they exist.
No GitHub Actions workflow in the current repo (docs reference .github/workflows/ci.yml from old Electron app).
No Dockerfile or containerization for the Python backend.
sam3_bridge.py has no requirements.txt or pyproject.toml in src-tauri/.
No automated setup script for SAM3 environment (expected: scripts/setup_sam3.py).
Cargo.lock is present but not verified for outdated dependencies.
"""

# ── Tasks ───────────────────────────────────────────────────────────

task_rust = Task(
    description=f"""Audit the Rust backend of MoshDither Studio.
Review the following subsystem context and produce a structured report with:
1. CRITICAL (P0) bugs that will cause crashes, data loss, or undefined behavior
2. HIGH (P1) issues that cause incorrect behavior under edge cases
3. MEDIUM (P2) code quality and maintainability issues
4. LOW (P3) style/performance nitpicks

For each issue, provide:
- File path and line number range
- Exact description of the bug
- Why it matters (impact)
- Suggested fix with code snippet if applicable

Context:
{RUST_CONTEXT}
""",
    expected_output="A markdown report titled 'Rust Backend Audit Findings' with at least 8 distinct findings across P0-P3.",
    agent=rust_architect,
)

task_ml = Task(
    description=f"""Audit the machine learning and SAM3 integration of MoshDither Studio.
Review the following subsystem context and produce a structured report with P0-P3 findings.

For each issue, provide file path, line numbers, exact description, impact, and fix.

Context:
{PYTHON_CONTEXT}

Also check these gaps against real SAM3 capabilities:
- SAM3 supports: text prompts, point prompts, box prompts, automatic mask generation, mask refinement, video segmentation (propagation), 3D segmentation.
- Current implementation: text, point, box prompts only. Missing: auto-mask, refinement, video propagation, 3D.
- The bridge returns only the top-scoring mask. SAM3 can return multiple masks per prompt (3 levels of granularity).
- No mask post-processing (edge smoothing, hole filling, grow/shrink).
""",
    expected_output="A markdown report titled 'SAM3 / ML Backend Audit Findings' with P0-P3 issues and a SAM3 feature gap matrix.",
    agent=ml_engineer,
)

task_frontend = Task(
    description=f"""Audit the React/TypeScript frontend of MoshDither Studio.
Review the following subsystem context and produce a structured report with P0-P3 findings.

Context:
{FRONTEND_CONTEXT}

Also check:
- Is the canvas overlay alignment bug from handover-canvas-alignment.md still present in the new Tauri codebase?
- Are there any missing effect controls that are registered in the backend but not exposed in the UI?
- Is the Zustand store serializable for potential persistence?
""",
    expected_output="A markdown report titled 'Frontend Audit Findings' with at least 8 findings across P0-P3.",
    agent=frontend_specialist,
)

task_security = Task(
    description=f"""Audit the security posture of MoshDither Studio.
Review the following subsystem context and produce a structured report with P0-P3 findings.

Context:
{SECURITY_CONTEXT}

Also check:
- Tauri v2 permission model: are all commands properly permissioned?
- Are there any secrets or tokens hardcoded in source files?
- Is the CSP tight enough for a desktop graphics app that processes user media?
- Could a malicious media file exploit the FFmpeg parsing or image decoding paths?
""",
    expected_output="A markdown report titled 'Security Audit Findings' with at least 6 findings across P0-P3.",
    agent=security_auditor,
)

task_tests = Task(
    description=f"""Audit the test coverage of MoshDither Studio.
Review the following subsystem context and produce a structured report with P0-P3 findings.

Context:
{TEST_CONTEXT}

Also produce a prioritized list of tests to add, ordered by risk reduction value.
""",
    expected_output="A markdown report titled 'Test Coverage Audit Findings' with missing test inventory and prioritization.",
    agent=test_analyst,
)

task_devops = Task(
    description=f"""Audit the build, CI/CD, and DevOps setup of MoshDither Studio.
Review the following subsystem context and produce a structured report with P0-P3 findings.

Context:
{DEVOPS_CONTEXT}

Also check:
- Does the project have reproducible builds?
- Are native dependencies (FFmpeg) properly bundled for distribution?
- Is the Python SAM3 bridge distributable as a standalone binary or does it require a Python environment on the user's machine?
""",
    expected_output="A markdown report titled 'DevOps / Build Audit Findings' with at least 6 findings across P0-P3.",
    agent=devops_integrator,
)

# ── Orchestrate ─────────────────────────────────────────────────────

crew = Crew(
    agents=[rust_architect, ml_engineer, frontend_specialist, security_auditor, test_analyst, devops_integrator],
    tasks=[task_rust, task_ml, task_frontend, task_security, task_tests, task_devops],
    process=Process.sequential,
    verbose=True,
)

if __name__ == "__main__":
    print("=" * 60)
    print("MoshDither Studio — CrewAI Multi-Agent Audit")
    print("=" * 60)
    result = crew.kickoff()
    print("\n" + "=" * 60)
    print("AUDIT COMPLETE")
    print("=" * 60)
    print(result)
    
    # Save raw output
    out_path = PROJECT_ROOT / "AUDIT_RAW_OUTPUT.md"
    out_path.write_text(str(result), encoding="utf-8")
    print(f"\nRaw output saved to: {out_path}")
