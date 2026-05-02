use windows::{
    core::HSTRING,
    Media::Playback::MediaPlayer,
    Media::{MediaPlaybackType, MediaPlaybackStatus},
    Foundation::{Uri, TypedEventHandler},
    Storage::Streams::RandomAccessStreamReference,
    Media::SystemMediaTransportControlsButtonPressedEventArgs,
};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

static PLAYER: OnceLock<MediaPlayer> = OnceLock::new();

pub fn init_smtc(app: AppHandle) {
    let player = MediaPlayer::new().unwrap();
    let smtc = player.SystemMediaTransportControls().unwrap();

    smtc.SetIsEnabled(true).unwrap();
    smtc.SetIsPlayEnabled(true).unwrap();
    smtc.SetIsPauseEnabled(true).unwrap();
    smtc.SetIsPreviousEnabled(true).unwrap();
    smtc.SetIsNextEnabled(true).unwrap();

    let updater = smtc.DisplayUpdater().unwrap();
    updater.SetType(MediaPlaybackType::Music).unwrap();

    let music = updater.MusicProperties().unwrap();
    music.SetTitle(&HSTRING::from("Arch Radio")).unwrap();
    music.SetArtist(&HSTRING::from("Live Stream")).unwrap();

    updater.Update().unwrap();

    // Event Handlers
    let app_c = app.clone();
    smtc.ButtonPressed(&TypedEventHandler::new(move |_, args: &Option<SystemMediaTransportControlsButtonPressedEventArgs>| {
        if let Some(args) = args {
            let button = args.Button().unwrap();
            match button.0 {
                0 => { let _ = app_c.emit("smtc-play", ()); }
                1 => { let _ = app_c.emit("smtc-pause", ()); }
                2 => { let _ = app_c.emit("smtc-stop", ()); }
                // 3: Record
                // 4: FastForward
                // 5: Rewind
                6 => { let _ = app_c.emit("smtc-next", ()); }
                7 => { let _ = app_c.emit("smtc-prev", ()); }
                // 8: ChannelUp
                // 9: ChannelDown
                _ => {}
            }
        }
        Ok(())
    })).unwrap();

    let _ = PLAYER.set(player);
}

#[tauri::command]
pub async fn update_smtc_metadata(title: String, artist: String, image_url: Option<String>) -> std::result::Result<(), String> {
    if let Some(player) = PLAYER.get() {
        let smtc = player.SystemMediaTransportControls().map_err(|e| e.to_string())?;
        let updater = smtc.DisplayUpdater().map_err(|e| e.to_string())?;
        let music = updater.MusicProperties().map_err(|e| e.to_string())?;

        music.SetTitle(&HSTRING::from(title)).map_err(|e| e.to_string())?;
        music.SetArtist(&HSTRING::from(artist)).map_err(|e| e.to_string())?;

        if let Some(url) = image_url {
            if !url.is_empty() {
                if let Ok(uri) = Uri::CreateUri(&HSTRING::from(url)) {
                    if let Ok(stream_ref) = RandomAccessStreamReference::CreateFromUri(&uri) {
                        let _ = updater.SetThumbnail(&stream_ref);
                    }
                }
            }
        }

        updater.Update().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn update_smtc_status(playing: bool) {
    if let Some(player) = PLAYER.get() {
        if let Ok(smtc) = player.SystemMediaTransportControls() {
            let status = if playing {
                MediaPlaybackStatus::Playing
            } else {
                MediaPlaybackStatus::Paused
            };
            let _ = smtc.SetPlaybackStatus(status);
        }
    }
}