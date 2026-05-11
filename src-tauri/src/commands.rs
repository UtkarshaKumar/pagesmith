/// Tauri IPC commands that bridge the frontend JS to the surgical engine.
///
/// These are the commands callable from the WKWebView via `invoke()`.
/// Every command goes through the engine's patch model — same code path
/// for human edits and LLM edits.
use crate::engine::patch::{Patch, UndoStack};
use crate::engine::source_model::SourceModel;
use crate::engine::file_io;
use crate::engine::parser;
use std::sync::Mutex;
use tauri::State;

/// Application state shared across commands
pub struct AppState {
    pub model: Mutex<Option<SourceModel>>,
    pub undo_stack: Mutex<UndoStack>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            model: Mutex::new(None),
            undo_stack: Mutex::new(UndoStack::new()),
        }
    }
}

// ── File Operations ──

#[tauri::command]
pub fn open_file(state: State<AppState>, path: String) -> Result<String, String> {
    let model = file_io::read_file(std::path::Path::new(&path))
        .map_err(|e| e.to_string())?;

    let html = model.as_str().map_err(|e| e.to_string())?.to_string();
    *state.model.lock().unwrap() = Some(model);

    Ok(html)
}

#[tauri::command]
pub fn get_current_html(state: State<AppState>) -> Result<String, String> {
    let model = state.model.lock().unwrap();
    match model.as_ref() {
        Some(m) => m.as_str().map(|s| s.to_string()).map_err(|e| e.to_string()),
        None => Err("No file open".to_string()),
    }
}

#[tauri::command]
pub fn save_file(state: State<AppState>) -> Result<(), String> {
    let model = state.model.lock().unwrap();
    match model.as_ref() {
        Some(m) => {
            file_io::write_file_atomic(m).map_err(|e| e.to_string())?;
            Ok(())
        }
        None => Err("No file open".to_string()),
    }
}

#[tauri::command]
pub fn save_file_as(state: State<AppState>, path: String) -> Result<(), String> {
    let mut model = state.model.lock().unwrap();
    match model.as_mut() {
        Some(m) => {
            let content = m.as_str().map_err(|e| e.to_string())?.to_string();
            file_io::write_file_string_atomic(std::path::Path::new(&path), &content)
                .map_err(|e| e.to_string())?;
            m.file_path = Some(path);
            Ok(())
        }
        None => Err("No file open".to_string()),
    }
}

#[tauri::command]
pub fn is_file_dirty(state: State<AppState>) -> Result<bool, String> {
    let model = state.model.lock().unwrap();
    Ok(model.as_ref().map(|m| m.is_dirty).unwrap_or(false))
}

#[tauri::command]
pub fn get_file_path(state: State<AppState>) -> Result<Option<String>, String> {
    let model = state.model.lock().unwrap();
    Ok(model.as_ref().and_then(|m| m.file_path.clone()))
}

// ── Editing Operations ──

#[tauri::command]
pub fn apply_patch(
    state: State<AppState>,
    offset: usize,
    length: usize,
    replacement: String,
) -> Result<String, String> {
    let mut model = state.model.lock().unwrap();
    let model = model.as_mut().ok_or("No file open")?;

    let total_len = model.raw.len();

    // Bounds checking: clamp offset and length to valid range
    let offset = offset.min(total_len);
    let max_len = total_len.saturating_sub(offset);
    let length = length.min(max_len);

    if offset > total_len {
        return Err(format!("offset {} out of bounds (len {})", offset, total_len));
    }

    let original_slice = model.raw[offset..offset + length].to_vec();
    let patch = Patch::new(offset, length, replacement.as_bytes().to_vec());

    patch.apply(model).map_err(|e| e.to_string())?;

    // Record for undo
    state.undo_stack.lock().unwrap().record(patch, original_slice);

    model.as_str().map(|s| s.to_string()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn undo(state: State<AppState>) -> Result<String, String> {
    let mut model = state.model.lock().unwrap();
    let model = model.as_mut().ok_or("No file open")?;

    let inverse = state.undo_stack.lock().unwrap().undo()
        .ok_or("Nothing to undo")?;

    inverse.apply(model).map_err(|e| e.to_string())?;

    model.as_str().map(|s| s.to_string()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn redo(state: State<AppState>) -> Result<String, String> {
    let mut model = state.model.lock().unwrap();
    let model = model.as_mut().ok_or("No file open")?;

    let forward = state.undo_stack.lock().unwrap().redo()
        .ok_or("Nothing to redo")?;

    forward.apply(model).map_err(|e| e.to_string())?;

    model.as_str().map(|s| s.to_string()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn can_undo(state: State<AppState>) -> Result<bool, String> {
    Ok(state.undo_stack.lock().unwrap().can_undo())
}

#[tauri::command]
pub fn can_redo(state: State<AppState>) -> Result<bool, String> {
    Ok(state.undo_stack.lock().unwrap().can_redo())
}

// ── Source Model Operations ──

#[tauri::command]
pub fn get_source_length(state: State<AppState>) -> Result<usize, String> {
    let model = state.model.lock().unwrap();
    model.as_ref().map(|m| m.len()).ok_or("No file open".to_string())
}

#[tauri::command]
pub fn read_range(state: State<AppState>, offset: usize, length: usize) -> Result<String, String> {
    let model = state.model.lock().unwrap();
    let model = model.as_ref().ok_or("No file open")?;

    let end = (offset + length).min(model.len());
    let slice = &model.raw[offset..end];
    Ok(String::from_utf8_lossy(slice).to_string())
}

#[tauri::command]
pub fn parse_source_map(state: State<AppState>) -> Result<usize, String> {
    let model = state.model.lock().unwrap();
    let model = model.as_ref().ok_or("No file open")?;

    let map = parser::parse_html(&model.raw);
    let count = map.node_count();

    Ok(count)
}

#[tauri::command]
pub fn get_file_info(state: State<AppState>) -> Result<serde_json::Value, String> {
    let model = state.model.lock().unwrap();
    match model.as_ref() {
        Some(m) => Ok(serde_json::json!({
            "path": m.file_path,
            "is_dirty": m.is_dirty,
            "length": m.len(),
            "encoding": m.encoding,
        })),
        None => Ok(serde_json::json!({
            "path": null,
            "is_dirty": false,
            "length": 0,
            "encoding": "utf-8",
        })),
    }
}

#[tauri::command]
pub fn set_source_content(state: State<AppState>, content: String) -> Result<(), String> {
    let mut model = state.model.lock().unwrap();
    let model = model.as_mut().ok_or("No file open")?;
    model.raw = content.into_bytes();
    model.is_dirty = true;
    Ok(())
}

#[tauri::command]
pub fn replace_in_source(
    state: State<AppState>,
    offset_hint: usize,
    old_text: String,
    new_text: String,
) -> Result<serde_json::Value, String> {
    let mut model = state.model.lock().unwrap();
    let model = model.as_mut().ok_or("No file open")?;

    let source_str = model.as_str().map_err(|e| e.to_string())?;

    // Search for old_text starting from offset_hint, then expanding outward
    let actual_offset = find_text(source_str, &old_text, offset_hint)
        .ok_or_else(|| format!("Could not find '{}' in source near offset {}", old_text, offset_hint))?;

    let patch = Patch::new(actual_offset, old_text.len(), new_text.as_bytes().to_vec());
    let original_slice = model.raw[actual_offset..actual_offset + old_text.len()].to_vec();
    patch.apply(model).map_err(|e| e.to_string())?;

    state.undo_stack.lock().unwrap().record(patch, original_slice);

    let new_source = model.as_str().map_err(|e| e.to_string())?.to_string();

    Ok(serde_json::json!({
        "source": new_source,
        "offset": actual_offset,
        "new_length": new_text.len(),
    }))
}

/// Find `needle` in `haystack` starting from `hint` offset, expanding outward.
fn find_text(haystack: &str, needle: &str, hint: usize) -> Option<usize> {
    if needle.is_empty() {
        return Some(hint.min(haystack.len()));
    }

    let hint = hint.min(haystack.len());

    // Search forward from hint
    if let Some(pos) = haystack[hint..].find(needle) {
        return Some(hint + pos);
    }

    // Search backward from hint
    if let Some(pos) = haystack[..hint].rfind(needle) {
        return Some(pos);
    }

    None
}
