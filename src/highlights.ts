/**
 * highlights.ts: highlights on a page. The library holds them in memory, finds each again in the page's text, paints them a CSS highlight per colour, and tells the client every change it makes
 * (`onChange`), which the client stores its own way; changes made elsewhere come back in through `apply` and are not reported again. The library never calls into storage.
 *
 * Design: Codon's docs/highlights-design.html.
 */
import { anchorOfSpan, isAnchor, spanOfAnchor, type Anchor } from './places/anchor.js';
import { canPaint, caretAt, paint } from './places/paint.js';
import { buildTextIndex, documentOf, offsetOf, rangeForSpan, spanOfRange, trimSpan, type TextIndex } from './places/textIndex.js';
import { newId } from './ids.js';
import { DEFAULT_COLORS, entriesOf, isStoredPalette, prunePalette, type Entry, type StoredPalette } from './palette.js';
import { stroke, type PenItem } from './pen.js';

/** A highlight as it is stored. */
export interface HighlightRecord {
	readonly v: 1;
	readonly id: string;
	readonly anchor: Anchor;
	/** A palette entry's id, never a value. */
	readonly color: string;
	/** The client's own, carried through untouched. */
	readonly data?: unknown;
}

/** A highlight as the page has it now. */
export interface Highlight {
	readonly record: HighlightRecord;
	/** Its text: as found in the page, or as remembered for an orphan. */
	readonly text: string;
	/** Its passage is not in the page now. */
	readonly orphaned: boolean;
	readonly range: Range | null;
}

/** What changed: reported to `onChange`, and taken by `apply`. */
export interface Change {
	readonly added: readonly HighlightRecord[];
	readonly removed: readonly string[];
	readonly updated: readonly HighlightRecord[];
	/** The document's palette, when it changed. */
	readonly palette?: StoredPalette;
	/** Every highlight after the change (ignored by `apply`). */
	readonly all: readonly HighlightRecord[];
}

/** What a client had stored. Anything that doesn't read is left out. */
export interface Stored {
	readonly records?: readonly unknown[];
	readonly palette?: unknown;
}

export type Scheme = 'light' | 'dark' | 'auto';

export interface HighlightsOptions {
	/** Light or dark values: `auto` (the default) follows `prefers-color-scheme` in the page's window. */
	readonly scheme?: Scheme;
	/**
	 * Find everything again by itself when the page's text changes (default true). With a root given as a function, also watch the document for the root being replaced, and move to the
	 * new one.
	 */
	readonly observe?: boolean;
}

/**
 * Where the highlights live: an element (or any node), or a function that finds it. Given a function, the highlights follow the root when the page replaces it (a framework drawing the
 * same text again as a new element): once the element held has left the document and the function returns another, they move there, found again and painted in it.
 */
export type HighlightsRoot = Node | (() => Node | null);

export interface Highlights {
	/** The element the highlights live in: with a root given as a function, the one it found last. */
	readonly root: Node;
	readonly document: Document;
	/** Replace everything with what the client had stored. Reports nothing. */
	load(stored: Stored): void;
	/** Highlight a range in `color` (the palette's first by default), as a pen does. Null when it holds no text of the page. */
	add(range: Range, color?: string): Highlight | null;
	remove(id: string): void;
	recolor(id: string, color: string): void;
	/**
	 * Put a highlight in as `record` says, reported as a change: one erased, back as it was (an undo), or one there already as it was before (its colour, its `data`). Its colour must be in
	 * the palette. Returns it as the page has it, null when the record doesn't read.
	 */
	put(record: HighlightRecord): Highlight | null;
	/** The highlight under a point of the viewport. */
	at(x: number, y: number): Highlight | null;
	/** The highlight a selection lies in, or a collapsed range (a caret) is in. */
	containing(range: Range): Highlight | null;
	get(id: string): Highlight | null;
	/** Every highlight in page order, orphans after them. */
	list(): Highlight[];
	/** Scroll a highlight into view. */
	reveal(id: string): void;
	palette(): Entry[];
	nameColor(id: string, name: string): void;
	/** Set a colour's value for this document, for a light page; the dark value is made from it. */
	setColor(id: string, value: string): void;
	/** A custom colour for this document. */
	addColor(value: string, name?: string): Entry;
	/** A change made elsewhere: painted, not reported to `onChange`. */
	apply(change: Pick<Change, 'added' | 'removed' | 'updated'> & { palette?: StoredPalette }): void;
	/** Every change this library made; returns a function that stops listening. */
	onChange(listener: (change: Change) => void): () => void;
	/** Anything shown changed (a change, `apply`, `load`, the page found again): for a UI to redraw. */
	onUpdate(listener: () => void): () => void;
	/** Find everything again now: the client says the page changed in a way the library can't see. */
	refresh(): void;
	setScheme(scheme: Scheme): void;
	/**
	 * The highlight the person has picked (clicked, or the caret or a selection inside it): painted brighter, so it is plain which one a recolour or an erase will change. Null: none. A UI's own state, so nothing is reported.
	 */
	setActive(id: string | null): void;
	dispose(): void;
}

/** The CSS highlight a colour paints with: `gooder-highlight-<colour>` for the first set of highlights in a document, `gooder-highlight-<n>-<colour>` for the n-th after it, so two sets in one document (two parts of a page, a page showing the library twice) never paint over each other. */
export const highlightName = (color: string, instance = 0): string => (instance ? `gooder-highlight-${instance}-${color}` : `gooder-highlight-${color}`);

/** How many sets of highlights each document has had: the next one's number. */
const instances = new WeakMap<Document, number>();

interface Found {
	span: [number, number] | null;
	range: Range | null;
}

function isRecord(value: unknown): value is HighlightRecord {
	const r = value as Record<string, unknown> | null;
	return !!r && typeof r === 'object' && r['v'] === 1 && typeof r['id'] === 'string' && !!r['id'] && typeof r['color'] === 'string' && !!r['color'] && isAnchor(r['anchor']);
}

/**
 * Highlights in `rootOf`: an element, or a function that finds it, which lets them follow the element when the page replaces it (see {@link HighlightsRoot}). The function must find one now.
 */
export function createHighlights(rootOf: HighlightsRoot, options: HighlightsOptions = {}): Highlights {
	const find = typeof rootOf === 'function' ? rootOf : null;
	const first = find ? find() : (rootOf as Node);
	if (!first) {
		throw new Error('createHighlights: the root function found no node');
	}
	let root: Node = first;
	const doc = documentOf(root);
	const view = doc.defaultView;
	const instance = instances.get(doc) ?? 0;
	instances.set(doc, instance + 1);
	const nameOf = (color: string): string => highlightName(color, instance);
	let records: HighlightRecord[] = [];
	let stored: StoredPalette = {};
	const found = new Map<string, Found>();
	let index: TextIndex | null = null;
	let scheme: Scheme = options.scheme ?? 'auto';
	const changeListeners = new Set<(change: Change) => void>();
	const updateListeners = new Set<() => void>();
	const painted = new Set<string>();

	// The colours' rules, in a stylesheet of the library's own in the page's document.
	let sheet: CSSStyleSheet | null = null;
	try {
		const Sheet = (view as unknown as { CSSStyleSheet: typeof CSSStyleSheet } | null)?.CSSStyleSheet;
		if (Sheet && 'adoptedStyleSheets' in doc && canPaint(doc)) {
			sheet = new Sheet();
			doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
		}
	} catch {
		sheet = null;
	}
	const media = view?.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
	const isDark = (): boolean => (scheme === 'auto' ? !!media?.matches : scheme === 'dark');
	const pageValue = (property: string): string => {
		try {
			return view?.getComputedStyle(doc.documentElement).getPropertyValue(property).trim() ?? '';
		} catch {
			return '';
		}
	};
	const entries = (): Entry[] => entriesOf(stored, pageValue);
	/** The highlight picked, painted over its colour's: the same colour once more, so it is brighter than the rest. */
	let activeId: string | null = null;
	const activeName = nameOf('active');
	const writeRules = (): void => {
		if (!sheet) {
			return;
		}
		const dark = isDark();
		const all = entries();
		const rules = all.map((e) => `::highlight(${nameOf(e.id)}) { background-color: ${dark ? e.dark : e.light}; }`);
		const active = activeId ? all.find((e) => e.id === records.find((r) => r.id === activeId)?.color) : undefined;
		if (active) {
			const value = dark ? active.dark : active.light;
			rules.push(`::highlight(${activeName}) { background-color: ${value}; }`);
		}
		sheet.replaceSync(rules.join('\n'));
	};
	const onScheme = (): void => writeRules();
	media?.addEventListener?.('change', onScheme);

	const fresh = (): TextIndex => (index ??= buildTextIndex(root));

	const resolveAll = (): void => {
		index = buildTextIndex(root);
		found.clear();
		for (const r of records) {
			const span = spanOfAnchor(index, r.anchor);
			found.set(r.id, { span, range: span ? rangeForSpan(index, span[0], span[1]) : null });
		}
	};

	const paintAll = (): void => {
		const byColor = new Map<string, Range[]>();
		for (const r of records) {
			const range = found.get(r.id)?.range;
			if (range) {
				const list = byColor.get(r.color) ?? [];
				list.push(range);
				byColor.set(r.color, list);
			}
		}
		for (const name of painted) {
			if (![...byColor.keys()].some((c) => nameOf(c) === name)) {
				paint(name, [], doc);
				painted.delete(name);
			}
		}
		for (const [color, ranges] of byColor) {
			paint(nameOf(color), ranges, doc);
			painted.add(nameOf(color));
		}
		if (activeId && !records.some((r) => r.id === activeId)) {
			activeId = null;
		}
		const activeRange = activeId ? found.get(activeId)?.range : null;
		paint(activeName, activeRange ? [activeRange] : [], doc, 1);
	};

	const updated = (): void => {
		for (const l of updateListeners) {
			l();
		}
	};

	const report = (change: Omit<Change, 'all'>): void => {
		const full: Change = { ...change, all: records.slice() };
		for (const l of changeListeners) {
			l(full);
		}
	};

	const usedColors = (): Set<string> => new Set(records.map((r) => r.color));

	const view_ = (r: HighlightRecord): Highlight => {
		const f = found.get(r.id);
		const span = f?.span ?? null;
		return {
			record: r,
			text: span && index ? index.text.slice(span[0], span[1]) : r.anchor[0].exact,
			orphaned: !span,
			range: f?.range ?? null,
		};
	};

	const items = (): PenItem[] =>
		records.flatMap((r) => {
			const span = found.get(r.id)?.span;
			return span ? [{ id: r.id, color: r.color, span }] : [];
		});

	// The page changing: everything found again, once per frame however many changes came.
	let pending = 0;
	const schedule = (): void => {
		if (pending) {
			return;
		}
		const run = (): void => {
			pending = 0;
			resolveAll();
			paintAll();
			updated();
		};
		pending = view?.requestAnimationFrame ? view.requestAnimationFrame(run) : (setTimeout(run, 16) as unknown as number);
	};
	const MO = (view as unknown as { MutationObserver?: typeof MutationObserver } | null)?.MutationObserver;
	const observer = options.observe !== false && MO ? new MO(schedule) : null;
	const watch = { childList: true, subtree: true, characterData: true };
	observer?.observe(root, watch);

	// The root replaced: when the element held has left the document and the function finds another in it, the highlights move there. Records, palette, the one picked and the listeners
	// stay; the text is indexed again, every anchor found again in it, and painted. Nothing is reported (no record changed); `onUpdate` is told, so a list redraws.
	let disposed = false;
	const follow = (): void => {
		if (!find || disposed || root.isConnected) {
			return;
		}
		const next = find();
		if (!next || next === root || !next.isConnected || documentOf(next) !== doc) {
			return;
		}
		root = next;
		if (observer) {
			observer.disconnect();
			observer.observe(root, watch);
		}
		resolveAll();
		paintAll();
		updated();
	};
	// Watching the whole document costs one `isConnected` per batch of changes; the move itself waits for the next frame, so a page that takes the old element out and puts the new
	// one in over several changes has finished by then.
	let following = 0;
	const cancelFrame = (id: number): void => (view?.cancelAnimationFrame ? view.cancelAnimationFrame(id) : clearTimeout(id));
	const rootWatch =
		find && options.observe !== false && MO
			? new MO(() => {
					if (following || root.isConnected) {
						return;
					}
					const run = (): void => {
						following = 0;
						follow();
					};
					following = view?.requestAnimationFrame ? view.requestAnimationFrame(run) : (setTimeout(run, 16) as unknown as number);
				})
			: null;
	rootWatch?.observe(doc, { childList: true, subtree: true });

	writeRules();

	const api: Highlights = {
		get root() {
			follow();
			return root;
		},
		document: doc,

		load(s) {
			follow();
			records = (s.records ?? []).filter(isRecord);
			const seen = new Set<string>();
			records = records.filter((r) => !seen.has(r.id) && seen.add(r.id));
			stored = isStoredPalette(s.palette) ? s.palette : {};
			writeRules();
			resolveAll();
			paintAll();
			updated();
		},

		add(range, color = DEFAULT_COLORS[0]!.id) {
			follow();
			if (!entries().some((e) => e.id === color)) {
				return null;
			}
			index = buildTextIndex(root);
			const idx = index;
			const span = spanOfRange(idx, range);
			if (!span) {
				return null;
			}
			const raw = stroke(items(), span, color, () => newId('h'));
			// A part cut back keeps no whitespace at its edges; a part with nothing left goes.
			const trimmed = (it: PenItem): PenItem | null => {
				const t = trimSpan(idx, it.span[0], it.span[1]);
				return t ? { ...it, span: t } : null;
			};
			const result = {
				id: raw.id,
				added: raw.added.map(trimmed).filter((it): it is PenItem => !!it),
				updated: raw.updated.map(trimmed).filter((it): it is PenItem => !!it),
				removed: [...raw.removed, ...raw.updated.filter((it) => !trimmed(it)).map((it) => it.id)],
			};
			const make = (it: PenItem, base?: HighlightRecord): HighlightRecord => ({
				v: 1,
				id: it.id,
				anchor: anchorOfSpan(idx, it.span[0], it.span[1]),
				color: it.color,
				...(base?.data !== undefined ? { data: base.data } : {}),
			});
			const byId = new Map(records.map((r) => [r.id, r]));
			const added = result.added.map((it) => make(it, it.color === color ? undefined : records.find((r) => result.updated.some((u) => u.id === r.id && u.color === it.color))));
			const updatedRecords = result.updated.map((it) => make(it, byId.get(it.id)));
			const removedSet = new Set(result.removed);
			records = records.filter((r) => !removedSet.has(r.id)).map((r) => updatedRecords.find((u) => u.id === r.id) ?? r);
			records.push(...added);
			for (const id of result.removed) {
				found.delete(id);
			}
			for (const it of [...result.added, ...result.updated]) {
				found.set(it.id, { span: [it.span[0], it.span[1]], range: rangeForSpan(idx, it.span[0], it.span[1]) });
			}
			paintAll();
			report({ added, updated: updatedRecords, removed: result.removed });
			updated();
			const made = records.find((r) => r.id === result.id);
			return made ? view_(made) : null;
		},

		remove(id) {
			follow();
			if (!records.some((r) => r.id === id)) {
				return;
			}
			records = records.filter((r) => r.id !== id);
			found.delete(id);
			paintAll();
			const pruned = prunePalette(stored, usedColors());
			const paletteChanged = JSON.stringify(pruned) !== JSON.stringify(stored);
			stored = pruned;
			report({ added: [], updated: [], removed: [id], ...(paletteChanged ? { palette: stored } : {}) });
			updated();
		},

		recolor(id, color) {
			follow();
			const r = records.find((x) => x.id === id);
			if (!r || r.color === color || !entries().some((e) => e.id === color)) {
				return;
			}
			const next: HighlightRecord = { ...r, color };
			records = records.map((x) => (x.id === id ? next : x));
			if (id === activeId) {
				writeRules(); // the picked one's look follows its colour
			}
			paintAll();
			const pruned = prunePalette(stored, usedColors());
			const paletteChanged = JSON.stringify(pruned) !== JSON.stringify(stored);
			stored = pruned;
			report({ added: [], updated: [next], removed: [], ...(paletteChanged ? { palette: stored } : {}) });
			updated();
		},

		put(record) {
			follow();
			if (!isRecord(record) || !entries().some((e) => e.id === record.color)) {
				return null;
			}
			const at = records.findIndex((x) => x.id === record.id);
			if (at >= 0 && JSON.stringify(records[at]) === JSON.stringify(record)) {
				return view_(records[at]!);
			}
			records = at >= 0 ? records.map((x, i) => (i === at ? record : x)) : [...records, record];
			const span = spanOfAnchor(fresh(), record.anchor);
			found.set(record.id, { span, range: span ? rangeForSpan(fresh(), span[0], span[1]) : null });
			if (record.id === activeId) {
				writeRules();
			}
			paintAll();
			report(at >= 0 ? { added: [], updated: [record], removed: [] } : { added: [record], updated: [], removed: [] });
			updated();
			return view_(record);
		},

		at(x, y) {
			follow();
			const caret = caretAt(x, y, doc);
			if (!caret) {
				return null;
			}
			for (const r of records) {
				const range = found.get(r.id)?.range;
				if (!range || !range.isPointInRange(caret.startContainer, caret.startOffset)) {
					continue;
				}
				if (Array.from(range.getClientRects()).some((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)) {
					return view_(r);
				}
			}
			return null;
		},

		containing(range) {
			follow();
			const idx = fresh();
			let s: number | null;
			let e: number | null;
			if (range.collapsed) {
				s = e = offsetOf(idx, range.startContainer, range.startOffset, false);
			} else {
				const span = spanOfRange(idx, range);
				s = span?.[0] ?? null;
				e = span?.[1] ?? null;
			}
			if (s === null || e === null) {
				return null;
			}
			for (const r of records) {
				const span = found.get(r.id)?.span;
				if (span && span[0] <= s && e <= span[1]) {
					return view_(r);
				}
			}
			return null;
		},

		get(id) {
			follow();
			const r = records.find((x) => x.id === id);
			return r ? view_(r) : null;
		},

		list() {
			follow();
			const all = records.map(view_);
			const placed = all.filter((h) => !h.orphaned).sort((a, b) => found.get(a.record.id)!.span![0] - found.get(b.record.id)!.span![0]);
			return [...placed, ...all.filter((h) => h.orphaned)];
		},

		reveal(id) {
			follow();
			const range = found.get(id)?.range;
			const el = range ? (range.startContainer.nodeType === 1 ? (range.startContainer as Element) : range.startContainer.parentElement) : null;
			el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
		},

		palette: entries,

		nameColor(id, name) {
			if (!entries().some((e) => e.id === id)) {
				return;
			}
			const own = stored[id] ?? {};
			stored = prunePalette({ ...stored, [id]: { ...own, name: name.trim() } }, usedColors());
			report({ added: [], updated: [], removed: [], palette: stored });
			updated();
		},

		setColor(id, value) {
			if (!entries().some((e) => e.id === id)) {
				return;
			}
			const own = stored[id] ?? {};
			stored = prunePalette({ ...stored, [id]: { ...own, value } }, new Set([...usedColors(), id]));
			writeRules();
			report({ added: [], updated: [], removed: [], palette: stored });
			updated();
		},

		addColor(value, name) {
			const id = newId('p');
			stored = { ...stored, [id]: { value, ...(name?.trim() ? { name: name.trim() } : {}) } };
			writeRules();
			report({ added: [], updated: [], removed: [], palette: stored });
			updated();
			return entries().find((e) => e.id === id)!;
		},

		apply(change) {
			follow();
			const removed = new Set(change.removed);
			const incoming = [...change.added, ...change.updated].filter(isRecord);
			records = records.filter((r) => !removed.has(r.id));
			for (const r of incoming) {
				const at = records.findIndex((x) => x.id === r.id);
				if (at >= 0) {
					records[at] = r;
				} else {
					records.push(r);
				}
			}
			if (change.palette && isStoredPalette(change.palette)) {
				stored = change.palette;
				writeRules();
			}
			resolveAll();
			paintAll();
			updated();
		},

		onChange(listener) {
			changeListeners.add(listener);
			return () => changeListeners.delete(listener);
		},

		onUpdate(listener) {
			updateListeners.add(listener);
			return () => updateListeners.delete(listener);
		},

		refresh() {
			follow();
			resolveAll();
			paintAll();
			updated();
		},

		setActive(id) {
			follow();
			const next = id && records.some((r) => r.id === id) ? id : null;
			if (next === activeId) {
				return;
			}
			activeId = next;
			writeRules();
			paintAll();
		},

		setScheme(next) {
			scheme = next;
			writeRules();
		},

		dispose() {
			disposed = true;
			observer?.disconnect();
			rootWatch?.disconnect();
			for (const frame of [pending, following]) {
				if (frame) {
					cancelFrame(frame);
				}
			}
			pending = following = 0;
			media?.removeEventListener?.('change', onScheme);
			for (const name of painted) {
				paint(name, [], doc);
			}
			painted.clear();
			paint(activeName, [], doc);
			if (sheet) {
				doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== sheet);
			}
			changeListeners.clear();
			updateListeners.clear();
		},
	};
	return api;
}
