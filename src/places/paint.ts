/**
 * paint.ts: tinting ranges with the CSS Custom Highlight API, in the document the ranges are in (a same-origin frame's own `CSS` and `Highlight`), and telling which range a point is in.
 * Nothing is added to the page's DOM. Where the API is missing, painting does nothing and everything else goes on working.
 */

interface HighlightRealm {
	readonly CSS: { readonly highlights?: Map<string, unknown> };
	readonly Highlight?: new (...ranges: AbstractRange[]) => unknown;
}

function realmOf(doc: Document): HighlightRealm | null {
	const view = doc.defaultView as unknown as HighlightRealm | null;
	return view && view.CSS && view.CSS.highlights && view.Highlight ? view : null;
}

/** Whether the document can paint highlights. */
export function canPaint(doc: Document): boolean {
	return realmOf(doc) !== null;
}

/** Paint `ranges` as the highlight `name`, replacing what it painted before; no ranges clears it. Style it with `::highlight(name)`. `priority`: painted over highlights of a lower one where they overlap. */
export function paint(name: string, ranges: readonly Range[], doc: Document, priority = 0): void {
	const realm = realmOf(doc);
	if (!realm) {
		return;
	}
	if (ranges.length === 0) {
		realm.CSS.highlights!.delete(name);
		return;
	}
	const highlight = new realm.Highlight!(...ranges) as { priority?: number };
	if (priority) {
		highlight.priority = priority;
	}
	realm.CSS.highlights!.set(name, highlight);
}

/** Clear the highlight `name`. */
export function clear(name: string, doc: Document): void {
	realmOf(doc)?.CSS.highlights!.delete(name);
}

/** The caret position at a point of the viewport, as a collapsed range; null where there is none. */
export function caretAt(x: number, y: number, doc: Document): Range | null {
	const d = doc as Document & {
		caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
		caretRangeFromPoint?: (x: number, y: number) => Range | null;
	};
	if (d.caretPositionFromPoint) {
		const p = d.caretPositionFromPoint(x, y);
		if (!p) {
			return null;
		}
		const r = doc.createRange();
		r.setStart(p.offsetNode, p.offset);
		return r;
	}
	return d.caretRangeFromPoint?.(x, y) ?? null;
}

/** Whether the point is over the range's text itself, not merely in a line it shares with other text. */
function over(range: Range, x: number, y: number): boolean {
	for (const rect of Array.from(range.getClientRects())) {
		if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
			return true;
		}
	}
	return false;
}

/** Which of `ranges` a point of the viewport is in: its index, or -1. */
export function rangeAt(x: number, y: number, ranges: readonly Range[], doc: Document): number {
	const caret = caretAt(x, y, doc);
	for (let i = 0; i < ranges.length; i += 1) {
		const r = ranges[i]!;
		if (caret && r.isPointInRange(caret.startContainer, caret.startOffset) && over(r, x, y)) {
			return i;
		}
	}
	return -1;
}
