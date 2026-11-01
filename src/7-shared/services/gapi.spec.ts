import { expect } from '@jest/globals'
import GAPI, { DRIVE_DOCUMENT_FIELDS, DRIVE_WRITE_FIELDS, GOOGLE_LOGIN_TIMEOUT_MS, driveQueryLiteral } from './gapi'
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
		jest.useRealTimers()
		globalThis.google = originalGoogle
		globalThis.gapi = originalGapi
		document.head.querySelectorAll('script').forEach(script => script.remove())
		jest.restoreAllMocks()
	})

	it('таймаут завершает общий вход; поздний ответ не завершает следующую попытку', async () => {
		jest.useFakeTimers()
		const first = GAPI.logIn()
		const oldConfig = config
		const rejected = expect(first).rejects.toThrow('Истекло время входа')
		jest.advanceTimersByTime(GOOGLE_LOGIN_TIMEOUT_MS)
		await rejected
		const retry = GAPI.logIn()
		let finished = false
		void retry.then(() => {
			finished = true
		})
		oldConfig.callback({ access_token: 'OLD' } as any)
		oldConfig.error_callback({ type: 'popup_closed' })
		await Promise.resolve()
		expect(finished).toBe(false)
		config.callback({ access_token: 'NEW' } as any)
		await retry
		expect(gapi.client.setToken).toHaveBeenLastCalledWith({ access_token: 'NEW' })
		expect(jest.getTimerCount()).toBe(0)
	})

	it('popup_failed_to_open очищает pending и разрешает повтор', async () => {
		const first = GAPI.logIn()
		const rejected = expect(first).rejects.toThrow('Не удалось открыть')
		config.error_callback({ type: 'popup_failed_to_open' })
		await rejected
		const retry = GAPI.logIn()
		config.callback({ access_token: 'NEW' } as any)
		await retry
	})

	it('экранирует имя и ID папки как литералы q, сохраняет пагинацию', async () => {
		const folder = "folder'\\ or trashed = true"
		const name = "D'Angelo\\notes.json"
		const list = jest
			.fn()
			.mockResolvedValueOnce({ result: { files: [{ id: 'a' }], nextPageToken: 'next' } })
			.mockResolvedValueOnce({ result: { files: [{ id: 'b' }] } })
		;(gapi.client as any).drive = { files: { list } }
		expect(await GAPI.find('name = ' + driveQueryLiteral(name), folder)).toEqual([{ id: 'a' }, { id: 'b' }])
		expect(list.mock.calls[0][0].q).toBe(
			"'folder\\'\\\\ or trashed = true' in parents and trashed = false and (name = 'D\\'Angelo\\\\notes.json')"
		)
		expect(list.mock.calls[1][0].pageToken).toBe('next')
	})

	it('сохраняет код ошибки 404 при нормализации ошибки удаления', async () => {
		;(gapi.client as any).drive = { files: { delete: jest.fn().mockRejectedValue({ status: 404 }) } }
		expect(await GAPI.deleteFile('gone')).toBe(false)
	})

	it('отказ одного скрипта отменяет второй и освобождает оба таймера', async () => {
		jest.useFakeTimers()
		const onFailure = jest.fn()
		const init = GAPI.init({ onFailure })
		const scripts = Array.from(document.querySelectorAll('script')).slice(-2)
		scripts[0].dispatchEvent(new Event('error'))
		await init
		expect(onFailure).toHaveBeenCalledTimes(1)
		expect(jest.getTimerCount()).toBe(0)
	})

	it('таймаут client init завершает инициализацию без позднего onSuccess', async () => {
		jest.useFakeTimers()
		const onFailure = jest.fn(),
			onSuccess = jest.fn()
		let callback: () => void = () => {}
		;(gapi.load as jest.Mock).mockImplementation((_name, done) => {
			callback = done
		})
		const init = GAPI.init({ onFailure, onSuccess })
		Array.from(document.querySelectorAll('script'))
			.slice(-2)
			.forEach(script => script.dispatchEvent(new Event('load')))
		await jest.advanceTimersByTimeAsync(15000)
		await init
		expect(onFailure).toHaveBeenCalledTimes(1)
		callback()
		await Promise.resolve()
		expect(onSuccess).not.toHaveBeenCalled()
		expect(jest.getTimerCount()).toBe(0)
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
		config.callback({ access_token: 'SYNTHETIC_SECRET' } as any)
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

	it('читает version и etag одним v2 GET и отправляет If-Match в v2 media PUT', async () => {
		const raw = {
			id: 'file/a',
			title: 'Demo.json',
			mimeType: 'application/json',
			version: '1',
			etag: '"opaque/1"',
			parents: [{ id: 'folder' }],
			alternateLink: 'https://drive.google.com/file/d/file-a/view'
		}
		const request = jest
			.fn()
			.mockResolvedValueOnce({ result: raw })
			.mockResolvedValueOnce({ result: { ...raw, version: '2', etag: '"opaque/2"' } })
		;(gapi.client as any).request = request
		const condition = await GAPI.getFileWriteCondition('file/a')
		expect(condition.file.name).toBe('Demo.json')
		expect(condition.file.parents).toEqual(['folder'])
		expect(condition.file.webViewLink).toBe(raw.alternateLink)
		expect((await GAPI.updateDocument('file/a', '{"value":"Привет"}', 'application/json', condition)).version).toBe('2')
		expect(request.mock.calls[0][0]).toEqual({
			path: '/drive/v2/files/file%2Fa',
			method: 'GET',
			params: { fields: DRIVE_WRITE_FIELDS, supportsAllDrives: true, updateViewedDate: false }
		})
		expect(request.mock.calls[1][0]).toEqual({
			path: '/upload/drive/v2/files/file%2Fa',
			method: 'PUT',
			params: {
				uploadType: 'media',
				fields: DRIVE_WRITE_FIELDS,
				supportsAllDrives: true,
				newRevision: true,
				updateViewedDate: false
			},
			headers: { 'Content-Type': 'application/json', 'If-Match': '"opaque/1"' },
			body: '{"value":"Привет"}'
		})
	})

	test.each([undefined, '*', 'W/"weak"', 'bare', '"two", "tags"', '"bad\r\nheader"'])(
		'не отправляет обновление без сильного ETag: %s',
		async etag => {
			const request = jest.fn()
			;(gapi.client as any).request = request
			await expect(
				GAPI.updateDocument('source', '{}', 'application/json', {
					file: { id: 'source', name: 'Demo', mimeType: 'application/json' },
					etag
				} as any)
			).rejects.toThrow('условия записи')
			expect(request).not.toHaveBeenCalled()
		}
	)

	it('сохраняет HTTP 412 и не делает безусловный повтор', async () => {
		const request = jest.fn().mockRejectedValue({ result: { error: { code: 412, message: 'Precondition failed' } } })
		;(gapi.client as any).request = request
		await expect(
			GAPI.updateDocument('source', '{}', 'application/json', {
				file: { id: 'source', name: 'Demo', mimeType: 'application/json' },
				etag: '"old"'
			})
		).rejects.toMatchObject({ status: 412 })
		expect(request).toHaveBeenCalledTimes(1)
	})

	it('отсутствующий ETag или неверный ID в metadata запрещает запись', async () => {
		const request = jest
			.fn()
			.mockResolvedValue({ result: { id: 'source', title: 'Demo', mimeType: 'application/json', version: '1' } })
		;(gapi.client as any).request = request
		await expect(GAPI.getFileWriteCondition('source')).rejects.toThrow('ETag')
		request.mockResolvedValue({
			result: { id: 'other', title: 'Demo', mimeType: 'application/json', version: '1', etag: '"1"' }
		})
		await expect(GAPI.getFileWriteCondition('source')).rejects.toThrow('ETag')
	})
})
