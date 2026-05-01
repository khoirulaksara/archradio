use crate::models::Station;

// Indonesia Bounding Box
// lat: -11 to 6
// lng: 95 to 141
const MIN_LAT: f64 = -11.0;
const MAX_LAT: f64 = 6.0;
const MIN_LNG: f64 = 95.0;
const MAX_LNG: f64 = 141.0;

pub fn is_in_indonesia(lat: f64, lng: f64) -> bool {
    lat >= MIN_LAT && lat <= MAX_LAT && lng >= MIN_LNG && lng <= MAX_LNG
}

pub fn filter_indonesia(stations: Vec<Station>) -> Vec<Station> {
    stations.into_iter()
        .filter(|s| is_in_indonesia(s.lat, s.lng))
        .collect()
}
