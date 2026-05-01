use std::time::Instant;
use crate::models::Station;

pub struct AppCache {
    pub data: Option<Vec<Station>>,
    pub last_updated: Option<Instant>,
}

impl AppCache {
    pub fn new() -> Self {
        Self {
            data: None,
            last_updated: None,
        }
    }

    pub fn update(&mut self, stations: Vec<Station>) {
        self.data = Some(stations);
        self.last_updated = Some(Instant::now());
    }
}

pub struct AppState {
    pub cache: std::sync::Mutex<AppCache>,
}
