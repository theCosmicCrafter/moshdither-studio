//! mosh-verify: Standalone CLI for effect verification.
//!
//! Runs outside the Tauri runtime. Useful for CI, automated testing,
//! and agent-driven verification.
//!
//! Usage:
//!   mosh-verify verify-all [--format json|text] [--filter <substring>]
//!   mosh-verify verify-effect <effect_id>
//!   mosh-verify list-effects [--category <category>]
//!   mosh-verify status

use std::env;
use std::process::ExitCode;

use moshdither_studio_lib::effects::types::{Frame, Mask, MediaType, ParameterDef, VideoSegment};
use moshdither_studio_lib::effects::{
    clamp_params, functional_tests, verification, EffectRegistry,
};
use moshdither_studio_lib::ffmpeg;
use moshdither_studio_lib::utils::image_io;

fn print_usage() {
    eprintln!("mosh-verify — MoshDither Studio effect verification CLI");
    eprintln!();
    eprintln!("USAGE:");
    eprintln!("  mosh-verify <command> [options]");
    eprintln!();
    eprintln!("COMMANDS:");
    eprintln!("  verify-all              Run verification on all registered effects");
    eprintln!("    --format <json|text>   Output format (default: text)");
    eprintln!("    --filter <substring>   Only verify effects whose ID contains substring");
    eprintln!(
        "    --check <name>         Only run specific check: no_crash, non_empty, animates, mask"
    );
    eprintln!();
    eprintln!("  verify-effect <id>      Run verification on a single effect by ID");
    eprintln!();
    eprintln!("  list-effects            List all registered effects");
    eprintln!("    --category <cat>       Filter by category (dithering, glitch, analog, etc.)");
    eprintln!();
    eprintln!("  status                  Show environment status (binary paths, effect count)");
    eprintln!();
    eprintln!("  test-all                Run full functional test suite (all pipeline functions)");
    eprintln!("    --format <json|text>   Output format (default: text)");
    eprintln!("    --category <cat>       Only show results from a specific category");
    eprintln!();
    eprintln!(
        "  render-all              Render every effect on a test image + video, save outputs"
    );
    eprintln!("    --image <path>         Path to test image (required)");
    eprintln!("    --video <path>         Path to test video (required for video effects)");
    eprintln!("    --output <dir>         Output directory (default: ./outputs/render)");
    eprintln!("    --filter <substring>   Only render effects whose ID contains substring");
    eprintln!("    --duration <secs>      Clip duration in seconds (default: 5)");
    eprintln!();
    eprintln!("  animate-all              Animate a still image through every effect (time 0→1)");
    eprintln!("    --image <path>         Path to still image (required)");
    eprintln!("    --output <dir>         Output directory (default: ./outputs/animated)");
    eprintln!("    --filter <substring>   Only animate effects whose ID contains substring");
    eprintln!("    --duration <secs>      Clip duration in seconds (default: 5)");
    eprintln!("    --fps <n>              Frames per second (default: 24)");
    eprintln!();
    eprintln!("  audio-render            Render audio-reactive effects with baked audio features");
    eprintln!("    --video <path>        Path to input video (required)");
    eprintln!("    --audio-bake <path>   Path to AudioBakeData JSON (required)");
    eprintln!("    --output <dir>        Output directory (default: ./outputs/audio)");
    eprintln!("    --filter <substring>  Only render effects whose ID contains substring");
    eprintln!("    --max-frames <n>      Max frames to decode (default: 450 = 15s @ 30fps)");
    eprintln!("    --scale <n>           Downscale so longest side = n px (e.g. 720 for 720p)");
    eprintln!("                          Essential for 4K source — without this, the 2 GiB");
    eprintln!("                          decode budget only allows ~64 4K frames");
    eprintln!();
    eprintln!("  render-presets          Render preset stacks on a test image");
    eprintln!("    --image <path>        Path to test image (required)");
    eprintln!("    --presets <path>      JSON file with preset specs (required)");
    eprintln!("    --output <dir>        Output directory (default: ./outputs/presets)");
    eprintln!();
    eprintln!("  render-luts             Render every LUT in a directory via color.lut_grading");
    eprintln!("    --image <path>        Path to test image (required)");
    eprintln!("    --lut-dir <dir>       Directory containing LUT PNGs (default: ./public/lut)");
    eprintln!("    --output <dir>        Output directory (default: ./outputs/luts)");
    eprintln!();
    eprintln!("EXAMPLES:");
    eprintln!("  mosh-verify verify-all --format json > report.json");
    eprintln!("  mosh-verify verify-all --filter glitch");
    eprintln!("  mosh-verify verify-effect color.invert");
    eprintln!("  mosh-verify list-effects --category dithering");
    eprintln!("  mosh-verify test-all --format json");
    eprintln!(
        "  mosh-verify render-all --image photo.png --video clip.mp4 --output ./outputs/render"
    );
    eprintln!("  mosh-verify status");
}

fn cmd_verify_all(args: &[String]) -> ExitCode {
    let mut format = "text";
    let mut filter: Option<&str> = None;
    let mut _check_filter: Option<&str> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--format" => {
                i += 1;
                if i < args.len() {
                    format = &args[i];
                }
            }
            "--filter" => {
                i += 1;
                if i < args.len() {
                    filter = Some(&args[i]);
                }
            }
            "--check" => {
                i += 1;
                if i < args.len() {
                    _check_filter = Some(&args[i]);
                }
            }
            _ => {}
        }
        i += 1;
    }

    let registry = EffectRegistry::new();

    let report = if let Some(f) = filter {
        // Filter to matching effects only
        let metas: Vec<_> = registry
            .list()
            .into_iter()
            .filter(|m| m.id.contains(f))
            .collect();
        let mut results = Vec::with_capacity(metas.len());
        for meta in &metas {
            results.push(verification::verify_effect(&meta.id, &registry));
        }
        let passed = results.iter().filter(|r| r.overall_pass).count();
        let total = results.len();
        let failed = total - passed;
        verification::VerificationReport {
            total_effects: total,
            passed,
            failed,
            results,
            summary: format!(
                "{}/{} effects passed verification ({} failed)",
                passed, total, failed
            ),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs().to_string())
                .unwrap_or_else(|_| "unknown".to_string()),
        }
    } else {
        verification::verify_all_effects(&registry)
    };

    match format {
        "json" => {
            println!(
                "{}",
                serde_json::to_string_pretty(&report).unwrap_or_default()
            );
        }
        _ => {
            // Text format
            println!("=== MoshDither Studio Verification Report ===");
            println!(
                "Total: {} | Passed: {} | Failed: {}",
                report.total_effects, report.passed, report.failed
            );
            println!();
            for r in &report.results {
                let status = if r.overall_pass { "PASS" } else { "FAIL" };
                println!(
                    "  {} {} — {} [crash:{} output:{} anim:{} mask_in:{} mask_out:{}] {}ms",
                    status,
                    r.effect_id,
                    r.effect_name,
                    r.checks.no_crash as u8,
                    r.checks.non_empty_output as u8,
                    r.checks.animates as u8,
                    r.checks.mask_inside_correct as u8,
                    r.checks.mask_outside_correct as u8,
                    r.duration_ms,
                );
                if let Some(e) = &r.error_message {
                    println!("       error: {}", e);
                }
            }
            println!();
            println!("Summary: {}", report.summary);
        }
    }

    if report.failed > 0 {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}

fn cmd_verify_effect(args: &[String]) -> ExitCode {
    if args.is_empty() {
        eprintln!("Error: effect ID required");
        eprintln!("Usage: mosh-verify verify-effect <effect_id>");
        return ExitCode::from(2);
    }
    let effect_id = &args[0];
    let registry = EffectRegistry::new();
    let result = verification::verify_effect(effect_id, &registry);

    println!(
        "{}",
        serde_json::to_string_pretty(&result).unwrap_or_default()
    );

    if result.overall_pass {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(1)
    }
}

fn cmd_list_effects(args: &[String]) -> ExitCode {
    let mut category_filter: Option<String> = None;
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--category" {
            i += 1;
            if i < args.len() {
                category_filter = Some(args[i].clone());
            }
        }
        i += 1;
    }

    let registry = EffectRegistry::new();
    let metas = registry.list();

    let filtered: Vec<_> = if let Some(cat) = category_filter {
        metas
            .into_iter()
            .filter(|m| {
                format!("{:?}", m.category)
                    .to_lowercase()
                    .contains(&cat.to_lowercase())
            })
            .collect()
    } else {
        metas
    };

    println!("{:<40} {:<20} Name", "ID", "Category");
    println!("{:-<80}", "");
    for m in &filtered {
        println!(
            "{:<40} {:<20} {}",
            m.id,
            format!("{:?}", m.category),
            m.name
        );
    }
    println!();
    println!("Total: {} effects", filtered.len());
    ExitCode::SUCCESS
}

fn cmd_status() -> ExitCode {
    let registry = EffectRegistry::new();
    let metas = registry.list();

    // Count by category
    let mut categories: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for m in &metas {
        let cat = format!("{:?}", m.category);
        *categories.entry(cat).or_insert(0) += 1;
    }

    println!("=== MoshDither Studio Status ===");
    println!();
    println!("Effects registered: {}", metas.len());
    println!();
    println!("By category:");
    let mut cats: Vec<_> = categories.into_iter().collect();
    cats.sort();
    for (cat, count) in &cats {
        println!("  {:<25} {} effects", cat, count);
    }
    println!();
    println!("Rust version: {}", env!("CARGO_PKG_VERSION"));
    println!(
        "Build profile: {}",
        if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        }
    );

    ExitCode::SUCCESS
}

// ── render-all: render every effect on real image + video ──────────────────

/// Build params from an effect's ParameterDef list, using each parameter's own
/// declared default -- what a user actually gets on first drop.
fn build_default_params(
    effect_id: &str,
    params: &[ParameterDef],
) -> serde_json::Map<String, serde_json::Value> {
    build_params(effect_id, params, false)
}

/// Build params, optionally substituting deliberately strong values so every
/// effect is unmistakable in a sweep.
///
/// The strong values are keyed by parameter *name*, but names are not unique
/// across scales: six effects declare a `threshold`, ranging from 0.1-0.9
/// (line_screen) to 0-255 (dithering.threshold, solarize, pixel_sort). Feeding
/// the same literal 0.3 to all of them drove five to a degenerate end of their
/// range -- `dithering.threshold` rendered pure white, and `profile_smear` at
/// `strength: 1.0` (its max, vs a 0.8 default) collapsed every row onto the one
/// above it and output vertical stripes. Both looked exactly like product bugs.
///
/// So exaggeration is now opt-in via `--exaggerate`. Injected `_audio_*` values
/// are always applied: they are not user-facing parameters, and without them the
/// audio-reactive family is inert in a sweep that has no audio.
fn build_params(
    effect_id: &str,
    params: &[ParameterDef],
    exaggerate: bool,
) -> serde_json::Map<String, serde_json::Value> {
    let mut map = serde_json::Map::new();
    for p in params {
        if !exaggerate && !p.id.starts_with('_') {
            map.insert(p.id.clone(), p.default.clone());
            continue;
        }
        // Use the default value, but override zero-amount/zero-lift effects
        // and clamp audio-reactive audio params to neutral so they are animated by
        // the animate-all command rather than left silent.
        let val = match (effect_id, p.id.as_str()) {
            // Audio-reactive: inject fake audio data so effects activate
            (_, "_audio_bass") => serde_json::json!(0.8),
            (_, "_audio_beat_bass") => serde_json::json!(1.0),
            (_, "_audio_beat_energy") => serde_json::json!(0.7),
            (_, "_audio_centroid") => serde_json::json!(2000.0),
            (_, "_audio_flux") => serde_json::json!(50.0),
            // Lift/Gamma/Gain: use non-zero defaults so output is visible
            (_, "lift_r") | (_, "lift_g") | (_, "lift_b") => serde_json::json!(0.1),
            (_, "gamma_r") | (_, "gamma_g") | (_, "gamma_b") => serde_json::json!(1.2),
            (_, "gain_r") | (_, "gain_g") | (_, "gain_b") => serde_json::json!(0.3),
            // Fractal noise: default amount is strong (must come before wildcard)
            ("noise.fractal", "amount") => serde_json::json!(5.0),
            // Default amount/intensity should be strong, not subtle
            (_, "amount") => serde_json::json!(1.0),
            (_, "intensity") => serde_json::json!(1.0),
            (_, "strength") => serde_json::json!(1.0),
            // Sorting glitch: lower threshold so it activates on more images
            (_, "u_threshold") => serde_json::json!(0.3),
            // Noise: strong defaults so grain is obvious
            (_, "range") => serde_json::json!(64),
            (_, "density") => serde_json::json!(0.2),
            (_, "std_dev") => serde_json::json!(48.0),
            (_, "sigma") => serde_json::json!(16.0),
            // Glitch: large shifts so scanline corruption is obvious
            (_, "shift_amount") => serde_json::json!(64),
            (_, "scanline_interval") => serde_json::json!(4),
            (_, "u_intensity") => serde_json::json!(5.0),
            (_, "threshold") => serde_json::json!(0.3),
            // Overlays: thick, high-opacity lines so they are visible
            (_, "size") => serde_json::json!(20.0),
            (_, "line_width") => serde_json::json!(4.0),
            (_, "opacity") => serde_json::json!(0.9),
            (_, "grid_size") => serde_json::json!(32.0),
            // Brightness/contrast: non-neutral defaults
            (_, "brightness") => serde_json::json!(0.2),
            (_, "contrast") => serde_json::json!(0.3),
            (_, "saturation") => serde_json::json!(1.3),
            (_, "gamma") => serde_json::json!(1.1),
            // Use the declared default for everything else
            _ => p.default.clone(),
        };
        map.insert(p.id.clone(), val);
    }
    map
}

/// Sanitize an effect ID or preset name into a filesystem-safe filename.
///
/// This started out handling effect IDs, which are only ever `[a-z0-9._]`, so
/// replacing the separators was enough. It is also applied to preset and LUT
/// names, which are free-form human text -- `b&w-halftone` ships today -- and
/// those can carry characters Windows flatly refuses in a filename (`<>:"|?*`).
/// Letting one through means the render fails at the write rather than
/// producing a slightly odd name, so every reserved character is mapped.
fn sanitize_filename(id: &str) -> String {
    id.replace(
        ['.', '/', '\\', '&', '<', '>', ':', '"', '|', '?', '*'],
        "_",
    )
}

/// Create a circular gradient mask for testing mask-dependent effects.
fn make_test_mask(w: u32, h: u32) -> Mask {
    let mut data = vec![0u8; (w * h) as usize];
    let cx = w as f32 / 2.0;
    let cy = h as f32 / 2.0;
    let radius = w.min(h) as f32 * 0.35;
    for y in 0..h {
        for x in 0..w {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            let val = if dist < radius { 255 } else { 0 };
            data[(y * w + x) as usize] = val;
        }
    }
    Mask {
        width: w,
        height: h,
        data,
    }
}

struct RenderStats {
    total: usize,
    image_ok: usize,
    video_ok: usize,
    skipped: usize,
    errors: usize,
}

fn cmd_render_all(args: &[String]) -> ExitCode {
    let mut image_path: Option<&str> = None;
    let mut video_path: Option<&str> = None;
    let mut output_dir = "./outputs/render".to_string();
    let mut filter: Option<&str> = None;
    let mut duration_secs = 5.0f64;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--image" => {
                i += 1;
                if i < args.len() {
                    image_path = Some(&args[i]);
                }
            }
            "--video" => {
                i += 1;
                if i < args.len() {
                    video_path = Some(&args[i]);
                }
            }
            "--output" => {
                i += 1;
                if i < args.len() {
                    output_dir = args[i].clone();
                }
            }
            "--filter" => {
                i += 1;
                if i < args.len() {
                    filter = Some(&args[i]);
                }
            }
            "--duration" => {
                i += 1;
                if i < args.len() {
                    duration_secs = args[i].parse().unwrap_or(5.0);
                }
            }
            _ => {}
        }
        i += 1;
    }

    let image_path = match image_path {
        Some(p) => p,
        None => {
            eprintln!("Error: --image <path> is required");
            return ExitCode::from(2);
        }
    };

    // Create output directory structure
    let images_dir = format!("{}/images", output_dir);
    let videos_dir = format!("{}/videos", output_dir);
    let _ = std::fs::create_dir_all(&images_dir);
    let _ = std::fs::create_dir_all(&videos_dir);

    // Load test image
    eprintln!("Loading image: {}", image_path);
    let test_image = match image_io::load_image(image_path) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("Error loading image: {}", e);
            return ExitCode::from(1);
        }
    };
    eprintln!("  Image: {}x{}", test_image.width, test_image.height);

    // Load test video (if provided)
    let test_video: Option<VideoSegment> = if let Some(vp) = video_path {
        eprintln!("Loading video: {}", vp);
        let max_frames = (duration_secs * 24.0).ceil() as usize; // assume ~24fps
        match ffmpeg::decode_video(vp, Some(max_frames)) {
            Ok(seg) => {
                eprintln!(
                    "  Video: {}x{}, {} frames, {} fps",
                    seg.frames.first().map(|f| f.width).unwrap_or(0),
                    seg.frames.first().map(|f| f.height).unwrap_or(0),
                    seg.frames.len(),
                    seg.fps
                );
                Some(seg)
            }
            Err(e) => {
                eprintln!("Warning: could not load video: {}", e);
                None
            }
        }
    } else {
        eprintln!("No --video provided, skipping video effects");
        None
    };

    // Create test mask for mask-dependent effects
    let test_mask = make_test_mask(test_image.width, test_image.height);

    let registry = EffectRegistry::new();
    let metas: Vec<_> = if let Some(f) = filter {
        registry
            .list()
            .into_iter()
            .filter(|m| m.id.contains(f))
            .collect()
    } else {
        registry.list()
    };

    eprintln!("\nRendering {} effects...\n", metas.len());

    let mut stats = RenderStats {
        total: metas.len(),
        image_ok: 0,
        video_ok: 0,
        skipped: 0,
        errors: 0,
    };
    let mut report_lines: Vec<String> = Vec::new();

    for meta in &metas {
        let effect = match registry.get(&meta.id) {
            Some(e) => e,
            None => {
                eprintln!("  SKIP {} — not found in registry", meta.id);
                stats.skipped += 1;
                report_lines.push(format!("SKIP|{}|not found", meta.id));
                continue;
            }
        };

        let safe_name = sanitize_filename(&meta.id);
        let params = clamp_params(&meta.id, &build_default_params(&meta.id, &meta.parameters));

        // ── Render image output ──────────────────────────────
        let img_out_path = format!("{}/images/{}.png", output_dir, safe_name);
        let mask_ref = if effect.handles_masking() || meta.id == "mask_isolate" {
            Some(&test_mask)
        } else {
            None
        };

        match effect.process_frame(&test_image, mask_ref, &params) {
            Ok(output) => {
                if let Err(e) = image_io::save_image(&output, &img_out_path, Some("png"), None) {
                    eprintln!("  ERR  {} — save failed: {}", meta.id, e);
                    stats.errors += 1;
                    report_lines.push(format!("ERR|{}|save failed: {}", meta.id, e));
                } else {
                    eprintln!("  OK   {} → images/{}.png", meta.id, safe_name);
                    stats.image_ok += 1;
                    report_lines.push(format!("OK|{}|images/{}.png", meta.id, safe_name));
                }
            }
            Err(e) => {
                eprintln!("  ERR  {} — process_frame failed: {}", meta.id, e);
                stats.errors += 1;
                report_lines.push(format!("ERR|{}|process_frame: {}", meta.id, e));
            }
        }

        // ── Render video output (for video-capable effects) ──
        if let Some(ref video) = test_video {
            if meta.media_type == MediaType::Video || meta.media_type == MediaType::Both {
                let vid_out_path = format!("{}/videos/{}.mp4", output_dir, safe_name);
                let vid_mask = if effect.handles_masking() || meta.id == "mask_isolate" {
                    Some(make_test_mask(
                        video.frames[0].width,
                        video.frames[0].height,
                    ))
                } else {
                    None
                };

                let result = if effect.is_temporal() {
                    effect.process_video(video, vid_mask.as_ref(), &params)
                } else {
                    // Non-temporal: process each frame individually
                    let mut frames = Vec::with_capacity(video.frames.len());
                    for frame in &video.frames {
                        match effect.process_frame(frame, vid_mask.as_ref(), &params) {
                            Ok(f) => frames.push(f),
                            Err(e) => {
                                eprintln!("  ERR  {} — video frame failed: {}", meta.id, e);
                                stats.errors += 1;
                                report_lines.push(format!("ERR|{}|video frame: {}", meta.id, e));
                                break;
                            }
                        }
                    }
                    if frames.len() == video.frames.len() {
                        Ok(VideoSegment {
                            frames,
                            fps: video.fps,
                        })
                    } else {
                        continue; // error already reported
                    }
                };

                match result {
                    Ok(segment) => {
                        if segment.frames.is_empty() {
                            eprintln!("  SKIP {} — video output empty", meta.id);
                            stats.skipped += 1;
                            report_lines.push(format!("SKIP|{}|empty video", meta.id));
                        } else {
                            match ffmpeg::encode_video(
                                &segment,
                                &vid_out_path,
                                "h264",
                                None,
                                None,
                                None,
                                None,
                                None,
                                None,
                                None,
                                None,
                                None,
                                None,
                                None,
                                None,
                            ) {
                                Ok(()) => {
                                    eprintln!(
                                        "  OK   {} → videos/{}.mp4 ({} frames)",
                                        meta.id,
                                        safe_name,
                                        segment.frames.len()
                                    );
                                    stats.video_ok += 1;
                                    report_lines.push(format!(
                                        "OK|{}|videos/{}.mp4|{} frames",
                                        meta.id,
                                        safe_name,
                                        segment.frames.len()
                                    ));
                                }
                                Err(e) => {
                                    eprintln!("  ERR  {} — encode failed: {}", meta.id, e);
                                    stats.errors += 1;
                                    report_lines.push(format!("ERR|{}|encode: {}", meta.id, e));
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("  ERR  {} — process_video failed: {}", meta.id, e);
                        stats.errors += 1;
                        report_lines.push(format!("ERR|{}|process_video: {}", meta.id, e));
                    }
                }
            }
        }
    }

    // Write summary report
    let report_path = format!("{}/render-report.csv", output_dir);
    let report_content = format!("status|effect_id|output|notes\n{}", report_lines.join("\n"));
    let _ = std::fs::write(&report_path, report_content);

    eprintln!("\n=== Render Summary ===");
    eprintln!("Total effects: {}", stats.total);
    eprintln!("Image outputs: {}", stats.image_ok);
    eprintln!("Video outputs: {}", stats.video_ok);
    eprintln!("Skipped: {}", stats.skipped);
    eprintln!("Errors: {}", stats.errors);
    eprintln!("\nReport: {}", report_path);
    eprintln!("Images: {}/images/", output_dir);
    eprintln!("Videos: {}/videos/", output_dir);

    if stats.errors > 0 {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}

// ── render-presets: render built-in preset stacks on a test image ───────────

/// Preset stack entry — mirrors the frontend `StackEntry` shape.
#[derive(serde::Deserialize)]
struct PresetEntry {
    effect_id: String,
    #[serde(default)]
    params: serde_json::Map<String, serde_json::Value>,
    #[serde(default = "default_true")]
    enabled: bool,
}
fn default_true() -> bool {
    true
}

#[derive(serde::Deserialize)]
struct PresetSpec {
    name: String,
    stack: Vec<PresetEntry>,
}

fn cmd_render_presets(args: &[String]) -> ExitCode {
    let mut image_path: Option<&str> = None;
    let mut output_dir = "./outputs/presets".to_string();
    let mut presets_file: Option<&str> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--image" => {
                i += 1;
                if i < args.len() {
                    image_path = Some(&args[i]);
                }
            }
            "--output" => {
                i += 1;
                if i < args.len() {
                    output_dir = args[i].clone();
                }
            }
            "--presets" => {
                i += 1;
                if i < args.len() {
                    presets_file = Some(&args[i]);
                }
            }
            _ => {}
        }
        i += 1;
    }

    let image_path = match image_path {
        Some(p) => p,
        None => {
            eprintln!("Error: --image <path> is required");
            return ExitCode::from(2);
        }
    };
    let presets_file = match presets_file {
        Some(p) => p,
        None => {
            eprintln!("Error: --presets <path> is required (JSON file with preset specs)");
            return ExitCode::from(2);
        }
    };

    let _ = std::fs::create_dir_all(&output_dir);

    eprintln!("Loading image: {}", image_path);
    let _current = match image_io::load_image(image_path) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("Error loading image: {}", e);
            return ExitCode::from(1);
        }
    };
    eprintln!("  Image: {}x{}", _current.width, _current.height);

    eprintln!("Loading presets: {}", presets_file);
    let presets_json = match std::fs::read_to_string(presets_file) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error reading presets file: {}", e);
            return ExitCode::from(1);
        }
    };
    let presets: Vec<PresetSpec> = match serde_json::from_str(&presets_json) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Error parsing presets JSON: {}", e);
            return ExitCode::from(1);
        }
    };
    eprintln!("  {} presets\n", presets.len());

    let registry = EffectRegistry::new();
    let mut ok = 0usize;
    let mut errors = 0usize;

    for preset in &presets {
        let safe_name = sanitize_filename(&preset.name);
        // Reset to original image for each preset by reloading.
        let mut frame = match image_io::load_image(image_path) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("  ERR  {} — reload failed: {}", preset.name, e);
                errors += 1;
                continue;
            }
        };

        let mut preset_errors = 0;
        for entry in &preset.stack {
            if !entry.enabled {
                continue;
            }
            let effect = match registry.get(&entry.effect_id) {
                Some(e) => e,
                None => {
                    eprintln!(
                        "  ERR  {} — effect not found: {}",
                        preset.name, entry.effect_id
                    );
                    preset_errors += 1;
                    break;
                }
            };
            // Build params from the entry's params map, filling in defaults
            // for any missing parameters.
            let mut params = entry.params.clone();
            if let Some(meta) = registry
                .list()
                .into_iter()
                .find(|m| m.id == entry.effect_id)
            {
                for p in &meta.parameters {
                    if !params.contains_key(&p.id) {
                        params.insert(p.id.clone(), p.default.clone());
                    }
                }
            }
            let params = clamp_params(&entry.effect_id, &params);

            match effect.process_frame(&frame, None, &params) {
                Ok(out) => frame = out,
                Err(e) => {
                    eprintln!("  ERR  {} — {} failed: {}", preset.name, entry.effect_id, e);
                    preset_errors += 1;
                    break;
                }
            }
        }

        if preset_errors > 0 {
            errors += 1;
            continue;
        }

        let out_path = format!("{}/{}.png", output_dir, safe_name);
        match image_io::save_image(&frame, &out_path, Some("png"), None) {
            Ok(_) => {
                eprintln!("  OK   {} → {}.png", preset.name, safe_name);
                ok += 1;
            }
            Err(e) => {
                eprintln!("  ERR  {} — save failed: {}", preset.name, e);
                errors += 1;
            }
        }
        // Suppress unused warning on `_current` (kept for clarity of intent).
        let _ = &_current;
    }

    eprintln!("\nDone: {} ok, {} errors", ok, errors);
    if errors > 0 {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}

// ── render-luts: render every LUT in a directory via color.lut_grading ──────

fn cmd_render_luts(args: &[String]) -> ExitCode {
    let mut image_path: Option<&str> = None;
    let mut output_dir = "./outputs/luts".to_string();
    let mut lut_dir = "./public/lut".to_string();

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--image" => {
                i += 1;
                if i < args.len() {
                    image_path = Some(&args[i]);
                }
            }
            "--output" => {
                i += 1;
                if i < args.len() {
                    output_dir = args[i].clone();
                }
            }
            "--lut-dir" => {
                i += 1;
                if i < args.len() {
                    lut_dir = args[i].clone();
                }
            }
            _ => {}
        }
        i += 1;
    }

    let image_path = match image_path {
        Some(p) => p,
        None => {
            eprintln!("Error: --image <path> is required");
            return ExitCode::from(2);
        }
    };

    let _ = std::fs::create_dir_all(&output_dir);

    eprintln!("Loading image: {}", image_path);
    let test_image = match image_io::load_image(image_path) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("Error loading image: {}", e);
            return ExitCode::from(1);
        }
    };
    eprintln!("  Image: {}x{}", test_image.width, test_image.height);

    let lut_dir_path = std::path::Path::new(&lut_dir);
    let lut_files: Vec<_> = match std::fs::read_dir(lut_dir_path) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext.eq_ignore_ascii_case("png"))
                    .unwrap_or(false)
            })
            .collect(),
        Err(e) => {
            eprintln!("Error reading LUT directory {}: {}", lut_dir, e);
            return ExitCode::from(1);
        }
    };

    eprintln!("Found {} LUT files in {}\n", lut_files.len(), lut_dir);

    let registry = EffectRegistry::new();
    let lut_effect = match registry.get("color.lut_grading") {
        Some(e) => e,
        None => {
            eprintln!("Error: color.lut_grading effect not found in registry");
            return ExitCode::from(1);
        }
    };

    // Build params with the LUT path. The effect accepts `lut_path` as a
    // relative path (e.g. "lut/midnight.png") or an absolute path.
    let mut ok = 0usize;
    let mut errors = 0usize;

    for entry in &lut_files {
        let path = entry.path();
        let lut_name = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        // Pass the absolute path — the effect's path guard validates it
        // and rejects relative paths that don't start with `lut/`.
        let lut_path_str = std::fs::canonicalize(&path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string_lossy().to_string());

        let mut params = serde_json::Map::new();
        params.insert("amount".to_string(), serde_json::json!(1.0));
        params.insert("lut_path".to_string(), serde_json::json!(lut_path_str));
        let params = clamp_params("color.lut_grading", &params);

        match lut_effect.process_frame(&test_image, None, &params) {
            Ok(output) => {
                let out_path = format!("{}/{}.png", output_dir, sanitize_filename(&lut_name));
                match image_io::save_image(&output, &out_path, Some("png"), None) {
                    Ok(_) => {
                        eprintln!("  OK   {} → {}.png", lut_name, lut_name);
                        ok += 1;
                    }
                    Err(e) => {
                        eprintln!("  ERR  {} — save failed: {}", lut_name, e);
                        errors += 1;
                    }
                }
            }
            Err(e) => {
                eprintln!("  ERR  {} — process_frame failed: {}", lut_name, e);
                errors += 1;
            }
        }
    }

    eprintln!("\nDone: {} ok, {} errors", ok, errors);
    if errors > 0 {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}

// ── audio-render: render audio-reactive effects with baked audio features ──

fn cmd_audio_render(args: &[String]) -> ExitCode {
    let mut video_path: Option<&str> = None;
    let mut audio_bake_path: Option<&str> = None;
    let mut output_dir = "./outputs/audio".to_string();
    let mut filter: Option<&str> = None;
    let mut max_frames: usize = 450; // 15s @ 30fps default
    let mut scale: Option<usize> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--video" => {
                i += 1;
                if i < args.len() {
                    video_path = Some(&args[i]);
                }
            }
            "--audio-bake" => {
                i += 1;
                if i < args.len() {
                    audio_bake_path = Some(&args[i]);
                }
            }
            "--output" => {
                i += 1;
                if i < args.len() {
                    output_dir = args[i].clone();
                }
            }
            "--filter" => {
                i += 1;
                if i < args.len() {
                    filter = Some(&args[i]);
                }
            }
            "--max-frames" => {
                i += 1;
                if i < args.len() {
                    max_frames = args[i].parse().unwrap_or(450);
                }
            }
            "--scale" => {
                i += 1;
                if i < args.len() {
                    scale = args[i].parse().ok();
                }
            }
            _ => {}
        }
        i += 1;
    }

    let video_path = match video_path {
        Some(p) => p,
        None => {
            eprintln!("Error: --video <path> is required");
            return ExitCode::from(2);
        }
    };
    let audio_bake_path = match audio_bake_path {
        Some(p) => p,
        None => {
            eprintln!("Error: --audio-bake <path.json> is required");
            eprintln!("Generate one with scripts/extract_audio_features.py");
            return ExitCode::from(2);
        }
    };

    // Load AudioBakeData JSON
    eprintln!("Loading audio bake data: {}", audio_bake_path);
    let bake_json = match std::fs::read_to_string(audio_bake_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error reading audio bake file: {}", e);
            return ExitCode::from(1);
        }
    };
    let bake: moshdither_studio_lib::audio::AudioBakeData = match serde_json::from_str(&bake_json) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("Error parsing audio bake JSON: {}", e);
            return ExitCode::from(1);
        }
    };
    eprintln!(
        "  Audio bake: {} frames @ {} fps (bpm={:?})",
        bake.total_frames, bake.fps, bake.bpm
    );

    // Load video. If --scale was not specified, auto-pick a scale that
    // fits the adaptive memory budget (4K source → 1080p, etc.).
    let effective_scale = if scale.is_none() {
        match ffmpeg::plan_decode(video_path, None) {
            Ok((s, budget)) => {
                eprintln!(
                    "  Decode plan: auto scale={:?} (memory budget {:.0} MB)",
                    s,
                    budget as f64 / (1024.0 * 1024.0)
                );
                s
            }
            Err(e) => {
                eprintln!(
                    "Warning: plan_decode failed ({}), decoding at native res",
                    e
                );
                None
            }
        }
    } else {
        scale
    };

    eprintln!("Loading video: {}", video_path);
    let mut test_video =
        match ffmpeg::decode_video_with_options(video_path, Some(max_frames), effective_scale) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("Error loading video: {}", e);
                return ExitCode::from(1);
            }
        };
    eprintln!(
        "  Video: {}x{}, {} frames, {} fps",
        test_video.frames.first().map(|f| f.width).unwrap_or(0),
        test_video.frames.first().map(|f| f.height).unwrap_or(0),
        test_video.frames.len(),
        test_video.fps
    );

    // If video has more frames than audio bake, truncate
    if test_video.frames.len() > bake.frames.len() {
        eprintln!(
            "  Truncating video from {} to {} frames to match audio bake",
            test_video.frames.len(),
            bake.frames.len()
        );
        test_video.frames.truncate(bake.frames.len());
    }

    // Create output directory
    let _ = std::fs::create_dir_all(&output_dir);

    // Find audio-reactive effects
    let registry = EffectRegistry::new();
    let metas = registry.list();
    let audio_effects: Vec<_> = metas
        .iter()
        .filter(|m| m.id.starts_with("audio_reactive"))
        .filter(|m| filter.is_none_or(|f| m.id.contains(f)))
        .collect();

    if audio_effects.is_empty() {
        eprintln!("No audio-reactive effects matched filter");
        return ExitCode::from(1);
    }

    eprintln!(
        "\nRendering {} audio-reactive effects...\n",
        audio_effects.len()
    );

    let mut ok_count = 0usize;
    let mut err_count = 0usize;
    let mut report_lines: Vec<String> = Vec::new();

    for meta in &audio_effects {
        let effect = match registry.get(&meta.id) {
            Some(e) => e,
            None => {
                eprintln!("  SKIP {} — not found", meta.id);
                continue;
            }
        };

        let safe_name = sanitize_filename(&meta.id);
        let out_path = format!("{}/{}.mp4", output_dir, safe_name);

        // Build base params from defaults, then inject audio features per frame.
        let base_params = build_default_params(&meta.id, &meta.parameters);

        eprintln!(
            "  Rendering {} ({} frames)...",
            meta.id,
            test_video.frames.len()
        );
        let mut out_frames = Vec::with_capacity(test_video.frames.len());
        let mut had_error = false;

        for (idx, frame) in test_video.frames.iter().enumerate() {
            // Clone base params and inject audio features for this frame
            let mut params = base_params.clone();
            bake.inject_params(&mut params, idx);

            // Clamp to declared ranges
            let params = clamp_params(&meta.id, &params);

            match effect.process_frame(frame, None, &params) {
                Ok(f) => out_frames.push(f),
                Err(e) => {
                    eprintln!("    ERR frame {}: {}", idx, e);
                    had_error = true;
                    break;
                }
            }
        }

        if had_error {
            err_count += 1;
            report_lines.push(format!("ERR|{}|process_frame failed", meta.id));
            continue;
        }

        let segment = VideoSegment {
            frames: out_frames,
            fps: test_video.fps,
        };

        match ffmpeg::encode_video(
            &segment, &out_path, "h264", None, None, None, None, None, None, None, None, None,
            None, None, None,
        ) {
            Ok(()) => {
                eprintln!(
                    "  OK   {} → {} ({} frames)",
                    meta.id,
                    safe_name,
                    segment.frames.len()
                );
                ok_count += 1;
                report_lines.push(format!(
                    "OK|{}|{}.mp4|{} frames",
                    meta.id,
                    safe_name,
                    segment.frames.len()
                ));
            }
            Err(e) => {
                eprintln!("  ERR  {} — encode failed: {}", meta.id, e);
                err_count += 1;
                report_lines.push(format!("ERR|{}|encode: {}", meta.id, e));
            }
        }
    }

    // Write report
    let report_path = format!("{}/audio-render-report.csv", output_dir);
    let report_content = format!("status|effect_id|output|notes\n{}", report_lines.join("\n"));
    let _ = std::fs::write(&report_path, report_content);

    eprintln!("\n=== Audio Render Summary ===");
    eprintln!("Total effects: {}", audio_effects.len());
    eprintln!("OK: {}", ok_count);
    eprintln!("Errors: {}", err_count);
    eprintln!("\nReport: {}", report_path);
    eprintln!("Output: {}/", output_dir);

    if err_count > 0 {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}

// ── animate-all: animate a still image through every effect ────────────────

/// Check if two frames have any pixel differences.
fn frames_differ(a: &Frame, b: &Frame) -> bool {
    if a.data.len() != b.data.len() {
        return true;
    }
    // Sample every 64th byte for speed (full compare is too slow on 1080p)
    a.data
        .iter()
        .step_by(64)
        .zip(b.data.iter().step_by(64))
        .any(|(x, y)| x != y)
}

/// Count how many sampled pixels differ between two frames.
fn count_differing_pixels(a: &Frame, b: &Frame) -> usize {
    if a.data.len() != b.data.len() {
        return a.data.len().max(b.data.len());
    }
    let step = 4; // compare every pixel's R channel
    a.data
        .iter()
        .step_by(step)
        .zip(b.data.iter().step_by(step))
        .filter(|(x, y)| x != y)
        .count()
}

/// Animate the primary driving parameter for an effect based on normalized time.
/// `time` is 0.0 at the start and 1.0 at the end of the clip.
/// We always animate from 0 → max so the effect ramps in, regardless of the
/// default value used for static rendering.
fn animate_effect_params(
    effect_id: &str,
    base_params: &serde_json::Map<String, serde_json::Value>,
    time: f64,
) -> serde_json::Map<String, serde_json::Value> {
    let mut params = base_params.clone();
    params.insert("time".to_string(), serde_json::Value::from(time * 5.0)); // seconds-ish

    let set_if_exists =
        |params: &mut serde_json::Map<String, serde_json::Value>, key: &str, val: f64| {
            if params.contains_key(key) {
                params.insert(key.to_string(), serde_json::json!(val));
            }
        };

    match effect_id {
        // Effects driven by amount/intensity
        "glitch.edge_stretch"
        | "glitch.databend"
        | "glitch.byte_insert"
        | "glitch.byte_zero"
        | "glitch.byte_flip"
        | "glitch.png_chunk"
        | "glitch.macroblock_glitch"
        | "analog.ghosting"
        | "analog.scanlines"
        | "color.brightness_contrast"
        | "pixel_geo.block_shift"
        | "pixel_geo.slice_shift_advanced"
        | "pixel_geo.wave_distort"
        | "pixel_geo.mirror_slices"
        | "pixel_geo.kaleidoscope"
        | "audio_reactive.audio_dither" => {
            set_if_exists(&mut params, "amount", time);
            set_if_exists(&mut params, "intensity", time);
        }
        // Effects that read shift as integer: use integer steps
        "analog.chromatic_aberration" | "pixel_geo.anaglyph" => {
            set_if_exists(&mut params, "amount", time);
            if params.contains_key("shift") {
                params.insert("shift".to_string(), serde_json::json!((time * 32.0) as u64));
            }
        }
        // CRC mismatch: animate shift_amount and scanline_interval.
        // Must be integer JSON values because the effect reads them via as_u64().
        "glitch.crc_mismatch" => {
            if params.contains_key("shift_amount") {
                params.insert(
                    "shift_amount".to_string(),
                    serde_json::json!(1 + (time * 64.0) as u64),
                );
            }
            if params.contains_key("scanline_interval") {
                params.insert(
                    "scanline_interval".to_string(),
                    serde_json::json!(8 + (time * 24.0) as u64),
                );
            }
        }
        // Byte reverse: animate chunk_size
        "glitch.byte_reverse" => {
            if params.contains_key("chunk_size") {
                params.insert(
                    "chunk_size".to_string(),
                    serde_json::json!(2 + (time * 62.0) as u64),
                );
            }
        }
        // Sorting glitch: lower threshold over time so more pixels sort
        "glitch.sorting_glitch" | "pixel_geo.pixel_sort" => {
            if params.contains_key("u_threshold") {
                params.insert(
                    "u_threshold".to_string(),
                    serde_json::json!(0.5 - time * 0.45),
                );
            } else if params.contains_key("threshold") {
                params.insert(
                    "threshold".to_string(),
                    serde_json::json!(128.0 - time * 120.0),
                );
            }
        }
        // Audio-reactive: pulse audio params
        id if id.starts_with("audio_reactive") => {
            let pulse = 0.5 + 0.5 * (time * 2.0 * std::f64::consts::PI).sin();
            params.insert("_audio_bass".to_string(), serde_json::json!(pulse));
            params.insert(
                "_audio_beat_bass".to_string(),
                serde_json::json!(if pulse > 0.7 { 1.0 } else { 0.0 }),
            );
            params.insert(
                "_audio_beat_energy".to_string(),
                serde_json::json!(pulse * 0.8),
            );
            params.insert(
                "_audio_centroid".to_string(),
                serde_json::json!(1000.0 + 2000.0 * pulse),
            );
            params.insert(
                "_audio_flux".to_string(),
                serde_json::json!(30.0 + 40.0 * pulse),
            );
        }
        // Dithering: animate amount/intensity if present
        id if id.starts_with("dithering") => {
            set_if_exists(&mut params, "amount", time);
            set_if_exists(&mut params, "intensity", time);
        }
        // Datamoshing profiles and temporal: handled via process_video + synthetic drift
        _ => {}
    }

    clamp_params(effect_id, &params)
}

/// Apply a small horizontal drift to a frame so purely-deterministic effects
/// still produce visible motion when animated.
fn drift_frame(still: &Frame, frame_idx: usize, total_frames: usize) -> Frame {
    let w = still.width as usize;
    let h = still.height as usize;
    // Total drift of ~2% of the image width over the clip
    let max_drift = (w as f64 * 0.02).max(1.0) as usize;
    let t = frame_idx as f64 / total_frames.max(1) as f64;
    let shift = ((t * max_drift as f64) as usize) % w.max(1);
    if shift == 0 {
        return still.clone();
    }
    let mut data = vec![0u8; still.data.len()];
    for y in 0..h {
        for x in 0..w {
            let src_x = (x + shift) % w;
            let src_idx = (y * w + src_x) * 4;
            let dst_idx = (y * w + x) * 4;
            data[dst_idx..dst_idx + 4].copy_from_slice(&still.data[src_idx..src_idx + 4]);
        }
    }
    Frame {
        width: still.width,
        height: still.height,
        data,
    }
}

/// Create a synthetic drifting video sequence from a still image.
/// This gives temporal effects cross-frame variation to work with.
fn make_synthetic_video(still: &Frame, total_frames: usize, fps: f64) -> VideoSegment {
    let w = still.width as usize;
    let h = still.height as usize;
    let drift_pixels = (w.max(h) as f64 / 10.0).max(8.0) as usize;

    let mut frames = Vec::with_capacity(total_frames);
    for frame_idx in 0..total_frames {
        let t = frame_idx as f64 / total_frames.max(1) as f64;
        // Subtle horizontal drift: shift by t * drift_pixels
        let shift = ((t * drift_pixels as f64) as usize) % w;
        let mut data = vec![0u8; still.data.len()];
        for y in 0..h {
            for x in 0..w {
                let src_x = (x + shift) % w;
                let src_idx = (y * w + src_x) * 4;
                let dst_idx = (y * w + x) * 4;
                data[dst_idx..dst_idx + 4].copy_from_slice(&still.data[src_idx..src_idx + 4]);
            }
        }
        frames.push(Frame {
            width: still.width,
            height: still.height,
            data,
        });
    }
    VideoSegment { frames, fps }
}

/// Effects whose output is intentionally static (e.g., freeze-frame).
/// These are treated as successful verifications, not failures.
const INTENDED_STATIC_EFFECTS: &[&str] = &["datamoshing.frame_hold"];

fn cmd_animate_all(args: &[String]) -> ExitCode {
    let mut image_path: Option<&str> = None;
    let mut output_dir = "./outputs/animated".to_string();
    let mut filter: Option<&str> = None;
    let mut duration_secs = 5.0f64;
    let mut fps = 24.0f64;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--image" => {
                i += 1;
                if i < args.len() {
                    image_path = Some(&args[i]);
                }
            }
            "--output" => {
                i += 1;
                if i < args.len() {
                    output_dir = args[i].clone();
                }
            }
            "--filter" => {
                i += 1;
                if i < args.len() {
                    filter = Some(&args[i]);
                }
            }
            "--duration" => {
                i += 1;
                if i < args.len() {
                    duration_secs = args[i].parse().unwrap_or(5.0);
                }
            }
            "--fps" => {
                i += 1;
                if i < args.len() {
                    fps = args[i].parse().unwrap_or(24.0);
                }
            }
            _ => {}
        }
        i += 1;
    }

    let image_path = match image_path {
        Some(p) => p,
        None => {
            eprintln!("Error: --image <path> is required");
            return ExitCode::from(2);
        }
    };

    let _ = std::fs::create_dir_all(&output_dir);

    // Load still image
    eprintln!("Loading image: {}", image_path);
    let still = match image_io::load_image(image_path) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("Error loading image: {}", e);
            return ExitCode::from(1);
        }
    };
    eprintln!("  Image: {}x{}", still.width, still.height);

    let total_frames = (duration_secs * fps).round() as usize;
    eprintln!(
        "  Duration: {}s, FPS: {}, Total frames: {}",
        duration_secs, fps, total_frames
    );

    // Create test mask for mask-dependent effects
    let test_mask = make_test_mask(still.width, still.height);

    let registry = EffectRegistry::new();
    let metas: Vec<_> = if let Some(f) = filter {
        registry
            .list()
            .into_iter()
            .filter(|m| m.id.contains(f))
            .collect()
    } else {
        registry.list()
    };

    eprintln!("\nAnimating {} effects...\n", metas.len());

    let mut animated_count = 0;
    let mut static_count = 0;
    let mut intended_static_count = 0;
    let mut error_count = 0;
    let mut skip_count = 0;
    let mut report_lines: Vec<String> = Vec::new();

    for meta in &metas {
        let effect = match registry.get(&meta.id) {
            Some(e) => e,
            None => {
                eprintln!("  SKIP {} — not in registry", meta.id);
                skip_count += 1;
                report_lines.push(format!("SKIP|{}|not in registry", meta.id));
                continue;
            }
        };

        let safe_name = sanitize_filename(&meta.id);
        let base_params = build_default_params(&meta.id, &meta.parameters);
        let mask_ref = if effect.handles_masking() || meta.id == "mask_isolate" {
            Some(&test_mask)
        } else {
            None
        };

        // Generate frames: temporal effects get a synthetic drifting video + process_video,
        // non-temporal effects get per-frame process_frame with animated params.
        let mut frames: Vec<Frame> = Vec::with_capacity(total_frames);
        let mut process_error: Option<String> = None;

        if effect.is_temporal() {
            // Build a synthetic video sequence so temporal effects have cross-frame variation
            let synthetic = make_synthetic_video(&still, total_frames, fps);
            let vid_mask = if effect.handles_masking() || meta.id == "mask_isolate" {
                Some(make_test_mask(still.width, still.height))
            } else {
                None
            };
            // For temporal effects, use a fixed time param or animate their specific params
            let mut params = animate_effect_params(&meta.id, &base_params, 0.5);
            // For datamoshing.stop, vary the random threshold to make trigger probability change
            if meta.id == "datamoshing.stop" {
                params.insert("threshold".to_string(), serde_json::json!(50.0));
                params.insert("n_frames".to_string(), serde_json::json!(5));
            }
            let params = clamp_params(&meta.id, &params);
            match effect.process_video(&synthetic, vid_mask.as_ref(), &params) {
                Ok(seg) => frames = seg.frames,
                Err(e) => process_error = Some(format!("process_video: {}", e)),
            }
        } else {
            // First pass: generate frames with animated parameters
            for frame_idx in 0..total_frames {
                let time = frame_idx as f64 / total_frames.max(1) as f64;
                let frame_params = animate_effect_params(&meta.id, &base_params, time);

                match effect.process_frame(&still, mask_ref, &frame_params) {
                    Ok(f) => frames.push(f),
                    Err(e) => {
                        process_error = Some(format!("frame {}: {}", frame_idx, e));
                        break;
                    }
                }
            }

            // Second pass: if the effect is deterministic/static, apply a tiny
            // per-frame drift to the input so the video still shows motion.
            if process_error.is_none()
                && frames.len() == total_frames
                && !frames_differ(&frames[0], &frames[frames.len() / 2])
                && !frames_differ(&frames[0], &frames[frames.len() - 1])
            {
                eprintln!("    {} first pass static, applying input drift", meta.id);
                frames.clear();
                for frame_idx in 0..total_frames {
                    let time = frame_idx as f64 / total_frames.max(1) as f64;
                    let frame_params = animate_effect_params(&meta.id, &base_params, time);
                    let drifted = drift_frame(&still, frame_idx, total_frames);

                    match effect.process_frame(&drifted, mask_ref, &frame_params) {
                        Ok(f) => frames.push(f),
                        Err(e) => {
                            process_error = Some(format!("drift frame {}: {}", frame_idx, e));
                            break;
                        }
                    }
                }
            }
        }

        if let Some(e) = process_error {
            eprintln!("  ERR  {} — {}", meta.id, e);
            error_count += 1;
            report_lines.push(format!("ERR|{}|{}", meta.id, e));
            continue;
        }

        if frames.is_empty() {
            eprintln!("  SKIP {} — no frames generated", meta.id);
            skip_count += 1;
            report_lines.push(format!("SKIP|{}|no frames", meta.id));
            continue;
        }

        // Check if the effect actually animated (frame 0 vs frame mid differ)
        let mid = frames.len() / 2;
        let last = frames.len() - 1;
        let animates =
            frames_differ(&frames[0], &frames[mid]) || frames_differ(&frames[0], &frames[last]);
        let diff_pixels = count_differing_pixels(&frames[0], &frames[last]);

        // Encode video
        let vid_out_path = format!("{}/{}.mp4", output_dir, safe_name);
        let segment = VideoSegment { frames, fps };

        match ffmpeg::encode_video(
            &segment,
            &vid_out_path,
            "h264",
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        ) {
            Ok(()) => {
                let is_intended_static =
                    !animates && INTENDED_STATIC_EFFECTS.contains(&meta.id.as_str());
                let status = if animates {
                    "ANIMATED"
                } else if is_intended_static {
                    "INTENDED_STATIC"
                } else {
                    "STATIC"
                };
                if animates {
                    animated_count += 1;
                    eprintln!(
                        "  ANIM {} {} → {}.mp4 ({} differing pixels)",
                        meta.id, status, safe_name, diff_pixels
                    );
                } else if is_intended_static {
                    intended_static_count += 1;
                    eprintln!(
                        "  HOLD {} {} → {}.mp4 ({} differing pixels)",
                        meta.id, status, safe_name, diff_pixels
                    );
                } else {
                    static_count += 1;
                    eprintln!(
                        "  STAT {} {} → {}.mp4 ({} differing pixels)",
                        meta.id, status, safe_name, diff_pixels
                    );
                }
                report_lines.push(format!(
                    "{}|{}|{}.mp4|{} differing pixels",
                    status, meta.id, safe_name, diff_pixels
                ));
            }
            Err(e) => {
                eprintln!("  ERR  {} — encode failed: {}", meta.id, e);
                error_count += 1;
                report_lines.push(format!("ERR|{}|encode: {}", meta.id, e));
            }
        }
    }

    // Write report
    let report_path = format!("{}/animate-report.csv", output_dir);
    let report_content = format!("status|effect_id|output|notes\n{}", report_lines.join("\n"));
    let _ = std::fs::write(&report_path, report_content);

    eprintln!("\n=== Animation Summary ===");
    eprintln!("Total effects: {}", metas.len());
    eprintln!("Animated (motion detected): {}", animated_count);
    eprintln!("Intended static (by design): {}", intended_static_count);
    eprintln!("Static (no motion): {}", static_count);
    eprintln!("Skipped: {}", skip_count);
    eprintln!("Errors: {}", error_count);
    eprintln!("\nReport: {}", report_path);
    eprintln!("Videos: {}/", output_dir);

    if error_count > 0 || static_count > 0 {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}

fn cmd_test_all(args: &[String]) -> ExitCode {
    let mut format = "text";
    let mut category_filter: Option<&str> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--format" => {
                i += 1;
                if i < args.len() {
                    format = &args[i];
                }
            }
            "--category" => {
                i += 1;
                if i < args.len() {
                    category_filter = Some(&args[i]);
                }
            }
            _ => {}
        }
        i += 1;
    }

    let report = functional_tests::run_all_function_tests();

    let results: Vec<_> = if let Some(cat) = category_filter {
        report
            .results
            .iter()
            .filter(|r| r.category.contains(cat))
            .cloned()
            .collect()
    } else {
        report.results.clone()
    };

    match format {
        "json" => {
            let json_report = serde_json::json!({
                "total_tests": report.total_tests,
                "passed": report.passed,
                "failed": report.failed,
                "summary": report.summary,
                "timestamp": report.timestamp,
                "results": results,
            });
            println!(
                "{}",
                serde_json::to_string_pretty(&json_report).unwrap_or_default()
            );
        }
        _ => {
            println!("=== MoshDither Studio Functional Test Report ===");
            println!(
                "Total: {} | Passed: {} | Failed: {}",
                report.total_tests, report.passed, report.failed
            );
            println!();

            // Group by category
            let mut current_cat = String::new();
            for r in &results {
                if r.category != current_cat {
                    current_cat = r.category.clone();
                    println!("\n[{}]", current_cat);
                }
                let status = if r.passed { "PASS" } else { "FAIL" };
                println!(
                    "  {} {} — {} ({}ms)",
                    status,
                    r.test_name,
                    r.details
                        .as_deref()
                        .or(r.error_message.as_deref())
                        .unwrap_or(""),
                    r.duration_ms
                );
            }
            println!();
            println!("Summary: {}", report.summary);
        }
    }

    if report.failed > 0 {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();

    if args.is_empty() {
        print_usage();
        return ExitCode::from(2);
    }

    match args[0].as_str() {
        "verify-all" => cmd_verify_all(&args[1..]),
        "verify-effect" => cmd_verify_effect(&args[1..]),
        "list-effects" => cmd_list_effects(&args[1..]),
        "test-all" => cmd_test_all(&args[1..]),
        "render-all" => cmd_render_all(&args[1..]),
        "animate-all" => cmd_animate_all(&args[1..]),
        "audio-render" => cmd_audio_render(&args[1..]),
        "render-presets" => cmd_render_presets(&args[1..]),
        "render-luts" => cmd_render_luts(&args[1..]),
        "status" => cmd_status(),
        "--help" | "-h" | "help" => {
            print_usage();
            ExitCode::SUCCESS
        }
        _ => {
            eprintln!("Unknown command: {}", args[0]);
            eprintln!();
            print_usage();
            ExitCode::from(2)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::sanitize_filename;

    #[test]
    fn effect_ids_keep_their_shape_with_separators_flattened() {
        assert_eq!(
            sanitize_filename("color.brightness_contrast"),
            "color_brightness_contrast"
        );
        assert_eq!(sanitize_filename(r"a/b\c"), "a_b_c");
    }

    #[test]
    fn preset_names_lose_characters_windows_refuses_in_a_filename() {
        // `b&w-halftone` is a real preset in scripts/presets.json.
        assert_eq!(sanitize_filename("b&w-halftone"), "b_w-halftone");

        // Any of these would make the write fail outright on Windows.
        for reserved in ['<', '>', ':', '"', '|', '?', '*'] {
            let out = sanitize_filename(&format!("retro{reserved}vhs"));
            assert_eq!(out, "retro_vhs", "{reserved:?} must not survive");
        }
    }

    #[test]
    fn ordinary_names_are_left_alone() {
        // Spaces, hyphens and case are legal and worth preserving -- the point
        // is filesystem safety, not aggressive slugification.
        assert_eq!(sanitize_filename("Deep Bass-Pulse 2"), "Deep Bass-Pulse 2");
    }
}
