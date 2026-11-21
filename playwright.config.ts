import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	retries: 0,
	reporter: [['list']],
	use: {
		baseURL: 'http://127.0.0.1:4002/',
		headless: true,
		viewport: { width: 1280, height: 900 },
		screenshot: 'only-on-failure',
	},
	webServer: {
		command: 'node scripts/serve.mjs',
		url: 'http://127.0.0.1:4002/demo/',
		reuseExistingServer: true,
		timeout: 60000,
	},
});
