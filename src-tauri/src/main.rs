// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pagesmith::commands::{self, AppState};

fn main() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::open_file,
            commands::get_current_html,
            commands::save_file,
            commands::save_file_as,
            commands::is_file_dirty,
            commands::get_file_path,
            commands::apply_patch,
            commands::undo,
            commands::redo,
            commands::can_undo,
            commands::can_redo,
            commands::get_source_length,
            commands::read_range,
            commands::parse_source_map,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PageSmith");
}
