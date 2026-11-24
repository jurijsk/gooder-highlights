import { beforeEach, describe, expect, it } from 'vitest';
import { createHighlights, type Change, type Highlights } from '../../src/highlights.js';
import { localStore } from '../../src/store.js';

let h: Highlights;
let changes: Change[];

const page = (html: string): HTMLElement => {
	document.body.innerHTML = html;
	return document.body;
};
const rangeOfText = (text: string, occurrence = 0): Range => {
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
	let seen = 0;
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const t = n as Text;
		let at = t.data.indexOf(text);
		while (at >= 0) {
			if (seen++ === occurrence) {
				const r = document.createRange();
				r.setStart(t, at);
				r.setEnd(t, at + text.length);
				return r;
			}
			at = t.data.indexOf(text, at + 1);
		}
	}
	throw new Error(`no ${text}`);
};

beforeEach(() => {
	document.defaultView!.localStorage.clear();
	const root = page('<p>The harbour was quiet. Ships waited for the tide, their lamps low.</p><p>The pilot boat crossed to the outer mark.</p>');
	h = createHighlights(root, { observe: false });
	changes = [];
	h.onChange((c) => changes.push(c));
});

describe('highlights', () => {
	it('adds one, reports it, and lists it, without the Highlight API (painting skipped)', () => {
		const made = h.add(rangeOfText('Ships waited'))!;
		expect(made.text).toBe('Ships waited');
		expect(made.record).toMatchObject({ v: 1, color: 'yellow' });
		expect(made.record.id).toMatch(/^h[0-9a-z]+$/);
		expect(changes).toHaveLength(1);
		expect(changes[0]!.added).toHaveLength(1);
		expect(changes[0]!.all).toHaveLength(1);
		expect(h.list().map((x) => x.text)).toEqual(['Ships waited']);
	});

	it('follows the pen: the same colour extends, another cuts back', () => {
		const a = h.add(rangeOfText('Ships waited'))!;
		h.add(rangeOfText('waited for the tide'));
		expect(h.list().map((x) => [x.text, x.record.id])).toEqual([['Ships waited for the tide', a.record.id]]);
		h.add(rangeOfText('the tide'), 'green');
		expect(h.list().map((x) => [x.text, x.record.color])).toEqual([
			['Ships waited for', 'yellow'],
			['the tide', 'green'],
		]);
	});

	it('removes, recolours, and finds the one a caret is in', () => {
		const a = h.add(rangeOfText('pilot boat'))!;
		const caret = rangeOfText('boat');
		caret.collapse(true);
		expect(h.containing(caret)!.record.id).toBe(a.record.id);
		h.recolor(a.record.id, 'pink');
		expect(h.get(a.record.id)!.record.color).toBe('pink');
		h.remove(a.record.id);
		expect(h.list()).toEqual([]);
		expect(changes.at(-1)!.removed).toEqual([a.record.id]);
	});

	it('keeps an orphan, lists it last, and paints it again when its passage comes back', () => {
		const a = h.add(rangeOfText('outer mark'))!;
		h.add(rangeOfText('harbour'));
		const p = document.querySelectorAll('p')[1]!;
		const before = p.textContent;
		p.textContent = 'Nothing here now.';
		h.refresh();
		const list = h.list();
		expect(list.map((x) => [x.text, x.orphaned])).toEqual([
			['harbour', false],
			['outer mark', true],
		]);
		p.textContent = before;
		h.refresh();
		expect(h.get(a.record.id)!.orphaned).toBe(false);
	});

	it('loads what was stored, reporting nothing, and takes changes from elsewhere without reporting them', () => {
		const a = h.add(rangeOfText('harbour'))!;
		const stored = { records: changes[0]!.all, palette: {} };
		const other = createHighlights(document.body, { observe: false });
		const seen: Change[] = [];
		other.onChange((c) => seen.push(c));
		other.load({ records: [...stored.records, { junk: true }], palette: stored.palette });
		expect(other.list().map((x) => x.record.id)).toEqual([a.record.id]);
		other.apply({ added: [], updated: [], removed: [a.record.id] });
		expect(other.list()).toEqual([]);
		expect(seen).toEqual([]);
	});

	it('names a colour, changes its value, adds one of its own: reported as the palette', () => {
		h.nameColor('yellow', 'to check');
		expect(changes.at(-1)!.palette).toEqual({ yellow: { name: 'to check' } });
		h.setColor('blue', 'rgb(0 0 255 / 0.5)');
		expect(h.palette().find((e) => e.id === 'blue')).toMatchObject({ light: 'rgb(0 0 255 / 0.5)', dark: 'rgb(0 0 255 / 0.4)' });
		const own = h.addColor('rgb(120 90 220 / 0.45)', 'sources');
		expect(own.id).toMatch(/^p/);
		const made = h.add(rangeOfText('lamps'), own.id)!;
		expect(made.record.color).toBe(own.id);
	});

	it('puts one back as it was: an erased one is added again, a changed one updated, each reported; the same record again reports nothing', () => {
		const a = h.add(rangeOfText('Ships waited'), 'yellow')!;
		const before = a.record;
		h.remove(before.id);
		changes = [];
		const back = h.put(before)!;
		expect(back.text).toBe('Ships waited');
		expect(changes).toHaveLength(1);
		expect(changes[0]!.added.map((r) => r.id)).toEqual([before.id]);
		h.recolor(before.id, 'pink');
		changes = [];
		h.put({ ...before, data: { thread: 'c8' } });
		expect(h.get(before.id)!.record).toMatchObject({ color: 'yellow', data: { thread: 'c8' } });
		expect(changes[0]!.updated.map((r) => r.id)).toEqual([before.id]);
		changes = [];
		h.put(h.get(before.id)!.record);
		expect(changes).toHaveLength(0);
		expect(h.put({ ...before, color: 'no-such-colour' })).toBeNull();
	});

	it('refuses a colour the palette has not got', () => {
		expect(h.add(rangeOfText('lamps'), 'violet')).toBeNull();
	});
});

describe('the default store', () => {
	it('saves every change in localStorage and loads it back', () => {
		const s = localStore(h, 'test');
		h.add(rangeOfText('harbour'));
		h.nameColor('green', 'done');
		const kept = JSON.parse(document.defaultView!.localStorage.getItem(s.key)!);
		expect(kept.records).toHaveLength(1);
		expect(kept.palette).toEqual({ green: { name: 'done' } });
		const again = createHighlights(document.body, { observe: false });
		localStore(again, 'test');
		expect(again.list().map((x) => x.text)).toEqual(['harbour']);
		expect(again.palette()[1]!.name).toBe('done');
	});
});

describe('two sets of highlights in one document', () => {
	it('paint under names of their own, so neither paints over the other', async () => {
		const { highlightName } = await import('../../src/highlights.js');
		expect(highlightName('yellow')).toBe('gooder-highlight-yellow');
		expect(highlightName('yellow', 2)).toBe('gooder-highlight-2-yellow');
	});
});

describe('a root the page replaces', () => {
	const prose = (): HTMLElement => {
		document.body.innerHTML = '<article class="prose"><p>The harbour was quiet. Ships waited for the tide.</p><p>The pilot boat crossed to the outer mark.</p></article>';
		return document.querySelector<HTMLElement>('.prose')!;
	};
	/** The page draws the same text again as a new element, as a framework does. */
	const redraw = (): HTMLElement => {
		const old = document.querySelector<HTMLElement>('.prose')!;
		const next = old.cloneNode(true) as HTMLElement;
		old.replaceWith(next);
		return next;
	};
	const until = async (done: () => boolean): Promise<void> => {
		for (let i = 0; i < 50 && !done(); i++) {
			await new Promise((r) => setTimeout(r, 10));
		}
	};

	it('given as an element, stays on it: a range in the new one is not its text', () => {
		const old = prose();
		const fixed = createHighlights(old, { observe: false });
		redraw();
		expect(fixed.add(rangeOfText('pilot boat'))).toBeNull();
		expect(fixed.root).toBe(old);
		fixed.dispose();
	});

	it('given as a function, moves to the new element at once on the next call: found there, and a range in it highlighted', () => {
		const old = prose();
		const moving = createHighlights(() => document.querySelector('.prose'), { observe: false });
		expect(moving.root).toBe(old);
		const a = moving.add(rangeOfText('Ships waited'))!;
		const reported: Change[] = [];
		moving.onChange((c) => reported.push(c));
		const next = redraw();
		const b = moving.add(rangeOfText('pilot boat'));
		expect(b?.text).toBe('pilot boat');
		expect(moving.root).toBe(next);
		const kept = moving.get(a.record.id)!;
		expect(kept.orphaned).toBe(false);
		expect(next.contains(kept.range!.startContainer)).toBe(true);
		expect(reported.map((c) => c.added.length)).toEqual([1]); // the add, and nothing for the move
		moving.dispose();
	});

	it('given as a function, follows by itself: records, the one picked and the listeners kept; updated, nothing reported', async () => {
		prose();
		const moving = createHighlights(() => document.querySelector('.prose'));
		const a = moving.add(rangeOfText('outer mark'), 'green')!;
		moving.setActive(a.record.id);
		let updates = 0;
		const reported: Change[] = [];
		moving.onUpdate(() => updates++);
		moving.onChange((c) => reported.push(c));
		const next = redraw();
		await until(() => updates > 0);
		expect(updates).toBeGreaterThan(0);
		expect(reported).toEqual([]);
		const kept = moving.get(a.record.id)!;
		expect(kept.record.color).toBe('green');
		expect(next.contains(kept.range!.startContainer)).toBe(true);
		expect(moving.root).toBe(next);
		moving.recolor(a.record.id, 'pink');
		expect(reported.at(-1)!.updated[0]!.color).toBe('pink');
		moving.dispose();
	});

	it('waits while the function finds nothing, and moves when the new element comes', async () => {
		const old = prose();
		const moving = createHighlights(() => document.querySelector('.prose'));
		const a = moving.add(rangeOfText('harbour'))!;
		const parent = old.parentNode!;
		const copy = old.cloneNode(true) as HTMLElement;
		old.remove();
		await new Promise((r) => setTimeout(r, 40));
		expect(moving.root).toBe(old);
		parent.appendChild(copy);
		await until(() => moving.get(a.record.id)!.range?.startContainer.isConnected === true);
		expect(copy.contains(moving.get(a.record.id)!.range!.startContainer)).toBe(true);
		moving.dispose();
	});

	it('stops following once disposed', async () => {
		const old = prose();
		const moving = createHighlights(() => document.querySelector('.prose'));
		let updates = 0;
		moving.onUpdate(() => updates++);
		moving.dispose();
		redraw();
		await new Promise((r) => setTimeout(r, 40));
		expect(updates).toBe(0);
		expect(moving.root).toBe(old);
	});

	it('refuses a function that finds no root', () => {
		document.body.innerHTML = '';
		expect(() => createHighlights(() => null)).toThrow(/found no node/);
	});
});
