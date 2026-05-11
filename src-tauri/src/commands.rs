/// Tauri IPC commands that bridge the frontend JS to the surgical engine.
use crate::engine::patch::{Patch, UndoStack};
use crate::engine::source_model::SourceModel;
use crate::engine::file_io;
use crate::engine::parser;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub model: Mutex<Option<SourceModel>>,
    pub undo_stack: Mutex<UndoStack>,
}

impl AppState {
    pub fn new() -> Self {
        Self { model: Mutex::new(None), undo_stack: Mutex::new(UndoStack::new()) }
    }
}

#[tauri::command]
pub fn open_file(state: State<AppState>, path: String) -> Result<String, String> {
    let model = file_io::read_file(std::path::Path::new(&path)).map_err(|e| e.to_string())?;
    let html = model.as_str().map_err(|e| e.to_string())?.to_string();
    *state.model.lock().unwrap() = Some(model);
    Ok(html)
}

#[tauri::command]
pub fn get_current_html(state: State<AppState>) -> Result<String, String> {
    let model = state.model.lock().unwrap();
    model.as_ref().map(|m| m.as_str().map(|s| s.to_string()).map_err(|e| e.to_string())).unwrap_or(Err("No file open".to_string()))
}

#[tauri::command]
pub fn save_file(state: State<AppState>) -> Result<(), String> {
    let mut model = state.model.lock().unwrap();
    let model = model.as_mut().ok_or("No file open")?;
    file_io::write_file_atomic(model).map_err(|e| e.to_string())?;
    model.mark_clean();
    Ok(())
}

#[tauri::command]
pub fn save_file_as(state: State<AppState>, path: String) -> Result<(), String> {
    let mut model = state.model.lock().unwrap();
    let model = model.as_mut().ok_or("No file open")?;
    let content = model.as_str().map_err(|e| e.to_string())?.to_string();
    file_io::write_file_string_atomic(std::path::Path::new(&path), &content).map_err(|e| e.to_string())?;
    model.file_path = Some(path);
    model.mark_clean();
    Ok(())
}

#[tauri::command]
pub fn is_file_dirty(state: State<AppState>) -> Result<bool, String> {
    Ok(state.model.lock().unwrap().as_ref().map(|m| m.is_dirty).unwrap_or(false))
}

#[tauri::command]
pub fn get_file_path(state: State<AppState>) -> Result<Option<String>, String> {
    Ok(state.model.lock().unwrap().as_ref().and_then(|m| m.file_path.clone()))
}

#[tauri::command]
pub fn apply_patch(state: State<AppState>, offset: usize, length: usize, replacement: String) -> Result<String, String> {
    let mut model = state.model.lock().unwrap();
    let model = model.as_mut().ok_or("No file open")?;
    let total_len = model.raw.len();

    if offset > total_len {
        return Err(format!("offset {} out of bounds (len {})", offset, total_len));
    }
    let length = if offset + length > total_len { total_len - offset } else { length };

    let original_slice = model.raw[offset..offset + length].to_vec();
    let patch = Patch::new(offset, length, replacement.as_bytes().to_vec());
    patch.apply(model).map_err(|e| e.to_string())?;
    state.undo_stack.lock().unwrap().record(patch, original_slice);
    model.as_str().map(|s| s.to_string()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn undo(state: State<AppState>) -> Result<String, String> {
    let mut model = state.model.lock().unwrap();
    let model = model.as_mut().ok_or("No file open")?;
    let inverse = state.undo_stack.lock().unwrap().undo().ok_or("Nothing to undo")?;
    inverse.apply(model).map_err(|e| e.to_string())?;
    model.as_str().map(|s| s.to_string()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn redo(state: State<AppState>) -> Result<String, String> {
    let mut model = state.model.lock().unwrap();
    let model = model.as_mut().ok_or("No file open")?;
    let forward = { state.undo_stack.lock().unwrap().redo(model).ok_or("Nothing to redo")? };
    forward.apply(model).map_err(|e| e.to_string())?;
    model.as_str().map(|s| s.to_string()).map_err(|e| e.to_string())
}

#[tauri::command] pub fn can_undo(state: State<AppState>) -> Result<bool, String> { Ok(state.undo_stack.lock().unwrap().can_undo()) }
#[tauri::command] pub fn can_redo(state: State<AppState>) -> Result<bool, String> { Ok(state.undo_stack.lock().unwrap().can_redo()) }
#[tauri::command] pub fn get_source_length(state: State<AppState>) -> Result<usize, String> { state.model.lock().unwrap().as_ref().map(|m| m.len()).ok_or("No file open".to_string()) }

#[tauri::command]
pub fn read_range(state: State<AppState>, offset: usize, length: usize) -> Result<String, String> {
    let model = state.model.lock().unwrap();
    let model = model.as_ref().ok_or("No file open")?;
    if offset > model.len() { return Err(format!("offset {} out of bounds (len {})", offset, model.len())); }
    let end = (offset + length).min(model.len());
    Ok(String::from_utf8_lossy(&model.raw[offset..end]).to_string())
}

#[tauri::command] pub fn parse_source_map(state: State<AppState>) -> Result<usize, String> { let m = state.model.lock().unwrap(); let m = m.as_ref().ok_or("No file open")?; Ok(parser::parse_html(&m.raw).node_count()) }

#[tauri::command]
pub fn get_file_info(state: State<AppState>) -> Result<serde_json::Value, String> {
    let model = state.model.lock().unwrap();
    match model.as_ref() {
        Some(m) => Ok(serde_json::json!({"path":m.file_path,"is_dirty":m.is_dirty,"length":m.len(),"encoding":m.encoding})),
        None => Ok(serde_json::json!({"path":null,"is_dirty":false,"length":0,"encoding":"utf-8"})),
    }
}

#[tauri::command]
pub fn set_source_content(state: State<AppState>, content: String) -> Result<(), String> {
    let mut model = state.model.lock().unwrap();
    let model = model.as_mut().ok_or("No file open")?;
    model.raw = content.into_bytes();
    model.is_dirty = true;
    model.source_map = parser::parse_html(&model.raw);
    state.undo_stack.lock().unwrap().clear(); // old patches invalidated by full replace
    Ok(())
}

#[tauri::command]
pub fn replace_in_source(state: State<AppState>, offset_hint: usize, old_text: String, new_text: String) -> Result<serde_json::Value, String> {
    if old_text.is_empty() { return Err("old_text cannot be empty".to_string()); }
    let mut model = state.model.lock().unwrap();
    let model = model.as_mut().ok_or("No file open")?;
    let source_str = model.as_str().map_err(|e| e.to_string())?;
    let actual_offset = find_text(source_str, &old_text, offset_hint)
        .ok_or_else(|| format!("Could not find '{}' in source near offset {}", old_text, offset_hint))?;
    let patch = Patch::new(actual_offset, old_text.len(), new_text.as_bytes().to_vec());
    let original_slice = model.raw[actual_offset..actual_offset + old_text.len()].to_vec();
    patch.apply(model).map_err(|e| e.to_string())?;
    state.undo_stack.lock().unwrap().record(patch, original_slice);
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
pub fn export_pdf(state: State<AppState>, path: String) -> Result<(), String> {
    let model = state.model.lock().unwrap();
    let model = model.as_ref().ok_or("No file open")?;
    let html = model.as_str().map_err(|e| e.to_string())?;
    // Wrap in a basic HTML document if not already
    let doc = if html.contains("<html") { html.to_string() } else {
        format!("<!DOCTYPE html><html><head><meta charset='utf-8'><style>body{{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;line-height:1.6}}</style></head><body>{}</body></html>", html)
    };
    std::fs::write(std::path::Path::new(&path), &doc).map_err(|e| e.to_string())?;
    Ok(())
}
