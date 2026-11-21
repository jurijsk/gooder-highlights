/**
 * anchor.ts: remembering a passage, and finding it again.
 *
 * An anchor is a pair of W3C Web Annotation selectors (https://www.w3.org/TR/annotation-model/#selectors): a TextQuoteSelector, the passage's text and, where that text occurs more than once,
 * the words before and after it that tell the occurrences apart; and a TextPositionSelector, where it was in the page's text, which only decides between equal candidates. Context grows a word at
 * a time until the quote is the only match. Text is compared ignoring case and runs of whitespace, as a browser compares a text fragment.
 */
import { buildTextIndex, matchSpans, rangeForSpan, spanOfRange, type TextIndex } from './textIndex.js';

export interface TextQuoteSelector {
	readonly type: 'TextQuoteSelector';
	readonly exact: string;
	readonly prefix?: string;
	readonly suffix?: string;
}

export interface TextPositionSelector {
	readonly type: 'TextPositionSelector';
	readonly start: number;
	readonly end: number;
}

export type Anchor = readonly [TextQuoteSelector, TextPositionSelector];

/** Context is grown up to this many words on each side. */
const MAX_CONTEXT_WORDS = 32;
/** How much text around an occurrence is read when comparing context. */
const WINDOW = 800;

const norm = (s: string): string => s.replace(/\s+/g, ' ');
const fold = (s?: string): string => (s ? norm(s.toLowerCase()).trim() : '');

function textBefore(index: TextIndex, at: number, folded: boolean, window: number): string {
	return norm((folded ? index.folded : index.text).slice(Math.max(0, at - window), at)).trimEnd();
}

function textAfter(index: TextIndex, at: number, folded: boolean, window: number): string {
	return norm((folded ? index.folded : index.text).slice(at, at + window)).trimStart();
}

/** Whether the text before `at` ends with `p`, reading only as much as `p` needs. */
function endsBefore(index: TextIndex, at: number, p: string): boolean {
	for (let window = p.length * 2 + 16; ; window = Math.min(WINDOW, window * 4)) {
		const text = textBefore(index, at, true, window);
		if (text.length > p.length || at - window <= 0 || window >= WINDOW) {
			return text.endsWith(p);
		}
	}
}

function startsAfter(index: TextIndex, at: number, q: string): boolean {
	for (let window = q.length * 2 + 16; ; window = Math.min(WINDOW, window * 4)) {
		const text = textAfter(index, at, true, window);
		if (text.length > q.length || at + window >= index.folded.length || window >= WINDOW) {
			return text.startsWith(q);
		}
	}
}

/** The spans of `exact` whose surroundings match `prefix` and `suffix`. */
export function candidates(index: TextIndex, exact: string, prefix?: string, suffix?: string): [number, number][] {
	const p = fold(prefix);
	const q = fold(suffix);
	return matchSpans(index, exact).filter(([s, e]) => (!p || endsBefore(index, s, p)) && (!q || startsAfter(index, e, q)));
}

/** The smallest context that leaves only the occurrence at `s`; when even the largest leaves another identical passage, the largest, and the position decides. */
function uniqueContext(index: TextIndex, exact: string, s: number, e: number): { prefix?: string; suffix?: string } {
	if (matchSpans(index, exact).length <= 1) {
		return {};
	}
	const wordsBefore = textBefore(index, s, false, WINDOW).split(' ').filter(Boolean);
	const wordsAfter = textAfter(index, e, false, WINDOW).split(' ').filter(Boolean);
	const make = (kb: number, ka: number): { prefix?: string; suffix?: string } => ({
		...(kb ? { prefix: wordsBefore.slice(-kb).join(' ') } : {}),
		...(ka ? { suffix: wordsAfter.slice(0, ka).join(' ') } : {}),
	});
	const unique = (c: { prefix?: string; suffix?: string }): boolean => {
		const left = candidates(index, exact, c.prefix, c.suffix);
		return left.length === 1 && left[0]![0] === s;
	};
	const most = Math.max(Math.min(MAX_CONTEXT_WORDS, wordsBefore.length), Math.min(MAX_CONTEXT_WORDS, wordsAfter.length));
	for (let k = 1; k <= most; k += 1) {
		const kb = Math.min(k, wordsBefore.length);
		const ka = Math.min(k, wordsAfter.length);
		for (const c of [make(kb, 0), make(0, ka), make(kb, ka)]) {
			if ((c.prefix || c.suffix) && unique(c)) {
				return c;
			}
		}
	}
	return make(Math.min(MAX_CONTEXT_WORDS, wordsBefore.length), Math.min(MAX_CONTEXT_WORDS, wordsAfter.length));
}

/** The anchor of `[s, e)` in the index. */
export function anchorOfSpan(index: TextIndex, s: number, e: number): Anchor {
	const exact = index.text.slice(s, e);
	return [
		{ type: 'TextQuoteSelector', exact, ...uniqueContext(index, exact, s, e) },
		{ type: 'TextPositionSelector', start: s, end: e },
	];
}

/** How far around its remembered position a passage is looked for first: most pages change little between visits, and reading the whole text for each of hundreds of highlights is what costs. */
const NEAR = 4000;

/** Where an anchor is in the index: the candidate nearest its position; null when its text is not there. */
export function spanOfAnchor(index: TextIndex, anchor: Anchor): [number, number] | null {
	const [quote, position] = anchor;
	const near = nearCandidate(index, quote, position.start);
	if (near) {
		return near;
	}
	const found = candidates(index, quote.exact, quote.prefix, quote.suffix);
	if (found.length === 0) {
		return null;
	}
	let best = found[0]!;
	for (const c of found) {
		if (Math.abs(c[0] - position.start) < Math.abs(best[0] - position.start)) {
			best = c;
		}
	}
	return best;
}

/**
 * The matching occurrence nearest the remembered position, looked for within NEAR of it only. Any occurrence outside is farther, so when one is found here it is the one a search of the
 * whole text would pick.
 */
function nearCandidate(index: TextIndex, quote: TextQuoteSelector, at: number): [number, number] | null {
	const lower = quote.exact.toLowerCase();
	if (!lower) {
		return null;
	}
	const from = Math.max(0, at - NEAR);
	const to = Math.min(index.folded.length, at + NEAR + lower.length);
	const p = fold(quote.prefix);
	const q = fold(quote.suffix);
	let best: [number, number] | null = null;
	const window = index.folded.slice(from, to);
	for (let w = window.indexOf(lower); w !== -1; w = window.indexOf(lower, w + 1)) {
		const i = from + w;
		if ((!p || endsBefore(index, i, p)) && (!q || startsAfter(index, i + lower.length, q))) {
			if (!best || Math.abs(i - at) < Math.abs(best[0] - at)) {
				best = [i, i + lower.length];
			}
		}
	}
	return best;
}

/** The anchor of a selection's range in `root`, or null when it holds no text. */
export function anchorOf(range: Range, root: Node, index: TextIndex = buildTextIndex(root)): Anchor | null {
	const span = spanOfRange(index, range);
	return span ? anchorOfSpan(index, span[0], span[1]) : null;
}

/** The range an anchor names in `root` now, or null when its passage is gone. */
export function rangeOf(anchor: Anchor, root: Node, index: TextIndex = buildTextIndex(root)): Range | null {
	const span = spanOfAnchor(index, anchor);
	return span ? rangeForSpan(index, span[0], span[1]) : null;
}

/** Whether a value is an anchor, as read from storage. */
export function isAnchor(value: unknown): value is Anchor {
	if (!Array.isArray(value) || value.length !== 2) {
		return false;
	}
	const [q, p] = value as [Record<string, unknown>, Record<string, unknown>];
	return (
		!!q && q['type'] === 'TextQuoteSelector' && typeof q['exact'] === 'string' && !!q['exact'] && (q['prefix'] === undefined || typeof q['prefix'] === 'string') &&
		(q['suffix'] === undefined || typeof q['suffix'] === 'string') && !!p && p['type'] === 'TextPositionSelector' && Number.isInteger(p['start']) && Number.isInteger(p['end'])
	);
}

/**
 * A text fragment for an anchor (`#:~:text=prefix-,start,end,-suffix`), which a browser opens scrolled to the passage. A long passage is named by its first and last words. Line breaks between
 * runs become spaces, which the browser matches across elements.
 */
export function toTextFragment(anchor: Anchor): string {
	const [quote] = anchor;
	const enc = (s: string): string => encodeURIComponent(norm(s).trim()).replace(/-/g, '%2D').replace(/,/g, '%2C').replace(/&/g, '%26');
	const words = norm(quote.exact).trim().split(' ');
	const text = words.length > 8 ? `${enc(words.slice(0, 4).join(' '))},${enc(words.slice(-4).join(' '))}` : enc(quote.exact);
	const prefix = quote.prefix ? `${enc(quote.prefix.split(' ').slice(-3).join(' '))}-,` : '';
	const suffix = quote.suffix ? `,-${enc(quote.suffix.split(' ').slice(0, 3).join(' '))}` : '';
	return `#:~:text=${prefix}${text}${suffix}`;
}
