//! Workspace save/load commands.

use tauri::command;
use serde_json::Value;

/// Save workspace JSON to disk.
#[command]
pub async fn save_workspace(path: String, data: Value) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// Load workspace JSON from disk.
#[command]
pub async fn load_workspace(path: String) -> Result<Value, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}
