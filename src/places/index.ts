/** gooder-highlights/places: remembering a passage, finding it again, tinting it. What comment threads need, and what highlights are built on. */
export { anchorOf, anchorOfSpan, candidates, isAnchor, rangeOf, spanOfAnchor, toTextFragment, type Anchor, type TextPositionSelector, type TextQuoteSelector } from './anchor.js';
export { canPaint, caretAt, clear, paint, rangeAt } from './paint.js';
export { buildTextIndex, documentOf, matchSpans, offsetOf, rangeForSpan, spanOfRange, trimSpan, type TextIndex } from './textIndex.js';
