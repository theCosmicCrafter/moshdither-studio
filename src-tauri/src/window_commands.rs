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
    let window = app
        .get_webview_window("main")
        .ok_or("Window not found")?;
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

/// Snaps the Tauri window to the specified display edge on the current monitor.
/// `edge` must be one of: `"left"`, `"right"`, `"top"`, `"bottom"`.
#[tauri::command]
pub fn snap_to_edge(app: AppHandle, edge: String) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Window not found")?;
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No monitor detected")?;

    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    let window_size = window.outer_size().map_err(|e| e.to_string())?;

    let new_pos = match edge.as_str() {
        "left" => PhysicalPosition::new(monitor_pos.x, monitor_pos.y),
        "right" => PhysicalPosition::new(
            monitor_pos.x + (monitor_size.width as i32 - window_size.width as i32),
            monitor_pos.y,
        ),
        "top" => PhysicalPosition::new(monitor_pos.x, monitor_pos.y),
        "bottom" => PhysicalPosition::new(
            monitor_pos.x,
            monitor_pos.y + (monitor_size.height as i32 - window_size.height as i32),
        ),
        _ => return Err(format!("Unknown edge: {edge}")),
    };

    window
        .set_position(new_pos)
        .map_err(|e| e.to_string())?;
    Ok(())
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
    #[cfg(target_os = "windows")]
    {
        dock_appbar_win32(&app, &edge, size)?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (&app, &edge, size);
        return Err("AppBar docking is only supported on Windows".into());
    }

    Ok(())
}

/// Unregisters the AppBar, releasing the reserved screen space.
/// No-op on macOS / Linux.
#[tauri::command]
pub fn undock_window_appbar(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        undock_appbar_win32(&app)?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = &app;
        return Err("AppBar docking is only supported on Windows".into());
    }

    Ok(())
}

// ── Win32 AppBar implementation ─────────────────────────────────

#[cfg(target_os = "windows")]
fn dock_appbar_win32(app: &AppHandle, edge: &str, size: i32) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::{
        SHAppBarMessage, ABE_BOTTOM, ABE_LEFT, ABE_RIGHT, ABE_TOP, ABM_NEW, ABM_REMOVE,
        ABM_SETPOS, APPBARDATA,
    };

    let window = app
        .get_webview_window("main")
        .ok_or("Window not found")?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0
        as windows_sys::Win32::Foundation::HWND;

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

    let window = app
        .get_webview_window("main")
        .ok_or("Window not found")?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0
        as windows_sys::Win32::Foundation::HWND;

    unsafe {
        let mut abd: APPBARDATA = std::mem::zeroed();
        abd.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
        abd.hWnd = hwnd;

        SHAppBarMessage(ABM_REMOVE, &mut abd);
    }

    Ok(())
}
