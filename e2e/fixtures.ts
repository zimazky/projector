import { test as base, expect } from '@playwright/test'

/** Google заменён на границе сети; остальные внешние запросы запрещены. */
export const test = base.extend<{ isolatedGoogle: void; driveMode: boolean }>({
	driveMode: [false, { option: true }],
	isolatedGoogle: [
		async ({ context, baseURL, page, driveMode }, use) => {
			const errors: string[] = []
			page.on('pageerror', error => errors.push(error.message))
			await context.route('**/*', async route => {
				const url = new URL(route.request().url())
				if (url.origin === baseURL) return route.continue()
				if (url.href === 'https://accounts.google.com/gsi/client') {
					return route.fulfill({
						contentType: 'application/javascript',
						body: `
					window.google = { accounts: { oauth2: {
						initTokenClient: config => ({ requestAccessToken: () => config.callback({ error: 'access_denied' }) }),
						revoke: (_token, done) => done(),
						hasGrantedAllScopes: () => false
					} } };
				`
					})
				}
				if (url.href === 'https://apis.google.com/js/api.js') {
					return route.fulfill({
						contentType: 'application/javascript',
						body: driveMode
							? `
						const call = (method, args) => fetch('/__e2e__/drive/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) }).then(r => r.json());
						window.gapi = { load: (_name, done) => done(), client: {
							init: async () => {}, getToken: () => ({ access_token: 'playwright-placeholder' }), setToken: () => {},
							request: args => call('request', args),
							drive: { files: { get: args => call('get', args), list: args => call('list', args) } }
						} };
						`
							: `
					window.gapi = {
						load: (_name, done) => done(),
						client: { init: async () => {}, getToken: () => null, setToken: () => {} }
					};
				`
					})
				}
				if (driveMode && url.href === 'https://www.googleapis.com/oauth2/v3/userinfo') {
					return route.fulfill({ json: { name: 'Browser fixture' } })
				}
				return route.abort('blockedbyclient')
			})
			await use()
			expect(errors, 'Ошибки JavaScript в браузере').toEqual([])
		},
		{ auto: true }
	]
})

export { expect }
