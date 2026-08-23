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

    match &log_path {
        Some(p) => tracing::info!("Starting app... (log: {})", p.display()),
        None => tracing::info!("Starting app... (no log file: log directory unwritable)"),
    }
    moshdither_studio_lib::run();
}
