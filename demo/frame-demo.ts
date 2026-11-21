// The demo of a page in a same-origin frame, as the Codon Page view has it: the highlights on the frame's document, the panel in the outer one.
import { createHighlights } from '../src/index.js';
import { localStore } from '../src/store.js';
import { highlightsPanel } from '../src/ui/panel.js';

const frame = document.getElementById('page') as HTMLIFrameElement;
const start = (): void => {
	const doc = frame.contentDocument!;
	const highlights = createHighlights(doc.querySelector('main')!);
	localStore(highlights, 'frame-demo');
	highlightsPanel(highlights, { container: document });
	(window as unknown as { highlights: typeof highlights }).highlights = highlights;
};
if (frame.contentDocument?.readyState === 'complete' && frame.contentDocument.querySelector('main')) {
	start();
} else {
	frame.addEventListener('load', start, { once: true });
}
