/// Lossless HTML parser using html5ever.
///
/// Produces a SourceMap that maps byte offsets to DOM node information.
use super::source_model::{ByteOffset, ByteSpan, NodeKind, SourceMap};
use html5ever::tokenizer::{TokenSink, TokenSinkResult, Token, TagKind};
use html5ever::tokenizer::{Tokenizer, TokenizerOpts};
use markup5ever::buffer_queue::BufferQueue;
use std::cell::RefCell;
use std::rc::Rc;

struct Inner {
    source_map: SourceMap,
    offset: ByteOffset,
    depth: usize,
}

pub struct LosslessSink {
    inner: Rc<RefCell<Inner>>,
}

impl LosslessSink {
    pub fn new() -> Self {
        Self {
            inner: Rc::new(RefCell::new(Inner {
                source_map: SourceMap::new(),
                offset: 0,
                depth: 0,
            })),
        }
    }

    pub fn into_source_map(self) -> SourceMap {
        Rc::try_unwrap(self.inner)
            .ok()
            .map(|cell| cell.into_inner().source_map)
            .unwrap_or_else(SourceMap::new)
    }
}

impl TokenSink for LosslessSink {
    type Handle = ();

    fn process_token(&self, token: Token, _line_number: u64) -> TokenSinkResult<()> {
        let mut inner = self.inner.borrow_mut();
        let offset = inner.offset;
        let depth = inner.depth;

        match token {
            Token::DoctypeToken(doctype) => {
                let name = doctype.name.unwrap_or_default();
                let dstr = format!("<!DOCTYPE {}>", name);
                let len = dstr.len();
                inner.source_map.insert(
                    offset,
                    NodeKind::Doctype {
                        span: ByteSpan::new(offset, offset + len),
                    },
                    0,
                );
                inner.offset = offset + len;
            }

            Token::TagToken(tag) => {
                let tag_name = tag.name.to_string();

                match tag.kind {
                    TagKind::StartTag => {
                        let mut rep = String::from("<");
                        rep.push_str(&tag_name);
                        for attr in &tag.attrs {
                            rep.push(' ');
                            rep.push_str(&attr.name.local);
                            rep.push_str("=\"");
                            rep.push_str(&attr.value);
                            rep.push('"');
                        }
                        if tag.self_closing {
                            rep.push_str(" />");
                        } else {
                            rep.push('>');
                        }

                        let len = rep.len();
                        inner.source_map.insert(
                            offset,
                            NodeKind::Element {
                                tag_name: tag_name.clone(),
                                open_tag_start: offset,
                                open_tag_end: offset + len,
                                close_tag_start: None,
                                close_tag_end: None,
                                attributes: vec![],
                            },
                            depth,
                        );
                        inner.depth = depth + 1;
                        inner.offset = offset + len;
                    }

                    TagKind::EndTag => {
                        let estr = format!("</{}>", tag_name);
                        inner.depth = depth.saturating_sub(1);
                        inner.offset = offset + estr.len();
                    }
                }
            }

            Token::CommentToken(comment) => {
                let cstr = format!("<!--{}-->", comment);
                let len = cstr.len();
                inner.source_map.insert(
                    offset,
                    NodeKind::Comment {
                        content_span: ByteSpan::new(offset, offset + len),
                    },
                    depth,
                );
                inner.offset = offset + len;
            }

            Token::CharacterTokens(text) => {
                let tstr = text.to_string();
                let len = tstr.len();
                if !tstr.trim().is_empty() || tstr.contains('\n') {
                    inner.source_map.insert(
                        offset,
                        NodeKind::Text {
                            content_span: ByteSpan::new(offset, offset + len),
                        },
                        depth,
                    );
                }
                inner.offset = offset + len;
            }

            Token::NullCharacterToken => {
                inner.offset = offset + 1;
            }

            Token::EOFToken => {}

            Token::ParseError(_) => {
                inner.offset = offset + 1;
            }
        }

        TokenSinkResult::Continue
    }
}

/// Parse HTML content and produce a SourceMap.
pub fn parse_html(raw: &[u8]) -> SourceMap {
    let input_str = String::from_utf8_lossy(raw).to_string();
    let sink = LosslessSink::new();
    let opts = TokenizerOpts::default();
    let mut tokenizer = Tokenizer::new(sink, opts);

    let queue = BufferQueue::default();
    queue.push_back(tendril::StrTendril::from(input_str.as_str()));
    let _ = tokenizer.feed(&queue);
    tokenizer.end();

    tokenizer.sink.into_source_map()
}

pub fn is_likely_html(content: &[u8]) -> bool {
    let start = if content.len() > 100 { &content[..100] } else { content };
    let s = String::from_utf8_lossy(start).to_lowercase();
    s.contains("<html") || s.contains("<!doctype") || s.contains("<head")
        || s.contains("<body") || s.contains("<div") || s.contains("<p")
        || s.contains("<table")
}

pub fn source_map_summary(map: &SourceMap) -> String {
    format!("SourceMap: {} nodes tracked", map.node_count())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_html() {
        let map = parse_html(b"<html><head></head><body><p>Hello</p></body></html>");
        assert!(map.node_count() > 0, "Should find nodes");
    }

    #[test]
    fn test_is_likely_html_true() {
        assert!(is_likely_html(b"<!DOCTYPE html><html>"));
        assert!(is_likely_html(b"<html lang='en'>"));
        assert!(is_likely_html(b"<div class='content'>"));
        assert!(is_likely_html(b"<p>Hello world</p>"));
    }

    #[test]
    fn test_is_likely_html_false() {
        assert!(!is_likely_html(b"Just plain text"));
        assert!(!is_likely_html(b"{}"));
        assert!(!is_likely_html(b""));
    }

    #[test]
    fn test_parse_malformed_html() {
        let map = parse_html(b"<p>unclosed paragraph");
        let _ = map.node_count();
    }

    #[test]
    fn test_parse_with_comments() {
        let map = parse_html(b"<!-- header --><p>content</p><!-- footer -->");
        assert!(map.node_count() > 0);
    }
}
