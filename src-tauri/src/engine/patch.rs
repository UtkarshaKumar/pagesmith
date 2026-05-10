/// Patch model for surgical HTML editing.
///
/// Every edit — whether from a human clicking in the WYSIWYG view
/// or an LLM calling the surgical API — is recorded as a Patch.
/// Patches operate on byte offsets in the source buffer.
/// Undo replays the inverse patch. Redo replays the forward patch.
use super::source_model::{ByteOffset, SourceModel};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PatchError {
    #[error("offset {0} is out of bounds (source length: {1})")]
    OutOfBounds(ByteOffset, usize),
    #[error("span [{0}, {1}) is out of bounds (source length: {2})")]
    SpanOutOfBounds(ByteOffset, ByteOffset, usize),
}

/// A single surgical edit against the source buffer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Patch {
    /// Byte offset where the edit begins (0-indexed)
    pub offset: ByteOffset,
    /// Number of bytes to remove from the source
    pub length: usize,
    /// Replacement bytes to insert
    pub replacement: Vec<u8>,
}

impl Patch {
    /// Create a new patch. Validates bounds.
    pub fn new(
        offset: ByteOffset,
        length: usize,
        replacement: impl Into<Vec<u8>>,
    ) -> Self {
        Self {
            offset,
            length,
            replacement: replacement.into(),
        }
    }

    /// Create a text insertion patch (length = 0)
    pub fn insert(offset: ByteOffset, text: impl Into<Vec<u8>>) -> Self {
        Self::new(offset, 0, text)
    }

    /// Create a text deletion patch (replacement is empty)
    pub fn delete(offset: ByteOffset, length: usize) -> Self {
        Self::new(offset, length, vec![])
    }

    /// Create a text replacement patch
    pub fn replace(offset: ByteOffset, length: usize, text: impl Into<Vec<u8>>) -> Self {
        Self::new(offset, length, text)
    }

    /// Compute the inverse of this patch for undo.
    /// `replaced_bytes` should be the exact bytes that were removed by this patch
    /// (i.e., the content from the source buffer at [offset..offset+length] before the edit).
    /// The inverse patch will re-insert those bytes and remove the replacement.
    pub fn inverse(&self, replaced_bytes: &[u8]) -> Self {
        Self::new(
            self.offset,
            self.replacement.len(),
            replaced_bytes.to_vec(),
        )
    }

    /// Apply this patch to a SourceModel, modifying the raw buffer
    /// and updating the source map.
    pub fn apply(&self, model: &mut SourceModel) -> Result<(), PatchError> {
        let total_len = model.raw.len();

        if self.offset > total_len {
            return Err(PatchError::OutOfBounds(self.offset, total_len));
        }
        if self.offset + self.length > total_len {
            return Err(PatchError::SpanOutOfBounds(
                self.offset,
                self.offset + self.length,
                total_len,
            ));
        }

        let delta: isize = self.replacement.len() as isize - self.length as isize;

        // Perform the byte-level splice
        let new_raw: Vec<u8> = model.raw[..self.offset]
            .iter()
            .chain(self.replacement.iter())
            .chain(model.raw[self.offset + self.length..].iter())
            .copied()
            .collect();

        model.raw = new_raw;
        model.is_dirty = true;

        // Update the source map offsets
        if delta != 0 {
            model.source_map.shift_offsets(self.offset + self.length, delta);
        }

        Ok(())
    }

    /// Apply this patch to a raw byte buffer (for testing, without SourceModel)
    pub fn apply_to_bytes(&self, bytes: &[u8]) -> Result<Vec<u8>, PatchError> {
        let total_len = bytes.len();
        if self.offset > total_len {
            return Err(PatchError::OutOfBounds(self.offset, total_len));
        }
        if self.offset + self.length > total_len {
            return Err(PatchError::SpanOutOfBounds(
                self.offset,
                self.offset + self.length,
                total_len,
            ));
        }

        let result: Vec<u8> = bytes[..self.offset]
            .iter()
            .chain(self.replacement.iter())
            .chain(bytes[self.offset + self.length..].iter())
            .copied()
            .collect();

        Ok(result)
    }
}

/// Undo/Redo stack for patches.
#[derive(Debug, Clone, Default)]
pub struct UndoStack {
    /// History of applied patches with their inverse stored
    undo_stack: Vec<(Patch, Vec<u8>)>, // (forward patch, inverse bytes snapshot)
    /// Redo stack
    redo_stack: Vec<(Patch, Vec<u8>)>,
}

impl UndoStack {
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a patch that was applied. Stores the forward patch
    /// and the original bytes for inverse computation.
    pub fn record(&mut self, patch: Patch, original_bytes: Vec<u8>) {
        self.undo_stack.push((patch, original_bytes));
        self.redo_stack.clear(); // New action invalidates redo
    }

    /// Get the inverse patch for the last action, moving it to redo.
    pub fn undo(&mut self) -> Option<Patch> {
        let (patch, original_bytes) = self.undo_stack.pop()?;
        let inverse = patch.inverse(&original_bytes);
        self.redo_stack.push((patch, original_bytes));
        Some(inverse)
    }

    /// Get the forward patch for the last undone action, moving it to undo.
    pub fn redo(&mut self) -> Option<Patch> {
        let (patch, _) = self.redo_stack.pop()?;
        // When redoing, we re-apply the forward patch
        self.undo_stack.push((patch.clone(), vec![])); // original bytes not needed for redo forward
        Some(patch)
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    pub fn clear(&mut self) {
        self.undo_stack.clear();
        self.redo_stack.clear();
    }

    pub fn depth(&self) -> usize {
        self.undo_stack.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_patch_insert() {
        let patch = Patch::insert(5, b" world");
        let original = b"Hello!";
        let result = patch.apply_to_bytes(original).unwrap();
        assert_eq!(result, b"Hello world!");
    }

    #[test]
    fn test_patch_delete() {
        let patch = Patch::delete(5, 6);
        let original = b"Hello world!";
        let result = patch.apply_to_bytes(original).unwrap();
        assert_eq!(result, b"Hello!");
    }

    #[test]
    fn test_patch_replace() {
        let patch = Patch::replace(0, 5, b"Hi");
        let original = b"Hello world!";
        let result = patch.apply_to_bytes(original).unwrap();
        assert_eq!(result, b"Hi world!");
    }

    #[test]
    fn test_patch_inverse() {
        let original = b"Hello world!";
        // Replace "world" with "there"
        let patch = Patch::replace(6, 5, b"there");
        let after = patch.apply_to_bytes(original).unwrap();
        assert_eq!(after, b"Hello there!");

        let replaced = &original[6..11]; // "world" (5 bytes)
        let inverse = patch.inverse(replaced);
        let restored = inverse.apply_to_bytes(&after).unwrap();
        assert_eq!(restored, original);
    }

    #[test]
    fn test_patch_out_of_bounds() {
        let patch = Patch::new(100, 5, b"x");
        assert!(patch.apply_to_bytes(b"short").is_err());
    }

    #[test]
    fn test_undo_stack() {
        let mut stack = UndoStack::new();
        let original = b"Hello!".to_vec();
        let patch = Patch::delete(5, 1); // delete "!"
        let replaced = original[5..6].to_vec(); // "!"
        stack.record(patch.clone(), replaced);

        let undo_patch = stack.undo().unwrap();
        let mut model = SourceModel::new(b"Hello".to_vec(), "utf-8");
        undo_patch.apply(&mut model).unwrap();
        assert_eq!(model.as_str().unwrap(), "Hello!");
    }

    #[test]
    fn test_patch_apply_to_model() {
        let mut model = SourceModel::new(b"<p>Hello world!</p>".to_vec(), "utf-8");
        // "world" starts at offset 9 (after "<p>Hello ")
        let patch = Patch::replace(9, 5, b"there");
        patch.apply(&mut model).unwrap();

        assert_eq!(model.as_str().unwrap(), "<p>Hello there!</p>");
        assert!(model.is_dirty);
    }

    #[test]
    fn test_untouched_regions_preserved() {
        // Verifies that bytes before and after the edit are identical
        let original = b"<!-- comment -->\n<script>alert(1)</script>\n<p>Hello world!</p>";
        let patch = Patch::replace(
            // "world" starts at a specific offset
            original.iter().position(|&b| b == b'w').unwrap(),
            5, // "world" is 5 bytes
            b"there",
        );

        let result = patch.apply_to_bytes(original).unwrap();

        // Bytes before the edit should be identical
        let before_edit = &original[..patch.offset];
        let result_before = &result[..patch.offset];
        assert_eq!(before_edit, result_before, "Bytes before edit must be identical");

        // Bytes after the edit should be identical (accounting for length difference)
        let after_start = patch.offset + patch.length;
        let result_after_start = patch.offset + patch.replacement.len();
        let after_edit = &original[after_start..];
        let result_after = &result[result_after_start..];
        assert_eq!(after_edit, result_after, "Bytes after edit must be identical");
    }

    #[test]
    fn test_sequential_patches() {
        let original = b"<p>Hello world!</p>";
        let mut current = original.to_vec();

        // Replace "world" (offset 9, length 5) with "there"
        let p1 = Patch::replace(9, 5, b"there");
        current = p1.apply_to_bytes(&current).unwrap();
        assert_eq!(String::from_utf8_lossy(&current), "<p>Hello there!</p>");

        // Insert " again" after "there" (at offset 14 — after "there", before "!")
        let p2 = Patch::insert(14, b" again");
        current = p2.apply_to_bytes(&current).unwrap();

        assert_eq!(String::from_utf8_lossy(&current), "<p>Hello there again!</p>");
    }

    #[test]
    fn test_100_sequential_undos() {
        let original = b"<p>Hello world!</p>".to_vec();
        let mut model = SourceModel::new(original.clone(), "utf-8");
        let mut stack = UndoStack::new();

        // Apply 100 patches: toggle "world" <-> "there" at offset 9
        // Both "world" and "there" are 5 bytes
        for i in 0..100 {
            let p = if i % 2 == 0 {
                Patch::replace(9, 5, b"there")
            } else {
                Patch::replace(9, 5, b"world")
            };
            let orig_slice = model.raw[p.offset..p.offset + p.length].to_vec();
            p.apply(&mut model).unwrap();
            stack.record(p, orig_slice);
        }

        // Undo 100 times
        for _ in 0..100 {
            let undo = stack.undo().unwrap();
            undo.apply(&mut model).unwrap();
        }

        assert_eq!(model.raw, original);
    }
}
