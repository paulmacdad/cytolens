//! Figure export commands.

use tauri::command;

/// Export a figure to PNG/SVG/PDF from the WebView canvas data.
#[command]
pub async fn export_figure(
    data_url: String,
    path: String,
    format: String,
) -> Result<(), String> {
    // TODO: decode base64 data URL and write to disk
    let _ = (data_url, path, format);
    Ok(())
}
