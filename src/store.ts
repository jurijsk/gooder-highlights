/**
 * gooder-highlights/store: the default store. A page's highlights and palette kept in the browser's `localStorage`, by the page's address, wired to `load` and `onChange` as any client wires its
 * own. A plain page gets working highlights with it and the default UI. Storage that can't be read or written (a private window, blocked site data) leaves the highlights unsaved, nothing worse.
 */
import type { Highlights, Stored } from './highlights.js';

export interface LocalStore {
	readonly key: string;
	/** What is kept for the page. */
	read(): Stored;
	/** Stop saving. */
	dispose(): void;
}

/** Load the page's highlights into `highlights` and save every change it makes. `key` defaults to the page's address without its fragment. */
export function localStore(highlights: Highlights, key?: string): LocalStore {
	const view = highlights.document.defaultView;
	const k = `gooder-highlights:${key ?? (view ? view.location.origin + view.location.pathname + view.location.search : 'page')}`;
	const storage = ((): Storage | null => {
		try {
			return view?.localStorage ?? null;
		} catch {
			return null;
		}
	})();
	const read = (): Stored => {
		try {
			const raw = storage?.getItem(k);
			const parsed = raw ? (JSON.parse(raw) as Stored) : {};
			return { records: Array.isArray(parsed.records) ? parsed.records : [], palette: parsed.palette ?? {} };
		} catch {
			return { records: [], palette: {} };
		}
	};
	let palette = read().palette ?? {};
	highlights.load(read());
	const stop = highlights.onChange((change) => {
		if (change.palette) {
			palette = change.palette;
		}
		try {
			storage?.setItem(k, JSON.stringify({ records: change.all, palette }));
		} catch {
			// Full or blocked: the highlights stay on the page, unsaved.
		}
	});
	return { key: k, read, dispose: stop };
}
