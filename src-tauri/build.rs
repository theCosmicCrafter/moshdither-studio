use std::process::Command;

/// Stamp the binary with the commit it was built from.
///
/// Without this the app cannot say what it is, and the only way to tell an
/// installed build apart from the working tree is to compare file timestamps
/// against `git log` -- an inference that went wrong twice in one session,
/// each time sending a debugging effort after a bug that had already been
/// fixed. The stamp is logged on every launch, so the question is answered by
/// reading the first line of the log rather than by guessing.
fn git_stamp() -> String {
    let sha = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty());

    let Some(sha) = sha else {
        // A source tarball or a build without git present is still a valid
        // build; it just cannot name its commit.
        return "unknown".to_string();
    };

    // Uncommitted changes matter as much as the commit: a build made from a
    // dirty tree is not the commit it claims to be.
    let dirty = Command::new("git")
        .args(["status", "--porcelain"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| !String::from_utf8_lossy(&o.stdout).trim().is_empty())
        .unwrap_or(false);

    if dirty {
        format!("{sha}-dirty")
    } else {
        sha
    }
}

fn main() {
    println!("cargo:rustc-env=MOSHDITHER_GIT_SHA={}", git_stamp());

    // Rebuild the stamp when the checked-out commit changes. In a worktree
    // `.git` is a file rather than a directory, so both layouts are covered by
    // watching whichever paths actually exist.
    for p in ["../.git/HEAD", "../.git", "../.git/index"] {
        if std::path::Path::new(p).exists() {
            println!("cargo:rerun-if-changed={p}");
        }
    }

    tauri_build::build()
}
