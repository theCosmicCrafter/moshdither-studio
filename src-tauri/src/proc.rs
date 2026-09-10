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

/// Windows `CREATE_NO_WINDOW`. Defined here rather than pulled from a crate;
/// the job-object code below is the one place this module touches win32.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Build a `Command` that will not pop a console window on Windows.
///
/// A drop-in replacement for `Command::new`; on every other platform it is
/// exactly `Command::new`.
pub fn command<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new(program);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(windows))]
    {
        Command::new(program)
    }
}

/// A Windows Job Object that kills every process assigned to it when the
/// job handle is closed -- i.e. when this value is dropped.
///
/// Why: mosh-cli is a PyInstaller `--onefile` bundle. The exe the app spawns
/// is a BOOTLOADER that unpacks itself and spawns the real Python as a
/// separate process, which in turn spawns ffmpeg/ffgac/ffedit. Windows has
/// no parent-death signal, so `Child::kill()` reached only the bootloader;
/// measured on the dev machine, the Python child and its ffmpeg survived a
/// cancel and kept encoding at full CPU (IsProcessInJob was false on all
/// three). Assigning the direct child to a job with
/// `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` makes every descendant inherit the
/// job, and closing the handle terminates the lot.
///
/// Every step degrades to today's single-child behaviour with a warning
/// rather than failing the operation: nested-job assignment can be refused
/// by some launchers, and a datamosh that cannot be tree-killed is still
/// better than a datamosh that cannot run.
#[cfg(windows)]
pub struct KillJob(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
impl KillJob {
    pub fn new() -> Option<Self> {
        use windows_sys::Win32::System::JobObjects::{
            CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };
        // SAFETY: plain win32 calls with a null security descriptor and an
        // anonymous job; the handle is owned by the returned value and
        // closed exactly once in Drop.
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                tracing::warn!("CreateJobObjectW failed; cancel will kill the direct child only");
                return None;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                (&info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if ok == 0 {
                tracing::warn!(
                    "SetInformationJobObject failed; cancel will kill the direct child only"
                );
                windows_sys::Win32::Foundation::CloseHandle(handle);
                return None;
            }
            Some(KillJob(handle))
        }
    }

    /// Put `child` (and, from then on, everything it spawns) in the job.
    pub fn assign(&self, child: &std::process::Child) -> bool {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::AssignProcessToJobObject;
        // SAFETY: both handles are valid for the duration of the call.
        let ok = unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle()) };
        if ok == 0 {
            tracing::warn!(
                "AssignProcessToJobObject failed; cancel will kill the direct child only"
            );
        }
        ok != 0
    }
}

#[cfg(windows)]
impl Drop for KillJob {
    fn drop(&mut self) {
        // Closing the last handle to a KILL_ON_JOB_CLOSE job terminates every
        // process in it. This is the whole mechanism.
        // SAFETY: the handle was created by CreateJobObjectW and is closed once.
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

// A job handle is not tied to the creating thread.
#[cfg(windows)]
unsafe impl Send for KillJob {}
#[cfg(windows)]
unsafe impl Sync for KillJob {}

/// No-op stand-in so call sites need no cfg. Other platforms keep the
/// single-child kill; a process-group equivalent is a separate task.
#[cfg(not(windows))]
pub struct KillJob;

#[cfg(not(windows))]
impl KillJob {
    pub fn new() -> Option<Self> {
        None
    }
    pub fn assign(&self, _child: &std::process::Child) -> bool {
        false
    }
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

#[cfg(all(test, windows))]
mod kill_job_tests {
    use super::*;
    use std::time::{Duration, Instant};

    /// Dropping the job must terminate a process assigned to it. `ping -n 30`
    /// would otherwise run for ~30 s; the wait returning within a few seconds
    /// is the proof the kill-on-close limit took.
    #[test]
    fn dropping_the_job_terminates_its_process() {
        let job = KillJob::new().expect("a job object can be created on Windows");
        let mut child = command("ping")
            .args(["-n", "30", "127.0.0.1"])
            .stdout(std::process::Stdio::null())
            .spawn()
            .expect("ping spawns");
        assert!(
            job.assign(&child),
            "the child must be assignable to the job"
        );

        let started = Instant::now();
        drop(job);
        // Reap it; if the kill did not take this blocks ~30 s and the assert fails.
        // The exit STATUS is deliberately not asserted: a process terminated by
        // job close reports exit code 0 on Windows, so "not success" would be
        // wrong. The elapsed time is the proof.
        let _status = child.wait().expect("child can be waited on");
        let elapsed = started.elapsed();
        assert!(
            elapsed < Duration::from_secs(5),
            "ping should die with the job, took {elapsed:?}"
        );
    }

    /// The API must degrade, not fail: call sites use `.filter(|j| j.assign())`
    /// and carry on single-child if either half returns nothing.
    #[test]
    fn new_and_assign_have_the_documented_shape() {
        let job = KillJob::new();
        assert!(job.is_some());
        let mut child = command("cmd")
            .args(["/C", "exit 0"])
            .spawn()
            .expect("cmd spawns");
        let _ = child.wait();
        // Assigning an already-exited process may fail; either answer is a bool,
        // never a panic.
        let _ = job.as_ref().map(|j| j.assign(&child));
    }
}
