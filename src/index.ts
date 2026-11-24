/** gooder-highlights: passages of a page kept highlighted. Places (`gooder-highlights/places`), the default UI (`/ui`) and store (`/store`) are imports of their own. */
export { createHighlights, highlightName, type Change, type Highlight, type HighlightRecord, type Highlights, type HighlightsOptions, type HighlightsRoot, type Scheme, type Stored } from './highlights.js';
export { DEFAULT_COLORS, colorProperty, darkOf, entriesOf, type Entry, type PaletteColor, type StoredColor, type StoredPalette } from './palette.js';
export { newId } from './ids.js';
export { stroke, type PenItem, type PenResult } from './pen.js';
export { toTextFragment, type Anchor } from './places/anchor.js';
