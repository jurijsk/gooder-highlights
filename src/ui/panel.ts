/**
 * gooder-highlights/ui: the default UI, built only on the public API. A floating panel, apart from the selection, that the person drags by its grip to wherever it is out of the way (the place
 * is the viewer's own, kept in the browser, not with the highlights): the palette's swatches, Erase, the settings gear that opens the colours to change and name, and the list of the page's highlights.
 *
 * With text selected, a swatch highlights it in that colour. A click on a highlight, or a selection or the caret inside one, marks its colour: a swatch then recolours it, Erase removes it.
 * Keys, each one the client can change or turn off: highlight the selection in the last colour used (Ctrl+Shift+H); erase the highlight the selection or caret is in (Delete), only where the page
 * isn't being edited, so it never deletes text. Style it with `gooder-highlights/ui.css`.
 */
import { parseColor, type Entry } from '../palette.js';
import type { Highlight, Highlights } from '../highlights.js';
import { PANEL_CSS } from './css.js';

export { PANEL_CSS };

export interface PanelOptions {
	/** The document the panel goes in: the page's own by default; the outer one where the page is in a frame. */
	readonly container?: Document;
	/** The keys: a combination like `Ctrl+Shift+H`, or null for none. */
	readonly keys?: { readonly highlight?: string | null; readonly erase?: string | null };
	/** Where the panel's place is kept in `localStorage` (default `gooder-highlights:panel`). */
	readonly placeKey?: string;
	/** Put the panel's styles (ui.css) into its document, for a client that bundles no CSS. */
	readonly styles?: boolean;
	/**
	 * The part of the view the panel stays in, whole, in viewport coordinates: the whole view by default. A client whose view has parts of its own (Codon: the comment sidebar at the
	 * right) gives the rest, and calls `keepInView` when it changes.
	 */
	readonly bounds?: () => { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
	/**
	 * How much of the panel the bounds must hold: all of it (`panel`, the default), or only its grip (`grip`), the rest free to go past the right and bottom edges and under what lies
	 * there (Codon: the comment sidebar), still reachable by the grip.
	 */
	readonly keepVisible?: 'panel' | 'grip';
}

export interface Panel {
	readonly element: HTMLElement;
	/** What the highlight key does: the selection highlighted in `color` (the last colour used by default), or the highlight picked recoloured. For a client that binds its own keys. */
	highlight(color?: string): void;
	/** What the erase key does: the highlight picked, or the one the selection or caret is in, removed. False when there was none. */
	erase(): boolean;
	/** Put the panel back whole inside its bounds, where it has left them (the client's own parts of the view changed). */
	keepInView(): void;
	dispose(): void;
}

const DEFAULT_KEYS = { highlight: 'Ctrl+Shift+H', erase: 'Delete' };

/** The eraser: Fluent UI System Icons' eraser_20_regular (MIT, Microsoft, github.com/microsoft/fluentui-system-icons), in the current text colour. */
const ERASER_ICON =
	'<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M11.197 2.43934C11.7828 1.85355 12.7326 1.85355 13.3184 2.43934L17.561 6.68198C18.1468 7.26777 18.1468 8.21751 17.561 8.8033L9.36408 17.0002H14.5001C14.7763 17.0002 15.0001 17.2241 15.0001 17.5002C15.0001 17.7764 14.7763 18.0002 14.5001 18.0002H7.81974C7.40996 18.0217 6.99303 17.876 6.68003 17.5629L2.43739 13.3203C1.8516 12.7345 1.8516 11.7848 2.43739 11.199L11.197 2.43934ZM12.6112 3.14645C12.416 2.95118 12.0994 2.95118 11.9041 3.14645L5.53846 9.51212L10.4882 14.4619L16.8539 8.09619C17.0491 7.90093 17.0491 7.58435 16.8539 7.38909L12.6112 3.14645ZM9.7811 15.169L4.83135 10.2192L3.14449 11.9061C2.94923 12.1014 2.94923 12.4179 3.14449 12.6132L7.38713 16.8558C7.5824 17.0511 7.89898 17.0511 8.09424 16.8558L9.7811 15.169Z"/></svg>';
/** The settings gear: Fluent UI System Icons' settings_20_regular (MIT, Microsoft), in the current text colour. */
const SETTINGS_ICON =
	'<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M1.91099 7.38266C2.28028 6.24053 2.88863 5.19213 3.69133 4.30364C3.82707 4.15339 4.04002 4.09984 4.23069 4.16802L6.14897 4.85392C6.66905 5.03977 7.24131 4.76883 7.42716 4.24875C7.44544 4.19762 7.45952 4.14507 7.46925 4.09173L7.83471 2.08573C7.87104 1.88627 8.02422 1.7285 8.22251 1.6863C8.8027 1.5628 9.39758 1.5 10.0003 1.5C10.6026 1.5 11.1971 1.56273 11.7769 1.68607C11.9752 1.72824 12.1284 1.88591 12.1648 2.08529L12.5313 4.09165C12.6303 4.63497 13.1511 4.9951 13.6944 4.89601C13.7479 4.88627 13.8004 4.87219 13.8515 4.85395L15.7698 4.16802C15.9605 4.09984 16.1734 4.15339 16.3092 4.30364C17.1119 5.19213 17.7202 6.24053 18.0895 7.38266C18.1518 7.57534 18.0918 7.78658 17.9374 7.91764L16.3825 9.23773C15.9615 9.5952 15.9101 10.2263 16.2675 10.6473C16.3027 10.6887 16.3411 10.7271 16.3825 10.7623L17.9374 12.0824C18.0918 12.2134 18.1518 12.4247 18.0895 12.6173C17.7202 13.7595 17.1119 14.8079 16.3092 15.6964C16.1734 15.8466 15.9605 15.9002 15.7698 15.832L13.8515 15.1461C13.3315 14.9602 12.7592 15.2312 12.5733 15.7512C12.5551 15.8024 12.541 15.8549 12.5312 15.9085L12.1648 17.9147C12.1284 18.1141 11.9752 18.2718 11.7769 18.3139C11.1971 18.4373 10.6026 18.5 10.0003 18.5C9.39758 18.5 8.8027 18.4372 8.22251 18.3137C8.02422 18.2715 7.87104 18.1137 7.83471 17.9143L7.46926 15.9084C7.37018 15.365 6.8494 15.0049 6.30608 15.104C6.25265 15.1137 6.20011 15.1278 6.14906 15.1461L4.23069 15.832C4.04002 15.9002 3.82707 15.8466 3.69133 15.6964C2.88863 14.8079 2.28028 13.7595 1.91099 12.6173C1.84869 12.4247 1.90876 12.2134 2.06313 12.0824L3.61798 10.7623C4.03897 10.4048 4.09046 9.77373 3.73299 9.35274C3.69784 9.31135 3.65937 9.27288 3.618 9.23775L2.06313 7.91764C1.90876 7.78658 1.84869 7.57534 1.91099 7.38266ZM2.97154 7.37709L4.26523 8.47546C4.34803 8.54576 4.42496 8.62269 4.49526 8.70548C5.2102 9.54746 5.10721 10.8096 4.26521 11.5246L2.97154 12.6229C3.26359 13.4051 3.68504 14.1322 4.21648 14.7751L5.81246 14.2044C5.91473 14.1679 6.01982 14.1397 6.12667 14.1202C7.21332 13.922 8.25487 14.6423 8.45305 15.729L8.75702 17.3975C9.16489 17.4655 9.58024 17.5 10.0003 17.5C10.42 17.5 10.8351 17.4656 11.2427 17.3976L11.5475 15.7289C11.567 15.6221 11.5951 15.517 11.6317 15.4147C12.0034 14.3746 13.1479 13.8327 14.1881 14.2044L15.784 14.7751C16.3155 14.1322 16.7369 13.4051 17.029 12.6229L15.7353 11.5245C15.6525 11.4542 15.5756 11.3773 15.5053 11.2945C14.7903 10.4525 14.8933 9.1904 15.7353 8.47544L17.029 7.37709C16.7369 6.59486 16.3155 5.86783 15.784 5.22494L14.1881 5.79559C14.0858 5.83214 13.9807 5.8603 13.8738 5.87979C12.7872 6.07796 11.7456 5.3577 11.5475 4.27119L11.2427 2.60235C10.8351 2.53443 10.42 2.5 10.0003 2.5C9.58024 2.5 9.16489 2.53448 8.75702 2.60249L8.45304 4.27105C8.43355 4.37791 8.40539 4.48299 8.36884 4.58527C7.99714 5.62542 6.8526 6.1673 5.81237 5.79556L4.21648 5.22494C3.68504 5.86783 3.26359 6.59486 2.97154 7.37709ZM7.50026 10C7.50026 8.61929 8.61954 7.5 10.0003 7.5C11.381 7.5 12.5003 8.61929 12.5003 10C12.5003 11.3807 11.381 12.5 10.0003 12.5C8.61954 12.5 7.50026 11.3807 7.50026 10ZM8.50026 10C8.50026 10.8284 9.17183 11.5 10.0003 11.5C10.8287 11.5 11.5003 10.8284 11.5003 10C11.5003 9.17157 10.8287 8.5 10.0003 8.5C9.17183 8.5 8.50026 9.17157 8.50026 10Z"/></svg>';
/** A colour's opacity where its value can't be read. */
const DEFAULT_ALPHA = 0.45;

/** Whether a key event is the combination `combo` (`Ctrl+Shift+H`, `Delete`). Ctrl matches Cmd too. */
export function matchesKey(e: KeyboardEvent, combo: string): boolean {
	const parts = combo.split('+').map((p) => p.trim().toLowerCase());
	const key = parts.pop() ?? '';
	const want = { ctrl: parts.includes('ctrl'), shift: parts.includes('shift'), alt: parts.includes('alt') };
	return (
		e.key.toLowerCase() === key && (e.ctrlKey || e.metaKey) === want.ctrl && e.shiftKey === want.shift && e.altKey === want.alt
	);
}

/** Whether the person is typing where the event happened: a field, or an editable part of the page. */
function editing(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el || el.nodeType !== 1) {
		return false;
	}
	return el.isContentEditable || /^(input|textarea|select)$/i.test(el.localName);
}

const hexOf = (value: string): string => {
	const c = parseColor(value);
	return c ? '#' + [c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('') : '#ffe200';
};
const alphaOf = (value: string): number => parseColor(value)?.a ?? DEFAULT_ALPHA;
const withAlpha = (hex: string, a: number): string => {
	const c = parseColor(hex)!;
	return `rgb(${c.r} ${c.g} ${c.b} / ${a})`;
};

export function highlightsPanel(highlights: Highlights, options: PanelOptions = {}): Panel {
	const doc = highlights.document;
	const host = options.container ?? doc;
	const keys = { ...DEFAULT_KEYS, ...options.keys };
	const placeKey = options.placeKey ?? 'gooder-highlights:panel';

	const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
		const e = host.createElement(tag);
		if (cls) {
			e.className = cls;
		}
		if (text !== undefined) {
			e.textContent = text;
		}
		return e;
	};

	const style = options.styles ? el('style', '', PANEL_CSS) : null;
	if (style) {
		host.head.appendChild(style);
	}
	const panel = el('div', 'gooder-highlights-panel');
	panel.setAttribute('role', 'toolbar');
	panel.setAttribute('aria-label', 'Highlights');
	const grip = el('div', 'gh-grip');
	grip.title = 'Drag to move';
	grip.setAttribute('aria-hidden', 'true');
	const swatches = el('div', 'gh-swatches');
	// The colours' settings: each colour's value and name. A person edits the five; they don't add colours of their own (the API can, for a client that wants it).
	const settings = el('button', 'gh-settings');
	settings.type = 'button';
	settings.innerHTML = SETTINGS_ICON;
	settings.title = 'Colours: change a colour, name it';
	settings.setAttribute('aria-label', 'Colours');
	settings.setAttribute('aria-expanded', 'false');
	// An eraser, drawn: its name is in the tooltip and for a screen reader.
	const erase = el('button', 'gh-erase');
	erase.innerHTML = ERASER_ICON;
	erase.setAttribute('aria-label', 'Erase');
	erase.type = 'button';
	erase.title = `Erase the highlight${keys.erase ? ` (${keys.erase})` : ''}`;
	const row = el('div', 'gh-row');
	row.append(grip, swatches, erase, settings);
	const colors = el('div', 'gh-colors');
	colors.hidden = true;
	const colorsBody = el('div', 'gh-colors-body');
	colors.append(colorsBody);
	settings.addEventListener('click', () => {
		colors.hidden = !colors.hidden;
		settings.setAttribute('aria-expanded', String(!colors.hidden));
	});
	const list = el('details', 'gh-list');
	const listSummary = el('summary');
	const listBody = el('ol', 'gh-list-body');
	list.append(listSummary, listBody);
	const live = el('div', 'gh-live');
	live.setAttribute('aria-live', 'polite');
	panel.append(row, colors, list, live);
	host.body.appendChild(panel);

	let current: Highlight | null = null;
	let lastRange: Range | null = null;
	let lastColor = highlights.palette()[0]?.id ?? 'yellow';
	const say = (text: string): void => {
		live.textContent = text;
	};

	/** The selection in the page, when it is text of the page. */
	const selection = (): Range | null => {
		const sel = doc.getSelection();
		if (!sel || sel.rangeCount === 0) {
			return null;
		}
		const r = sel.getRangeAt(0);
		return highlights.root.contains(r.commonAncestorContainer) || highlights.root === r.commonAncestorContainer ? r : null;
	};

	const nameOf = (e: Entry): string => e.name || e.id;

	const render = (): void => {
		const entries = highlights.palette();
		if (current) {
			current = highlights.get(current.record.id);
		}
		// The one picked shows in the page too, brighter.
		highlights.setActive(current?.record.id ?? null);
		swatches.replaceChildren(
			...entries.map((e) => {
				const b = el('button', 'gh-swatch');
				b.type = 'button';
				b.style.background = e.light;
				b.title = e.name ? `${e.name} (${e.id})` : e.id;
				b.setAttribute('aria-label', nameOf(e));
				b.setAttribute('aria-pressed', String(current?.record.color === e.id));
				b.addEventListener('click', () => use(e.id));
				return b;
			}),
		);
		erase.disabled = !current;
		colorsBody.replaceChildren(
			...entries.map((e) => {
				const line = el('div', 'gh-color');
				const pick = el('input') as HTMLInputElement;
				pick.type = 'color';
				pick.value = hexOf(e.light);
				pick.title = 'Its colour';
				pick.addEventListener('change', () => highlights.setColor(e.id, withAlpha(pick.value, alphaOf(e.light))));
				const name = el('input', 'gh-name') as HTMLInputElement;
				name.type = 'text';
				name.placeholder = e.id;
				name.value = e.name;
				name.setAttribute('aria-label', `Name of ${e.id}`);
				name.addEventListener('change', () => highlights.nameColor(e.id, name.value));
				line.append(pick, name);
				return line;
			}),
		);
		const all = highlights.list();
		listSummary.textContent = `Highlights (${all.length})`;
		listBody.replaceChildren(
			...all.map((h) => {
				const li = el('li', `gh-item${h.orphaned ? ' gh-orphan' : ''}${current?.record.id === h.record.id ? ' gh-current' : ''}`);
				const dot = el('span', 'gh-dot');
				const entry = entries.find((x) => x.id === h.record.color);
				dot.style.background = entry?.light ?? 'transparent';
				const text = el('button', 'gh-text', h.text.replace(/\s+/g, ' '));
				text.type = 'button';
				text.title = h.orphaned ? 'Not found in the page now' : 'Show it';
				text.addEventListener('click', () => {
					current = h;
					highlights.reveal(h.record.id);
					render();
				});
				li.append(dot, text);
				if (h.orphaned) {
					li.append(el('span', 'gh-orphan-mark', 'not found'));
				}
				return li;
			}),
		);
	};

	/** A swatch, or the key: highlight the selection, or recolour the highlight picked. */
	const use = (color: string): void => {
		lastColor = color;
		const sel = selection();
		const range = sel && !sel.collapsed ? sel : lastRange;
		if (range && !range.collapsed && !(current && current.range && sameSpan(range, current))) {
			const made = highlights.add(range, color);
			lastRange = null;
			doc.getSelection()?.removeAllRanges();
			if (made) {
				current = made;
				say('Highlighted');
			}
		} else if (current) {
			highlights.recolor(current.record.id, color);
			say('Recoloured');
		}
		render();
	};

	/** Whether a selection is exactly a highlight (selecting a highlight to recolour it, not to draw over it). */
	const sameSpan = (range: Range, h: Highlight): boolean =>
		!!h.range && range.compareBoundaryPoints(0 /* START_TO_START */, h.range) === 0 && range.compareBoundaryPoints(2 /* END_TO_END */, h.range) === 0;

	const eraseCurrent = (): boolean => {
		const sel = selection();
		const target = current ?? (sel ? highlights.containing(sel) : null);
		if (!target) {
			return false;
		}
		highlights.remove(target.record.id);
		current = null;
		say('Erased');
		render();
		return true;
	};

	erase.addEventListener('click', () => eraseCurrent());

	// Clicking the panel keeps the page's selection.
	panel.addEventListener('mousedown', (e) => {
		if (!(e.target as HTMLElement).closest('input, summary')) {
			e.preventDefault();
		}
	});

	const onSelection = (): void => {
		const sel = selection();
		if (!sel) {
			return;
		}
		if (!sel.collapsed) {
			lastRange = sel.cloneRange();
		}
		const inside = highlights.containing(sel);
		if (inside || !sel.collapsed) {
			current = inside;
		}
		render();
	};
	const onClick = (e: MouseEvent): void => {
		// The path, not the target: a button in the panel may be redrawn, and detached, by its own click before the event gets here.
		if (e.composedPath().includes(panel)) {
			return;
		}
		const sel = doc.getSelection();
		if (sel && !sel.isCollapsed) {
			return;
		}
		current = highlights.at(e.clientX, e.clientY);
		render();
	};
	const onKey = (e: KeyboardEvent): void => {
		if (editing(e.target)) {
			return;
		}
		if (keys.highlight && matchesKey(e, keys.highlight)) {
			e.preventDefault();
			use(current && !selection()?.toString() ? current.record.color : lastColor);
		} else if (keys.erase && matchesKey(e, keys.erase) && eraseCurrent()) {
			e.preventDefault();
		}
	};
	doc.addEventListener('selectionchange', onSelection);
	doc.addEventListener('click', onClick);
	doc.addEventListener('keydown', onKey);
	if (host !== doc) {
		host.addEventListener('keydown', onKey);
	}
	const stopUpdates = highlights.onUpdate(render);

	// Dragging by the grip; the place kept per viewer.
	const storage = ((): Storage | null => {
		try {
			return host.defaultView?.localStorage ?? null;
		} catch {
			return null;
		}
	})();
	const bounds = (): { left: number; top: number; right: number; bottom: number } => {
		const view = host.defaultView;
		return options.bounds?.() ?? { left: 0, top: 0, right: view?.innerWidth ?? 1024, bottom: view?.innerHeight ?? 768 };
	};
	/** How wide and tall the part kept inside the bounds is: the whole panel, or the strip from its left edge to the grip's right edge, as tall as the grip's row. */
	const kept = (): { width: number; height: number } => {
		const box = panel.getBoundingClientRect();
		if (options.keepVisible !== 'grip') {
			return { width: box.width, height: box.height };
		}
		const g = grip.getBoundingClientRect();
		return { width: Math.max(g.right - box.left, 1), height: Math.max(g.bottom - box.top, 1) };
	};
	/** The panel at (x, y), moved as little as needed for what is kept to be inside its bounds (its top left first, where it doesn't fit). */
	const place = (x: number, y: number): void => {
		const b = bounds();
		const k = kept();
		panel.style.left = `${Math.max(b.left, Math.min(x, b.right - k.width))}px`;
		panel.style.top = `${Math.max(b.top, Math.min(y, b.bottom - k.height))}px`;
		panel.style.right = 'auto';
	};
	const keepInView = (): void => {
		const b = bounds();
		const box = panel.getBoundingClientRect();
		const k = kept();
		if (box.left < b.left || box.top < b.top || box.left + k.width > b.right || box.top + k.height > b.bottom) {
			place(box.left, box.top);
		}
	};
	try {
		const saved = JSON.parse(storage?.getItem(placeKey) ?? 'null') as { x: number; y: number } | null;
		if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
			place(saved.x, saved.y);
		}
	} catch {
		// No place kept: the stylesheet's corner.
	}
	// Dragging captures the pointer on the grip: every move and the release come to it wherever the pointer is, over a frame, outside the window, or on another
	// document. A drag ends on the release, on a cancel, when the capture is lost (the window lost focus), and on a move with no button held (a release nobody
	// heard): never left half done, to pick the panel up again on the next move. Where it stops, the panel is kept whole in the view.
	let dragging: { readonly id: number; readonly dx: number; readonly dy: number } | null = null;
	const endDrag = (): void => {
		if (!dragging) {
			return;
		}
		const id = dragging.id;
		dragging = null;
		grip.classList.remove('gh-dragging');
		if (grip.hasPointerCapture?.(id)) {
			grip.releasePointerCapture(id);
		}
		const b = panel.getBoundingClientRect();
		place(b.left, b.top);
		try {
			storage?.setItem(placeKey, JSON.stringify({ x: Math.round(b.left), y: Math.round(b.top) }));
		} catch {
			// The place is not kept.
		}
	};
	grip.addEventListener('pointerdown', (down) => {
		if (down.button !== 0) {
			return;
		}
		down.preventDefault();
		const box = panel.getBoundingClientRect();
		dragging = { id: down.pointerId, dx: down.clientX - box.left, dy: down.clientY - box.top };
		grip.classList.add('gh-dragging');
		try {
			grip.setPointerCapture(down.pointerId);
		} catch {
			// No capture (the pointer is already gone): the first move without a button ends the drag.
		}
	});
	grip.addEventListener('pointermove', (e) => {
		if (!dragging || e.pointerId !== dragging.id) {
			return;
		}
		if ((e.buttons & 1) === 0) {
			endDrag();
			return;
		}
		place(e.clientX - dragging.dx, e.clientY - dragging.dy);
	});
	grip.addEventListener('pointerup', endDrag);
	grip.addEventListener('pointercancel', endDrag);
	grip.addEventListener('lostpointercapture', endDrag);
	host.defaultView?.addEventListener('blur', endDrag);
	// The view resized: the panel is put back whole inside it.
	host.defaultView?.addEventListener('resize', keepInView);

	render();

	return {
		element: panel,
		highlight: (color) => use(color ?? (current && !selection()?.toString() ? current.record.color : lastColor)),
		erase: eraseCurrent,
		keepInView,
		dispose() {
			endDrag();
			host.defaultView?.removeEventListener('blur', endDrag);
			host.defaultView?.removeEventListener('resize', keepInView);
			style?.remove();
			stopUpdates();
			doc.removeEventListener('selectionchange', onSelection);
			doc.removeEventListener('click', onClick);
			doc.removeEventListener('keydown', onKey);
			host.removeEventListener('keydown', onKey);
			panel.remove();
		},
	};
}
