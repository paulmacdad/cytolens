//! CytoLens Desktop — Tauri v2 application entry point.
//!
//! This binary is the native shell. All flow cytometry logic lives in
//! @cytoflow/core (TypeScript) and runs in the WebView. The Rust side
//! provides only:
//!   - Large file streaming (FCS files >2GB via memory-mapped I/O)
//!   - Directory watching for auto-reload when files change
//!   - Native file picker integration
//!   - System tray
//!   - Auto-updater

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::fcs_stream::stream_fcs_header,
            commands::export::export_figure,
            commands::workspace_io::save_workspace,
            commands::workspace_io::load_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error running CytoLens desktop");
}
