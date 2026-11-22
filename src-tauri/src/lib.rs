use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WebviewWindow,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedTargetInfo {
    pub target_type: String, // "desktop" | "window"
    pub hwnd: u64,
    pub process_name: String,
    pub label: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteVisibilityQuery {
    pub id: String,
    pub center_x: f64,
    pub center_y: f64,
    pub target_type: String,
    pub hwnd: u64,
    pub process_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteVisibilityResult {
    pub id: String,
    pub visible: bool,
    pub resolved_hwnd: u64,
}

pub struct HitTestState {
    pub regions: Arc<Mutex<Vec<HitRect>>>,
    pub is_dragging: Arc<Mutex<bool>>,
    pub is_ignoring: Arc<Mutex<bool>>,
}

#[cfg(target_os = "windows")]
mod win32_tracker {
    use super::{NoteVisibilityQuery, NoteVisibilityResult, PinnedTargetInfo};
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    type HWND = isize;
    type BOOL = i32;
    type DWORD = u32;
    type HANDLE = isize;

    #[repr(C)]
    #[derive(Debug, Default, Clone, Copy)]
    struct RECT {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }

    const GWL_EXSTYLE: i32 = -20;
    const WS_EX_TOOLWINDOW: isize = 0x00000080;
    const WS_EX_TRANSPARENT: isize = 0x00000020;
    const WS_EX_NOACTIVATE: isize = 0x08000000;
    const DWMWA_CLOAKED: u32 = 14;
    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;

    #[link(name = "user32")]
    unsafe extern "system" {
        fn EnumWindows(lpEnumFunc: unsafe extern "system" fn(HWND, isize) -> BOOL, lParam: isize) -> BOOL;
        fn IsWindow(hWnd: HWND) -> BOOL;
        fn IsWindowVisible(hWnd: HWND) -> BOOL;
        fn IsIconic(hWnd: HWND) -> BOOL;
        fn GetWindowRect(hWnd: HWND, lpRect: *mut RECT) -> BOOL;
        fn GetWindowTextW(hWnd: HWND, lpString: *mut u16, nMaxCount: i32) -> i32;
        fn GetClassNameW(hWnd: HWND, lpClassName: *mut u16, nMaxCount: i32) -> i32;
        fn GetWindowLongPtrW(hWnd: HWND, nIndex: i32) -> isize;
        fn GetWindowThreadProcessId(hWnd: HWND, lpdwProcessId: *mut DWORD) -> DWORD;
        fn FindWindowExW(
            hWndParent: HWND,
            hWndChildAfter: HWND,
            lpszClass: *const u16,
            lpszWindow: *const u16,
        ) -> HWND;
    }

    #[link(name = "dwmapi")]
    unsafe extern "system" {
        fn DwmGetWindowAttribute(
            hwnd: HWND,
            dwAttribute: DWORD,
            pvAttribute: *mut std::ffi::c_void,
            cbAttribute: DWORD,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn OpenProcess(dwDesiredAccess: DWORD, bInheritHandle: BOOL, dwProcessId: DWORD) -> HANDLE;
        fn QueryFullProcessImageNameW(
            hProcess: HANDLE,
            dwFlags: DWORD,
            lpExeName: *mut u16,
            lpdwSize: *mut DWORD,
        ) -> BOOL;
        fn CloseHandle(hObject: HANDLE) -> BOOL;
    }

    #[derive(Debug, Clone)]
    struct WindowEntry {
        hwnd: HWND,
        rect: RECT,
        is_desktop: bool,
        process_name: String,
        title: String,
    }

    fn get_window_class(hwnd: HWND) -> String {
        let mut buf = [0u16; 256];
        let len = unsafe { GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
        if len <= 0 {
            return String::new();
        }
        OsString::from_wide(&buf[..len as usize])
            .to_string_lossy()
            .into_owned()
    }

    fn get_window_title(hwnd: HWND) -> String {
        let mut buf = [0u16; 512];
        let len = unsafe { GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
        if len <= 0 {
            return String::new();
        }
        OsString::from_wide(&buf[..len as usize])
            .to_string_lossy()
            .into_owned()
    }

    fn get_process_name(pid: u32) -> String {
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle == 0 {
                return String::new();
            }
            let mut buf = [0u16; 512];
            let mut size = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size);
            let _ = CloseHandle(handle);
            if ok == 0 || size == 0 {
                return String::new();
            }
            let full_path = OsString::from_wide(&buf[..size as usize])
                .to_string_lossy()
                .into_owned();
            full_path
                .rsplit(['\\', '/'])
                .next()
                .unwrap_or("")
                .to_lowercase()
        }
    }

    fn is_window_cloaked(hwnd: HWND) -> bool {
        let mut cloaked: u32 = 0;
        let hr = unsafe {
            DwmGetWindowAttribute(
                hwnd,
                DWMWA_CLOAKED,
                &mut cloaked as *mut u32 as *mut std::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            )
        };
        hr == 0 && cloaked != 0
    }

    fn has_shelldll_defview(hwnd: HWND) -> bool {
        // UTF-16 null-terminated "SHELLDLL_DefView"
        let class_utf16: [u16; 17] = [
            b'S' as u16,
            b'H' as u16,
            b'E' as u16,
            b'L' as u16,
            b'L' as u16,
            b'D' as u16,
            b'L' as u16,
            b'L' as u16,
            b'_' as u16,
            b'D' as u16,
            b'e' as u16,
            b'f' as u16,
            b'V' as u16,
            b'i' as u16,
            b'e' as u16,
            b'w' as u16,
            0,
        ];
        let child = unsafe { FindWindowExW(hwnd, 0, class_utf16.as_ptr(), std::ptr::null()) };
        child != 0
    }

    fn friendly_app_label(process_name: &str, title: &str) -> String {
        let proc_clean = process_name.trim_end_matches(".exe");
        match proc_clean {
            "chrome" => "Chrome".to_string(),
            "msedge" => "Edge".to_string(),
            "brave" => "Brave".to_string(),
            "firefox" => "Firefox".to_string(),
            "opera" => "Opera".to_string(),
            "vivaldi" => "Vivaldi".to_string(),
            "arc" => "Arc".to_string(),
            "code" => "VS Code".to_string(),
            "devenv" => "Visual Studio".to_string(),
            "explorer" => "Dosya Gezgini".to_string(),
            "spotify" => "Spotify".to_string(),
            "discord" => "Discord".to_string(),
            "slack" => "Slack".to_string(),
            "notion" => "Notion".to_string(),
            "obsidian" => "Obsidian".to_string(),
            "windowsterminal" => "Terminal".to_string(),
            "powershell" | "pwsh" => "PowerShell".to_string(),
            "cmd" => "Komut İstemi".to_string(),
            _ => {
                if !proc_clean.is_empty() {
                    let mut chars = proc_clean.chars();
                    match chars.next() {
                        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                        None => "Pencere".to_string(),
                    }
                } else if !title.is_empty() {
                    title.chars().take(14).collect()
                } else {
                    "Pencere".to_string()
                }
            }
        }
    }

    unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: isize) -> BOOL {
        let list = unsafe { &mut *(lparam as *mut Vec<WindowEntry>) };

        if unsafe { IsWindowVisible(hwnd) } == 0 || unsafe { IsIconic(hwnd) } != 0 {
            return 1;
        }
        if is_window_cloaked(hwnd) {
            return 1;
        }

        let mut pid: u32 = 0;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        if pid == std::process::id() {
            // Skip our own Post-it overlay window
            return 1;
        }

        let class_name = get_window_class(hwnd);
        // Skip taskbar, system tray, cursor and auxiliary shell overlays
        if matches!(
            class_name.as_str(),
            "Shell_TrayWnd"
                | "Shell_SecondaryTrayWnd"
                | "NotifyIconOverflowWindow"
                | "XamlExplorerHostIslandWindow"
                | "TopLevelWindowForOverflowXamlIsland"
                | "CursorWindow"
                | "IME"
                | "MSCTFIME UI"
        ) {
            return 1;
        }

        let mut rect = RECT::default();
        if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 {
            return 1;
        }
        if (rect.right - rect.left) < 60 || (rect.bottom - rect.top) < 60 {
            return 1;
        }

        // Check if this is the Windows Desktop shell window (Progman or WorkerW with SHELLDLL_DefView)
        if class_name == "Progman" || (class_name == "WorkerW" && has_shelldll_defview(hwnd)) {
            list.push(WindowEntry {
                hwnd,
                rect,
                is_desktop: true,
                process_name: "desktop".to_string(),
                title: "Masaüstü".to_string(),
            });
            return 1;
        }

        // Skip empty WorkerW layers that don't host the desktop
        if class_name == "WorkerW" {
            return 1;
        }

        let ex_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };
        // Skip click-through overlays, tool windows, and no-activate HUDs
        if (ex_style & WS_EX_TRANSPARENT) != 0
            || (ex_style & WS_EX_TOOLWINDOW) != 0
            || (ex_style & WS_EX_NOACTIVATE) != 0
        {
            return 1;
        }

        let title = get_window_title(hwnd);
        if title.trim().is_empty() {
            return 1;
        }

        let process_name = get_process_name(pid);
        list.push(WindowEntry {
            hwnd,
            rect,
            is_desktop: false,
            process_name,
            title,
        });

        1
    }

    fn snapshot_z_ordered_windows() -> Vec<WindowEntry> {
        let mut list = Vec::<WindowEntry>::with_capacity(32);
        unsafe {
            EnumWindows(enum_windows_proc, &mut list as *mut Vec<WindowEntry> as isize);
        }
        list
    }

    fn find_top_entry_at_point(entries: &[WindowEntry], phys_x: i32, phys_y: i32) -> Option<&WindowEntry> {
        entries.iter().find(|e| {
            e.is_desktop
                || (phys_x >= e.rect.left
                    && phys_x <= e.rect.right
                    && phys_y >= e.rect.top
                    && phys_y <= e.rect.bottom)
        })
    }

    pub fn detect_target_at_physical_point(phys_x: i32, phys_y: i32) -> PinnedTargetInfo {
        let entries = snapshot_z_ordered_windows();
        if let Some(top) = find_top_entry_at_point(&entries, phys_x, phys_y) {
            if !top.is_desktop {
                let label = friendly_app_label(&top.process_name, &top.title);
                return PinnedTargetInfo {
                    target_type: "window".to_string(),
                    hwnd: top.hwnd as u64,
                    process_name: top.process_name.clone(),
                    label,
                    title: top.title.clone(),
                };
            }
        }

        PinnedTargetInfo {
            target_type: "desktop".to_string(),
            hwnd: 0,
            process_name: "desktop".to_string(),
            label: "Masaüstü".to_string(),
            title: "Masaüstü".to_string(),
        }
    }

    pub fn evaluate_notes_visibility(
        queries: Vec<NoteVisibilityQuery>,
        win_offset_x: i32,
        win_offset_y: i32,
        scale: f64,
    ) -> Vec<NoteVisibilityResult> {
        let entries = snapshot_z_ordered_windows();
        let mut results = Vec::with_capacity(queries.len());

        for q in queries {
            let phys_x = win_offset_x + (q.center_x * scale) as i32;
            let phys_y = win_offset_y + (q.center_y * scale) as i32;

            let top_at_point = find_top_entry_at_point(&entries, phys_x, phys_y);

            if q.target_type == "desktop" {
                // Visible only when no application window covers this point on the desktop
                let is_desktop_exposed = match top_at_point {
                    Some(entry) => entry.is_desktop,
                    None => true,
                };
                results.push(NoteVisibilityResult {
                    id: q.id,
                    visible: is_desktop_exposed,
                    resolved_hwnd: 0,
                });
            } else if q.target_type == "window" {
                let target_hwnd = q.hwnd as HWND;
                let hwnd_alive = target_hwnd != 0 && unsafe { IsWindow(target_hwnd) } != 0;

                if hwnd_alive && unsafe { IsIconic(target_hwnd) } != 0 {
                    // Target window is minimized -> hide the note along with it!
                    results.push(NoteVisibilityResult {
                        id: q.id,
                        visible: false,
                        resolved_hwnd: q.hwnd,
                    });
                    continue;
                }

                // Check who is visually on top at the note's center coordinate
                let (visible, resolved_hwnd) = match top_at_point {
                    Some(top) if !top.is_desktop => {
                        if hwnd_alive && top.hwnd == target_hwnd {
                            (true, q.hwnd)
                        } else if !q.process_name.is_empty() && top.process_name == q.process_name {
                            // Same application is on top at this coordinate (e.g. re-opened or same app window)
                            (true, top.hwnd as u64)
                        } else {
                            // Covered by a different application window
                            (false, q.hwnd)
                        }
                    }
                    _ => {
                        // Only desktop is underneath this point (e.g. target window was minimized, closed, or moved away)
                        (false, q.hwnd)
                    }
                };

                results.push(NoteVisibilityResult {
                    id: q.id,
                    visible,
                    resolved_hwnd,
                });
            } else {
                results.push(NoteVisibilityResult {
                    id: q.id,
                    visible: true,
                    resolved_hwnd: q.hwnd,
                });
            }
        }

        results
    }
}

fn get_notes_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app_data_dir: {}", e))?;
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create app_data_dir: {}", e))?;
    }
    Ok(dir.join("notes.json"))
}

#[tauri::command]
fn load_notes(app: AppHandle) -> Result<String, String> {
    let path = get_notes_file_path(&app)?;
    if !path.exists() {
        return Ok("[]".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read notes.json: {}", e))
}

#[tauri::command]
fn save_notes(app: AppHandle, notes_json: String) -> Result<(), String> {
    let path = get_notes_file_path(&app)?;
    fs::write(&path, notes_json).map_err(|e| format!("Failed to write notes.json: {}", e))
}

#[tauri::command]
fn set_click_through(
    window: WebviewWindow,
    ignore: bool,
    state: State<'_, HitTestState>,
) -> Result<(), String> {
    if let Ok(mut is_ign) = state.is_ignoring.lock() {
        *is_ign = ignore;
    }
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| format!("Failed to set ignore cursor events: {}", e))
}

#[tauri::command]
fn minimize_to_tray(window: WebviewWindow) -> Result<(), String> {
    let _ = window.set_skip_taskbar(true);
    window
        .hide()
        .map_err(|e| format!("Failed to hide window to system tray: {}", e))
}

#[tauri::command]
fn update_hit_regions(
    regions: Vec<HitRect>,
    is_dragging: bool,
    state: State<'_, HitTestState>,
) -> Result<(), String> {
    if let Ok(mut reg) = state.regions.lock() {
        *reg = regions;
    }
    if let Ok(mut drag) = state.is_dragging.lock() {
        *drag = is_dragging;
    }
    Ok(())
}

#[tauri::command]
fn detect_target_at_point(
    window: WebviewWindow,
    x: f64,
    y: f64,
) -> Result<PinnedTargetInfo, String> {
    let win_pos = window
        .outer_position()
        .unwrap_or(tauri::PhysicalPosition::new(0, 0));
    let scale = window.scale_factor().unwrap_or(1.0);
    let phys_x = win_pos.x + (x * scale) as i32;
    let phys_y = win_pos.y + (y * scale) as i32;

    #[cfg(target_os = "windows")]
    {
        Ok(win32_tracker::detect_target_at_physical_point(phys_x, phys_y))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (phys_x, phys_y);
        Ok(PinnedTargetInfo {
            target_type: "desktop".to_string(),
            hwnd: 0,
            process_name: "desktop".to_string(),
            label: "Masaüstü".to_string(),
            title: "Masaüstü".to_string(),
        })
    }
}

#[tauri::command]
fn check_notes_visibility(
    window: WebviewWindow,
    queries: Vec<NoteVisibilityQuery>,
) -> Result<Vec<NoteVisibilityResult>, String> {
    let win_pos = window
        .outer_position()
        .unwrap_or(tauri::PhysicalPosition::new(0, 0));
    let scale = window.scale_factor().unwrap_or(1.0);

    #[cfg(target_os = "windows")]
    {
        Ok(win32_tracker::evaluate_notes_visibility(
            queries,
            win_pos.x,
            win_pos.y,
            scale,
        ))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (win_pos, scale);
        Ok(queries
            .into_iter()
            .map(|q| NoteVisibilityResult {
                id: q.id,
                visible: true,
                resolved_hwnd: q.hwnd,
            })
            .collect())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let regions = Arc::new(Mutex::new(Vec::<HitRect>::new()));
    let is_dragging = Arc::new(Mutex::new(false));
    let is_ignoring = Arc::new(Mutex::new(false));

    let regions_bg = Arc::clone(&regions);
    let is_dragging_bg = Arc::clone(&is_dragging);
    let is_ignoring_bg = Arc::clone(&is_ignoring);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(HitTestState {
            regions,
            is_dragging,
            is_ignoring,
        })
        .setup(move |app| {
            // Build System Tray icon & menu so minimizing hides to the background tray area (not taskbar)
            let toggle_item =
                MenuItem::with_id(app, "toggle", "Post-it Göster / Gizle", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&toggle_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("Post-it")
                .show_menu_on_left_click(false)
                .on_menu_event(|app_handle, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(win) = app_handle.get_webview_window("main") {
                            let is_vis = win.is_visible().unwrap_or(true);
                            let _ = win.set_skip_taskbar(true);
                            if is_vis {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.unminimize();
                                let _ = win.set_focus();
                            }
                        }
                    }
                    "quit" => {
                        app_handle.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app_handle = tray.app_handle();
                        if let Some(win) = app_handle.get_webview_window("main") {
                            let is_vis = win.is_visible().unwrap_or(true);
                            let _ = win.set_skip_taskbar(true);
                            if is_vis {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.unminimize();
                                let _ = win.set_focus();
                            }
                        }
                    }
                });

            if let Some(default_icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(default_icon.clone());
            }
            let _tray = tray_builder.build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_skip_taskbar(true);
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let size = monitor.size();
                    let pos = monitor.position();
                    let _ = window.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
                    let _ = window.set_size(tauri::PhysicalSize::new(size.width, size.height));
                }

                let win_clone = window.clone();
                thread::spawn(move || loop {
                    thread::sleep(Duration::from_millis(30));

                    let dragging = is_dragging_bg.lock().map(|d| *d).unwrap_or(false);
                    if dragging {
                        let currently_ignoring =
                            is_ignoring_bg.lock().map(|i| *i).unwrap_or(false);
                        if currently_ignoring {
                            let _ = win_clone.set_ignore_cursor_events(false);
                            if let Ok(mut i) = is_ignoring_bg.lock() {
                                *i = false;
                            }
                        }
                        continue;
                    }

                    let Ok(cursor_phys) = win_clone.cursor_position() else {
                        continue;
                    };
                    let win_pos = win_clone
                        .outer_position()
                        .unwrap_or(tauri::PhysicalPosition::new(0, 0));
                    let scale = win_clone.scale_factor().unwrap_or(1.0);

                    let logical_x = (cursor_phys.x - win_pos.x as f64) / scale;
                    let logical_y = (cursor_phys.y - win_pos.y as f64) / scale;

                    let hit = if let Ok(rects) = regions_bg.lock() {
                        rects.iter().any(|r| {
                            logical_x >= (r.x - 12.0)
                                && logical_x <= (r.x + r.width + 12.0)
                                && logical_y >= (r.y - 12.0)
                                && logical_y <= (r.y + r.height + 12.0)
                        })
                    } else {
                        true
                    };

                    let should_ignore = !hit;
                    let currently_ignoring = is_ignoring_bg.lock().map(|i| *i).unwrap_or(false);

                    if should_ignore != currently_ignoring {
                        if win_clone.set_ignore_cursor_events(should_ignore).is_ok() {
                            if let Ok(mut i) = is_ignoring_bg.lock() {
                                *i = should_ignore;
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_notes,
            save_notes,
            set_click_through,
            minimize_to_tray,
            update_hit_regions,
            detect_target_at_point,
            check_notes_visibility
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
