# gooder-highlights

Keep passages of a web page highlighted: across reloads, as the page changes around them, and for everyone who opens it.

- **Painted with the [CSS Custom Highlight API](https://developer.mozilla.org/docs/Web/API/CSS_Custom_Highlight_API).** The page gains no `<mark>` or `<span>`, so its own scripts, a framework that owns its DOM, and the file on disk never see one. A selection across paragraphs or table cells is one highlight.
- **Anchored with [W3C Web Annotation](https://www.w3.org/TR/annotation-model/#selectors) selectors**: the passage's text, the words around it where it repeats, and its position. Found again after the page changes; one whose passage is gone is kept, marked orphaned.
- **Stored wherever you like.** The library holds highlights in memory and tells you every change; you keep them in a file, a database or `localStorage`, and hand back changes made elsewhere.
- **Like a pen.** A passage has one colour: the same colour over a highlight extends it, another colour takes the part it covers.
- **A palette** of five colours, with values for light and dark pages, which a document can name, change and add to.
- **Works on a document you don't own**, the page's own or one in a same-origin frame. No runtime dependencies.

## Install

```bash
npm install gooder-highlights
```

## Four imports, take what you use

```ts
import { createHighlights } from 'gooder-highlights'; // highlights: records, colours, changes
import { highlightsPanel } from 'gooder-highlights/ui'; // the default UI
import 'gooder-highlights/ui.css';
import { localStore } from 'gooder-highlights/store'; // the default store, in localStorage
import { anchorOf, rangeOf, paint } from 'gooder-highlights/places'; // just remembering, finding and tinting passages
```

## A page with highlights, in three lines

```ts
const highlights = createHighlights(document.querySelector('main')!);
localStore(highlights);
highlightsPanel(highlights);
```

Select text, click a swatch. Click a highlight (or put the caret in it) to recolour it, or erase it with the eraser or Delete. The gear opens the colours, to change one or name it; the five are the colours there are (a client can add more through the API). Ctrl+Shift+H highlights the selection in the last colour used. Drag the panel by its grip; it stays where you put it.

## A page that draws its text again

A framework may replace the element the highlights are in with a new one holding the same text (a component drawn again, a hot update). Give `createHighlights` a function that finds the element, not the element itself, and the highlights follow it:

```ts
const highlights = createHighlights(() => document.querySelector('.report_prose'));
```

When the element held has left the document and the function returns another, the highlights move there: the text is read again, every highlight found again in it and painted. Records, palette, the highlight picked and listeners stay; nothing is reported to `onChange`, and `onUpdate` is told. `highlights.root` is the element found last. The document is watched for the replacement (one check per frame) unless `observe` is `false`; either way, every call checks first, so one made right after the replacement works on the new element. The function must find an element when `createHighlights` is called.

## Your own storage

```ts
const highlights = createHighlights(root);
highlights.load({ records, palette }); // what you had stored; reports nothing
highlights.onChange(({ added, removed, updated, all, palette }) => {
	// keep them: `all` for a whole set, or added/removed/updated for rows
});
highlights.apply({ added, removed, updated, palette }); // a change made elsewhere: painted, not reported back
```

A record:

```json
{
	"v": 1,
	"id": "hmwl4yu8k3x9",
	"anchor": [
		{ "type": "TextQuoteSelector", "exact": "the passage", "prefix": "words before", "suffix": "words after" },
		{ "type": "TextPositionSelector", "start": 1204, "end": 1215 }
	],
	"color": "yellow",
	"data": {}
}
```

Treat `anchor` as opaque; `color` names a palette entry; `data` is yours and is carried through untouched. The palette you store holds only what differs from the five (`{ "yellow": { "name": "to check" } }`).

## The rest of the API

`add(range, color?)`, `remove(id)`, `recolor(id, color)`, `at(x, y)`, `containing(range)`, `get(id)`, `list()` (page order, orphans last), `reveal(id)`, `palette()`, `nameColor(id, name)`, `setColor(id, value)`, `addColor(value, name?)`, `onUpdate(listener)` (anything shown changed: redraw a UI), `refresh()`, `setScheme('light' | 'dark' | 'auto')`, `dispose()`. `toTextFragment(anchor)` makes a link (`#:~:text=…`) that any current browser opens at the passage.

## Colours

Yellow, green, blue, pink, red. A page changes one with a custom property on `:root`: `--gooder-highlight-yellow`, and `--gooder-highlight-yellow-dark` for a dark page. Light or dark follows `prefers-color-scheme` unless you pass `scheme`.

## Browsers

Chrome and Edge 105, Safari 17.2, Firefox 140. Without the Highlight API, everything but painting works.

## Develop

```bash
npm test          # unit tests (vitest, jsdom)
npm run dev       # the demo at http://127.0.0.1:4002/demo/ (and /demo/frame.html)
npm run test:e2e  # browser tests on the demo (Playwright)
npm run build
```

Design: Codon's `docs/highlights-design.html`.

## License

MIT
