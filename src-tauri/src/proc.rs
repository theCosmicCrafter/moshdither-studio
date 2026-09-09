//! Spawning child processes without flashing a console window at the user.
//!
//! Every external tool this app runs -- ffmpeg, ffprobe, ffgac, ffedit,
//! mosh-cli, the SAM3 bridge -- is a CONSOLE subsystem executable. On Windows,
//! starting one from a GUI app makes Windows allocate a console for it, so a
//! black command-prompt window flashes up (and for a long export, SITS there)
//! every single time. There were 27 spawn sites and not one of them suppressed
//! it: clicking "auto mask" or "export" popped a terminal in the user's face.
//!
//! `CREATE_NO_WINDOW` (0x08000000) tells Windows not to allocate that console.
//! Output still pipes normally, which is what the app actually reads.
//!
//! Use [`command`] instead of `Command::new` for anything the app spawns. The
//! one deliberate exception is code that only ever runs from a terminal
//! already, such as the CLI verifier, where there is no window to protect.

use std::process::Command;

/// Windows `CREATE_NO_WINDOW`. Defined here rather than pulled from winapi so
/// this module stays dependency-free.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Build a `Command` that will not pop a console window on Windows.
///
/// A drop-in replacement for `Command::new`; on every other platform it is
/// exactly `Command::new`.
pub fn command<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The helper must still produce a working command -- a wrong flag value
    /// makes CreateProcess fail outright, which would break every external
    /// tool at once.
    #[test]
    fn command_still_runs_and_captures_output() {
        let prog = if cfg!(windows) { "cmd" } else { "sh" };
        let args: &[&str] = if cfg!(windows) {
            &["/C", "echo moshdither"]
        } else {
            &["-c", "echo moshdither"]
        };
        let out = command(prog)
            .args(args)
            .output()
            .expect("spawns with CREATE_NO_WINDOW");
        assert!(out.status.success());
        assert!(
            String::from_utf8_lossy(&out.stdout).contains("moshdither"),
            "stdout must still be captured with the flag set"
        );
    }

    #[cfg(windows)]
    #[test]
    fn flag_is_the_documented_constant() {
        // 0x08000000. A typo here would silently stop suppressing the window
        // while everything still worked, which is the failure that is hard to
        // notice in review.
        assert_eq!(CREATE_NO_WINDOW, 134_217_728);
    }
}
