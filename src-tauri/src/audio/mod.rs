use serde::{Deserialize, Serialize};

/// Per-frame audio features extracted by the frontend AudioFeatureExtractor.
/// This mirrors the TypeScript `FrameAudioFeatures` interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameAudioFeatures {
    pub frame: usize,
    pub time: f64,
    pub rms: f64,
    pub energy: f64,
    pub spectral_centroid: f64,
    pub spectral_flatness: f64,
    pub spectral_rolloff: f64,
    pub spectral_flux: f64,
    pub zcr: f64,
    pub volume: f64,
    pub sub_bass: f64,
    pub bass: f64,
    pub low_mid: f64,
    pub mid: f64,
    pub high_mid: f64,
    pub presence: f64,
    pub brilliance: f64,
    pub beat_bass: bool,
    pub beat_mid: bool,
    pub beat_treble: bool,
    pub beat_energy: f64,
}

/// Baked audio data sent from frontend to Rust during export.
/// Mirrors the TypeScript `AudioBakeData` interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioBakeData {
    pub fps: f64,
    pub total_frames: usize,
    pub bpm: Option<f64>,
    pub frames: Vec<FrameAudioFeatures>,
}

impl AudioBakeData {
    /// Get audio features for a specific frame index.
    pub fn get_frame(&self, idx: usize) -> Option<&FrameAudioFeatures> {
        self.frames.get(idx)
    }

    /// Frame indices on which a beat lands, from the low band.
    ///
    /// Bass is the useful default here: kick and snare hits drive the felt
    /// pulse of a track, whereas the treble flag fires on hi-hats and would
    /// trigger far too often to cut on.
    pub fn beat_frames(&self) -> Vec<usize> {
        self.frames
            .iter()
            .enumerate()
            .filter(|(_, f)| f.beat_bass)
            .map(|(i, _)| i)
            .collect()
    }

    /// Inject whole-timeline audio data, for effects that run over a segment
    /// rather than a frame.
    ///
    /// `inject_params` gives a single frame's values, which is meaningless to a
    /// temporal effect: it receives the whole segment at once and must decide
    /// for itself which frames to act on. Passing the beat positions and tempo
    /// lets it do that -- this is what makes cutting on the beat possible at
    /// all, since the export path never calls `process_frame` for these.
    pub fn inject_timeline_params(&self, params: &mut serde_json::Map<String, serde_json::Value>) {
        let beats: Vec<serde_json::Value> = self
            .beat_frames()
            .into_iter()
            .map(|i| serde_json::Value::from(i as u64))
            .collect();
        params.insert(
            "_audio_beat_frames".to_string(),
            serde_json::Value::Array(beats),
        );
        if let Some(bpm) = self.bpm {
            params.insert("_audio_bpm".to_string(), serde_json::Value::from(bpm));
        }
        params.insert("_audio_fps".to_string(), serde_json::Value::from(self.fps));
    }

    /// Inject audio feature values into a parameter map with `_audio_` prefixed keys.
    pub fn inject_params(
        &self,
        params: &mut serde_json::Map<String, serde_json::Value>,
        frame_idx: usize,
    ) {
        let Some(features) = self.get_frame(frame_idx) else {
            return;
        };
        let val = |v: f64| -> serde_json::Value { serde_json::Value::from(v) };
        params.insert("_audio_rms".to_string(), val(features.rms));
        params.insert("_audio_energy".to_string(), val(features.energy));
        params.insert(
            "_audio_centroid".to_string(),
            val(features.spectral_centroid),
        );
        params.insert(
            "_audio_flatness".to_string(),
            val(features.spectral_flatness),
        );
        params.insert("_audio_rolloff".to_string(), val(features.spectral_rolloff));
        params.insert("_audio_flux".to_string(), val(features.spectral_flux));
        params.insert("_audio_zcr".to_string(), val(features.zcr));
        params.insert("_audio_volume".to_string(), val(features.volume));
        params.insert("_audio_sub_bass".to_string(), val(features.sub_bass));
        params.insert("_audio_bass".to_string(), val(features.bass));
        params.insert("_audio_low_mid".to_string(), val(features.low_mid));
        params.insert("_audio_mid".to_string(), val(features.mid));
        params.insert("_audio_high_mid".to_string(), val(features.high_mid));
        params.insert("_audio_presence".to_string(), val(features.presence));
        params.insert("_audio_brilliance".to_string(), val(features.brilliance));
        params.insert(
            "_audio_beat_bass".to_string(),
            val(if features.beat_bass { 1.0 } else { 0.0 }),
        );
        params.insert(
            "_audio_beat_mid".to_string(),
            val(if features.beat_mid { 1.0 } else { 0.0 }),
        );
        params.insert(
            "_audio_beat_treble".to_string(),
            val(if features.beat_treble { 1.0 } else { 0.0 }),
        );
        params.insert("_audio_beat_energy".to_string(), val(features.beat_energy));
    }
}
