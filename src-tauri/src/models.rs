use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stream {
    pub url: String,
    #[serde(default)]
    pub bitrate: u32,
    #[serde(default)]
    pub codec: String,
    #[serde(default, rename = "isHttps")]
    pub is_https: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Station {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub city: String,
    #[serde(default)]
    pub country: String,
    #[serde(default)]
    pub logo: String,
    #[serde(default)]
    pub stream: String,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    #[serde(default)]
    pub streams: Vec<Stream>,
}

#[derive(Debug, Deserialize)]
pub struct ApiResponse {
    pub data: Vec<Station>,
}
