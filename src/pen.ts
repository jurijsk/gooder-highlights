/**
 * pen.ts: highlighting over highlights, as a pen does. A passage has at most one colour, so highlights never overlap.
 *
 * - The same colour over a highlight it overlaps or touches extends it, and joins every same-coloured one it bridges into one: the earliest keeps its id, the others are removed.
 * - Another colour takes the part it covers: an old highlight is cut back, or cut in two, its first part keeping its id and the rest a new highlight.
 *
 * Pure: spans in the page's text, no DOM. "Earliest" is the order the highlights are given in.
 */

export interface PenItem {
	readonly id: string;
	readonly color: string;
	readonly span: readonly [number, number];
}

export interface PenResult {
	/** The highlight the stroke made or extended. */
	readonly id: string;
	readonly added: PenItem[];
	readonly updated: PenItem[];
	readonly removed: string[];
}

const overlaps = (a: readonly [number, number], b: readonly [number, number]): boolean => a[0] < b[1] && b[0] < a[1];
const touches = (a: readonly [number, number], b: readonly [number, number]): boolean => a[0] <= b[1] && b[0] <= a[1];

/** A stroke of `color` over `span`, given the found highlights `items` (in the order they were made). `newId` makes an id for each new highlight. */
export function stroke(items: readonly PenItem[], span: readonly [number, number], color: string, newId: () => string): PenResult {
	const same = items.filter((it) => it.color === color && touches(it.span, span));
	let start = span[0];
	let end = span[1];
	for (const it of same) {
		start = Math.min(start, it.span[0]);
		end = Math.max(end, it.span[1]);
	}
	const whole: [number, number] = [start, end];
	const added: PenItem[] = [];
	const updated: PenItem[] = [];
	const removed: string[] = [];

	let id: string;
	if (same.length > 0) {
		const keep = same[0]!;
		id = keep.id;
		if (keep.span[0] !== start || keep.span[1] !== end) {
			updated.push({ id, color, span: whole });
		}
		for (const it of same.slice(1)) {
			removed.push(it.id);
		}
	} else {
		id = newId();
		added.push({ id, color, span: whole });
	}

	for (const it of items) {
		if (it.color === color || !overlaps(it.span, whole)) {
			continue;
		}
		const before: [number, number] | null = it.span[0] < start ? [it.span[0], start] : null;
		const after: [number, number] | null = it.span[1] > end ? [end, it.span[1]] : null;
		if (before) {
			updated.push({ id: it.id, color: it.color, span: before });
			if (after) {
				added.push({ id: newId(), color: it.color, span: after });
			}
		} else if (after) {
			updated.push({ id: it.id, color: it.color, span: after });
		} else {
			removed.push(it.id);
		}
	}
	return { id, added, updated, removed };
}
