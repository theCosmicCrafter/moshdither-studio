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

## 5. Add frontend parameter UI (if parameters exist)

Add a corresponding parameter panel component in `src/components/ParameterPanel/`.

## 6. Test

Run `cargo test` and `npm run tauri:dev` to verify.