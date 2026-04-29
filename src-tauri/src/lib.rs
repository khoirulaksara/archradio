use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use reqwest::header::{HeaderMap, HeaderValue};

#[tauri::command]
async fn fetch_metadata(url: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert("Icy-MetaData", HeaderValue::from_static("1"));

    let mut response = client.get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let metaint = response.headers()
        .get("icy-metaint")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<usize>().ok());

    if let Some(interval) = metaint {
        // Only read a limited chunk to avoid hanging
        let mut buffer = vec![0u8; interval + 512];
        let mut bytes_read = 0;
        
        // We need to read synchronously or handle the stream
        // For simplicity in this context, we take a slice
        while bytes_read < buffer.len() {
            let chunk = response.chunk().await.map_err(|e| e.to_string())?;
            if let Some(c) = chunk {
                let to_copy = std::cmp::min(c.len(), buffer.len() - bytes_read);
                buffer[bytes_read..bytes_read + to_copy].copy_from_slice(&c[..to_copy]);
                bytes_read += to_copy;
                if bytes_read >= buffer.len() { break; }
            } else { break; }
        }

        if buffer.len() > interval {
            let metadata_len = buffer[interval] as usize * 16;
            if metadata_len > 0 && buffer.len() >= interval + 1 + metadata_len {
                let metadata = &buffer[interval + 1..interval + 1 + metadata_len];
                let text = String::from_utf8_lossy(metadata);
                if let Some(start) = text.find("StreamTitle='") {
                    let rest = &text[start + 13..];
                    if let Some(end) = rest.find("';") {
                        return Ok(rest[..end].to_string());
                    }
                }
            }
        }
    }
    
    Err("No metadata found".into())
}

#[tauri::command]
fn update_tray_tooltip(app: tauri::AppHandle, title: String) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(title));
    }
}

#[tauri::command]
fn set_widget_mode(window: tauri::Window, enabled: bool) {
    // Temporarily allow resizing to change the boundaries
    let _ = window.set_resizable(true);
    let _ = window.set_min_size(None::<tauri::LogicalSize<f64>>);
    let _ = window.set_max_size(None::<tauri::LogicalSize<f64>>);

    if enabled {
        let logical_width = 300.0;
        let logical_height = 65.0; // Increased height for stacked layout
        
        let _ = window.set_size(tauri::LogicalSize::new(logical_width, logical_height));
        let _ = window.set_min_size(Some(tauri::LogicalSize::new(logical_width, logical_height)));
        let _ = window.set_max_size(Some(tauri::LogicalSize::new(logical_width, logical_height)));
        
        if let Ok(Some(monitor)) = window.current_monitor() {
            let scale_factor = monitor.scale_factor();
            let work_area = monitor.work_area();
            
            let physical_width = (logical_width * scale_factor).round() as i32;
            let physical_height = (logical_height * scale_factor).round() as i32;
            
            let x = work_area.position.x + (work_area.size.width as i32) - physical_width - 10;
            let y = work_area.position.y + (work_area.size.height as i32) - physical_height - 10;
            
            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
            let _ = window.set_skip_taskbar(true);
        }
    } else {
        let _ = window.set_size(tauri::LogicalSize::new(320.0, 500.0));
        let _ = window.set_min_size(Some(tauri::LogicalSize::new(320.0, 500.0)));
        let _ = window.set_max_size(Some(tauri::LogicalSize::new(320.0, 500.0)));
        let _ = window.center();
        let _ = window.set_skip_taskbar(false);
    }
    
    // Lock resizing again so user cannot manually drag edges
    let _ = window.set_resizable(false);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .invoke_handler(tauri::generate_handler![fetch_metadata, update_tray_tooltip, set_widget_mode])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Archangel Radio", true, None::<&str>)?;
            let play_i = MenuItem::with_id(app, "play_pause", "Play / Pause", true, None::<&str>)?;
            let next_i = MenuItem::with_id(app, "next", "Next Station", true, None::<&str>)?;
            let prev_i = MenuItem::with_id(app, "prev", "Previous Station", true, None::<&str>)?;
            
            let sep = tauri::menu::PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&show_i, &sep, &play_i, &next_i, &prev_i, &sep, &quit_i])?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Arch Radio")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        std::process::exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "play_pause" => {
                        let _ = app.emit("tray-play-pause", ());
                    }
                    "next" => {
                        let _ = app.emit("tray-next", ());
                    }
                    "prev" => {
                        let _ = app.emit("tray-prev", ());
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
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
