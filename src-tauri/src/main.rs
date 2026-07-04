// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod scan;
mod telemetry;
mod thumbnails;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(thumbnails::ThumbState::default())
        .invoke_handler(tauri::generate_handler![
            scan::scan_teslacam,
            telemetry::parse_telemetry,
            thumbnails::request_thumbnails,
            thumbnails::cancel_thumbnails,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
