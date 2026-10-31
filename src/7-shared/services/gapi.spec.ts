import { expect } from '@jest/globals'
import GAPI, { DRIVE_DOCUMENT_FIELDS } from './gapi'
import { GoogleLoginCancelledError } from './GoogleAuthError'

type TokenConfig = google.accounts.oauth2.TokenClientConfig & { error_callback: (error: { type: string }) => void }

describe('Отмена авторизации и безопасные логи', () => {
	let config: TokenConfig
	let requestAccessToken: jest.Mock
	let originalGoogle: typeof google
	let originalGapi: typeof gapi

	beforeEach(async () => {
		originalGoogle = globalThis.google
		originalGapi = globalThis.gapi
		requestAccessToken = jest.fn()
		globalThis.google = {
			accounts: {
				oauth2: {
					initTokenClient: jest.fn((value: TokenConfig) => {
						config = value
						return { requestAccessToken }
					}),
					revoke: jest.fn((_token, done) => done())
				}
			}
		} as any
		globalThis.gapi = {
			load: jest.fn((_name, callback) => callback()),
			client: {
				init: jest.fn().mockResolvedValue(undefined),
				getToken: jest.fn().mockReturnValue({ access_token: 'SYNTHETIC_SECRET' }),
				setToken: jest.fn()
			}
		} as any
		jest.spyOn(console, 'log').mockImplementation(() => {})
		jest.spyOn(console, 'error').mockImplementation(() => {})
		const init = GAPI.init({})
		for (const script of document.querySelectorAll('script')) script.dispatchEvent(new Event('load'))
		await init
	})

	afterEach(() => {
		globalThis.google = originalGoogle
		globalThis.gapi = originalGapi
		document.head.querySelectorAll('script').forEach(script => script.remove())
		jest.restoreAllMocks()
	})

	it('закрытие popup завершает общий Promise, следующий вход возможен', async () => {
		const first = GAPI.logIn()
		expect(GAPI.logIn()).toBe(first)
		const rejected = expect(first).rejects.toBeInstanceOf(GoogleLoginCancelledError)
		config.error_callback({ type: 'popup_closed' })
		await rejected
		const retry = GAPI.logIn()
		config.callback({ access_token: 'SYNTHETIC_SECRET' } as any)
		await retry
		expect(requestAccessToken).toHaveBeenCalledTimes(2)
	})

	it('синхронный отказ открытия не оставляет зависший pending Promise', async () => {
		requestAccessToken.mockImplementationOnce(() => {
			throw new Error('Blocked')
		})
		await expect(GAPI.logIn()).rejects.toThrow('Не удалось открыть окно входа')
		const retry = GAPI.logIn()
		config.callback({} as any)
		await retry
		expect(requestAccessToken).toHaveBeenCalledTimes(2)
	})

	it('отказ согласия завершает вход как отменённый', async () => {
		const login = GAPI.logIn()
		const rejected = expect(login).rejects.toBeInstanceOf(GoogleLoginCancelledError)
		config.callback({ error: 'access_denied', access_token: 'SYNTHETIC_SECRET' } as any)
		await rejected
	})

	it('не выводит token response и отозванный токен в консоль', async () => {
		const login = GAPI.logIn()
		config.callback({ access_token: 'SYNTHETIC_SECRET' } as any)
		await login
		GAPI.logOut()
		const diagnostics = JSON.stringify([
			...(console.log as jest.Mock).mock.calls,
			...(console.error as jest.Mock).mock.calls
		])
		expect(diagnostics).not.toContain('SYNTHETIC_SECRET')
		expect(diagnostics).not.toContain('access_token')
	})

	it('создаёт JSON multipart POST с version в ответе и не использует PATCH', async () => {
		const request = jest.fn().mockResolvedValue({ result: { id: 'new', version: '1' } })
		;(gapi.client as any).request = request
		const source = { id: 'source', version: '9007199254740993', name: 'Demo.json', mimeType: 'application/json' }
		await GAPI.createDocument('Demo.json', '{"local":true}', 'application/json', ['root'], source)
		const args = request.mock.calls[0][0]
		expect(args.method).toBe('POST')
		expect(args.path).toBe('/upload/drive/v3/files')
		expect(args.params).toEqual({ uploadType: 'multipart', fields: DRIVE_DOCUMENT_FIELDS })
		expect(args.body).toContain('"local":true')
		expect(args.body).toContain('"projectorSourceVersion":"9007199254740993"')
	})
})
