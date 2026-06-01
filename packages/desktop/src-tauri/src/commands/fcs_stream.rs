//! FCS streaming commands.
//!
//! For files too large to load into the WebView's ArrayBuffer (>500MB),
//! the Rust sidecar streams events in pages directly from disk.

use serde::{Deserialize, Serialize};
use tauri::command;

#[derive(Serialize)]
pub struct FCSHeaderResult {
    pub version: String,
    pub text_start: u64,
    pub text_end: u64,
    pub data_start: u64,
    pub data_end: u64,
    pub keywords: std::collections::HashMap<String, String>,
}

/// Read FCS header and TEXT segment from a large file.
/// Returns metadata without loading event data.
#[command]
pub async fn stream_fcs_header(path: String) -> Result<FCSHeaderResult, String> {
    use std::fs::File;
    use std::io::{Read, Seek, SeekFrom};
    
    let mut file = File::open(&path).map_err(|e| e.to_string())?;
    
    // Read 58-byte header
    let mut header_buf = [0u8; 58];
    file.read_exact(&mut header_buf).map_err(|e| e.to_string())?;
    
    let version = String::from_utf8_lossy(&header_buf[0..6]).trim().to_string();
    let text_start = parse_field(&header_buf[10..18]);
    let text_end = parse_field(&header_buf[18..26]);
    let data_start = parse_field(&header_buf[26..34]);
    let data_end = parse_field(&header_buf[34..42]);
    
    // Read TEXT segment
    let text_len = (text_end - text_start + 1) as usize;
    file.seek(SeekFrom::Start(text_start)).map_err(|e| e.to_string())?;
    let mut text_buf = vec![0u8; text_len];
    file.read_exact(&mut text_buf).map_err(|e| e.to_string())?;
    
    let keywords = parse_text_segment(&text_buf);
    
    Ok(FCSHeaderResult {
        version,
        text_start,
        text_end,
        data_start,
        data_end,
        keywords,
    })
}

fn parse_field(bytes: &[u8]) -> u64 {
    let s = String::from_utf8_lossy(bytes).trim().to_string();
    s.parse().unwrap_or(0)
}

fn parse_text_segment(bytes: &[u8]) -> std::collections::HashMap<String, String> {
    let text = String::from_utf8_lossy(bytes);
    let mut map = std::collections::HashMap::new();
    
    if text.is_empty() { return map; }
    
    let delim = text.chars().next().unwrap_or('\x0C');
    let parts: Vec<&str> = text[1..].split(delim).collect();
    let mut i = 0;
    while i + 1 < parts.len() {
        let key = parts[i].trim().to_uppercase();
        let val = parts[i + 1].trim().to_string();
        if !key.is_empty() {
            map.insert(key, val);
        }
        i += 2;
    }
    map
}
