// Arch Radio - Copyright (c) 2026 Khoirul Aksara - MIT License

mod models;
mod fetch;
mod transform;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

#[tauri::command]
async fn fetch_metadata(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;
    
    let mut response = client.get(&url)
        .header("Icy-MetaData", "1")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let metaint = response.headers()
        .get("icy-metaint")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<usize>().ok());

    if let Some(interval) = metaint {
        let mut buffer = vec![0u8; interval + 512];
        let mut bytes_read = 0;
        
        while bytes_read < buffer.len() {
            let chunk = response.chunk().await.map_err(|e| e.to_string())?;
            if let Some(c) = chunk {
                let to_copy = std::cmp::min(c.len(), buffer.len() - bytes_read);
                buffer[bytes_read..bytes_read + to_copy].copy_from_slice(&c[..to_copy]);
                bytes_read += to_copy;
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
    Err("No metadata".into())
}

#[tauri::command]
async fn proxy_get(url: String) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

#[tauri::command]
async fn resolve_url(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;
        
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    Ok(res.url().to_string())
}

#[tauri::command]
fn update_tray_tooltip(app: tauri::AppHandle, title: String) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(title));
    }
}

use std::sync::Mutex;

struct AppState {
    last_normal_pos: Mutex<Option<tauri::PhysicalPosition<i32>>>,
}

#[tauri::command]
fn set_widget_mode(window: tauri::Window, state: tauri::State<AppState>, enabled: bool) {
    let _ = window.set_resizable(true);
    if enabled {
        // Save current position before shrinking
        if let Ok(pos) = window.outer_position() {
            let mut last_pos = state.last_normal_pos.lock().unwrap();
            *last_pos = Some(pos);
        }

        let _ = window.set_size(tauri::LogicalSize::new(300.0, 66.0));
        let _ = window.set_skip_taskbar(true);
        let _ = window.set_always_on_top(true);
        let _ = window.set_decorations(false); // No OS controls

        // Position at bottom right for widget
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let screen_size = monitor.size();
            let scale_factor = monitor.scale_factor();
            let window_size = tauri::LogicalSize::new(300.0, 66.0).to_physical::<u32>(scale_factor);
            
            let x = screen_size.width - window_size.width - 20;
            let y = screen_size.height - window_size.height - 57; 
            
            let _ = window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
        }
    } else {
        // Restore size first
        let _ = window.set_size(tauri::LogicalSize::new(320.0, 560.0));
        
        // Restore position if we have it
        let last_pos = state.last_normal_pos.lock().unwrap();
        if let Some(pos) = *last_pos {
            let _ = window.set_position(pos);
        } else {
            let _ = window.center();
        }

        let _ = window.set_skip_taskbar(false);
        let _ = window.set_always_on_top(false);
        let _ = window.set_decorations(false);
    }
    let _ = window.set_resizable(false);
}

#[tauri::command]
async fn get_indonesia_stations(params: String) -> Result<Vec<models::Station>, String> {
    // Fetch directly from custom API with params
    match fetch::fetch_stations(&params).await {
        Ok(stations) => {
            let prepared = transform::prepare_stations(stations);
            Ok(prepared)
        }
        Err(e) => Err(e)
    }
}

#[tauri::command]
async fn get_cities() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let res = client.get("https://api-radio.kalingga.workers.dev/?group=city")
        .send().await.map_err(|e| e.to_string())?;
    let json = res.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
async fn detect_ip_location() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let res = client.get("http://ip-api.com/json/")
        .send().await.map_err(|e| e.to_string())?;
    let json = res.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[cfg(target_os = "windows")]
fn set_aumid() {
    use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
    use windows::core::PCWSTR;
    let aumid: Vec<u16> = "com.radio.arch".encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(PCWSTR(aumid.as_ptr()));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    set_aumid();

    tauri::Builder::default()
        .manage(AppState { last_normal_pos: Mutex::new(None) })
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(tauri_plugin_geolocation::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            fetch_metadata, 
            update_tray_tooltip, 
            set_widget_mode, 
            proxy_get,
            resolve_url,
            get_indonesia_stations,
            get_cities,
            detect_ip_location
        ])
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Radio", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => std::process::exit(0),
                    "show" => if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.set_focus(); }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
