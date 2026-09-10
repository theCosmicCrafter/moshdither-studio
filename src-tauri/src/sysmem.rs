//! What the OS will actually let this process allocate right now.
//!
//! On Windows the number that matters is not free physical RAM but the
//! *commit* headroom: RAM plus pagefile, minus everything every process and
//! driver has already reserved. A machine can show 39 GB of RAM free and
//! still refuse every new allocation because the commit limit is exhausted --
//! that is exactly what happened on the primary dev box on 2026-09-10: a
//! GPU-heavy app had ~65 GB of driver-backed shared memory committed, the
//! limit was 109.7 GB, and at 109.3 GB every child process failed its own
//! way. ffgac and ffmpeg exited `-22` (EINVAL) opening their input, the
//! bundled mosh-cli died with `OpenBLAS error: Memory allocation still
//! failed after 10 retries`, PowerShell refused to start with
//! `0x800705AF: The paging file is too small`, and this app itself went
//! down with an ACCESS_VIOLATION. None of those messages say "out of
//! memory", and the export planner -- which budgets from free *physical*
//! RAM -- would have planned a multi-gigabyte decode into a machine that
//! could not hand out a megabyte.
//!
//! Everything here is read through [`allocatable_bytes`], which is the
//! smaller of the two figures, and [`low_memory_notice`], which turns a
//! near-exhausted state into the one sentence a user can act on.

/// Below this much commit headroom an export or datamosh is not going to
/// succeed -- a decoded 1080p frame is 8 MiB, the mosh-cli sidecar's numpy
/// alone reserves hundreds of MiB of BLAS buffers at import -- so refuse up
/// front with a reason rather than let a child process fail with a bare
/// exit code.
pub const LOW_MEMORY_FLOOR_BYTES: u64 = 1024 * 1024 * 1024;

/// Physical and commit headroom, in bytes. `commit_*` are `None` where the
/// OS has no commit limit worth reporting (Linux overcommits by default;
/// macOS compresses and swaps on demand).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MemoryHeadroom {
    pub available_physical: u64,
    pub total_physical: u64,
    pub commit_used: Option<u64>,
    pub commit_limit: Option<u64>,
    pub commit_available: Option<u64>,
}

impl MemoryHeadroom {
    /// The smaller of free physical RAM and free commit: the most this
    /// process can realistically allocate right now.
    pub fn allocatable(&self) -> u64 {
        match self.commit_available {
            Some(commit) => self.available_physical.min(commit),
            None => self.available_physical,
        }
    }

    /// True when the commit limit, not physical RAM, is what is binding.
    pub fn commit_bound(&self) -> bool {
        matches!(self.commit_available, Some(c) if c < self.available_physical)
    }
}

#[cfg(windows)]
pub fn memory_headroom() -> MemoryHeadroom {
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        dwMemoryLoad: 0,
        ullTotalPhys: 0,
        ullAvailPhys: 0,
        ullTotalPageFile: 0,
        ullAvailPageFile: 0,
        ullTotalVirtual: 0,
        ullAvailVirtual: 0,
        ullAvailExtendedVirtual: 0,
    };
    // SAFETY: `status` is a correctly sized, initialised MEMORYSTATUSEX and
    // the pointer is valid for the duration of the call; the API writes
    // only into that struct.
    let ok = unsafe { GlobalMemoryStatusEx(&mut status) } != 0;
    if !ok {
        return sysinfo_headroom();
    }
    // ullTotalPageFile / ullAvailPageFile are the commit limit and the
    // commit headroom despite the names -- the "page file" figures include
    // physical RAM.
    MemoryHeadroom {
        available_physical: status.ullAvailPhys,
        total_physical: status.ullTotalPhys,
        commit_used: Some(
            status
                .ullTotalPageFile
                .saturating_sub(status.ullAvailPageFile),
        ),
        commit_limit: Some(status.ullTotalPageFile),
        commit_available: Some(status.ullAvailPageFile),
    }
}

#[cfg(not(windows))]
pub fn memory_headroom() -> MemoryHeadroom {
    sysinfo_headroom()
}

fn sysinfo_headroom() -> MemoryHeadroom {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_memory();
    MemoryHeadroom {
        available_physical: sys.available_memory(),
        total_physical: sys.total_memory(),
        commit_used: None,
        commit_limit: None,
        commit_available: None,
    }
}

/// The most this process can realistically allocate right now. Zero means
/// the OS could not be asked (sandboxed test environments), which callers
/// treat as "unknown", not "none".
pub fn allocatable_bytes() -> u64 {
    memory_headroom().allocatable()
}

fn gib(bytes: u64) -> f64 {
    bytes as f64 / (1024.0 * 1024.0 * 1024.0)
}

/// The user-facing explanation for a given headroom, or `None` when there
/// is enough. Kept separate from [`low_memory_notice`] so it can be tested
/// without a real machine state.
///
/// Only the *commit* figure refuses work. It is the one that bounds an
/// allocation on Windows: with little physical RAM free the OS pages and the
/// allocation still succeeds, so gating on free RAM would refuse exports on
/// a laptop that could run them. Where the OS reports no commit limit
/// (Linux, macOS) nothing is refused; the budget planner is conservative on
/// its own. "Unknown" is a reader that failed -- a zero total -- never a
/// reading of zero: commit headroom of exactly 0 is the fully exhausted
/// state this module exists for, and it must fire, not be waved through.
pub fn notice_for(h: &MemoryHeadroom) -> Option<String> {
    if h.total_physical == 0 {
        return None;
    }
    let (used, limit, available) = match (h.commit_used, h.commit_limit, h.commit_available) {
        (Some(u), Some(l), Some(a)) => (u, l, a),
        _ => return None,
    };
    if available >= LOW_MEMORY_FLOOR_BYTES {
        return None;
    }
    let mib = available / (1024 * 1024);
    Some(format!(
        "Your computer is almost out of memory. Windows has committed {:.1} of its \
         {:.1} GB limit (RAM plus pagefile), so only {mib} MB can still be allocated \
         even though {:.1} GB of RAM shows as free. Close other applications -- GPU \
         tools such as ComfyUI, browsers with many tabs, other editors -- and try again.",
        gib(used),
        gib(limit),
        gib(h.available_physical)
    ))
}

/// A sentence for the user when the machine is too low on memory for an
/// export or a datamosh to succeed, or `None` when it is not.
pub fn low_memory_notice() -> Option<String> {
    notice_for(&memory_headroom())
}

/// Appended to a child-process failure so an `exit -22` from ffmpeg, or a
/// dead sidecar, is reported with the reason it most likely had. Empty
/// when memory is fine, so it costs nothing to add to every error path.
pub fn low_memory_suffix() -> String {
    match low_memory_notice() {
        Some(notice) => format!("\n\n{notice}"),
        None => String::new(),
    }
}

/// One line for the log, for the crash handler and for the start of an
/// export, so a post-mortem can see what the machine looked like.
pub fn describe(h: &MemoryHeadroom) -> String {
    match (h.commit_used, h.commit_limit) {
        (Some(used), Some(limit)) => format!(
            "memory: {:.1} GB RAM free of {:.1}; commit {:.1} of {:.1} GB ({:.1} GB available)",
            gib(h.available_physical),
            gib(h.total_physical),
            gib(used),
            gib(limit),
            gib(limit.saturating_sub(used))
        ),
        _ => format!(
            "memory: {:.1} GB RAM free of {:.1}",
            gib(h.available_physical),
            gib(h.total_physical)
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const GB: u64 = 1024 * 1024 * 1024;

    fn headroom(phys_free: u64, commit_free: Option<u64>) -> MemoryHeadroom {
        MemoryHeadroom {
            available_physical: phys_free,
            total_physical: 94 * GB,
            commit_used: commit_free.map(|c| 110 * GB - c),
            commit_limit: commit_free.map(|_| 110 * GB),
            commit_available: commit_free,
        }
    }

    #[test]
    fn allocatable_is_the_smaller_of_physical_and_commit() {
        // The 2026-09-10 dev-box state: 39 GB of RAM free, 400 MB of commit.
        let h = headroom(39 * GB, Some(400 * 1024 * 1024));
        assert_eq!(h.allocatable(), 400 * 1024 * 1024);
        assert!(h.commit_bound());
        // Plenty of commit, little RAM: physical wins.
        let h = headroom(2 * GB, Some(50 * GB));
        assert_eq!(h.allocatable(), 2 * GB);
        assert!(!h.commit_bound());
        // No commit figure at all (Linux): physical is all there is.
        let h = headroom(3 * GB, None);
        assert_eq!(h.allocatable(), 3 * GB);
        assert!(!h.commit_bound());
    }

    #[test]
    fn notice_fires_on_low_commit_and_names_it() {
        let h = headroom(39 * GB, Some(400 * 1024 * 1024));
        let notice = notice_for(&h).expect("400 MB of commit is below the floor");
        assert!(
            notice.contains("committed 109.6 of its 110.0 GB"),
            "{notice}"
        );
        assert!(notice.contains("only 400 MB"), "{notice}");
        assert!(notice.contains("39.0 GB of RAM"), "{notice}");
        // Fully exhausted -- the terminal state of the 2026-09-10 incident --
        // is a real reading of zero, and the one case that must not be silent.
        let notice = notice_for(&headroom(39 * GB, Some(0))).expect("0 MB of commit must fire");
        assert!(notice.contains("only 0 MB"), "{notice}");
    }

    #[test]
    fn notice_is_silent_with_headroom_without_a_commit_limit_or_when_unread() {
        assert!(notice_for(&headroom(39 * GB, Some(40 * GB))).is_none());
        assert!(notice_for(&headroom(
            LOW_MEMORY_FLOOR_BYTES,
            Some(LOW_MEMORY_FLOOR_BYTES)
        ))
        .is_none());
        // Low free RAM alone is not a refusal: the OS pages, the allocation
        // succeeds. Only commit bounds it.
        assert!(notice_for(&headroom(300 * 1024 * 1024, Some(50 * GB))).is_none());
        // No commit limit reported (Linux, macOS): nothing to refuse on.
        assert!(notice_for(&headroom(300 * 1024 * 1024, None)).is_none());
        // A reader that failed reports a zero total; that is unknown, not empty.
        let unread = MemoryHeadroom {
            available_physical: 0,
            total_physical: 0,
            commit_used: Some(0),
            commit_limit: Some(0),
            commit_available: Some(0),
        };
        assert!(notice_for(&unread).is_none());
    }

    #[test]
    fn the_real_machine_reports_something_sane() {
        let h = memory_headroom();
        assert!(h.total_physical > 0);
        assert!(h.available_physical <= h.total_physical);
        if let (Some(used), Some(limit), Some(avail)) =
            (h.commit_used, h.commit_limit, h.commit_available)
        {
            assert!(limit >= h.total_physical, "{}", describe(&h));
            assert_eq!(used + avail, limit, "{}", describe(&h));
        }
    }
}
