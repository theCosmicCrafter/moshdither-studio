use super::types::*;
use super::Effect;
use std::collections::HashMap;
use std::sync::Arc;

/// Registry of all available effects, indexed by effect ID.
pub struct EffectRegistry {
    effects: HashMap<String, Arc<dyn Effect>>,
}

impl EffectRegistry {
    pub fn new() -> Self {
        let mut registry = Self {
            effects: HashMap::new(),
        };
        registry.register_defaults();
        registry
    }

    fn register<E: Effect + 'static>(&mut self, effect: E) {
        let meta = effect.meta();
        // The frontend falls back to the `ffglitch.` id-prefix when it can't
        // read `pipeline` — so the namespace and the trait method must always
        // agree. A codec effect under any other id would silently degrade to
        // pass-through pixels; an ffglitch.* id without Codec would be
        // dispatched as a pixel effect and moshed nothing.
        debug_assert_eq!(
            meta.id.starts_with("ffglitch."),
            matches!(effect.pipeline(), Pipeline::Codec),
            "pipeline/id-namespace mismatch for {}",
            meta.id
        );
        self.effects.insert(meta.id, Arc::new(effect));
    }

    fn register_defaults(&mut self) {
        // Dithering
        self.register(super::dithering::BayerDither::default());
        self.register(super::dithering::PaletteDither);
        self.register(super::dithering::FloydSteinbergDither);
        self.register(super::dithering::AtkinsonDither);
        self.register(super::dithering::BlueNoiseDither::default());
        self.register(super::dithering::JarvisJudiceNinke);
        self.register(super::dithering::StuckiDither);
        self.register(super::dithering::BurkesDither);
        self.register(super::dithering::SierraDither);
        self.register(super::dithering::ErrorDiffusionDither);
        self.register(super::dithering::RandomNoiseDither);
        self.register(super::dithering::ThresholdDither::default());
        self.register(super::dithering::RiemersmaDither);
        self.register(super::dithering::HalftoneDither::default());
        self.register(super::dithering::AutoPaletteDither);
        self.register(super::dithering::KMeansDither);
        self.register(super::dithering::CustomMatrixDither);
        self.register(super::dithering::OrderedDitherVariants);
        self.register(super::dithering::LineScreen);

        // Analog
        self.register(super::analog::Scanlines::default());
        self.register(super::analog::ChromaticAberration::default());
        self.register(super::analog::VhsEffect::default());
        self.register(super::analog::ColorBleed::default());
        self.register(super::analog::HueShift::default());
        self.register(super::analog::TvGlitch::default());
        self.register(super::analog::Ghosting::default());
        self.register(super::analog::ScanDrift::default());

        // Color
        self.register(super::color::RgbShift::default());
        self.register(super::color::BrightnessContrast);
        self.register(super::color::HistoricalPalettes);
        self.register(super::color::ChannelSwap::default());
        self.register(super::color::Invert::default());
        self.register(super::color::LiftGammaGain);
        self.register(super::color::LutGrading::default());

        // Composite
        self.register(super::composite::Overlay::default());

        // Overlay (HUD-style guides)

        // Pixel Geometry
        self.register(super::pixel_geo::PixelSort::default());
        self.register(super::pixel_geo::Kaleidoscope::default());
        self.register(super::pixel_geo::WaveDistort::default());
        self.register(super::pixel_geo::Pixelate::default());
        self.register(super::pixel_geo::Anaglyph::default());
        self.register(super::pixel_geo::BlockShift::default());
        self.register(super::pixel_geo::MirrorSlices::default());
        self.register(super::pixel_geo::SliceShiftAdvanced::default());

        // Glitch
        self.register(super::glitch::JpegQuantize::default());
        self.register(super::glitch::Databend::default());
        self.register(super::glitch::SliceShift::default());
        self.register(super::glitch::ByteFlip::default());
        self.register(super::glitch::ByteInsert::default());
        self.register(super::glitch::ByteReverse::default());
        self.register(super::glitch::ByteZero::default());
        self.register(super::glitch::PngChunkGlitch);
        self.register(super::glitch::CrcMismatchGlitch);
        self.register(super::glitch::SortingGlitch::default());
        self.register(super::glitch::MacroblockGlitch::default());
        self.register(super::glitch::EdgeStretch);

        // Noise
        self.register(super::noise::SaltPepperNoise::default());
        self.register(super::noise::GaussianNoise::default());
        self.register(super::noise::UniformNoise::default());
        self.register(super::noise::FractalNoise::default());

        // Artistic
        self.register(super::artistic::Vaporwave);
        self.register(super::artistic::Posterize::default());
        self.register(super::artistic::Solarize::default());
        self.register(super::artistic::Grayscale::default());

        // Datamoshing
        self.register(super::datamoshing::beat_sync::BeatHold);
        self.register(super::datamoshing::beat_sync::BeatSmear);
        self.register(super::datamoshing::IFrameRemoval::default());
        self.register(super::datamoshing::IFrameRemovalAdvanced);
        self.register(super::datamoshing::ClassicDatamosh::default());
        self.register(super::datamoshing::RiseDatamosh::default());
        self.register(super::datamoshing::ShuffleDatamosh::default());
        self.register(super::datamoshing::FrameReverse);
        self.register(super::datamoshing::FrameSortByDataSize);
        self.register(super::datamoshing::FrameHold);
        self.register(super::datamoshing::BloomDatamosh::default());
        self.register(super::datamoshing::CombineDatamosh::default());
        self.register(super::datamoshing::MotionTransfer);
        self.register(super::datamoshing::ZoomGlitch);
        self.register(super::datamoshing::ShearGlitch);
        self.register(super::datamoshing::VibrateGlitch);
        self.register(super::datamoshing::StopGlitch::default());
        self.register(super::datamoshing::BufferGlitch);
        self.register(super::datamoshing::DelayGlitch);
        self.register(super::datamoshing::MirrorGlitch);
        self.register(super::datamoshing::OpticalFlow::default());
        self.register(super::datamoshing::CrossVideoDatamosh);
        self.register(super::datamoshing::GlitchProfile);
        self.register(super::datamoshing::BloomProfile);
        self.register(super::datamoshing::SmearProfile);
        self.register(super::datamoshing::ExtremeProfile);
        self.register(super::datamoshing::RainbowProfile);

        // Codec-corruption layers: the 25 FFglitch modes, one parameterised
        // struct over the spec table in effects/ffglitch.rs. These declare
        // Pipeline::Codec — they mosh the encoded file at export time, not
        // frames inside process_video.
        for effect in super::ffglitch::ffglitch_modes() {
            self.register(effect);
        }

        // Segmentation
        self.register(super::segmentation::MaskIsolate);

        // Audio-Reactive
        self.register(super::audio_reactive::BassPulse);
        self.register(super::audio_reactive::BeatGlitch);
        self.register(super::audio_reactive::SpectralShift);
        self.register(super::audio_reactive::AudioDither);
        self.register(super::audio_visual::AudioSpectrum);
        self.register(super::audio_visual::AudioWaveform);
        self.register(super::audio_visual::AudioChromatic);
        self.register(super::audio_visual::AudioPixelate);
    }

    /// Retired effect IDs and what they now resolve to.
    ///
    /// An unknown effect ID is a hard error in the render pipeline -- it aborts
    /// the whole export rather than skipping the entry -- so removing an ID that
    /// projects may reference has to leave a forwarding address or those
    /// projects stop rendering entirely.
    ///
    /// Aliases do NOT appear in `list()`, so a retired ID is invisible in the
    /// effect browser and cannot be added to a new project. It only resolves for
    /// work that already refers to it.
    const ALIASES: &'static [(&'static str, &'static str)] = &[
        // Removed 2026-07-26. Was byte-for-byte the same algorithm as
        // datamoshing.classic -- chunk the segment, repeat each chunk N times --
        // with identical defaults and only the parameter names differing.
        // classic's ranges are wider on both parameters (chunk 2-30 vs 2-20,
        // repeats 1-10 vs 2-10), so nothing is lost by forwarding here.
        // ClassicDatamosh also reads `series_size` and `repeat_count`, so stored
        // values carry over.
        ("datamoshing.repeat", "datamoshing.classic"),
    ];

    pub fn get(&self, id: &str) -> Option<&dyn Effect> {
        if let Some(effect) = self.effects.get(id) {
            return Some(effect.as_ref());
        }
        Self::ALIASES
            .iter()
            .find(|(old, _)| *old == id)
            .and_then(|(_, new)| self.effects.get(*new))
            .map(|b| b.as_ref())
    }

    /// Owned handle to an effect — the caller can drop the registry lock and
    /// still use it. The export loop resolves every call's effect once under
    /// the lock, then releases it: a codec stage runs its sidecar for seconds
    /// and must not hold the mutex that preview renders queue on.
    pub fn get_shared(&self, id: &str) -> Option<Arc<dyn Effect>> {
        if let Some(effect) = self.effects.get(id) {
            return Some(effect.clone());
        }
        Self::ALIASES
            .iter()
            .find(|(old, _)| *old == id)
            .and_then(|(_, new)| self.effects.get(*new))
            .cloned()
    }

    pub fn list(&self) -> Vec<EffectMeta> {
        self.effects.values().map(|e| e.meta()).collect()
    }

    /// `(meta, pipeline, is_temporal)` for every registered effect. Both
    /// flags live on the trait object, not `EffectMeta`, so `list()` alone
    /// cannot answer them — the `list_effects` command joins them here
    /// rather than doing a second `get()` per id.
    pub fn list_details(&self) -> Vec<(EffectMeta, Pipeline, bool)> {
        self.effects
            .values()
            .map(|e| (e.meta(), e.pipeline(), e.is_temporal()))
            .collect()
    }

    pub fn list_by_category(&self, category: EffectCategory) -> Vec<EffectMeta> {
        self.effects
            .values()
            .map(|e| e.meta())
            .filter(|m| m.category == category)
            .collect()
    }

    /// Return a map of effect ID to parameter definitions, used for input
    /// validation and clamping without repeatedly re-instantiating metadata.
    pub fn parameter_defs(&self) -> HashMap<String, Vec<ParameterDef>> {
        self.effects
            .iter()
            .map(|(id, e)| (id.clone(), e.meta().parameters))
            .collect()
    }
}

impl Default for EffectRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The frontend reads `pipeline` from `list_effects` but falls back to the
    /// `ffglitch.` id-prefix heuristic — so a codec effect that forgets to
    /// override `pipeline()` must not be able to register silently. Both
    /// directions are asserted: every codec effect lives under `ffglitch.*`
    /// (a new codec namespace would need the frontend heuristic updated too),
    /// and every `ffglitch.*` id reports `Pipeline::Codec`.
    #[test]
    fn pipeline_matches_id_namespace_for_all_registered_effects() {
        let registry = EffectRegistry::new();
        for (meta, pipeline, _) in registry.list_details() {
            assert_eq!(
                meta.id.starts_with("ffglitch."),
                matches!(pipeline, Pipeline::Codec),
                "pipeline/id-namespace mismatch for {}",
                meta.id
            );
        }
    }

    /// The count is a tripwire: registering a mode under the wrong namespace
    /// or dropping modes from the spec table shows up here.
    #[test]
    fn all_ffglitch_modes_are_registered_as_codec() {
        let registry = EffectRegistry::new();
        let codecs = registry
            .list_details()
            .into_iter()
            .filter(|(_, p, _)| matches!(p, Pipeline::Codec))
            .count();
        assert_eq!(codecs, 25, "expected 25 ffglitch codec modes");
    }
}
