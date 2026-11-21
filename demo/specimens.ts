// Live specimens of the default UI, for a design page that discusses it (Codon's docs/highlights-ui.html): each `[data-specimen]` element gets a sample text with highlights and the real panel
// inside it, not floating. `data-open` opens a folded part ("colours", "list"). Bundled (esbuild, iife) and put inline in the page.
import { createHighlights } from '../src/index.js';
import { highlightsPanel } from '../src/ui/panel.js';

const SAMPLE = 'The harbour was quiet. Ships waited for the tide, their lamps low, while the pilot boat crossed to the outer mark and the storm signal went up.';
const MARKS: [string, string][] = [
	['Ships waited for the tide', 'yellow'],
	['the pilot boat', 'blue'],
	['the storm signal', 'pink'],
];

function record(id: string, text: string, exact: string, color: string): unknown {
	const start = text.indexOf(exact);
	return {
		v: 1,
		id,
		color,
		anchor: [
			{ type: 'TextQuoteSelector', exact },
			{ type: 'TextPositionSelector', start, end: start + exact.length },
		],
	};
}

document.querySelectorAll<HTMLElement>('[data-specimen]').forEach((box, n) => {
	const text = document.createElement('p');
	text.className = 'specimen-text';
	text.textContent = SAMPLE;
	box.appendChild(text);
	const highlights = createHighlights(text, { observe: false });
	highlights.load({
		records: MARKS.map(([exact, color], i) => record(`h${n}-${i}`, SAMPLE, exact, color)),
		palette: box.dataset['open'] === 'colours' ? { yellow: { name: 'to check' } } : {},
	});
	const panel = highlightsPanel(highlights, { styles: n === 0, keys: { highlight: null, erase: null }, placeKey: `specimen-${n}` });
	panel.element.classList.add('specimen-panel');
	box.insertBefore(panel.element, text);
	const open = box.dataset['open'];
	if (open) {
		if (open === 'colours') {
			panel.element.querySelector<HTMLButtonElement>('.gh-settings')!.click();
		} else {
			panel.element.querySelector<HTMLDetailsElement>('.gh-list')!.open = true;
		}
	}
});
