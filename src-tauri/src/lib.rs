// Arch Radio - Copyright (c) 2026 Khoirul Aksara - MIT License

mod models;
mod fetch;
mod transform;
pub mod smtc;


use tauri::{
    menu::{Menu, IconMenuItem, IconMenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager,
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
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
        
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;

    // --- LOGIKA ROBUST UNTUK STREAM ---
    let final_url = res.url().to_string();

    // 2. Deteksi Universal Shoutcast/Icecast (Bukan cuma klikhost)
    // Tanda-tandanya: Punya Port, Path kosong atau hanya '/', atau punya header ICY
    let has_port = res.url().port().is_some();
    let is_root = res.url().path() == "/" || res.url().path() == "";
    let is_shoutcast = res.headers().contains_key("icy-metaint") || 
                       res.headers().get("server").map(|v| v.to_str().unwrap_or("").to_lowercase().contains("shoutcast")).unwrap_or(false);

    // Cek apakah ini file playlist
    let is_pls = final_url.to_lowercase().ends_with(".pls") || 
                 res.headers().get("content-type").map(|v| v.to_str().unwrap_or("").contains("scpls")).unwrap_or(false);
    let is_m3u = final_url.to_lowercase().ends_with(".m3u") || 
                 res.headers().get("content-type").map(|v| v.to_str().unwrap_or("").contains("mpegurl")).unwrap_or(false);
    
    if is_pls {
        let text = res.text().await.unwrap_or_default();
        for line in text.lines() {
            if line.to_lowercase().starts_with("file1=") {
                return Ok(line[6..].trim().to_string());
            }
        }
    } else if is_m3u {
        let text = res.text().await.unwrap_or_default();
        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("http") {
                return Ok(trimmed.to_string());
            }
        }
    }

    let mut resolved = final_url;
    if (is_shoutcast || (has_port && is_root)) && !resolved.contains(';') && !resolved.contains(".m3u8") {
        resolved = if resolved.ends_with('/') { format!("{};", resolved) } else { format!("{}/;", resolved) };
    }

    Ok(resolved)
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
    is_aot_enabled: Mutex<bool>,
    tray_menu: Mutex<Option<Menu<tauri::Wry>>>,
}


#[tauri::command]
async fn set_widget_mode(window: tauri::WebviewWindow, state: tauri::State<'_, AppState>, enabled: bool) -> Result<(), String> {


    if enabled {
        // Simpan posisi lama
        if let Ok(pos) = window.outer_position() {
            let mut last_pos = state.last_normal_pos.lock().unwrap();
            *last_pos = Some(pos);
        }

        let _ = window.set_always_on_top(true); // Widget WAJIB AOT
        let _ = window.set_decorations(false);
        let _ = window.set_size(tauri::LogicalSize::new(300.0, 66.0));
        let _ = window.set_skip_taskbar(true);
        let _ = window.set_resizable(false);
        
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
        let _ = window.set_size(tauri::LogicalSize::new(320.0, 560.0));
        let _ = window.set_decorations(false);
        let _ = window.set_skip_taskbar(false);
        let _ = window.set_resizable(false);

        // KUNCINYA DI SINI: Kembalikan AOT sesuai keinginan user sebelumnya
        let user_aot_pref = *state.is_aot_enabled.lock().unwrap();
        let _ = window.set_always_on_top(user_aot_pref); 




        
        // Restore position if we have it
        let last_pos = state.last_normal_pos.lock().unwrap();
        if let Some(pos) = *last_pos {
            let _ = window.set_position(pos);
        } else {
            let _ = window.center();
        }
    }
    Ok(())
}



#[tauri::command]
async fn set_always_on_top(
    window: tauri::WebviewWindow, 
    state: tauri::State<'_, AppState>, 
    enabled: bool
) -> Result<(), String> {
    // Simpan preferensi user
    let mut aot = state.is_aot_enabled.lock().unwrap();
    *aot = enabled;
    
    let _ = window.set_always_on_top(enabled);
    Ok(())
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

#[tauri::command]
async fn is_portable() -> Result<bool, String> {
    if let Ok(path) = std::env::current_exe() {
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            return Ok(name.to_lowercase().contains("portable"));
        }
    }
    Ok(false)
}

#[tauri::command]
async fn download_portable(url: String, filename: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let mut exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    exe_path.set_file_name(filename);

    std::fs::write(&exe_path, bytes).map_err(|e| e.to_string())?;

    Ok(exe_path.to_string_lossy().to_string())
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

#[tauri::command]
fn update_tray_playback(app: tauri::AppHandle, state: tauri::State<'_, AppState>, playing: bool) {
    let menu_lock = state.tray_menu.lock().unwrap();
    if let Some(menu) = menu_lock.as_ref() {
        // Cari menu item berdasarkan ID "play_pause"
        if let Some(item_kind) = menu.get("play_pause") {
            if let Some(item) = item_kind.as_icon_menuitem() {
                let text = if playing { "Pause Radio" } else { "Play Radio" };
                let icon_name = if playing { "pause.png" } else { "play.png" };
                
                let path = app.path().resource_dir().unwrap_or_default().join("icons").join(icon_name);
                let icon = if let Ok(img) = tauri::image::Image::from_path(path) {
                    Some(img)
                } else {
                    let fallback = app.path().resource_dir().unwrap_or_default().join("icons/32x32.png");
                    tauri::image::Image::from_path(fallback).ok()
                };
                
                let _ = item.set_icon(icon);
                let _ = item.set_text(text);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    set_aumid();
    
    tauri::Builder::default()
        .manage(AppState { 
            last_normal_pos: Mutex::new(None),
            is_aot_enabled: Mutex::new(false),
            tray_menu: Mutex::new(None),
        })

        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(tauri_plugin_geolocation::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            fetch_metadata, 
            update_tray_tooltip, 
            set_widget_mode, 
            set_always_on_top,
            proxy_get,
            update_tray_playback,

            resolve_url,
            get_indonesia_stations,
            get_cities,
            detect_ip_location,
            is_portable,
            download_portable,
            smtc::update_smtc_metadata,
            smtc::update_smtc_status


        ])
        .setup(|app| {
            // Fungsi pembantu untuk memuat ikon dari folder icons
            let load_icon = |app: &tauri::App, name: &str| -> Option<tauri::image::Image> {
                let path = app.path().resource_dir().ok()?.join("icons").join(name);
                if let Ok(img) = tauri::image::Image::from_path(path) {
                    Some(img)
                } else {
                    // Jika tidak ketemu (misal play.png belum ada), gunakan ikon logo sebagai cadangan
                    let fallback_path = app.path().resource_dir().ok()?.join("icons/32x32.png");
                    tauri::image::Image::from_path(fallback_path).ok()
                }
            };

            // Fungsi pembantu untuk membuat IconMenuItem dengan aman
            let build_item = |app: &tauri::App, id: &str, text: &str, icon: Option<tauri::image::Image>| -> tauri::Result<IconMenuItem<tauri::Wry>> {
                let mut builder = IconMenuItemBuilder::with_id(id, text);
                if let Some(img) = icon {
                    builder = builder.icon(img);
                }
                builder.build(app)
            };

            // Memuat ikon masing-masing
            let quit_i = build_item(app, "quit", "Quit", load_icon(app, "quit.png"))?;
            let show_i = build_item(app, "show", "Show Radio", load_icon(app, "show.png"))?;
            let play_i = build_item(app, "play_pause", "Play / Pause", load_icon(app, "play.png"))?;
            let next_i = build_item(app, "next", "Next Station", load_icon(app, "next.png"))?;
            let prev_i = build_item(app, "prev", "Previous Station", load_icon(app, "prev.png"))?;
            let compact_i = build_item(app, "toggle_compact", "Compact Mode", load_icon(app, "compact.png"))?;
            
            // Item Header (Arch Radio) - Tetap enabled agar warna muncul, tapi tidak diberi fungsi
            let header_i = IconMenuItemBuilder::with_id("header", "Arch Radio")
                .icon(load_icon(app, "32x32.png").unwrap())
                .enabled(true) 
                .build(app)?;

            let menu = Menu::with_items(app, &[
                &header_i,
                &tauri::menu::PredefinedMenuItem::separator(app)?,
                &play_i, 
                &prev_i, 
                &next_i, 
                &tauri::menu::PredefinedMenuItem::separator(app)?,
                &compact_i,
                &show_i, 
                &tauri::menu::PredefinedMenuItem::separator(app)?,
                &quit_i
            ])?;

            // Simpan menu di State agar bisa diupdate nanti
            let state = app.state::<AppState>();
            *state.tray_menu.lock().unwrap() = Some(menu.clone());

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => std::process::exit(0),
                    "show" => if let Some(window) = app.get_webview_window("main") { 
                        let _ = window.show(); 
                        let _ = window.set_focus(); 
                    },
                    "play_pause" => { let _ = app.emit("tray-play-pause", ()); },
                    "next" => { let _ = app.emit("tray-next", ()); },
                    "prev" => { let _ = app.emit("tray-prev", ()); },
                    "toggle_compact" => { 
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit("tray-toggle-compact", ()); 
                    },

                    _ => {}
                })
                .build(app)?;
            
            #[cfg(target_os = "windows")]
            smtc::init_smtc(app.handle().clone());

            // FIX: Pastikan jendela selalu Frameless (tanpa bar ganda) setiap startup
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_decorations(false);
                
                let size = window.outer_size().unwrap_or_default();
                if size.width < 400 && size.height < 150 {
                    let _ = window.set_size(tauri::LogicalSize::new(320.0, 560.0));
                    let _ = window.set_always_on_top(false);
                    let _ = window.set_skip_taskbar(false);
                    let _ = window.set_resizable(false);
                    let _ = window.center();
                }
            }


            Ok(())


        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
