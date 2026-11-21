import { describe, expect, it } from 'vitest';
import { stroke, type PenItem } from '../../src/pen.js';

const ids = (): (() => string) => {
	let n = 0;
	return () => `n${++n}`;
};
const item = (id: string, color: string, s: number, e: number): PenItem => ({ id, color, span: [s, e] });

describe('the pen', () => {
	it('makes a new highlight where there is none', () => {
		expect(stroke([], [0, 5], 'yellow', ids())).toEqual({ id: 'n1', added: [item('n1', 'yellow', 0, 5)], updated: [], removed: [] });
	});

	it('extends a highlight of the same colour it overlaps or touches', () => {
		const r = stroke([item('a', 'yellow', 0, 5)], [5, 9], 'yellow', ids());
		expect(r).toEqual({ id: 'a', added: [], updated: [item('a', 'yellow', 0, 9)], removed: [] });
	});

	it('changes nothing when the stroke lies inside a highlight of its colour', () => {
		expect(stroke([item('a', 'yellow', 0, 9)], [2, 4], 'yellow', ids())).toEqual({ id: 'a', added: [], updated: [], removed: [] });
	});

	it('joins the same-coloured highlights it bridges, the earliest keeping its id', () => {
		const r = stroke([item('a', 'yellow', 0, 3), item('b', 'yellow', 6, 9)], [2, 7], 'yellow', ids());
		expect(r).toEqual({ id: 'a', added: [], updated: [item('a', 'yellow', 0, 9)], removed: ['b'] });
	});

	it('cuts back another colour it covers part of', () => {
		const r = stroke([item('a', 'green', 0, 10)], [6, 12], 'yellow', ids());
		expect(r.updated).toEqual([item('a', 'green', 0, 6)]);
		expect(r.added).toEqual([item('n1', 'yellow', 6, 12)]);
	});

	it('cuts another colour in two, its first part keeping its id', () => {
		const r = stroke([item('a', 'green', 0, 10)], [3, 6], 'yellow', ids());
		expect(r.added).toEqual([item('n1', 'yellow', 3, 6), item('n2', 'green', 6, 10)]);
		expect(r.updated).toEqual([item('a', 'green', 0, 3)]);
	});

	it('keeps the id on the part after when nothing is left before', () => {
		const r = stroke([item('a', 'green', 4, 10)], [0, 6], 'yellow', ids());
		expect(r.updated).toEqual([item('a', 'green', 6, 10)]);
	});

	it('removes another colour it covers whole', () => {
		const r = stroke([item('a', 'green', 3, 5)], [0, 9], 'yellow', ids());
		expect(r.removed).toEqual(['a']);
	});

	it("doesn't touch another colour it only meets at an edge", () => {
		const r = stroke([item('a', 'green', 0, 5)], [5, 9], 'yellow', ids());
		expect(r.updated).toEqual([]);
		expect(r.removed).toEqual([]);
	});
});
