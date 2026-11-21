// Writes src/ui/css.ts from src/ui.css, so a client that bundles no CSS can have the panel's styles put in for it (`highlightsPanel(h, { styles: true })`). ui.css is the source.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const css = readFileSync(resolve(root, 'src/ui.css'), 'utf8');
const out = `// Generated from src/ui.css by scripts/css-module.mjs: edit ui.css, not this.\nexport const PANEL_CSS = ${JSON.stringify(css)};\n`;
writeFileSync(resolve(root, 'src/ui/css.ts'), out);
