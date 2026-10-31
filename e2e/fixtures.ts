import { test as base, expect } from '@playwright/test'

/** Google заменён на границе сети; остальные внешние запросы запрещены. */
export const test = base.extend<{ isolatedGoogle: void }>({
	isolatedGoogle: [
		async ({ context, baseURL, page }, use) => {
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
						body: `
					window.gapi = {
						load: (_name, done) => done(),
						client: { init: async () => {}, getToken: () => null, setToken: () => {} }
					};
				`
					})
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
