use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager, State, WebviewWindow};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub struct HitTestState {
    pub regions: Arc<Mutex<Vec<HitRect>>>,
    pub is_dragging: Arc<Mutex<bool>>,
    pub is_ignoring: Arc<Mutex<bool>>,
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
            if let Some(window) = app.get_webview_window("main") {
                // Ensure the transparent overlay spans the primary monitor cleanly
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let size = monitor.size();
                    let pos = monitor.position();
                    let _ = window.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
                    let _ = window.set_size(tauri::PhysicalSize::new(size.width, size.height));
                }

                // Background cursor poller so that when OS-level click-through
                // (WS_EX_TRANSPARENT) is enabled, moving the cursor back onto a Post-it,
                // the stack, or the active Trash Dock immediately re-enables mouse events.
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
                        if rects.is_empty() {
                            // Until the frontend registers regions, keep interactive
                            true
                        } else {
                            rects.iter().any(|r| {
                                logical_x >= (r.x - 12.0)
                                    && logical_x <= (r.x + r.width + 12.0)
                                    && logical_y >= (r.y - 12.0)
                                    && logical_y <= (r.y + r.height + 12.0)
                            })
                        }
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
            update_hit_regions
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
