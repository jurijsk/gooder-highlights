// The demo: a plain page with the default UI and the default store. Its tests run on it.
import { createHighlights, toTextFragment } from '../src/index.js';
import { localStore } from '../src/store.js';
import { highlightsPanel } from '../src/ui/panel.js';

const highlights = createHighlights(document.querySelector('main')!);
localStore(highlights, 'demo');
highlightsPanel(highlights);
Object.assign(window, { highlights, toTextFragment });
