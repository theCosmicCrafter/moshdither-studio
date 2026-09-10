//! Crash and diagnostic reporting.
//!
//! Release builds are compiled with `windows_subsystem = "windows"`, which
//! detaches the console: every `tracing` line the app emits goes nowhere unless
//! it was launched from a shell with stdout redirected. That is why an installed
//! build that dies leaves no evidence behind, and why diagnosing a crash
//! previously meant re-running it by hand from a terminal.
//!
//! This module gives the app three things it did not have:
//!
//! 1. a log FILE, written on every run regardless of how the app was launched;
//! 2. a panic hook, so a Rust panic records its message, location and backtrace
//!    instead of vanishing with the process;
//! 3. on Windows, a last-chance exception filter, so a hard fault -- an access
//!    violation, a stack overflow -- records its exception code and faulting
//!    address before the process dies. Those never reach the panic hook,
//!    because they are not panics.

use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

/// Path of the log file for this run, so the exception filter can append to it
/// without going through `tracing` (which may itself be unusable by then).
static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

/// The same handle the tracing subscriber writes through.
///
/// `append_raw` used to open its OWN handle in append mode. Two handles means
/// two file positions: the append extended the file, then the subscriber's next
/// ordinary line was written at its stale offset, straight over the top of the
/// panic block that had just been recorded. Sharing one handle keeps the file a
/// single ordered stream.
static LOG_FILE: OnceLock<Arc<Mutex<File>>> = OnceLock::new();

/// Directory holding this app's logs: `~/.moshdither/logs`, matching the
/// `~/.moshdither/models` convention the SAM3 checkpoint already uses.
pub fn log_dir() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)?;
    Some(home.join(".moshdither").join("logs"))
}

/// Open this run's log file. One file per run, named by start time and pid so
/// concurrent runs cannot interleave into the same file and a crash can be
/// matched to the process that produced it.
fn open_log_file() -> Option<(File, PathBuf)> {
    let dir = log_dir()?;
    std::fs::create_dir_all(&dir).ok()?;

    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path = dir.join(format!("moshdither-{}-{}.log", secs, std::process::id()));
    let file = File::create(&path).ok()?;
    prune_old_logs(&dir);
    Some((file, path))
}

/// How many runs' logs to keep. The byte cost of more is trivial; the cost that
/// matters is that "send me the log" stops being answerable once the directory
/// holds hundreds of files named by epoch seconds, none of which says which run
/// was the one that failed.
const KEEP_LOGS: usize = 20;

/// Delete all but the newest `KEEP_LOGS` log files.
///
/// Best-effort throughout: a log directory that cannot be tidied is not a reason
/// to fail startup, and every error here is deliberately swallowed.
fn prune_old_logs(dir: &std::path::Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut logs: Vec<(std::time::SystemTime, PathBuf)> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            let name = path.file_name()?.to_str()?;
            if !name.starts_with("moshdither-") || !name.ends_with(".log") {
                return None;
            }
            let modified = e.metadata().ok()?.modified().ok()?;
            Some((modified, path))
        })
        .collect();

    if logs.len() <= KEEP_LOGS {
        return;
    }
    logs.sort_by_key(|entry| std::cmp::Reverse(entry.0)); // newest first
    for (_, stale) in logs.into_iter().skip(KEEP_LOGS) {
        let _ = std::fs::remove_file(stale);
    }
}

/// Absolute path of this run's log file, for surfacing in the UI.
///
/// A crash log only has value if a human can find it, and nothing in the app
/// said where it was -- least of all the error screen shown after a UI crash,
/// which is exactly when someone needs it.
#[tauri::command]
pub fn get_log_path() -> Option<String> {
    LOG_PATH.get().map(|p| p.display().to_string())
}

/// A `MakeWriter` over a shared log file handle.
struct LogFile(Arc<Mutex<File>>);

struct LogFileHandle(Arc<Mutex<File>>);

impl Write for LogFileHandle {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        match self.0.lock() {
            Ok(mut f) => f.write(buf),
            // A poisoned lock means another thread panicked mid-write. Dropping
            // the line is better than panicking again from inside the logger.
            Err(_) => Ok(buf.len()),
        }
    }
    fn flush(&mut self) -> std::io::Result<()> {
        match self.0.lock() {
            Ok(mut f) => f.flush(),
            Err(_) => Ok(()),
        }
    }
}

impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for LogFile {
    type Writer = LogFileHandle;
    fn make_writer(&'a self) -> Self::Writer {
        LogFileHandle(self.0.clone())
    }
}

/// Initialise logging to stdout AND a file, and return the log path if one was
/// opened. Falls back to stdout alone if the log directory is unwritable --
/// losing the file is not a reason to refuse to start.
pub fn init_logging() -> Option<PathBuf> {
    use tracing_subscriber::fmt::writer::MakeWriterExt;

    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    match open_log_file() {
        Some((file, path)) => {
            let handle = Arc::new(Mutex::new(file));
            let _ = LOG_FILE.set(handle.clone());
            let shared = LogFile(handle);
            tracing_subscriber::fmt()
                .with_env_filter(filter)
                .with_ansi(false)
                .with_writer(std::io::stdout.and(shared))
                .init();
            let _ = LOG_PATH.set(path.clone());
            Some(path)
        }
        None => {
            tracing_subscriber::fmt().with_env_filter(filter).init();
            None
        }
    }
}

/// Record panics with location and backtrace before the process unwinds away.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<unknown location>".to_string());
        let backtrace = std::backtrace::Backtrace::force_capture();
        tracing::error!("PANIC at {location}: {info}\nbacktrace:\n{backtrace}");
        append_raw(&format!(
            "\n=== PANIC ===\nat {location}\n{info}\nbacktrace:\n{backtrace}\n"
        ));
        previous(info);
    }));
}

/// Append straight to the log file, bypassing `tracing`.
///
/// Used from the panic hook and the exception filter: by the time either runs
/// the process may be in a state where the subscriber's machinery is no longer
/// trustworthy, and a diagnostic that cannot be written is worthless.
fn append_raw(msg: &str) {
    // Write through the subscriber's own handle so the file stays one ordered
    // stream. `try_lock`, never `lock`: this runs from the panic hook and from
    // the fault filter, where the thread that holds the mutex may be the very
    // one that died. Blocking there would hang the process instead of recording
    // why it is dying.
    if let Some(shared) = LOG_FILE.get() {
        if let Ok(mut f) = shared.try_lock() {
            let _ = f.write_all(msg.as_bytes());
            let _ = f.flush();
            return;
        }
    }
    // Contended or not yet initialised: a second handle risks interleaving, but
    // a diagnostic that is written imperfectly beats one that is not written.
    if let Some(path) = LOG_PATH.get() {
        if let Ok(mut f) = std::fs::OpenOptions::new().append(true).open(path) {
            let _ = f.write_all(msg.as_bytes());
            let _ = f.flush();
        }
    }
}

/// Install a last-chance handler for hard faults (access violations, stack
/// overflows). These never reach the panic hook -- they are CPU exceptions, not
/// Rust panics -- so without this they leave nothing behind but a Windows Event
/// Log entry naming an address with no context.
#[cfg(windows)]
pub fn install_exception_handler() {
    use windows_sys::Win32::System::Diagnostics::Debug::{
        SetUnhandledExceptionFilter, EXCEPTION_POINTERS,
    };

    unsafe extern "system" fn on_fault(info: *const EXCEPTION_POINTERS) -> i32 {
        // Deliberately minimal: the process is already broken, so this reads a
        // couple of fields and writes a line. No allocation-heavy formatting,
        // no locks that another thread might hold.
        let (code, address, access) = unsafe {
            if info.is_null() || (*info).ExceptionRecord.is_null() {
                (0u32, 0usize, None)
            } else {
                let rec = &*(*info).ExceptionRecord;
                // For an access violation the record also says what the
                // faulting instruction was doing and to which address: a read
                // of 0x0 is a null dereference, a write far from anything is a
                // buffer overrun. The instruction address alone says neither.
                let access = if rec.ExceptionCode as u32 == 0xC0000005 && rec.NumberParameters >= 2
                {
                    Some((rec.ExceptionInformation[0], rec.ExceptionInformation[1]))
                } else {
                    None
                };
                (
                    rec.ExceptionCode as u32,
                    rec.ExceptionAddress as usize,
                    access,
                )
            }
        };
        let name = match code {
            0xC0000005 => "ACCESS_VIOLATION",
            0xC00000FD => "STACK_OVERFLOW",
            0xC000001D => "ILLEGAL_INSTRUCTION",
            0xC0000094 => "INTEGER_DIVIDE_BY_ZERO",
            0xC000041D => "FATAL_USER_CALLBACK_EXCEPTION",
            _ => "UNKNOWN",
        };
        // The 2026-09-10 crash logged "at address 0x00007FF7A04902D7" and
        // nothing else; under ASLR that number means nothing once the
        // process is gone. Module name plus offset from its base is what a
        // PDB can resolve.
        let location = match module_of(address) {
            Some((base, file)) => format!(
                "{file}+0x{:X} (base 0x{base:016X})",
                address.wrapping_sub(base)
            ),
            None => "an unmapped address".to_string(),
        };
        let access_line = match access {
            Some((kind, at)) => {
                let verb = match kind {
                    0 => "reading",
                    1 => "writing",
                    8 => "executing (DEP)",
                    _ => "accessing",
                };
                format!("{verb} address 0x{at:016X}\n")
            }
            None => String::new(),
        };
        // The same crash happened on a machine whose commit limit was
        // exhausted; the state at the moment of death is the first thing a
        // post-mortem wants.
        let memory = crate::sysmem::describe(&crate::sysmem::memory_headroom());
        append_raw(&format!(
            "\n=== FATAL EXCEPTION ===\ncode 0x{code:08X} ({name})\nat address 0x{address:016X}\n\
             in {location}\n{access_line}{memory}\n\
             The process is about to die. This is a hard fault, not a Rust panic,\n\
             so no backtrace is available here -- resolve the module offset\n\
             against that build's PDB to locate it.\n"
        ));
        // Let Windows Error Reporting still see it, so a configured crash dump
        // is written and the Event Log entry is unchanged.
        0 // EXCEPTION_CONTINUE_SEARCH
    }

    unsafe {
        SetUnhandledExceptionFilter(Some(on_fault));
    }
}

/// The module an address belongs to: its load base and file name.
#[cfg(windows)]
fn module_of(address: usize) -> Option<(usize, String)> {
    use windows_sys::Win32::Foundation::HMODULE;
    use windows_sys::Win32::System::LibraryLoader::{
        GetModuleFileNameW, GetModuleHandleExW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
        GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
    };
    let mut module: HMODULE = std::ptr::null_mut();
    // SAFETY: FROM_ADDRESS makes the API treat the pointer as an address to
    // look up, never as a string to read; UNCHANGED_REFCOUNT means there is
    // nothing to release afterwards.
    let found = unsafe {
        GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            address as *const u16,
            &mut module,
        )
    } != 0;
    if !found || module.is_null() {
        return None;
    }
    let mut name = [0u16; 512];
    // SAFETY: the buffer is valid for the length passed; the API truncates.
    let len = unsafe { GetModuleFileNameW(module, name.as_mut_ptr(), name.len() as u32) } as usize;
    let path = String::from_utf16_lossy(&name[..len.min(name.len())]);
    let file = path.rsplit(['\\', '/']).next().unwrap_or(&path).to_string();
    Some((module as usize, file))
}

#[cfg(not(windows))]
pub fn install_exception_handler() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_dir_sits_under_the_moshdither_home() {
        // Only meaningful when a home directory is discoverable; CI sandboxes
        // that strip both variables have nothing to assert.
        if let Some(dir) = log_dir() {
            assert!(dir.ends_with("logs"));
            assert!(dir.to_string_lossy().contains(".moshdither"));
        }
    }

    #[test]
    fn append_raw_is_silent_when_no_log_file_was_opened() {
        // LOG_PATH is unset in tests, so this must be a no-op rather than a
        // panic -- the panic hook calls it, and a logger that panics while
        // reporting a panic loses the original failure.
        append_raw("this must not panic");
    }
}
