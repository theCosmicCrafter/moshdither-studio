// Window management commands — edge snapping, monitor info, and native AppBar docking.
//
// Method 1 (cross-platform): `snap_to_edge` + `get_monitor_info`
// Method 2 (Windows-only): `dock_window_appbar` + `undock_window_appbar`

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize};

/// Monitor geometry returned to the frontend for edge-proximity calculations.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

// ── Method 1: Cross-platform edge snapping ──────────────────────

/// Returns the current monitor's position and size so the frontend can
/// compute edge proximity locally (avoiding an IPC round-trip per move event).
#[tauri::command]
pub fn get_monitor_info(app: AppHandle) -> Result<MonitorInfo, String> {
    let window = app.get_webview_window("main").ok_or("Window not found")?;
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No monitor detected")?;

    let pos = monitor.position();
    let size = monitor.size();

    Ok(MonitorInfo {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        scale_factor: monitor.scale_factor(),
    })
}

/// Pure position arithmetic for [`snap_to_edge`], factored out so it can be
/// unit-tested without a live Tauri window.
///
/// Only the axis named by `edge` moves. The window's current position on the
/// OTHER axis is preserved rather than reset to the monitor's origin: a
/// window snapping left while sitting in the vertical middle of the screen
/// should end up flush left at its current height, not teleported to the
/// top-left corner. Snapping right or bottom is symmetric.
fn compute_snap_position(
    edge: &str,
    monitor_pos: PhysicalPosition<i32>,
    monitor_size: PhysicalSize<u32>,
    window_size: PhysicalSize<u32>,
    current_pos: PhysicalPosition<i32>,
) -> Result<PhysicalPosition<i32>, String> {
    Ok(match edge {
        "left" => PhysicalPosition::new(monitor_pos.x, current_pos.y),
        "right" => PhysicalPosition::new(
            monitor_pos.x + (monitor_size.width as i32 - window_size.width as i32),
            current_pos.y,
        ),
        "top" => PhysicalPosition::new(current_pos.x, monitor_pos.y),
        "bottom" => PhysicalPosition::new(
            current_pos.x,
            monitor_pos.y + (monitor_size.height as i32 - window_size.height as i32),
        ),
        _ => return Err(format!("Unknown edge: {edge}")),
    })
}

/// Snaps the Tauri window to the specified display edge on the current monitor.
/// `edge` must be one of: `"left"`, `"right"`, `"top"`, `"bottom"`.
#[tauri::command]
pub fn snap_to_edge(app: AppHandle, edge: String) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Window not found")?;
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No monitor detected")?;

    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    let window_size = window.outer_size().map_err(|e| e.to_string())?;
    let current_pos = window.outer_position().map_err(|e| e.to_string())?;

    let new_pos =
        compute_snap_position(&edge, *monitor_pos, *monitor_size, window_size, current_pos)?;

    window.set_position(new_pos).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // A monitor not anchored at the OS origin, and a window that is neither
    // flush against an edge nor centered -- so a bug that swaps an axis, or
    // that resets one to 0 instead of to monitor_pos, cannot hide behind a
    // coincidental match.
    const MONITOR_POS: PhysicalPosition<i32> = PhysicalPosition::new(1920, 100);
    const MONITOR_SIZE: PhysicalSize<u32> = PhysicalSize::new(2560, 1440);
    const WINDOW_SIZE: PhysicalSize<u32> = PhysicalSize::new(800, 500);
    const CURRENT_POS: PhysicalPosition<i32> = PhysicalPosition::new(2400, 340);

    #[test]
    fn snapping_left_moves_only_x() {
        let p = compute_snap_position("left", MONITOR_POS, MONITOR_SIZE, WINDOW_SIZE, CURRENT_POS)
            .unwrap();
        assert_eq!(p.x, MONITOR_POS.x, "should be flush against the left edge");
        assert_eq!(
            p.y, CURRENT_POS.y,
            "vertical position must be preserved, not reset to the monitor's top"
        );
    }

    #[test]
    fn snapping_right_moves_only_x() {
        let p = compute_snap_position("right", MONITOR_POS, MONITOR_SIZE, WINDOW_SIZE, CURRENT_POS)
            .unwrap();
        assert_eq!(
            p.x,
            MONITOR_POS.x + (MONITOR_SIZE.width as i32 - WINDOW_SIZE.width as i32),
            "should be flush against the right edge"
        );
        assert_eq!(
            p.y, CURRENT_POS.y,
            "vertical position must be preserved, not reset to the monitor's top"
        );
    }

    #[test]
    fn snapping_top_moves_only_y() {
        let p = compute_snap_position("top", MONITOR_POS, MONITOR_SIZE, WINDOW_SIZE, CURRENT_POS)
            .unwrap();
        assert_eq!(p.y, MONITOR_POS.y, "should be flush against the top edge");
        assert_eq!(
            p.x, CURRENT_POS.x,
            "horizontal position must be preserved, not reset to the monitor's left"
        );
    }

    #[test]
    fn snapping_bottom_moves_only_y() {
        let p = compute_snap_position(
            "bottom",
            MONITOR_POS,
            MONITOR_SIZE,
            WINDOW_SIZE,
            CURRENT_POS,
        )
        .unwrap();
        assert_eq!(
            p.y,
            MONITOR_POS.y + (MONITOR_SIZE.height as i32 - WINDOW_SIZE.height as i32),
            "should be flush against the bottom edge"
        );
        assert_eq!(
            p.x, CURRENT_POS.x,
            "horizontal position must be preserved, not reset to the monitor's left"
        );
    }

    #[test]
    fn unknown_edge_is_rejected() {
        let err = compute_snap_position(
            "diagonal",
            MONITOR_POS,
            MONITOR_SIZE,
            WINDOW_SIZE,
            CURRENT_POS,
        )
        .unwrap_err();
        assert!(err.contains("diagonal"));
    }
}

// ── Method 2: Native Windows AppBar docking ─────────────────────

/// Registers the Tauri window as a Win32 AppBar, reserving screen space on the
/// specified edge so that other maximized applications will not overlap it.
///
/// - `edge`: `"left"`, `"right"`, `"top"`, or `"bottom"`
/// - `size`: strip width (for left/right) or height (for top/bottom) in pixels
///
/// No-op on macOS / Linux.
#[tauri::command]
pub fn dock_window_appbar(app: AppHandle, edge: String, size: i32) -> Result<(), String> {
    // Each branch is a complete, terminal Result on its own platform -- not a
    // shared trailing Ok(()) after both -- because on non-Windows only the
    // `Err` branch survives cfg-stripping, and an unconditional Ok(()) after
    // an unconditional `return Err(...)` is unreachable there. That only
    // shows up building for a non-Windows target, which this session never
    // did locally (Windows-only dev machine) despite `cargo clippy -D
    // warnings` passing repeatedly -- clean on the platform it ran on says
    // nothing about a `#[cfg(not(target_os = "..."))]` branch it never
    // compiled.
    #[cfg(target_os = "windows")]
    {
        dock_appbar_win32(&app, &edge, size)?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (&app, &edge, size);
        Err("AppBar docking is only supported on Windows".into())
    }
}

/// Unregisters the AppBar, releasing the reserved screen space.
/// No-op on macOS / Linux.
#[tauri::command]
pub fn undock_window_appbar(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        undock_appbar_win32(&app)?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = &app;
        Err("AppBar docking is only supported on Windows".into())
    }
}

// ── Win32 AppBar implementation ─────────────────────────────────

#[cfg(target_os = "windows")]
fn dock_appbar_win32(app: &AppHandle, edge: &str, size: i32) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::{
        SHAppBarMessage, ABE_BOTTOM, ABE_LEFT, ABE_RIGHT, ABE_TOP, ABM_NEW, ABM_REMOVE, ABM_SETPOS,
        APPBARDATA,
    };

    let window = app.get_webview_window("main").ok_or("Window not found")?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as windows_sys::Win32::Foundation::HWND;

    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No monitor detected")?;
    let screen = monitor.size();

    let abe = match edge {
        "left" => ABE_LEFT,
        "right" => ABE_RIGHT,
        "top" => ABE_TOP,
        "bottom" => ABE_BOTTOM,
        _ => return Err(format!("Unknown edge: {edge}")),
    };

    unsafe {
        let mut abd: APPBARDATA = std::mem::zeroed();
        abd.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
        abd.hWnd = hwnd;
        abd.uCallbackMessage = 0x8001; // WM_USER + 1 — custom callback message ID

        // Remove any previous registration before re-registering
        SHAppBarMessage(ABM_REMOVE, &mut abd);

        // Register as a new AppBar
        SHAppBarMessage(ABM_NEW, &mut abd);

        // Set edge and rect
        abd.uEdge = abe;
        match edge {
            "left" => {
                abd.rc.left = 0;
                abd.rc.top = 0;
                abd.rc.right = size;
                abd.rc.bottom = screen.height as i32;
            }
            "right" => {
                abd.rc.left = screen.width as i32 - size;
                abd.rc.top = 0;
                abd.rc.right = screen.width as i32;
                abd.rc.bottom = screen.height as i32;
            }
            "top" => {
                abd.rc.left = 0;
                abd.rc.top = 0;
                abd.rc.right = screen.width as i32;
                abd.rc.bottom = size;
            }
            "bottom" => {
                abd.rc.left = 0;
                abd.rc.top = screen.height as i32 - size;
                abd.rc.right = screen.width as i32;
                abd.rc.bottom = screen.height as i32;
            }
            _ => unreachable!(),
        }

        SHAppBarMessage(ABM_SETPOS, &mut abd);

        // Move + resize the Tauri window to match the reserved rect
        window
            .set_position(PhysicalPosition::new(abd.rc.left, abd.rc.top))
            .map_err(|e| e.to_string())?;
        window
            .set_size(PhysicalSize::new(
                (abd.rc.right - abd.rc.left) as u32,
                (abd.rc.bottom - abd.rc.top) as u32,
            ))
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn undock_appbar_win32(app: &AppHandle) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::{SHAppBarMessage, ABM_REMOVE, APPBARDATA};

    let window = app.get_webview_window("main").ok_or("Window not found")?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as windows_sys::Win32::Foundation::HWND;

    unsafe {
        let mut abd: APPBARDATA = std::mem::zeroed();
        abd.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
        abd.hWnd = hwnd;

        SHAppBarMessage(ABM_REMOVE, &mut abd);
    }

    Ok(())
}
