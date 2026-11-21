import { beforeEach, describe, expect, it } from 'vitest';
import { anchorOf, rangeOf, spanOfAnchor, toTextFragment } from '../../src/places/anchor.js';
import { buildTextIndex, rangeForSpan, spanOfRange } from '../../src/places/textIndex.js';

const page = (html: string): HTMLElement => {
	document.body.innerHTML = html;
	return document.body;
};

const select = (node: Node, start: number, endNode: Node, end: number): Range => {
	const r = document.createRange();
	r.setStart(node, start);
	r.setEnd(endNode, end);
	return r;
};

describe('the page as text', () => {
	beforeEach(() => page(''));

	it('runs text through inline elements and breaks it between blocks and cells', () => {
		const root = page('<p>see <a href="#">here</a>.</p><table><tr><td>one</td><td>two</td></tr></table><script>var x = 1</script>');
		expect(buildTextIndex(root).text).toBe('see here.\none\ntwo');
	});

	it('trims whitespace off a selection', () => {
		const root = page('<p>  the passage  </p>');
		const t = root.querySelector('p')!.firstChild!;
		const idx = buildTextIndex(root);
		const span = spanOfRange(idx, select(t, 0, t, (t as Text).length))!;
		expect(idx.text.slice(span[0], span[1])).toBe('the passage');
	});
});

describe('anchors', () => {
	it('names a unique passage by its text alone, and finds it again', () => {
		const root = page('<p>The harbour was quiet. Ships waited for the tide.</p>');
		const t = root.querySelector('p')!.firstChild as Text;
		const at = t.data.indexOf('Ships');
		const anchor = anchorOf(select(t, at, t, at + 'Ships waited'.length), root)!;
		expect(anchor[0]).toEqual({ type: 'TextQuoteSelector', exact: 'Ships waited' });
		expect(rangeOf(anchor, root)!.toString()).toBe('Ships waited');
	});

	it('takes words around a repeated passage until it is the only match', () => {
		const root = page('<p>the tide came in.</p><p>the tide went out.</p>');
		const second = root.querySelectorAll('p')[1]!.firstChild as Text;
		const anchor = anchorOf(select(second, 0, second, 'the tide'.length), root)!;
		expect(anchor[0].prefix ?? anchor[0].suffix).toBeTruthy();
		const r = rangeOf(anchor, root)!;
		expect(r.startContainer).toBe(second);
	});

	it('finds a passage again after the text around it changes', () => {
		const root = page('<p>Before. The storm signal went up.</p>');
		const t = root.querySelector('p')!.firstChild as Text;
		const at = t.data.indexOf('storm signal');
		const anchor = anchorOf(select(t, at, t, at + 'storm signal'.length), root)!;
		root.querySelector('p')!.insertAdjacentHTML('afterbegin', '<b>A new first sentence.</b> ');
		expect(rangeOf(anchor, root)!.toString()).toBe('storm signal');
	});

	it('is gone when its passage is', () => {
		const root = page('<p>The storm signal went up.</p>');
		const t = root.querySelector('p')!.firstChild as Text;
		const anchor = anchorOf(select(t, 4, t, 16), root)!;
		root.querySelector('p')!.textContent = 'Calm seas.';
		expect(rangeOf(anchor, root)).toBeNull();
	});

	it('spans elements: the end of one paragraph and the start of the next', () => {
		const root = page('<p>first one</p><p>second two</p>');
		const [a, b] = Array.from(root.querySelectorAll('p')).map((p) => p.firstChild as Text);
		const anchor = anchorOf(select(a!, 6, b!, 6), root)!;
		expect(anchor[0].exact).toBe('one\nsecond');
		const idx = buildTextIndex(root);
		const span = spanOfAnchor(idx, anchor)!;
		expect(rangeForSpan(idx, span[0], span[1])!.toString()).toBe('onesecond');
	});

	it('picks the occurrence nearest its position when context can not tell two apart', () => {
		const root = page('<p>same words</p><p>same words</p>');
		const second = root.querySelectorAll('p')[1]!.firstChild as Text;
		const anchor = anchorOf(select(second, 0, second, 10), root)!;
		expect(rangeOf(anchor, root)!.startContainer).toBe(second);
	});
});

describe('text fragments', () => {
	it('carry the passage and its context', () => {
		expect(toTextFragment([{ type: 'TextQuoteSelector', exact: 'the tide', suffix: 'went out' }, { type: 'TextPositionSelector', start: 0, end: 8 }])).toBe(
			'#:~:text=the%20tide,-went%20out',
		);
	});

	it('name a long passage by its first and last words, and escape what the syntax uses', () => {
		const exact = 'one two three four five six seven eight nine-ten';
		expect(toTextFragment([{ type: 'TextQuoteSelector', exact, prefix: 'a, b' }, { type: 'TextPositionSelector', start: 0, end: exact.length }])).toBe(
			'#:~:text=a%2C%20b-,one%20two%20three%20four,six%20seven%20eight%20nine%2Dten',
		);
	});
});
