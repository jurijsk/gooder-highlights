import { expect, test, type Page, type Frame } from '@playwright/test';

type Where = Page | Frame;

/** Select `text` (its `occurrence`-th match) inside the element `#id`; `to` ends the selection in another element instead. */
async function select(where: Where, id: string, text: string, to?: { id: string; text: string }): Promise<void> {
	await where.evaluate(
		({ id, text, to }) => {
			const find = (elId: string, t: string, end: boolean): [Node, number] => {
				const el = document.getElementById(elId)!;
				const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
				for (let n = walker.nextNode(); n; n = walker.nextNode()) {
					const at = (n as Text).data.indexOf(t);
					if (at >= 0) {
						return [n, end ? at + t.length : at];
					}
				}
				throw new Error(`no ${t} in #${elId}`);
			};
			const [sn, so] = find(id, text, false);
			const [en, eo] = to ? find(to.id, to.text, true) : find(id, text, true);
			const r = document.createRange();
			r.setStart(sn, so);
			r.setEnd(en, eo);
			const sel = document.getSelection()!;
			sel.removeAllRanges();
			sel.addRange(r);
		},
		{ id, text, to },
	);
}

/** How many ranges each colour paints. */
const painted = (where: Where): Promise<Record<string, number>> =>
	where.evaluate(() => {
		const out: Record<string, number> = {};
		for (const [name, h] of (CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights) {
			if (name !== 'gooder-highlight-active') {
				out[name.replace('gooder-highlight-', '')] = h.size;
			}
		}
		return out;
	});

const texts = (page: Page): Promise<string[]> =>
	page.evaluate(() => (window as unknown as { highlights: { list(): { text: string; orphaned: boolean }[] } }).highlights.list().map((h) => (h.orphaned ? `(${h.text})` : h.text)));

test.beforeEach(async ({ page }) => {
	await page.goto('/demo/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test('select, click a swatch: highlighted, and still there after a reload', async ({ page }) => {
	await select(page, 'p1', 'Ships waited for the tide');
	await page.getByRole('button', { name: 'yellow' }).click();
	expect(await painted(page)).toEqual({ yellow: 1 });
	expect(await texts(page)).toEqual(['Ships waited for the tide']);
	await page.reload();
	expect(await painted(page)).toEqual({ yellow: 1 });
	await expect(page.locator('.gh-list summary')).toHaveText('Highlights (1)');
});

test('the pen: the same colour extends and joins, another colour cuts back or in two', async ({ page }) => {
	await select(page, 'p1', 'Ships waited');
	await page.getByRole('button', { name: 'yellow' }).click();
	await select(page, 'p1', 'the tide');
	await page.getByRole('button', { name: 'yellow' }).click();
	await select(page, 'p1', 'waited for the');
	await page.getByRole('button', { name: 'yellow' }).click();
	expect(await texts(page)).toEqual(['Ships waited for the tide']);
	await select(page, 'p1', 'for');
	await page.getByRole('button', { name: 'green' }).click();
	expect(await texts(page)).toEqual(['Ships waited', 'for', 'the tide']);
	expect(await painted(page)).toEqual({ yellow: 2, green: 1 });
});

test('Erase and Delete remove the highlight the caret is in; Delete in a field deletes text', async ({ page }) => {
	await select(page, 'p1', 'pilot boat');
	await page.getByRole('button', { name: 'pink' }).click();
	await page.getByText('pilot boat', { exact: false }).first().click({ position: { x: 5, y: 5 } });
	await select(page, 'p1', 'pilot');
	await page.evaluate(() => document.getSelection()!.collapseToStart());
	await page.keyboard.press('Delete');
	expect(await texts(page)).toEqual([]);

	await select(page, 'p2', 'pilot boat');
	await page.getByRole('button', { name: 'blue' }).click();
	await select(page, 'p2', 'boat');
	await page.getByRole('button', { name: 'Erase' }).click();
	expect(await texts(page)).toEqual([]);

	await page.locator('#field').click();
	await page.keyboard.press('End');
	await page.keyboard.press('Backspace');
	await page.keyboard.press('Home');
	await page.keyboard.press('Delete');
	await expect(page.locator('#field')).toHaveValue('ype her');
});

test('a colour named and its value changed: repainted, and both survive a reload', async ({ page }) => {
	await select(page, 'p3', 'harbour master');
	await page.getByRole('button', { name: 'green' }).click();
	await page.getByRole('button', { name: 'Colours' }).click();
	const green = page.locator('.gh-color').nth(1);
	await green.locator('.gh-name').fill('done');
	await green.locator('.gh-name').press('Enter');
	await green.locator('input[type=color]').evaluate((input: HTMLInputElement) => {
		input.value = '#0000ff';
		input.dispatchEvent(new Event('change', { bubbles: true }));
	});
	const rule = (): Promise<string> =>
		page.evaluate(() =>
			document.adoptedStyleSheets
				.flatMap((s) => Array.from(s.cssRules))
				.map((r) => r.cssText)
				.find((t) => t.includes('gooder-highlight-green'))!,
		);
	expect(await rule()).toContain('0, 0, 255');
	await page.reload();
	expect(await rule()).toContain('0, 0, 255');
	await expect(page.getByRole('button', { name: 'done' })).toBeVisible();
});

test('the gear opens and closes the colours; there is no colour of one\'s own to pick', async ({ page }) => {
	const gear = page.getByRole('button', { name: 'Colours' });
	await expect(page.locator('.gh-colors')).toBeHidden();
	await gear.click();
	await expect(page.locator('.gh-color')).toHaveCount(5);
	await expect(gear).toHaveAttribute('aria-expanded', 'true');
	await gear.click();
	await expect(page.locator('.gh-colors')).toBeHidden();
	await expect(page.locator('.gooder-highlights-panel input[type=color]')).toHaveCount(5); // the colours' own pickers only, in the closed settings
});

test('the page changes: found again; its passage gone: orphaned and kept; back: painted again', async ({ page }) => {
	await select(page, 'p2', 'went out faster');
	await page.getByRole('button', { name: 'yellow' }).click();
	await page.evaluate(() => document.getElementById('p2')!.insertAdjacentHTML('afterbegin', '<b>New first words. </b>'));
	await expect.poll(() => painted(page)).toEqual({ yellow: 1 });
	const before = await page.evaluate(() => document.getElementById('p2')!.innerHTML);
	await page.evaluate(() => (document.getElementById('p2')!.textContent = 'Something else entirely.'));
	await expect.poll(() => texts(page)).toEqual(['(went out faster)']);
	await expect(page.locator('.gh-orphan')).toHaveCount(1);
	await page.evaluate((html) => (document.getElementById('p2')!.innerHTML = html), before);
	await expect.poll(() => texts(page)).toEqual(['went out faster']);
});

test('a selection across two paragraphs, and across table cells, is one highlight each', async ({ page }) => {
	await select(page, 'p1', 'storm signal', { id: 'p2', text: 'The tide came' });
	await page.getByRole('button', { name: 'yellow' }).click();
	await select(page, 'c1', 'Northern', { id: 'c2', text: 'Berth' });
	await page.getByRole('button', { name: 'blue' }).click();
	expect(await painted(page)).toEqual({ yellow: 1, blue: 1 });
	expect((await texts(page)).length).toBe(2);
});

test('the list: page order, a click brings one into view', async ({ page }) => {
	await select(page, 'p3', 'harbour master');
	await page.getByRole('button', { name: 'green' }).click();
	await select(page, 'p1', 'harbour');
	await page.getByRole('button', { name: 'yellow' }).click();
	await page.locator('.gh-list summary').click();
	await expect(page.locator('.gh-text')).toHaveText(['harbour', 'harbour master']);
	await page.locator('.gh-text', { hasText: 'harbour master' }).click();
	await expect(page.locator('.gh-current .gh-text')).toHaveText('harbour master');
});

test('a text fragment made from a highlight opens the page at its passage', async ({ page }) => {
	await select(page, 'p3', 'harbour master wrote');
	await page.getByRole('button', { name: 'yellow' }).click();
	const fragment = await page.evaluate(() => {
		const w = window as unknown as { highlights: { list(): { record: { anchor: unknown } }[] }; toTextFragment(a: unknown): string };
		return w.toTextFragment(w.highlights.list()[0]!.record.anchor);
	});
	expect(fragment).toBe('#:~:text=harbour%20master%20wrote');
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.goto('/demo/index.html?again' + fragment);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(800);
});

test('in a same-origin frame, with the panel outside it', async ({ page }) => {
	await page.goto('/demo/frame.html');
	const frame = page.frameLocator('#page');
	await expect(frame.locator('#p1')).toBeVisible();
	const f = page.frame({ url: /page\.html/ })!;
	await f.evaluate(() => localStorage.clear());
	await page.reload();
	const f2 = page.frame({ url: /page\.html/ })!;
	await expect.poll(() => page.evaluate(() => !!(window as unknown as { highlights?: unknown }).highlights)).toBe(true);
	await select(f2, 'p1', 'pilot boat');
	await page.getByRole('button', { name: 'yellow' }).click();
	expect(await painted(f2)).toEqual({ yellow: 1 });
	await expect(page.locator('.gh-list summary')).toHaveText('Highlights (1)');
});

test('performance: 500 highlights on 1.5 MB of text', async ({ page }) => {
	const ms = await page.evaluate(() => {
		// Positions as a page that hasn't changed since the highlights were made has them.
		const main = document.querySelector('main')!;
		const words = 'harbour tide lamps pilot boat mark signal quay master book ships waited quiet slowly'.split(' ');
		let seed = 1;
		const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
		const paras: string[] = [];
		let size = 0;
		while (size < 1_500_000) {
			const p = Array.from({ length: 80 }, () => words[Math.floor(rnd() * words.length)]).join(' ') + ` (${paras.length}).`;
			paras.push(`<p>${p}</p>`);
			size += p.length;
		}
		main.innerHTML = paras.join('');
		const h = (window as unknown as { highlights: { load(s: unknown): void; list(): unknown[] } }).highlights;
		const ps = main.querySelectorAll('p');
		const starts = new Map<Element, number>();
		let acc = 0;
		ps.forEach((x) => {
			starts.set(x, acc);
			acc += x.textContent!.length + 1;
		});
		const records = Array.from({ length: 500 }, (_, i) => {
			const p = ps[Math.floor((i * ps.length) / 500)]!;
			const exact = p.textContent!.slice(10, 40);
			return { v: 1, id: `h${i}`, color: 'yellow', anchor: [{ type: 'TextQuoteSelector', exact, suffix: p.textContent!.slice(40, 70) }, { type: 'TextPositionSelector', start: starts.get(p)! + 10, end: starts.get(p)! + 40 }] };
		});
		const t0 = performance.now();
		h.load({ records, palette: {} });
		return performance.now() - t0;
	});
	console.log(`load: ${Math.round(ms)} ms`);
	expect(ms).toBeLessThan(200);
});

test('dragging the grip moves the panel, keeps it whole in the view, and ends when the button is up, wherever that was heard', async ({ page }) => {
	const panel = page.locator('.gooder-highlights-panel');
	const grip = page.locator('.gh-grip');
	const g = (await grip.boundingBox())!;
	await page.mouse.move(g.x + 4, g.y + 6);
	await page.mouse.down();
	await page.mouse.move(400, 300, { steps: 5 });
	let box = (await panel.boundingBox())!;
	expect(Math.round(box.x)).toBeGreaterThan(300);
	expect(Math.round(box.x)).toBeLessThan(420);
	// Far past the view's corner: it stops whole inside the view.
	await page.mouse.move(5000, 5000, { steps: 3 });
	box = (await panel.boundingBox())!;
	const view = page.viewportSize()!;
	expect(box.x + box.width).toBeLessThanOrEqual(view.width + 0.5);
	expect(box.y + box.height).toBeLessThanOrEqual(view.height + 0.5);
	// The release happened where nobody heard it: the next move, with no button held, ends the drag; moving on moves nothing.
	await grip.dispatchEvent('pointermove', { pointerId: 1, buttons: 0, clientX: 100, clientY: 100, bubbles: true });
	await page.mouse.up();
	const at = (await panel.boundingBox())!;
	await page.mouse.move(200, 200, { steps: 3 });
	expect(await panel.boundingBox()).toEqual(at);
	await expect(grip).not.toHaveClass(/gh-dragging/);
});


test('the highlight picked is painted brighter; picking none, or another, moves the mark', async ({ page }) => {
	const active = (): Promise<string> =>
		page.evaluate(() => {
			const h = (CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights.get('gooder-highlight-active');
			return h ? [...h].map((r) => r.toString()).join('|') : '';
		});
	await select(page, 'p1', 'Ships waited');
	await page.getByRole('button', { name: 'yellow' }).click();
	await select(page, 'p2', 'went out');
	await page.getByRole('button', { name: 'green' }).click();
	await select(page, 'p1', 'waited');
	await page.evaluate(() => document.getSelection()!.collapseToStart());
	await expect.poll(active).toBe('Ships waited');
	const rule = await page.evaluate(() =>
		document.adoptedStyleSheets
			.flatMap((s) => Array.from(s.cssRules))
			.map((r) => r.cssText)
			.find((t) => t.includes('gooder-highlight-active')),
	);
	expect(rule).toContain('background-color');
	expect(rule).not.toContain('underline');
	await select(page, 'p2', 'went');
	await page.evaluate(() => document.getSelection()!.collapseToStart());
	await expect.poll(active).toBe('went out');
	await select(page, 'p3', 'lamps');
	await page.evaluate(() => document.getSelection()!.collapseToStart());
	await expect.poll(active).toBe('');
});
