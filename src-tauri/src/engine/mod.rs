/// PageSmith's surgical HTML editing engine.
///
/// Architecture (ADR-003):
/// 1. SourceModel: raw HTML string + offset map to DOM nodes
/// 2. Patch model: (offset, length, replacement) — surgical, lossless
/// 3. File I/O: read with encoding detection, atomic write
/// 4. Parser: lossless HTML parsing using html5ever with source-map generation
///
/// The source buffer is the source of truth. The WYSIWYG view is derived.
/// Never derive source from the DOM. Surgery over reconstruction.
pub mod source_model;
pub mod patch;
pub mod file_io;
pub mod parser;
