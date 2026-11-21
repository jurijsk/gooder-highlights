/**
 * textIndex.ts: the page as text. One string of its text, with the text node behind every offset: passages are matched in it, and a span of it is turned back into a Range.
 *
 * Text that is not prose is left out: the contents of `<script>`, `<style>`, `<noscript>`, `<textarea>`, `<title>` and `<template>`. Text runs through inline elements (`<em>`, `<a>`, `<span>`…),
 * so "see <a>here</a>." reads "see here.". Anywhere else (a block, a table cell, a `<br>`, an image) a line break goes between two pieces of text, so the edges of two cells never fuse into one
 * word. Decided by tag, not by computed `display`, which would make the browser recalculate the whole page's styles.
 */

export interface TextIndex {
	readonly root: Node;
	/** The text, with a line break where a run of text ends. */
	readonly text: string;
	/** `text` lowercased, at the same offsets. */
	readonly folded: string;
	readonly nodes: readonly Text[];
	/** Where each of `nodes` starts in `text`. Ascending. */
	readonly starts: readonly number[];
	/** Where a node starts, by node. */
	readonly startOf: ReadonlyMap<Text, number>;
}

const NOT_PROSE = new Set(['script', 'style', 'noscript', 'textarea', 'title', 'template']);

/** Elements that mark up part of a line of text, which runs through them. */
const INLINE = new Set([
	'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font', 'i', 'ins', 'kbd', 'label', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time',
	'u', 'var', 'wbr',
]);

const isInline = (node: Node | null): boolean => !!node && node.nodeType === 1 && INLINE.has((node as Element).localName);

/** The element a text node's run belongs to: its nearest ancestor that is not inline. Two pieces of text are one run only when they share it. */
function runOf(node: Node): Node | null {
	let n = node.parentNode;
	while (n && isInline(n)) {
		n = n.parentNode;
	}
	return n;
}

export function documentOf(root: Node): Document {
	return root.nodeType === 9 ? (root as Document) : root.ownerDocument!;
}

/** The text of `root`'s subtree, in one walk. */
export function buildTextIndex(root: Node): TextIndex {
	const doc = documentOf(root);
	const walker = doc.createTreeWalker(root, 0x1 | 0x4); // elements and text
	const nodes: Text[] = [];
	const starts: number[] = [];
	const parts: string[] = [];
	const foldedParts: string[] = [];
	const startOf = new Map<Text, number>();
	let offset = 0;
	let run: Node | null = null;
	let broken = false;
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.nodeType === 1) {
			broken ||= !isInline(node);
			continue;
		}
		const parent = node.parentNode;
		if (parent && parent.nodeType === 1 && NOT_PROSE.has((parent as Element).localName)) {
			continue;
		}
		const text = node as Text;
		const container = runOf(text);
		if (nodes.length > 0 && (broken || container !== run)) {
			parts.push('\n');
			foldedParts.push('\n');
			offset += 1;
		}
		broken = false;
		run = container;
		nodes.push(text);
		starts.push(offset);
		startOf.set(text, offset);
		parts.push(text.data);
		// Lowercasing changes the length of a few characters (`İ`), which would shift every offset after it: such a node is left as it is, and matches case-sensitively.
		const lower = text.data.toLowerCase();
		foldedParts.push(lower.length === text.data.length ? lower : text.data);
		offset += text.data.length;
	}
	return { root, text: parts.join(''), folded: foldedParts.join(''), nodes, starts, startOf };
}

/** Every `[start, end)` where `needle` occurs in the text, ignoring case; overlapping ones too. */
export function matchSpans(index: TextIndex, needle: string): [number, number][] {
	const spans: [number, number][] = [];
	const lower = needle.toLowerCase();
	if (!lower) {
		return spans;
	}
	for (let at = index.folded.indexOf(lower); at !== -1; at = index.folded.indexOf(lower, at + 1)) {
		spans.push([at, at + lower.length]);
	}
	return spans;
}

/** The node holding offset `at`: the last whose start is at or before it. */
function nodeAt(index: TextIndex, at: number): number {
	let lo = 0;
	let hi = index.starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (index.starts[mid]! <= at) {
			lo = mid;
		} else {
			hi = mid - 1;
		}
	}
	return lo;
}

/** The Range a span of the text covers; null when it is empty or outside the text. */
export function rangeForSpan(index: TextIndex, start: number, end: number): Range | null {
	if (index.nodes.length === 0 || end <= start) {
		return null;
	}
	let first = nodeAt(index, start);
	// A span that starts on a line break between runs starts in the next node.
	if (start >= index.starts[first]! + index.nodes[first]!.length) {
		first += 1;
	}
	const last = nodeAt(index, end - 1);
	if (first >= index.nodes.length || last < first) {
		return null;
	}
	const range = index.nodes[first]!.ownerDocument.createRange();
	range.setStart(index.nodes[first]!, Math.max(0, start - index.starts[first]!));
	range.setEnd(index.nodes[last]!, Math.min(index.nodes[last]!.length, end - index.starts[last]!));
	return range;
}

/** The index offset of a DOM boundary point, or null outside the index. An element boundary reads as the first indexed text after it (a start), or the last before it (an end). */
export function offsetOf(index: TextIndex, node: Node, offset: number, isEnd: boolean): number | null {
	if (node.nodeType === 3) {
		const start = index.startOf.get(node as Text);
		if (start !== undefined) {
			return start + Math.min(offset, (node as Text).length);
		}
	}
	const doc = documentOf(index.root);
	const walker = doc.createTreeWalker(index.root, 0x4);
	const child = node.nodeType === 3 ? null : (node.childNodes[offset] ?? null);
	let last: Node = node;
	while (last.lastChild) {
		last = last.lastChild;
	}
	walker.currentNode = node.nodeType === 3 ? node : (child ?? last);
	if (!isEnd) {
		for (let t: Node | null = child && child.nodeType === 3 ? child : walker.nextNode(); t; t = walker.nextNode()) {
			const s = index.startOf.get(t as Text);
			if (s !== undefined) {
				return s;
			}
		}
		return null;
	}
	for (let t: Node | null = !child && last.nodeType === 3 && node.nodeType !== 3 ? last : walker.previousNode(); t; t = walker.previousNode()) {
		const s = index.startOf.get(t as Text);
		if (s !== undefined) {
			return s + (t as Text).length;
		}
	}
	return null;
}

/** A Range's span in the index, whitespace trimmed off both ends; null when nothing is left or it is outside the index. */
export function spanOfRange(index: TextIndex, range: Range): [number, number] | null {
	const s = offsetOf(index, range.startContainer, range.startOffset, false);
	const e = offsetOf(index, range.endContainer, range.endOffset, true);
	if (s === null || e === null || e <= s) {
		return null;
	}
	return trimSpan(index, s, e);
}

/** `[s, e)` with whitespace trimmed off both ends; null when nothing is left. */
export function trimSpan(index: TextIndex, s: number, e: number): [number, number] | null {
	while (s < e && /\s/.test(index.text[s]!)) {
		s += 1;
	}
	while (e > s && /\s/.test(index.text[e - 1]!)) {
		e -= 1;
	}
	return e > s ? [s, e] : null;
}
