# Changelog

## 0.1.0 (unreleased)

- First version: highlights anchored with W3C Web Annotation selectors and painted with the CSS Custom Highlight API; the pen model; a palette of five colours that a document names, changes and adds to; records in, changes out (`load`, `onChange`, `apply`); orphans kept; text fragments made from anchors.
- `gooder-highlights/places`: remembering, finding and tinting passages, on their own.
- `gooder-highlights/ui` and `ui.css`: the default UI, a floating panel with the swatches, the eraser, the gear that opens the colours (to change and name the five; no colour of one's own in the UI), and the list; Ctrl+Shift+H and Delete. Its icons are Fluent UI System Icons (MIT).
- Two sets of highlights in one document paint under names of their own (`gooder-highlight-<n>-<colour>` after the first), so neither paints over the other.
- `highlightsPanel` takes `styles: true` (the panel's CSS put into its document, for a client that bundles no CSS) and has `highlight()` and `erase()`, what its keys do, for a client that binds its own keys.
- The panel's drag captures the pointer: it ends on the release wherever that happens, on a cancel, when the window loses focus, and on a move with no button held; the panel is kept whole in the view (or in `bounds`, a client's part of it), and `keepInView()` puts it back when that part changes; with `keepVisible: 'grip'`, only the grip has to stay in, the rest free to go under what lies past the edge.
- `setActive(id)`: the highlight picked is painted brighter (its colour once more over itself); the default UI marks the one it would recolour or erase.
- `gooder-highlights/store`: the default store, in `localStorage`.
- `put(record)`: a highlight put in as a record says, and reported: one erased put back (an undo), or one there already as it was before (its colour, its `data`).
