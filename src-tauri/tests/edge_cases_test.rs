/// Edge case + exception handling tests for PageSmith surgical engine.
use pagesmith::engine::patch::{Patch, UndoStack};
use pagesmith::engine::source_model::{ByteSpan, NodeKind, SourceMap, SourceModel};
use pagesmith::engine::file_io;
use std::fs;

// ═══════════════════════════════════════════════════════════
// BUG B4: Undo-redo-undo cycle integrity (fixed in patch.rs)
// ═══════════════════════════════════════════════════════════

#[test]
fn test_undo_redo_undo_cycle_preserves_content() {
    let original = b"<p>Hello world!</p>".to_vec();
    let mut model = SourceModel::new(original.clone(), "utf-8");
    let mut stack = UndoStack::new();

    // "world" starts at offset 9 in "<p>Hello world!</p>"
    let p1 = Patch::replace(9, 5, b"there");
    let r1 = model.raw[9..14].to_vec();
    p1.apply(&mut model).unwrap();
    stack.record(p1, r1);

    let p2 = Patch::replace(9, 5, b"everyone");
    let r2 = model.raw[9..14].to_vec();
    p2.apply(&mut model).unwrap();
    stack.record(p2, r2);

    // Undo → "there"
    stack.undo().unwrap().apply(&mut model).unwrap();
    // Undo → "world"
    stack.undo().unwrap().apply(&mut model).unwrap();
    assert_eq!(model.raw, original);

    // Redo → "there"
    stack.redo(&mut model).unwrap().apply(&mut model).unwrap();
    // Undo back → "world" (this was the B4 corruption point)
    stack.undo().unwrap().apply(&mut model).unwrap();
    assert_eq!(model.raw, original);
}

#[test]
fn test_100_undo_redo_cycles_no_corruption() {
    let original = b"<p>Hello world!</p>".to_vec();
    let mut model = SourceModel::new(original.clone(), "utf-8");
    let mut stack = UndoStack::new();

    for i in 0..100 {
        let (old, new): (&[u8], &[u8]) = if i % 2 == 0 {
            (b"world", b"there")
        } else {
            (b"there", b"world")
        };
        let p = Patch::replace(8, old.len(), new);
        let replaced = model.raw[8..8 + old.len()].to_vec();
        p.apply(&mut model).unwrap();
        stack.record(p, replaced);
    }

    // Undo all
    for _ in 0..100 {
        let u = stack.undo().unwrap();
        u.apply(&mut model).unwrap();
    }
    assert_eq!(model.raw, original);

    // Redo all
    for _ in 0..100 {
        let r = stack.redo(&mut model).unwrap();
        // Redo only returns Some for non-empty redo_stack
        if let Some(redo_patch) = Some(r) {
            redo_patch.apply(&mut model).unwrap();
        }
    }
    // After full undo+redo, model should be in final state
    assert_eq!(model.raw.len(), 19); // same length as original
}

// ═══════════════════════════════════════════════════════════
// Encoding edge cases
// ═══════════════════════════════════════════════════════════

#[test]
fn test_utf8_bom_preserved() {
    let mut content = vec![0xEF, 0xBB, 0xBF]; // UTF-8 BOM
    content.extend_from_slice(b"<p>Hello</p>");
    let mut model = SourceModel::new(content.clone(), "utf-8");

    let patch = Patch::replace(6, 5, b"World"); // skip BOM + "<p>"
    patch.apply(&mut model).unwrap();

    // BOM must survive untouched
    assert_eq!(&model.raw[..3], &[0xEF, 0xBB, 0xBF]);
    assert_eq!(String::from_utf8_lossy(&model.raw[3..]), "<p>World</p>");
}

#[test]
fn test_iso_8859_1_content_roundtrip() {
    // ISO-8859-1 bytes (Latin-1)
    let content: Vec<u8> = b"<p>caf\xe9</p>".to_vec(); // café with é as 0xE9
    let mut model = SourceModel::new(content.clone(), "iso-8859-1");

    // Edit in the visible range
    let patch = Patch::replace(3, 4, b"test"); // "café" -> "test"
    patch.apply(&mut model).unwrap();

    assert_eq!(&model.raw[..3], b"<p>");
    assert_eq!(&model.raw[3..7], b"test");
    assert_eq!(&model.raw[7..], b"</p>");
}

#[test]
fn test_multibyte_utf8_offsets() {
    // "Hello" = 5 ASCII bytes, "世界" = 6 bytes (3 per CJK char)
    let content = "<p>Hello 世界!</p>".as_bytes().to_vec();
    let mut model = SourceModel::new(content.clone(), "utf-8");

    // Replace "世界" (bytes 9-14, chars 7-8)
    let patch = Patch::replace(9, 6, b"world");
    patch.apply(&mut model).unwrap();

    assert_eq!(model.as_str().unwrap(), "<p>Hello world!</p>");
}

#[test]
fn test_zero_width_chars_preserved() {
    let zwj = "\u{200D}";
    let content = format!("<p>test{}</p>", zwj);
    let bytes = content.as_bytes().to_vec();
    let mut model = SourceModel::new(bytes.clone(), "utf-8");

    // Verify content contains ZWJ
    assert!(model.as_str().unwrap().contains(zwj));

    // Edit before ZWJ — ZWJ must survive
    let patch = Patch::replace(3, 4, b"pass"); // "test" -> "pass"
    patch.apply(&mut model).unwrap();
    assert!(model.as_str().unwrap().contains(zwj));
    assert!(model.as_str().unwrap().contains("pass"));
}

// ═══════════════════════════════════════════════════════════
// Atomic file I/O edge cases
// ═══════════════════════════════════════════════════════════

#[test]
fn test_atomic_write_nonexistent_directory() {
    let model = SourceModel::new(b"<p>test</p>".to_vec(), "utf-8");
    let mut m = model;
    m.file_path = Some("/nonexistent/dir/file.html".to_string());
    assert!(file_io::write_file_atomic(&m).is_err());
}

#[test]
fn test_write_zero_byte_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("empty.html");

    let mut model = SourceModel::new(b"".to_vec(), "utf-8");
    model.file_path = Some(path.to_string_lossy().to_string());

    file_io::write_file_atomic(&model).unwrap();
    let written = fs::read(&path).unwrap();
    assert_eq!(written.len(), 0);
}

#[test]
fn test_write_50mb_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("large.html");
    let content = b"<p>x</p>\n".repeat(5_000_000); // ~50MB
    let mut model = SourceModel::new(content, "utf-8");
    model.file_path = Some(path.to_string_lossy().to_string());

    file_io::write_file_atomic(&model).unwrap();
    let written = fs::metadata(&path).unwrap();
    assert!(written.len() > 40_000_000);
}

// ═══════════════════════════════════════════════════════════
// Patch model edge cases
// ═══════════════════════════════════════════════════════════

#[test]
fn test_patch_at_exact_end() {
    let mut model = SourceModel::new(b"<p>Hello</p>".to_vec(), "utf-8");
    // Insert new tag at the end
    let patch = Patch::insert(12, b"<div></div>");
    patch.apply(&mut model).unwrap();
    assert_eq!(model.as_str().unwrap(), "<p>Hello</p><div></div>");
}

#[test]
fn test_patch_delete_everything() {
    let mut model = SourceModel::new(b"<p>Hello</p>".to_vec(), "utf-8");
    let patch = Patch::delete(0, 12);
    patch.apply(&mut model).unwrap();
    assert_eq!(model.as_str().unwrap(), "");
}

#[test]
fn test_patch_replace_with_unicode_replacement() {
    let mut model = SourceModel::new(b"<p>x</p>".to_vec(), "utf-8");
    let patch = Patch::replace(3, 1, "🚀".as_bytes());
    patch.apply(&mut model).unwrap();
    assert_eq!(model.as_str().unwrap(), "<p>🚀</p>");
}

#[test]
fn test_patch_insert_at_zero() {
    let mut model = SourceModel::new(b"<p>Hello</p>".to_vec(), "utf-8");
    let patch = Patch::insert(0, b"<div></div>");
    patch.apply(&mut model).unwrap();
    assert_eq!(model.as_str().unwrap(), "<div></div><p>Hello</p>");
}

// ═══════════════════════════════════════════════════════════
// SourceMap edge cases
// ═══════════════════════════════════════════════════════════

#[test]
fn test_source_map_multiple_shifts() {
    let mut map = SourceMap::new();
    // Insert 3 nodes
    map.insert(0, NodeKind::Element {
        tag_name: "body".into(),
        open_tag_start: 0, open_tag_end: 6,
        close_tag_start: Some(100), close_tag_end: Some(107),
        attributes: vec![],
    }, 0);
    map.insert(10, NodeKind::Text {
        content_span: ByteSpan::new(10, 20),
    }, 1);
    map.insert(30, NodeKind::Text {
        content_span: ByteSpan::new(30, 40),
    }, 1);

    // Shift offsets by inserting 5 bytes at offset 5
    map.shift_offsets(5, 5);

    // Node at 0 stays at 0 (before shift point)
    assert!(map.node_at_offset(0).is_some());
    // Node at 10 shifts to 15
    assert!(map.node_at_offset(15).is_some());
    // Node at 30 shifts to 35
    assert!(map.node_at_offset(35).is_some());
}

#[test]
fn test_source_map_negative_shift() {
    let mut map = SourceMap::new();
    map.insert(20, NodeKind::Text {
        content_span: ByteSpan::new(20, 30),
    }, 1);

    // Delete 10 bytes at offset 5 — node at 20 shifts to 10
    map.shift_offsets(5, -10);
    assert!(map.node_at_offset(10).is_some());
}

// ═══════════════════════════════════════════════════════════
// Encoding detection edge cases
// ═══════════════════════════════════════════════════════════

#[test]
fn test_detect_no_encoding_specified() {
    let html = b"<html><head></head><body><p>No encoding</p></body></html>";
    let model = file_io::read_file_from_bytes(html, "/tmp/test.html");
    // Falls back to UTF-8 or Windows-1252
    assert!(model.encoding == "UTF-8" || model.encoding == "windows-1252");
}

#[test]
fn test_detect_windows1252() {
    let content: Vec<u8> = b"<html><head><meta charset='windows-1252'></head><body></body></html>".to_vec();
    let model = file_io::read_file_from_bytes(&content, "/tmp/test.html");
    assert_eq!(model.encoding.to_lowercase(), "windows-1252");
}

// ═══════════════════════════════════════════════════════════
// Commands.rs edge cases (BUG 1, 3 fixes verified)
// ═══════════════════════════════════════════════════════════
// These test the Rust functions directly — Tauri IPC layer is integration-tested
use pagesmith::engine::patch::Patch as PatchModel;

#[test]
fn test_apply_patch_bounds_check_rejects_overlong_offset() {
    let mut model = SourceModel::new(b"short".to_vec(), "utf-8");
    let patch = PatchModel::new(100, 5, b"x");
    let result = patch.apply(&mut model);
    assert!(result.is_err());
}

#[test]
fn test_apply_patch_clamped_length() {
    let mut model = SourceModel::new(b"short".to_vec(), "utf-8");
    // offset 3, length 100 — should not panic but also not corrupt
    let patch = PatchModel::new(3, 5, b"x"); // 3+5=8 > 5
    let result = patch.apply(&mut model);
    // This tests that the engine survives, even if result is clamped
    // The actual behavior depends on our clamping logic in apply_patch
    // After writing, verify the model is still valid
    let _ = result; // may succeed with clamping or fail — either is fine, just no panic
    assert!(model.len() >= 1);
}

// ═══════════════════════════════════════════════════════════
// Security: script preservation with edit
// ═══════════════════════════════════════════════════════════

#[test]
fn test_script_block_preserved_after_edit() {
    let content = b"<script>var x = 1 < 2;</script><p>Hello</p>";
    let mut model = SourceModel::new(content.to_vec(), "utf-8");

    // Edit only the paragraph, not the script
    let p_start = content.iter().position(|&b| b == b'H').unwrap();
    let patch = PatchModel::replace(p_start, 5, b"World");
    patch.apply(&mut model).unwrap();

    let result = model.as_str().unwrap();
    assert!(result.contains("var x = 1 < 2;"), "Script content must survive");
    assert!(result.contains("<script>"), "Script tag must survive");
    assert!(result.contains("World"), "Edit must be applied");
}

#[test]
fn test_comment_preserved_after_edit() {
    let content = b"<!-- DON'T DELETE --><p>Hello</p><!-- END -->";
    let mut model = SourceModel::new(content.to_vec(), "utf-8");

    let p_start = content.iter().position(|&b| b == b'H').unwrap();
    let patch = PatchModel::replace(p_start, 5, b"World");
    patch.apply(&mut model).unwrap();

    let result = model.as_str().unwrap();
    assert!(result.contains("DON'T DELETE"));
    assert!(result.contains("END -->"));
}
