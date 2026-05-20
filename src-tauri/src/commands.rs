use crate::engine::patch::{Patch, UndoStack};
use crate::engine::source_model::SourceModel;
use crate::engine::file_io;
use crate::engine::parser;
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{State, Window, WebviewUrl, WebviewWindowBuilder};

static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(1);

#[derive(Default)]
pub struct WindowState {
    pub model: Option<SourceModel>,
    pub undo_stack: UndoStack,
}

pub struct AppState {
    pub windows: Mutex<HashMap<String, WindowState>>,
}

impl AppState {
    pub fn new() -> Self {
        Self { windows: Mutex::new(HashMap::new()) }
    }
}

fn get_window_state<'a>(
    windows: &'a mut HashMap<String, WindowState>,
    label: &str,
) -> &'a mut WindowState {
    windows.entry(label.to_string()).or_insert_with(|| WindowState {
        model: None,
        undo_stack: UndoStack::new(),
    })
}

fn cleanup_window(state: &AppState, label: &str) {
    state.windows.lock().unwrap().remove(label);
}

#[tauri::command]
pub fn open_file(state: State<AppState>, window: Window, path: String) -> Result<String, String> {
    let label = window.label().to_string();
    let mut windows = state.windows.lock().unwrap();
    let ws = get_window_state(&mut windows, &label);
    let model = file_io::read_file(std::path::Path::new(&path)).map_err(|e| e.to_string())?;
    let html = model.as_str().map_err(|e| e.to_string())?.to_string();
    ws.model = Some(model);
    ws.undo_stack.clear(); // fresh undo history per file
    Ok(html)
}

#[tauri::command]
pub fn get_current_html(state: State<AppState>, window: Window) -> Result<String, String> {
    let label = window.label().to_string();
    let windows = state.windows.lock().unwrap();
    let ws = windows.get(&label).ok_or("No window state found")?;
    ws.model.as_ref().map(|m| m.as_str().map(|s| s.to_string()).map_err(|e| e.to_string())).unwrap_or(Err("No file open".to_string()))
}

#[tauri::command]
pub fn save_file(state: State<AppState>, window: Window) -> Result<(), String> {
    let label = window.label().to_string();
    let mut windows = state.windows.lock().unwrap();
    let ws = windows.get_mut(&label).ok_or("No window state found")?;
    let model = ws.model.as_mut().ok_or("No file open")?;
    file_io::write_file_atomic(model).map_err(|e| e.to_string())?;
    model.mark_clean();
    Ok(())
}

#[tauri::command]
pub fn save_file_as(state: State<AppState>, window: Window, path: String) -> Result<(), String> {
    let label = window.label().to_string();
    let mut windows = state.windows.lock().unwrap();
    let ws = windows.get_mut(&label).ok_or("No window state found")?;
    let model = ws.model.as_mut().ok_or("No file open")?;
    let content = model.as_str().map_err(|e| e.to_string())?.to_string();
    file_io::write_file_string_atomic(std::path::Path::new(&path), &content).map_err(|e| e.to_string())?;
    model.file_path = Some(path);
    model.mark_clean();
    Ok(())
}

#[tauri::command]
pub fn is_file_dirty(state: State<AppState>, window: Window) -> Result<bool, String> {
    let label = window.label().to_string();
    let windows = state.windows.lock().unwrap();
    Ok(windows.get(&label).and_then(|ws| ws.model.as_ref()).map(|m| m.is_dirty).unwrap_or(false))
}

#[tauri::command]
pub fn get_file_path(state: State<AppState>, window: Window) -> Result<Option<String>, String> {
    let label = window.label().to_string();
    let windows = state.windows.lock().unwrap();
    Ok(windows.get(&label).and_then(|ws| ws.model.as_ref()).and_then(|m| m.file_path.clone()))
}

#[tauri::command]
pub fn apply_patch(state: State<AppState>, window: Window, offset: usize, length: usize, replacement: String) -> Result<String, String> {
    let label = window.label().to_string();
    let mut windows = state.windows.lock().unwrap();
    let ws = windows.get_mut(&label).ok_or("No window state found")?;
    let model = ws.model.as_mut().ok_or("No file open")?;
    let total_len = model.raw.len();

    if offset > total_len {
        return Err(format!("offset {} out of bounds (len {})", offset, total_len));
    }
    let length = if offset + length > total_len { total_len - offset } else { length };

    let original_slice = model.raw[offset..offset + length].to_vec();
    let patch = Patch::new(offset, length, replacement.as_bytes().to_vec());
    patch.apply(model).map_err(|e| e.to_string())?;
    ws.undo_stack.record(patch, original_slice);
    model.as_str().map(|s| s.to_string()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn undo(state: State<AppState>, window: Window) -> Result<String, String> {
    let label = window.label().to_string();
    let mut windows = state.windows.lock().unwrap();
    let ws = windows.get_mut(&label).ok_or("No window state found")?;
    let model = ws.model.as_mut().ok_or("No file open")?;
    let inverse = ws.undo_stack.undo().ok_or("Nothing to undo")?;
    inverse.apply(model).map_err(|e| e.to_string())?;
    model.as_str().map(|s| s.to_string()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn redo(state: State<AppState>, window: Window) -> Result<String, String> {
    let label = window.label().to_string();
    let mut windows = state.windows.lock().unwrap();
    let ws = windows.get_mut(&label).ok_or("No window state found")?;
    let model = ws.model.as_mut().ok_or("No file open")?;
    let forward = { ws.undo_stack.redo(model).ok_or("Nothing to redo")? };
    forward.apply(model).map_err(|e| e.to_string())?;
    model.as_str().map(|s| s.to_string()).map_err(|e| e.to_string())
}

#[tauri::command] pub fn can_undo(state: State<AppState>, window: Window) -> Result<bool, String> {
    let label = window.label().to_string();
    let windows = state.windows.lock().unwrap();
    Ok(windows.get(&label).map(|ws| ws.undo_stack.can_undo()).unwrap_or(false))
}
#[tauri::command] pub fn can_redo(state: State<AppState>, window: Window) -> Result<bool, String> {
    let label = window.label().to_string();
    let windows = state.windows.lock().unwrap();
    Ok(windows.get(&label).map(|ws| ws.undo_stack.can_redo()).unwrap_or(false))
}
#[tauri::command] pub fn get_source_length(state: State<AppState>, window: Window) -> Result<usize, String> {
    let label = window.label().to_string();
    let windows = state.windows.lock().unwrap();
    windows.get(&label).and_then(|ws| ws.model.as_ref()).map(|m| m.len()).ok_or("No file open".to_string())
}

#[tauri::command]
pub fn read_range(state: State<AppState>, window: Window, offset: usize, length: usize) -> Result<String, String> {
    let label = window.label().to_string();
    let windows = state.windows.lock().unwrap();
    let ws = windows.get(&label).ok_or("No window state found")?;
    let model = ws.model.as_ref().ok_or("No file open")?;
    if offset > model.len() { return Err(format!("offset {} out of bounds (len {})", offset, model.len())); }
    let end = (offset + length).min(model.len());
    Ok(String::from_utf8_lossy(&model.raw[offset..end]).to_string())
}

#[tauri::command] pub fn parse_source_map(state: State<AppState>, window: Window) -> Result<usize, String> {
    let label = window.label().to_string();
    let windows = state.windows.lock().unwrap();
    let ws = windows.get(&label).ok_or("No window state found")?;
    let m = ws.model.as_ref().ok_or("No file open")?;
    Ok(parser::parse_html(&m.raw).node_count())
}

#[tauri::command]
pub fn get_file_info(state: State<AppState>, window: Window) -> Result<serde_json::Value, String> {
    let label = window.label().to_string();
    let windows = state.windows.lock().unwrap();
    let ws = windows.get(&label).unwrap_or_else(|| {
        panic!("Window state not found for {}", label)
    });
    match ws.model.as_ref() {
        Some(m) => Ok(serde_json::json!({"path":m.file_path,"is_dirty":m.is_dirty,"length":m.len(),"encoding":m.encoding})),
        None => Ok(serde_json::json!({"path":null,"is_dirty":false,"length":0,"encoding":"utf-8"})),
    }
}

#[tauri::command]
pub fn set_source_content(state: State<AppState>, window: Window, content: String) -> Result<(), String> {
    let label = window.label().to_string();
    let mut windows = state.windows.lock().unwrap();
    let ws = windows.get_mut(&label).ok_or("No window state found")?;
    let model = ws.model.as_mut().ok_or("No file open")?;
    model.raw = content.into_bytes();
    model.is_dirty = true;
    model.source_map = parser::parse_html(&model.raw);
    Ok(())
}

#[tauri::command]
pub fn replace_in_source(state: State<AppState>, window: Window, offset_hint: usize, old_text: String, new_text: String) -> Result<serde_json::Value, String> {
    if old_text.is_empty() { return Err("old_text cannot be empty".to_string()); }
    let label = window.label().to_string();
    let mut windows = state.windows.lock().unwrap();
    let ws = windows.get_mut(&label).ok_or("No window state found")?;
    let model = ws.model.as_mut().ok_or("No file open")?;
    let source_str = model.as_str().map_err(|e| e.to_string())?;
    let actual_offset = find_text(source_str, &old_text, offset_hint)
        .ok_or_else(|| format!("Could not find '{}' in source near offset {}", old_text, offset_hint))?;
    let patch = Patch::new(actual_offset, old_text.len(), new_text.as_bytes().to_vec());
    let original_slice = model.raw[actual_offset..actual_offset + old_text.len()].to_vec();
    patch.apply(model).map_err(|e| e.to_string())?;
    ws.undo_stack.record(patch, original_slice);
    let new_source = model.as_str().map_err(|e| e.to_string())?.to_string();
    Ok(serde_json::json!({"source":new_source,"offset":actual_offset,"new_length":new_text.len()}))
}

fn find_text(haystack: &str, needle: &str, hint: usize) -> Option<usize> {
    let hint = hint.min(haystack.len());
    let hint = haystack.floor_char_boundary(hint);
    let forward = haystack[hint..].find(needle).map(|p| hint + p);
    let backward = haystack[..hint].rfind(needle);
    match (forward, backward) {
        (Some(f), Some(b)) if f - hint < hint.saturating_sub(b) => Some(f),
        (Some(f), _) => Some(f),
        (_, Some(b)) => Some(b),
        (None, None) => None,
    }
}

#[tauri::command]
pub fn export_pdf(state: State<AppState>, window: Window, path: String) -> Result<(), String> {
    let label = window.label().to_string();
    let windows = state.windows.lock().unwrap();
    let ws = windows.get(&label).ok_or("No window state found")?;
    let model = ws.model.as_ref().ok_or("No file open")?;
    let html = model.as_str().map_err(|e| e.to_string())?;
    let doc = if html.contains("<html") { html.to_string() } else {
        format!("<!DOCTYPE html><html><head><meta charset='utf-8'><style>body{{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;line-height:1.6}}</style></head><body>{}</body></html>", html)
    };
    std::fs::write(std::path::Path::new(&path), &doc).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn new_window(app: tauri::AppHandle) -> Result<(), String> {
    let n = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let label = format!("pagesmith-{}", n);
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("PageSmith")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn close_window(window: Window, state: State<AppState>) {
    let label = window.label().to_string();
    cleanup_window(&state, &label);
    let _ = window.close();
}
