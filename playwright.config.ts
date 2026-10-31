import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PROJECTOR_E2E_PORT ?? 43188)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PROJECTOR_E2E_PORT')
const baseURL = `http://127.0.0.1:${port}`
const channel = process.env.PROJECTOR_E2E_CHANNEL || 'chromium'

export default defineConfig({
	testDir: './e2e',
	outputDir: 'artifacts/playwright/results',
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: 0,
	timeout: 45000,
	globalTimeout: 10 * 60 * 1000,
	expect: { timeout: 15000 },
	reporter: [
		['list'],
		['html', { outputFolder: 'artifacts/playwright/report', open: 'never' }],
		['json', { outputFile: 'artifacts/playwright/results.json' }]
	],
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel } }],
	webServer: {
		command: 'node scripts/start-e2e-server.mjs',
		url: `${baseURL}/index.html`,
		env: {
			PROJECTOR_DEV_PORT: String(port)
		},
		reuseExistingServer: false,
		timeout: 120000,
		stdout: 'pipe',
		stderr: 'pipe'
	}
})
