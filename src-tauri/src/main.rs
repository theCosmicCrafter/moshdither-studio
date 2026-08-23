#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Release builds detach the console (windows_subsystem = "windows"), so
    // stdout alone means an installed build that crashes leaves no evidence at
    // all. Logging also goes to a file, and panics and hard faults are recorded
    // there before the process dies.
    //
    // Defaults to "info" so routine diagnostics (frame counts, decode plans,
    // etc.) stay opt-in via RUST_LOG=debug rather than always printing --
    // several of those messages include filesystem paths.
    let log_path = moshdither_studio_lib::crash::init_logging();
    moshdither_studio_lib::crash::install_panic_hook();
    moshdither_studio_lib::crash::install_exception_handler();

    // Identify the build FIRST, before anything else can fail. Knowing which
    // commit produced a binary is the difference between debugging the code in
    // front of you and debugging a build that was already superseded.
    let build = format!(
        "v{} ({})",
        env!("CARGO_PKG_VERSION"),
        env!("MOSHDITHER_GIT_SHA")
    );
    match &log_path {
        Some(p) => tracing::info!("Starting app {} (log: {})", build, p.display()),
        None => tracing::info!("Starting app {} (no log file: directory unwritable)", build),
    }
    moshdither_studio_lib::run();
}
