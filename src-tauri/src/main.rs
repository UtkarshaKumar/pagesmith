#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pagesmith::commands::{self, AppState};
use tauri::Manager;

fn main() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let window = app.get_webview_window("main")
                .expect("main window should exist");
            let label = window.label().to_string();

            // Pre-initialize window state for the main window
            {
                let state = app.state::<AppState>();
                let mut windows = state.windows.lock().unwrap();
                windows.entry(label).or_insert_with(|| commands::WindowState {
                    model: None,
                    undo_stack: Default::default(),
                });
            }

            Ok(())
        })
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
            commands::get_file_info,
            commands::set_source_content,
            commands::replace_in_source,
            commands::export_pdf,
            commands::new_window,
            commands::close_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PageSmith");
}
