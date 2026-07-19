use super::types::*;
use super::Effect;
use std::collections::HashMap;

/// Registry of all available effects, indexed by effect ID.
pub struct EffectRegistry {
    effects: HashMap<String, Box<dyn Effect>>,
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
        self.effects.insert(meta.id.clone(), Box::new(effect));
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
        self.register(super::overlay::PixelGridOverlay);
        self.register(super::overlay::SafeArea);
        self.register(super::overlay::RuleOfThirds);
        self.register(super::overlay::Crosshairs);

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
        self.register(super::datamoshing::IFrameRemoval::default());
        self.register(super::datamoshing::IFrameRemovalAdvanced);
        self.register(super::datamoshing::ClassicDatamosh::default());
        self.register(super::datamoshing::RiseDatamosh::default());
        self.register(super::datamoshing::ShuffleDatamosh::default());
        self.register(super::datamoshing::FrameReverse);
        self.register(super::datamoshing::FrameSortByDataSize);
        self.register(super::datamoshing::FrameHold);
        self.register(super::datamoshing::BloomDatamosh::default());
        self.register(super::datamoshing::RepeatDatamosh::default());
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

        // Segmentation
        self.register(super::segmentation::MaskIsolate);

        // Audio-Reactive
        self.register(super::audio_reactive::BassPulse);
        self.register(super::audio_reactive::BeatGlitch);
        self.register(super::audio_reactive::SpectralShift);
        self.register(super::audio_reactive::AudioDither);
    }

    pub fn get(&self, id: &str) -> Option<&dyn Effect> {
        self.effects.get(id).map(|b| b.as_ref())
    }

    pub fn list(&self) -> Vec<EffectMeta> {
        self.effects.values().map(|e| e.meta()).collect()
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
