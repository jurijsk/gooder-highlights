import { describe, expect, it } from 'vitest';
import { darkOf, entriesOf, parseColor, prunePalette } from '../../src/palette.js';
import { newId } from '../../src/ids.js';

describe('colours', () => {
	it('read rgb(), rgba() and hex values', () => {
		expect(parseColor('rgb(255 226 0 / 0.5)')).toEqual({ r: 255, g: 226, b: 0, a: 0.5 });
		expect(parseColor('rgba(10, 20, 30, 0.4)')).toEqual({ r: 10, g: 20, b: 30, a: 0.4 });
		expect(parseColor('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: 128 / 255 });
		expect(parseColor('papayawhip')).toBeNull();
	});

	it('make a dark value from a light one by lowering its opacity a fifth', () => {
		expect(darkOf('rgb(120 90 220 / 0.45)')).toBe('rgb(120 90 220 / 0.36)');
		expect(darkOf('papayawhip')).toBe('papayawhip');
	});

	it('start as the five, then a document changes, names and adds', () => {
		const entries = entriesOf({ yellow: { name: 'to check' }, green: { value: 'rgb(0 200 0 / 0.5)' }, pabc: { name: 'sources', value: 'rgb(1 2 3 / 0.5)' } });
		expect(entries.map((e) => e.id)).toEqual(['yellow', 'green', 'blue', 'pink', 'red', 'pabc']);
		expect(entries[0]).toMatchObject({ name: 'to check', light: 'rgb(255 226 0 / 0.5)', custom: false });
		expect(entries[1]).toMatchObject({ light: 'rgb(0 200 0 / 0.5)', dark: 'rgb(0 200 0 / 0.4)' });
		expect(entries[5]).toMatchObject({ name: 'sources', custom: true });
	});

	it("take a page's own values where the document has none", () => {
		const entries = entriesOf({}, (p) => (p === '--gooder-highlight-blue' ? 'rgb(0 0 255 / 0.3)' : ''));
		expect(entries[2]!.light).toBe('rgb(0 0 255 / 0.3)');
	});

	it('keep only what differs, and a custom colour while it is used or named', () => {
		const pruned = prunePalette({ yellow: { name: '' }, pa: { value: 'red' }, pb: { value: 'blue' }, pc: { value: 'x', name: 'kept' } }, new Set(['pa']));
		expect(pruned).toEqual({ pa: { value: 'red' }, pc: { value: 'x', name: 'kept' } });
	});
});

describe('ids', () => {
	it('are the prefix, the time and four random characters, sorting by time', () => {
		const a = newId('h', 1_700_000_000_000, () => 0);
		const b = newId('h', 1_700_000_000_001, () => 0.99);
		expect(a).toBe('h' + (1_700_000_000_000).toString(36) + '0000');
		expect(a < b).toBe(true);
		expect(newId('p').startsWith('p')).toBe(true);
	});
});
