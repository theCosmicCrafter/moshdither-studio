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
        self.register(super::dithering::FloydSteinbergDither);
        self.register(super::dithering::AtkinsonDither);
        self.register(super::dithering::BlueNoiseDither::default());
        self.register(super::dithering::JarvisJudiceNinke);
        self.register(super::dithering::StuckiDither);
        self.register(super::dithering::BurkesDither);
        self.register(super::dithering::SierraDither);
        self.register(super::dithering::RandomNoiseDither);
        self.register(super::dithering::ThresholdDither::default());
        self.register(super::dithering::RiemersmaDither);

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
        self.register(super::color::ChannelSwap::default());

        // Pixel Geometry
        self.register(super::pixel_geo::PixelSort::default());
        self.register(super::pixel_geo::Kaleidoscope::default());
        self.register(super::pixel_geo::WaveDistort::default());
        self.register(super::pixel_geo::Pixelate::default());
        self.register(super::pixel_geo::Anaglyph::default());
        self.register(super::pixel_geo::BlockShift::default());
        self.register(super::pixel_geo::MirrorSlices::default());

        // Glitch
        self.register(super::glitch::JpegQuantize::default());
        self.register(super::glitch::Databend::default());
        self.register(super::glitch::SliceShift::default());
        self.register(super::glitch::ByteFlip::default());
        self.register(super::glitch::ByteInsert::default());
        self.register(super::glitch::ByteReverse::default());
        self.register(super::glitch::ByteZero::default());

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
        self.register(super::datamoshing::ClassicDatamosh::default());
        self.register(super::datamoshing::RiseDatamosh::default());
        self.register(super::datamoshing::ShuffleDatamosh::default());
        self.register(super::datamoshing::BloomDatamosh::default());
        self.register(super::datamoshing::RepeatDatamosh::default());
        self.register(super::datamoshing::CombineDatamosh::default());
        self.register(super::datamoshing::MotionTransfer);

        // Segmentation
        self.register(super::segmentation::MaskIsolate);
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
}

impl Default for EffectRegistry {
    fn default() -> Self {
        Self::new()
    }
}