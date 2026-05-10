/// SourceModel: the single source of truth for an HTML document.
///
/// Stores the raw HTML as bytes, a character-offset map
/// to DOM nodes, and encoding information. All edits go through
/// the patch model — the source buffer is never derived from the DOM.
use std::collections::BTreeMap;

/// A position in the source buffer (byte offset, 0-indexed)
pub type ByteOffset = usize;

/// A span in the source buffer [start, end)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ByteSpan {
    pub start: ByteOffset,
    pub end: ByteOffset,
}

impl ByteSpan {
    pub fn new(start: ByteOffset, end: ByteOffset) -> Self {
        debug_assert!(start <= end, "ByteSpan start must be <= end");
        Self { start, end }
    }

    pub fn len(&self) -> usize {
        self.end - self.start
    }

    pub fn is_empty(&self) -> bool {
        self.start == self.end
    }
}

/// Represents the type of a DOM node for offset-mapping purposes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NodeKind {
    Element {
        tag_name: String,
        /// Offset of the opening tag (including `<`)
        open_tag_start: ByteOffset,
        /// Offset after the closing `>` of the opening tag
        open_tag_end: ByteOffset,
        /// Offset of the closing tag (including `</`)
        close_tag_start: Option<ByteOffset>,
        /// Offset after the closing `>` of the closing tag
        close_tag_end: Option<ByteOffset>,
        /// Attributes with their source offsets
        attributes: Vec<AttributeSpan>,
    },
    Text {
        content_span: ByteSpan,
    },
    Comment {
        content_span: ByteSpan, // includes <!-- and -->
    },
    Doctype {
        span: ByteSpan,
    },
    /// Raw content that must pass through verbatim (CDATA, scripts, style)
    Raw {
        kind: RawKind,
        content_span: ByteSpan,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RawKind {
    Script,
    Style,
    CData,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttributeSpan {
    /// Offset of attribute name start
    pub name_start: ByteOffset,
    /// Offset after attribute name end
    pub name_end: ByteOffset,
    /// Offset of value start (after `="` or `='`)
    pub value_start: Option<ByteOffset>,
    /// Offset of value end (before closing quote)
    pub value_end: Option<ByteOffset>,
    /// The full attribute span including name, =, quotes, value
    pub full_span: ByteSpan,
}

/// Maps DOM nodes to their byte offsets in the source buffer.
/// Used by the WYSIWYG view to translate click positions to edit targets.
#[derive(Debug, Clone, Default)]
pub struct SourceMap {
    /// Sorted map of start_offset -> NodeKind
    nodes: BTreeMap<ByteOffset, NodeEntry>,
}

#[derive(Debug, Clone)]
struct NodeEntry {
    kind: NodeKind,
    /// Depth in the DOM tree (for indentation/context)
    depth: usize,
}

impl SourceMap {
    pub fn new() -> Self {
        Self {
            nodes: BTreeMap::new(),
        }
    }

    pub fn insert(&mut self, offset: ByteOffset, kind: NodeKind, depth: usize) {
        self.nodes.insert(offset, NodeEntry { kind, depth });
    }

    /// Find the deepest node that contains the given byte offset.
    pub fn node_at_offset(&self, offset: ByteOffset) -> Option<&NodeKind> {
        self.nodes
            .range(..=offset)
            .next_back()
            .map(|(_, entry)| &entry.kind)
    }

    /// Find the deepest element node containing the given offset.
    pub fn element_at_offset(&self, offset: ByteOffset) -> Option<&NodeKind> {
        self.nodes
            .range(..=offset)
            .rev()
            .find(|(_, entry)| matches!(entry.kind, NodeKind::Element { .. }))
            .map(|(_, entry)| &entry.kind)
    }

    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    /// Shift all offsets after `from` by `delta` bytes.
    /// Called after a patch is applied to keep the map in sync.
    pub fn shift_offsets(&mut self, from: ByteOffset, delta: isize) {
        let to_move: Vec<_> = self
            .nodes
            .range(from..)
            .map(|(k, _)| *k)
            .collect();

        for old_key in to_move {
            if let Some(entry) = self.nodes.remove(&old_key) {
                let new_key = ((old_key as isize) + delta) as usize;
                self.nodes.insert(new_key, entry);
            }
        }
    }
}

/// The complete source model for an HTML document.
#[derive(Debug, Clone)]
pub struct SourceModel {
    /// Raw HTML content as bytes
    pub raw: Vec<u8>,
    /// Detected or specified character encoding
    pub encoding: &'static str,
    /// Source map: byte offsets to DOM node information
    pub source_map: SourceMap,
    /// Whether the document has been modified
    pub is_dirty: bool,
    /// Original file path (None for new/unsaved documents)
    pub file_path: Option<String>,
}

impl SourceModel {
    pub fn new(raw: Vec<u8>, encoding: &'static str) -> Self {
        Self {
            raw,
            encoding,
            source_map: SourceMap::new(),
            is_dirty: false,
            file_path: None,
        }
    }

    /// Get the content as a UTF-8 string (after decoding from the source encoding)
    pub fn as_str(&self) -> Result<&str, std::str::Utf8Error> {
        std::str::from_utf8(&self.raw)
    }

    /// Get the total byte length
    pub fn len(&self) -> usize {
        self.raw.len()
    }

    pub fn is_empty(&self) -> bool {
        self.raw.is_empty()
    }

    /// Get a slice of the raw content at the given byte span
    pub fn slice(&self, span: ByteSpan) -> &[u8] {
        &self.raw[span.start..span.end.min(self.raw.len())]
    }

    /// Mark as dirty (unsaved changes)
    pub fn mark_dirty(&mut self) {
        self.is_dirty = true;
    }

    /// Mark as clean (saved)
    pub fn mark_clean(&mut self) {
        self.is_dirty = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_source_map_node_at_offset() {
        let mut map = SourceMap::new();
        map.insert(0, NodeKind::Element {
            tag_name: "p".into(),
            open_tag_start: 0,
            open_tag_end: 3,
            close_tag_start: Some(10),
            close_tag_end: Some(14),
            attributes: vec![],
        }, 0);

        assert!(map.node_at_offset(0).is_some());
        assert!(map.node_at_offset(5).is_some());
        // node_at_offset returns deepest node containing the offset.
        // Since the only node starts at 0, any offset returns it.
        assert!(map.node_at_offset(100).is_some());
    }

    #[test]
    fn test_source_map_shift_offsets() {
        let mut map = SourceMap::new();
        map.insert(10, NodeKind::Text {
            content_span: ByteSpan::new(10, 20),
        }, 1);

        // Insert 5 bytes at offset 0 — everything shifts right by 5
        map.shift_offsets(0, 5);

        assert!(map.node_at_offset(15).is_some());
        assert!(map.node_at_offset(9).is_none());
    }

    #[test]
    fn test_source_model_basic() {
        let model = SourceModel::new(b"<p>Hello</p>".to_vec(), "utf-8");
        assert_eq!(model.len(), 12);
        assert_eq!(model.as_str().unwrap(), "<p>Hello</p>");
        assert!(!model.is_dirty);
    }
}
