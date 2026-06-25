# ADR-0002: Rust Effect Engine with Rayon Parallelization

## Status
Accepted

## Context
The effect system needs to process video frames through a stack of 75+ effects. Performance is critical for real-time preview and export. Effects can be temporal (requiring cross-frame context) or non-temporal (per-frame independent).

## Decision
Implement the effect engine in Rust with **Rayon** for parallel frame processing.

## Rationale
- **Type safety**: Rust's trait system ensures all effects implement the same interface
- **Zero-cost abstractions**: Traits and generics compile to efficient native code
- **Rayon parallelism**: Non-temporal effects process frames in parallel across CPU cores
- **Sequential fallback**: Temporal effects (datamoshing, audio-reactive) use sequential `process_video`
- **Memory efficiency**: Frames are RGBA `Vec<u8>` — no GC pressure

## Architecture
```
EffectStack
  ├─ process_frame()     — sequential, single frame
  ├─ process_video()     — temporal: sequential, non-temporal: rayon parallel
  └─ process_frames_parallel() — batch parallel for export pipelines
```

## Consequences
- Temporal effects must implement `process_video()` for correctness
- Non-temporal effects can rely on `process_frame()` and get parallelism for free
- The `is_temporal()` method on the Effect trait determines the processing path
- Audio-reactive effects with per-frame parameter injection remain sequential
