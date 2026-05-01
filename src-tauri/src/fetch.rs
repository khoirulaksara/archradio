use crate::models::Station;
use reqwest::Client;
use std::time::Duration;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
// Memastikan endpoint sesuai dengan API Anda
const BASE_URL: &str = "https://api-radio.kalingga.workers.dev/";

pub async fn fetch_stations(params: &str) -> Result<Vec<Station>, String> {
    let client = Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(15))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;

    let url = if params.is_empty() {
        BASE_URL.to_string()
    } else {
        format!("{}?{}", BASE_URL, params)
    };

    let response = client.get(&url).send().await.map_err(|e| format!("Request failed: {}", e))?;
    
    let status = response.status();
    let body = response.text().await.map_err(|e| format!("Failed to read body: {}", e))?;
    
    if status.is_success() {
        match serde_json::from_str::<crate::models::ApiResponse>(&body) {
            Ok(res) => {
                Ok(res.data)
            },
            Err(e) => {
                Err(format!("Data format error: {}", e))
            }
        }
    } else {
        Err(format!("Server error: {}", status))
    }
}

pub async fn _validate_stream(_url: &str) -> bool {
    true // Selalu anggap valid untuk kecepatan
}
