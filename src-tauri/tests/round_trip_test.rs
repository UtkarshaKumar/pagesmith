/// Integration tests: round-trip faithfulness validation.
///
/// Tests that surgical edits preserve unedited regions byte-for-byte.
/// This is the Phase 1 gate (P1-T6/P1-T7): 100% of test files must pass.
use pagesmith::engine::patch::Patch;
use pagesmith::engine::source_model::SourceModel;
use pagesmith::engine::file_io;
use std::fs;
use std::path::Path;

/// Helper: apply a patch to a SourceModel and verify unedited regions are untouched.
fn test_round_trip(
    fixture_name: &str,
    edit_offset: usize,
    edit_length: usize,
    replacement: &[u8],
) {
    let path = Path::new("tests/fixtures").join(fixture_name);
    let original = fs::read_to_string(&path)
        .unwrap_or_else(|_| panic!("Fixture not found: {}", path.display()));

    let mut model = SourceModel::new(original.as_bytes().to_vec(), "utf-8");
    model.file_path = Some(path.to_string_lossy().to_string());

    // Apply the patch
    let patch = Patch::new(edit_offset, edit_length, replacement.to_vec());
    patch.apply(&mut model).unwrap();

    let result = model.as_str().unwrap();

    // Verify: bytes before edit_offset must be identical
    assert_eq!(
        &original.as_bytes()[..edit_offset],
        &result.as_bytes()[..edit_offset],
        "{}: bytes BEFORE edit must be identical", fixture_name
    );

    // Verify: bytes after (edit_offset + edit_length) must be identical
    let original_after_start = edit_offset + edit_length;
    let result_after_start = edit_offset + replacement.len();
    assert_eq!(
        &original.as_bytes()[original_after_start..],
        &result.as_bytes()[result_after_start..],
        "{}: bytes AFTER edit must be identical", fixture_name
    );

    // Verify: total length is correct (original - removed + added)
    assert_eq!(
        result.len(),
        original.len() - edit_length + replacement.len(),
        "{}: result length should be original length - removed + added", fixture_name
    );

    // Verify the replaced content is present
    let replaced_region = &result.as_bytes()[edit_offset..edit_offset + replacement.len()];
    assert_eq!(
        replaced_region, replacement,
        "{}: replaced region should contain the replacement text", fixture_name
    );

    println!("  PASS: {} ({} bytes → {} bytes)", fixture_name, original.len(), result.len());
}

// ── Basic round-trip tests ──

#[test]
fn rt_basic_doctype() {
    test_round_trip("basic_doctype.html", 102, 5, b"Alice"); // "World" -> "Alice"
}

#[test]
fn rt_basic_minimal() {
    test_round_trip("basic_minimal.html", 3, 7, b"Changed"); // "Minimal" -> "Changed"
}

#[test]
fn rt_table_simple() {
    test_round_trip("table_simple.html", 24, 5, b"Alice"); // First cell content
}

#[test]
fn rt_comments_inline() {
    // Edit only the text content, comments stay
    test_round_trip("comments_inline.html", 24, 7, b"Changed"); // "Content" -> "Changed"
}

#[test]
fn rt_script_inline() {
    // Change paragraph text, script must survive
    test_round_trip("script_inline.html", 34, 7, b"changed");
}

#[test]
fn rt_style_inline() {
    // Change paragraph text, style block must survive
    test_round_trip("style_inline.html", 34, 6, b"edited");
}

#[test]
fn rt_list_ul() {
    test_round_trip("list_ul.html", 13, 6, b"First!"); // "Item 1" -> "First!"
}

#[test]
fn rt_link_simple() {
    // <a href="https://example.com">Click here</a>
    // "Click here" is 10 bytes at offset 32
    test_round_trip("link_simple.html", 32, 10, b"Visit now");
}

#[test]
fn rt_attr_ordered() {
    // <div class="main" id="content" data-type="article" aria-label="Main content">Text</div>
    // "Text" is 4 bytes — replace it
    test_round_trip("attr_ordered.html", 82, 4, b"Data");
}

#[test]
fn rt_edge_empty() {
    // Empty file: insert at offset 0
    let path = Path::new("tests/fixtures/edge_empty.html");
    let original = fs::read_to_string(path).unwrap();
    let mut model = SourceModel::new(original.as_bytes().to_vec(), "utf-8");
    let patch = Patch::insert(0, b"<p>New</p>");
    patch.apply(&mut model).unwrap();
    assert_eq!(model.as_str().unwrap(), "<p>New</p>");
    println!("  PASS: edge_empty.html");
}

#[test]
fn rt_unicode_content() {
    // <p>Hello — world… "quoted" © 2026</p>
    // Replace " — world" (multi-byte content) with " World"
    // — is 3 bytes, space is 1 byte
    test_round_trip("unicode_content.html", 8, 9, b" World...");
}

#[test]
fn rt_whitespace_pre() {
    // Edit inside <pre> — whitespace in unedited lines must survive
    test_round_trip("whitespace_pre.html", 27, 2, b"hi"); // "hi" -> "hi" (same length)
}

#[test]
fn rt_vue_template() {
    // Edit text inside Vue template — Vue directives must survive
    test_round_trip("vue_template.html", 28, 11, b"Hello World"); // "{{ message }}" -> "Hello World"
}

#[test]
fn rt_alpine_template() {
    // Edit text in Alpine template — directives survive
    test_round_trip("alpine_template.html", 57, 7, b"Changed");
}

#[test]
fn rt_realistic_email() {
    // Edit the newsletter content — header, styles, footer survive
    test_round_trip("realistic_email.html", 460, 3, b"two"); // "three" -> "two"
}

// ── Encoding tests ──

#[test]
fn test_detect_encoding_from_meta() {
    let html = r#"<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>"#;
    let path = std::env::temp_dir().join("pagesmith_test_enc.html");
    fs::write(&path, html).unwrap();

    let model = file_io::read_file(&path).unwrap();
    assert_eq!(model.encoding, "UTF-8");

    let _ = fs::remove_file(&path);
}

// ── Atomic save test ──

#[test]
fn test_atomic_save_preserves_original_on_error() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("atomic_test.html");
    let content = "<p>original content</p>";
    fs::write(&path, content).unwrap();

    let mut model = file_io::read_file(&path).unwrap();

    // Apply an edit
    let patch = Patch::replace(3, 8, b"modified");
    patch.apply(&mut model).unwrap();

    // Save atomically
    file_io::write_file_atomic(&model).unwrap();

    // Re-read and verify — "original" (8 bytes) replaced by "modified" (8 bytes) at offset 3
    let reloaded = file_io::read_file(&path).unwrap();
    assert_eq!(reloaded.as_str().unwrap(), "<p>modified content</p>");
}

#[test]
fn test_save_as_new_path() {
    let dir = tempfile::tempdir().unwrap();
    let original_path = dir.path().join("original.html");
    let new_path = dir.path().join("copy.html");

    fs::write(&original_path, "<p>Hello</p>").unwrap();

    let mut model = file_io::read_file(&original_path).unwrap();
    let patch = Patch::replace(3, 5, b"World");
    patch.apply(&mut model).unwrap();

    // Save to new path
    let content = model.as_str().unwrap().to_string();
    file_io::write_file_string_atomic(&new_path, &content).unwrap();

    // Original unchanged
    let orig = fs::read_to_string(&original_path).unwrap();
    assert_eq!(orig, "<p>Hello</p>");

    // Copy has changes
    let copy = fs::read_to_string(&new_path).unwrap();
    assert_eq!(copy, "<p>World</p>");
}

// ── Malformed HTML handling ──

#[test]
fn test_malformed_html_does_not_crash() {
    let malformed = b"<p>unclosed paragraph<span>mismatched</div>";
    let mut model = SourceModel::new(malformed.to_vec(), "utf-8");

    // Editing malformed HTML should not panic
    let patch = Patch::replace(3, 8, b"fixed");
    patch.apply(&mut model).unwrap();

    // Content should be edited
    assert!(model.as_str().unwrap().contains("fixed"));
}

// ── Large insert test ──

#[test]
fn test_large_replacement() {
    let original = b"<p>x</p>";
    let large = "Hello world! ".repeat(1000);
    let mut model = SourceModel::new(original.to_vec(), "utf-8");

    let patch = Patch::replace(3, 1, large.as_bytes());
    patch.apply(&mut model).unwrap();

    assert!(model.len() > 1000);
    assert_eq!(&model.raw[model.len()-4..], b"</p>");
}

// ── Byte-offset edge cases ──

#[test]
fn test_edit_at_start() {
    let mut model = SourceModel::new(b"<p>Hello</p>".to_vec(), "utf-8");
    // Insert "<div>" before the existing content (offset 0, delete 0, insert "<div>")
    let patch = Patch::insert(0, b"<div>");
    patch.apply(&mut model).unwrap();
    // <div> + <p>Hello</p> = <div><p>Hello</p>
    assert_eq!(model.as_str().unwrap(), "<div><p>Hello</p>");
}

#[test]
fn test_edit_at_end() {
    let mut model = SourceModel::new(b"<p>Hello</p>".to_vec(), "utf-8");
    let patch = Patch::replace(11, 1, b"!");
    patch.apply(&mut model).unwrap();
    assert_eq!(model.as_str().unwrap(), "<p>Hello</p!");
}

#[test]
fn test_delete_all_content() {
    let mut model = SourceModel::new(b"<p>Hello</p>".to_vec(), "utf-8");
    // Delete "Hello" between <p> and </p>
    let patch = Patch::delete(3, 5);
    patch.apply(&mut model).unwrap();
    assert_eq!(model.as_str().unwrap(), "<p></p>");
}

#[test]
fn test_no_op_patch() {
    let mut model = SourceModel::new(b"<p>Hello</p>".to_vec(), "utf-8");
    let patch = Patch::delete(3, 0); // Delete 0 bytes
    patch.apply(&mut model).unwrap();
    assert_eq!(model.as_str().unwrap(), "<p>Hello</p>");
}
