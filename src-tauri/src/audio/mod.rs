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

impl FrameAudioFeatures {
    /// One feature, by the name an AudioBinding stores.
    ///
    /// The UI names these in camelCase (`subBass`, `beatBass`) because they
    /// come from the browser-side analyser; the struct is snake_case. Both
    /// spellings are accepted so a binding written by either side resolves.
    pub fn by_binding_source(&self, source: &str) -> Option<f64> {
        let b = |v: bool| if v { 1.0 } else { 0.0 };
        Some(match source {
            "rms" => self.rms,
            "energy" => self.energy,
            "spectralCentroid" | "spectral_centroid" | "centroid" => self.spectral_centroid,
            "spectralFlatness" | "spectral_flatness" | "flatness" => self.spectral_flatness,
            "spectralRolloff" | "spectral_rolloff" | "rolloff" => self.spectral_rolloff,
            "spectralFlux" | "spectral_flux" | "flux" => self.spectral_flux,
            "zcr" => self.zcr,
            "volume" => self.volume,
            "subBass" | "sub_bass" => self.sub_bass,
            "bass" => self.bass,
            "lowMid" | "low_mid" => self.low_mid,
            "mid" => self.mid,
            "highMid" | "high_mid" => self.high_mid,
            "presence" => self.presence,
            "brilliance" => self.brilliance,
            "beatBass" | "beat_bass" => b(self.beat_bass),
            "beatMid" | "beat_mid" => b(self.beat_mid),
            "beatTreble" | "beat_treble" => b(self.beat_treble),
            "beatEnergy" | "beat_energy" => self.beat_energy,
            _ => return None,
        })
    }
}

impl AudioBakeData {
    /// Get audio features for a specific frame index.
    pub fn get_frame(&self, idx: usize) -> Option<&FrameAudioFeatures> {
        self.frames.get(idx)
    }

    /// The bake frame covering absolute time `t` seconds.
    ///
    /// The bake is sampled at ITS fps, from the start of the audio file. The
    /// export used to index it by the video's frame number, which was wrong
    /// twice over: it assumed the bake's fps equalled the video's, and it
    /// ignored the in-point, so an export trimmed to start at 5 s heard the
    /// audio from 0 s. The preview plays audio at the transport time; this
    /// is the same lookup.
    pub fn frame_at_time(&self, t: f64) -> Option<&FrameAudioFeatures> {
        if self.frames.is_empty() || !t.is_finite() {
            return None;
        }
        let fps = if self.fps.is_finite() && self.fps > 0.0 {
            self.fps
        } else {
            30.0
        };
        let idx = (t.max(0.0) * fps).round() as usize;
        self.frames.get(idx.min(self.frames.len() - 1))
    }

    /// [`inject_params`] for the frame covering absolute time `t`.
    pub fn inject_params_at_time(
        &self,
        params: &mut serde_json::Map<String, serde_json::Value>,
        t: f64,
    ) {
        let fps = if self.fps.is_finite() && self.fps > 0.0 {
            self.fps
        } else {
            30.0
        };
        if self.frames.is_empty() || !t.is_finite() {
            return;
        }
        let idx = ((t.max(0.0) * fps).round() as usize).min(self.frames.len() - 1);
        self.inject_params(params, idx);
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

#[cfg(test)]
mod time_lookup_tests {
    use super::*;

    fn bake(fps: f64, n: usize) -> AudioBakeData {
        AudioBakeData {
            fps,
            total_frames: n,
            bpm: None,
            frames: (0..n)
                .map(|i| FrameAudioFeatures {
                    frame: i,
                    time: i as f64 / fps,
                    rms: 0.0,
                    energy: 0.0,
                    spectral_centroid: 0.0,
                    spectral_flatness: 0.0,
                    spectral_rolloff: 0.0,
                    spectral_flux: 0.0,
                    zcr: 0.0,
                    volume: 0.0,
                    sub_bass: 0.0,
                    // Encode the index in a feature so a lookup can be checked.
                    bass: i as f64,
                    low_mid: 0.0,
                    mid: 0.0,
                    high_mid: 0.0,
                    presence: 0.0,
                    brilliance: 0.0,
                    beat_bass: false,
                    beat_mid: false,
                    beat_treble: false,
                    beat_energy: 0.0,
                })
                .collect(),
        }
    }

    /// The export used to index the bake by the VIDEO's frame number. With a
    /// 60 fps bake and a 24 fps video, video frame 24 (t = 1 s) read bake
    /// frame 24 (t = 0.4 s). By time, it reads bake frame 60.
    #[test]
    fn looks_up_by_time_regardless_of_the_videos_frame_rate() {
        let b = bake(60.0, 600);
        assert_eq!(b.frame_at_time(1.0).unwrap().bass, 60.0);
        assert_eq!(b.frame_at_time(0.0).unwrap().bass, 0.0);
        // Rounds to the nearest bake frame.
        assert_eq!(b.frame_at_time(0.51).unwrap().bass, 31.0);
    }

    /// An export trimmed to start at 5 s must hear the audio from 5 s. The
    /// caller adds the in-point to `t`; this test pins that the lookup itself
    /// is absolute.
    #[test]
    fn an_in_point_offset_reaches_the_right_audio() {
        let b = bake(30.0, 900);
        let t = 5.0 + 10.0 / 30.0; // in-point 5 s, export frame 10 at 30 fps
        assert_eq!(b.frame_at_time(t).unwrap().bass, 160.0);
    }

    #[test]
    fn clamps_past_the_end_and_survives_bad_input() {
        let b = bake(30.0, 10);
        assert_eq!(b.frame_at_time(99.0).unwrap().bass, 9.0);
        assert_eq!(b.frame_at_time(-3.0).unwrap().bass, 0.0);
        assert!(b.frame_at_time(f64::NAN).is_none());
        assert!(bake(30.0, 0).frame_at_time(1.0).is_none());
        // A bake with a nonsense fps falls back to 30 rather than dividing by zero.
        let odd = bake(0.0, 100);
        assert_eq!(odd.frame_at_time(1.0).unwrap().bass, 30.0);
    }

    #[test]
    fn inject_at_time_writes_the_same_frame_the_lookup_returns() {
        let b = bake(30.0, 300);
        let mut p = serde_json::Map::new();
        b.inject_params_at_time(&mut p, 2.0);
        assert_eq!(p["_audio_bass"], serde_json::Value::from(60.0));
    }
}
