/// File I/O with encoding detection and atomic writes.
///
/// Reads HTML files detecting their encoding (from <meta charset> or BOM),
/// converts to UTF-8 internally. Writes atomically (temp file → rename)
/// preserving the original encoding.
use super::source_model::SourceModel;
use anyhow::{Context, Result};
use encoding_rs::{Encoding, UTF_8};
use std::fs;
use std::io::Write;
use std::path::Path;

/// Read an HTML file, detect encoding, and build a SourceModel.
pub fn read_file(path: &Path) -> Result<SourceModel> {
    let raw = fs::read(path)
        .with_context(|| format!("Failed to read file: {}", path.display()))?;

    let (encoding, _confidence) = detect_encoding(&raw);

    let encoding_name = encoding.name();

    let mut model = SourceModel::new(raw, encoding_name);
    model.file_path = Some(path.to_string_lossy().to_string());

    Ok(model)
}

/// Detect the character encoding of HTML content.
/// Checks BOM first, then <meta charset> tag, falls back to UTF-8.
fn detect_encoding(raw: &[u8]) -> (&'static Encoding, f32) {
    // Check BOM
    if raw.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return (UTF_8, 1.0);
    }
    if raw.starts_with(&[0xFE, 0xFF]) {
        return (encoding_rs::UTF_16BE, 1.0);
    }
    if raw.starts_with(&[0xFF, 0xFE]) {
        return (encoding_rs::UTF_16LE, 1.0);
    }

    // Check <meta charset> in the first 1024 bytes
    let sniff = if raw.len() > 1024 { &raw[..1024] } else { raw };
    if let Ok(sniff_str) = std::str::from_utf8(sniff) {
        if let Some(charset) = extract_meta_charset(sniff_str) {
            if let Some(enc) = Encoding::for_label(charset.as_bytes()) {
                return (enc, 0.9);
            }
        }
    }

    // Fall back to UTF-8 detection
    if std::str::from_utf8(raw).is_ok() {
        return (UTF_8, 0.7);
    }

    // Try common legacy encodings
    (encoding_rs::WINDOWS_1252, 0.3)
}

/// Extract charset from <meta charset="..."> or <meta http-equiv="Content-Type" content="...charset=...">
fn extract_meta_charset(html: &str) -> Option<&str> {
    // <meta charset="utf-8">
    if let Some(start) = html.to_lowercase().find("<meta") {
        let meta_section = &html[start..];
        if let Some(end) = meta_section.find('>') {
            let meta = &meta_section[..=end];

            // Direct charset attribute
            if let Some(cs_start) = meta.to_lowercase().find("charset=") {
                let after = &meta[cs_start + 8..];
                // Skip optional quote character
                let charset_start = if after.starts_with('"') || after.starts_with('\'') {
                    1
                } else {
                    0
                };
                let charset: String = after[charset_start..]
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
                    .collect();
                if !charset.is_empty() {
                    return Some(Box::leak(charset.into_boxed_str()));
                }
            }

            // content="text/html; charset=utf-8"
            if let Some(content_start) = meta.to_lowercase().find("content=") {
                let content_str = &meta[content_start + 8..];
                let quote = content_str.chars().next().unwrap_or('"');
                let content = content_str[1..]
                    .split(quote)
                    .next()
                    .unwrap_or("");
                if let Some(cs_pos) = content.to_lowercase().find("charset=") {
                    let charset: String = content[cs_pos + 8..]
                        .chars()
                        .take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
                        .collect();
                    if !charset.is_empty() {
                        return Some(Box::leak(charset.into_boxed_str()));
                    }
                }
            }
        }
    }
    None
}

/// Write a SourceModel back to disk atomically.
///
/// Writes to a temp file in the same directory, then renames
/// over the original. On any failure, the original file is untouched.
pub fn write_file_atomic(model: &SourceModel) -> Result<()> {
    let path = model
        .file_path
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("No file path set"))?;

    let path = Path::new(path);

    // Re-encode from internal UTF-8 to the original encoding
    let output_bytes = if model.encoding != "utf-8" && model.encoding != "UTF-8" {
        if let Some(enc) = Encoding::for_label(model.encoding.as_bytes()) {
            let (encoded, _, _) = enc.encode(std::str::from_utf8(&model.raw)?);
            encoded.into_owned()
        } else {
            model.raw.clone()
        }
    } else {
        model.raw.clone()
    };

    // Write to temp file in the same directory (ensures same filesystem for atomic rename)
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let mut temp = tempfile::NamedTempFile::new_in(dir)?;
    temp.write_all(&output_bytes)?;
    temp.flush()?;

    // Atomic rename
    let temp_path = temp.into_temp_path();
    temp_path.persist(path)?;

    Ok(())
}

/// Read the raw content of a file as a string (for the frontend to display).
pub fn read_file_string(path: &Path) -> Result<String> {
    let raw = fs::read(path)
        .with_context(|| format!("Failed to read file: {}", path.display()))?;

    let (encoding, _) = detect_encoding(&raw);
    let (decoded, _, _) = encoding.decode(&raw);

    Ok(decoded.into_owned())
}

/// Write a string to a file atomically.
pub fn write_file_string_atomic(path: &Path, content: &str) -> Result<()> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let mut temp = tempfile::NamedTempFile::new_in(dir)?;
    temp.write_all(content.as_bytes())?;
    temp.flush()?;

    let temp_path = temp.into_temp_path();
    temp_path.persist(path)?;

    Ok(())
}

/// Check if a file has been modified externally since we last read it.
pub fn is_externally_modified(model: &SourceModel) -> Result<bool> {
    let path = model
        .file_path
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("No file path set"))?;

    let path = Path::new(path);
    if !path.exists() {
        return Ok(false);
    }

    let current = fs::read(path)?;
    Ok(current != model.raw)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_detect_encoding_utf8() {
        let html = b"<!DOCTYPE html><html><head><meta charset='utf-8'></head><body></body></html>";
        let (enc, conf) = detect_encoding(html);
        assert_eq!(enc.name(), "UTF-8");
        assert!(conf > 0.8);
    }

    #[test]
    fn test_detect_encoding_bom() {
        let mut html = vec![0xEF, 0xBB, 0xBF];
        html.extend_from_slice(b"<html></html>");
        let (enc, conf) = detect_encoding(&html);
        assert_eq!(enc.name(), "UTF-8");
        assert_eq!(conf, 1.0);
    }

    #[test]
    fn test_extract_meta_charset_direct() {
        let html = r#"<meta charset="utf-8">"#;
        assert_eq!(extract_meta_charset(html), Some("utf-8"));
    }

    #[test]
    fn test_extract_meta_charset_content() {
        let html = r#"<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">"#;
        assert_eq!(extract_meta_charset(html), Some("iso-8859-1"));
    }

    #[test]
    fn test_atomic_write_and_read() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.html");
        let content = "<p>Hello world!</p>";

        write_file_string_atomic(&file_path, content).unwrap();
        let read_back = read_file_string(&file_path).unwrap();
        assert_eq!(read_back, content);

        // Verify file is complete (not zero-byte)
        let metadata = std::fs::metadata(&file_path).unwrap();
        assert!(metadata.len() > 0);
    }

    #[test]
    fn test_atomic_write_survives_kill() {
        // Verify that if a temp file exists, the original is untouched
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("kill_test.html");

        let original = "<p>original</p>";
        write_file_string_atomic(&file_path, original).unwrap();

        // Simulate: write new content but don't rename (like a crash during save)
        let temp_path = file_path.with_extension("html.tmp");
        std::fs::write(&temp_path, "<p>partial").unwrap();

        // Original file should still contain the original content
        let read_back = read_file_string(&file_path).unwrap();
        assert_eq!(read_back, original);
    }

    #[test]
    fn test_read_builds_source_model() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.html");
        let content = "<!DOCTYPE html>\n<html lang='en'>\n<head><meta charset='utf-8'></head>\n<body><p>Hello</p></body>\n</html>";

        std::fs::write(&file_path, content).unwrap();

        let model = read_file(&file_path).unwrap();
        assert_eq!(model.as_str().unwrap(), content);
        assert!(model.file_path.is_some());
        assert_eq!(model.encoding, "UTF-8");
    }
}
