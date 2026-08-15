#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Defaults to "info" so routine diagnostics (frame counts, decode plans,
    // etc.) stay opt-in via RUST_LOG=debug rather than always printing --
    // several of those messages include filesystem paths.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tracing::info!("Starting app...");
    moshdither_studio_lib::run();
}
