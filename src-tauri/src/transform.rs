use crate::models::Station;

/// Prepares station data by sorting streams and setting default fallback
pub fn prepare_stations(mut stations: Vec<Station>) -> Vec<Station> {
    for station in &mut stations {
        // 1. Sort streams by quality: HTTPS first, then higher bitrate for backup mechanism
        if station.streams.len() > 1 {
            station.streams.sort_by(|a, b| {
                // Better HTTPS detection: URL must start with https://
                let a_https = a.url.starts_with("https://");
                let b_https = b.url.starts_with("https://");
                
                let https_cmp = b_https.cmp(&a_https);
                if https_cmp == std::cmp::Ordering::Equal {
                    b.bitrate.cmp(&a.bitrate)
                } else {
                    https_cmp
                }
            });
        }

        // 2. Ensure default 'stream' field is populated with the best one for the player
        if !station.streams.is_empty() {
            station.stream = station.streams[0].url.clone();
            // Update the is_https flag based on actual URL if needed
            for s in &mut station.streams {
                s.is_https = s.url.starts_with("https://");
            }
        }

        // 3. Fallback for logo if absolutely missing
        if station.logo.is_empty() {
            station.logo = "https://radio.garden/api/ara/content/channel/default/image".to_string();
        }
    }
    stations
}
