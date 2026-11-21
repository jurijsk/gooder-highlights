/**
 * palette.ts: the colours. The library's five, each with a value for a light page and one for a dark page; a page or a site overrides them with CSS custom properties on `:root`
 * (`--gooder-highlight-yellow`, `--gooder-highlight-yellow-dark`); a document names a colour, changes its value or adds one of its own, and keeps only what differs from the five.
 * A value picked by a person is for a light page; its dark value is made from it: the same colour, the opacity lowered as the five's are.
 */

export interface PaletteColor {
	readonly id: string;
	readonly light: string;
	readonly dark: string;
}

/** The library's five, in order; the first is the default. */
export const DEFAULT_COLORS: readonly PaletteColor[] = [
	{ id: 'yellow', light: 'rgb(255 226 0 / 0.5)', dark: 'rgb(255 214 0 / 0.38)' },
	{ id: 'green', light: 'rgb(102 223 78 / 0.45)', dark: 'rgb(102 223 78 / 0.34)' },
	{ id: 'blue', light: 'rgb(80 190 245 / 0.42)', dark: 'rgb(100 195 245 / 0.36)' },
	{ id: 'pink', light: 'rgb(240 120 205 / 0.42)', dark: 'rgb(245 130 210 / 0.36)' },
	{ id: 'red', light: 'rgb(235 60 60 / 0.38)', dark: 'rgb(240 80 80 / 0.4)' },
];

/** The custom property a page sets to change one of the five: `--gooder-highlight-<id>`, and `-dark` after it for a dark page. */
export const colorProperty = (id: string, dark = false): string => `--gooder-highlight-${id}${dark ? '-dark' : ''}`;

/** A document's change to one colour: a name given, a value set (for a light page). An entry with an id not among the five is a custom colour, and has a value. */
export interface StoredColor {
	readonly name?: string;
	readonly value?: string;
}

/** What a document keeps of its palette, by colour id: only what differs from the five. */
export type StoredPalette = Readonly<Record<string, StoredColor>>;

/** A colour as a client sees it. */
export interface Entry {
	readonly id: string;
	readonly name: string;
	/** Painted on a light page. */
	readonly light: string;
	/** Painted on a dark page. */
	readonly dark: string;
	readonly custom: boolean;
}

/** How much a value's opacity is lowered on a dark page: the five's dark opacities are about four fifths of their light ones. */
const DARK_ALPHA = 0.8;

/** `rgb(r g b / a)`, `rgba(r, g, b, a)` or `#rrggbb[aa]` as numbers; null for anything else. */
export function parseColor(value: string): { r: number; g: number; b: number; a: number } | null {
	const v = value.trim();
	const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(v);
	if (hex) {
		const n = parseInt(hex[1]!, 16);
		return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: hex[2] ? parseInt(hex[2], 16) / 255 : 1 };
	}
	const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/i.exec(v);
	if (!fn) {
		return null;
	}
	const a = fn[4] === undefined ? 1 : fn[5] ? Number(fn[4]) / 100 : Number(fn[4]);
	return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a };
}

const round = (n: number): number => Math.round(n * 100) / 100;

/** The dark-page value made from a light-page one: the same colour, its opacity lowered. A value that can't be read is used as it is. */
export function darkOf(value: string): string {
	const c = parseColor(value);
	return c ? `rgb(${c.r} ${c.g} ${c.b} / ${round(c.a * DARK_ALPHA)})` : value;
}

/** The palette a document has: the five, as a page may have changed them, with the document's names and values; then the document's own colours, in the order they were added. */
export function entriesOf(stored: StoredPalette, pageValue: (property: string) => string = () => ''): Entry[] {
	const entries: Entry[] = DEFAULT_COLORS.map((c) => {
		const own = stored[c.id];
		const light = own?.value ?? (pageValue(colorProperty(c.id)) || c.light);
		const dark = own?.value ? darkOf(own.value) : pageValue(colorProperty(c.id, true)) || c.dark;
		return { id: c.id, name: own?.name ?? '', light, dark, custom: false };
	});
	for (const [id, own] of Object.entries(stored)) {
		if (!DEFAULT_COLORS.some((c) => c.id === id) && own.value) {
			entries.push({ id, name: own.name ?? '', light: own.value, dark: darkOf(own.value), custom: true });
		}
	}
	return entries;
}

/** Whether a value read from storage is a stored palette. */
export function isStoredPalette(value: unknown): value is StoredPalette {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	return Object.values(value as Record<string, unknown>).every((c) => {
		const o = c as Record<string, unknown> | null;
		return !!o && typeof o === 'object' && (o['name'] === undefined || typeof o['name'] === 'string') && (o['value'] === undefined || typeof o['value'] === 'string');
	});
}

/** The stored palette without what no longer differs: an empty name, a custom colour no highlight uses and nobody named. */
export function prunePalette(stored: StoredPalette, used: ReadonlySet<string>): StoredPalette {
	const out: Record<string, StoredColor> = {};
	for (const [id, own] of Object.entries(stored)) {
		const isDefault = DEFAULT_COLORS.some((c) => c.id === id);
		const name = own.name || undefined;
		if (!isDefault && !name && !used.has(id)) {
			continue;
		}
		if (!name && !own.value) {
			continue;
		}
		out[id] = { ...(name ? { name } : {}), ...(own.value ? { value: own.value } : {}) };
	}
	return out;
}
