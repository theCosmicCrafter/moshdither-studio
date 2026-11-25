# Effect Guide

How to add a new effect to MoshDither Studio.

## 1. Create the effect file

Create a file under the appropriate category, e.g.:

```text
src-tauri/src/effects/dithering/my_effect.rs
```

## 2. Implement the `Effect` trait

```rust
use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;

pub struct MyEffect;

impl Effect for MyEffect {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.my_effect".to_string(),
            name: "My Effect".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: vec![],
        }
    }

    fn process_frame(&self, input: &Frame, _mask: Option<&Mask>, _params: &ParameterValues) -> Result<Frame> {
        Ok(Frame { ..input.clone() })
    }

    fn process_video(&self, input: &VideoSegment, _mask: Option<&Mask>, _params: &ParameterValues) -> Result<VideoSegment> {
        Ok(VideoSegment { ..input.clone() })
    }
}
```

## 3. Register in the category mod

Add to `src-tauri/src/effects/dithering/mod.rs`:

```rust
pub mod my_effect;
```

## 4. Add to the registry

Register in `src-tauri/src/effects/engine.rs` or a central registry.

## 5. Codec-pipeline effects (`Pipeline::Codec`)

`Effect::pipeline()` defaults to `Pipeline::Pixel`. Override it to
`Pipeline::Codec` for effects that operate on the encoded bitstream rather
than on frames — the 25 `ffglitch.*` modes are the model
(`src-tauri/src/effects/ffglitch.rs`, a single parameterized `FfglitchMode`
driven by a `ModeSpec` table mirroring `src/lib/ffglitchModes.ts`).

A codec effect:

- keeps `process_frame`/`process_video` as deliberate pass-throughs so the
  CPU preview and frame cache see unchanged frames;
- declares `is_temporal() == true` (corruption crosses frame boundaries);
- is dispatched by `export_video_blocking` to `apply_codec_to_segment`,
  which encodes the in-flight segment to a temp mp4, runs the FFglitch
  sidecar on the file, and decodes back — inside the held export semaphore,
  sharing the export's cancel flag;
- is reported as `skipped` by `verify_all_effects`/conformance — the
  frame-domain checks don't apply;
- suppresses keyframe/LFO/audio-bind/mask controls in the UI (the
  `effectPipeline()` helper in `src/lib/effectPipeline.ts` reads the
  `pipeline` field from `list_effects`, falling back to the `ffglitch.`
  id-prefix heuristic).

## 6. Add frontend parameter UI (if parameters exist)

Add a corresponding parameter panel component in `src/components/ParameterPanel/`.

## 7. Test

Run `cargo test` and `npm run tauri:dev` to verify.