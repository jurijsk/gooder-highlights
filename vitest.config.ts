import { defineConfig } from 'vitest/config';

// The unit tests only, in jsdom: tests/e2e is Playwright's. Node's own localStorage (experimental, empty without a file) would hide jsdom's.
export default defineConfig({
	test: {
		include: ['tests/unit/**/*.test.ts'],
		environment: 'jsdom',
		environmentOptions: { jsdom: { url: 'http://localhost/' } },
		execArgv: ['--no-experimental-webstorage'],
	},
});
