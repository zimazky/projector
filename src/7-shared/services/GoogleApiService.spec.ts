import GAPI, { DRIVE_DOCUMENT_FIELDS } from './gapi'
import { GoogleApiService } from './GoogleApiService'
import { deferred } from 'src/test-utils/deferred'

const file = (id = 'source', version = '1') => ({
	id,
	version,
	name: 'Demo.json',
	mimeType: 'application/json',
	parents: ['root']
})

describe('Жизненный цикл Google API', () => {
	afterEach(() => jest.restoreAllMocks())
	it('dispose завершает ожидание готовности, подавляет старые callbacks и повторный init', async () => {
		const init = jest.spyOn(GAPI, 'init').mockResolvedValue(undefined)
		const api = new GoogleApiService()
		api.initGapi()
		const options = init.mock.calls[0][0]
		const ready = expect(api.waitForGapiReady()).rejects.toThrow('disposed')
		api.dispose()
		api.dispose()
		await ready
		expect(options.signal?.aborted).toBe(true)
		options.onSuccess?.()
		options.onSignIn?.()
		options.onFailure?.()
		api.initGapi()
		expect(init).toHaveBeenCalledTimes(1)
		expect(api.isGoogleLoggedIn).toBe(false)
		await expect(api.logIn()).rejects.toThrow('disposed')
	})
})

describe('Сохранить как создаёт отдельные файлы', () => {
	afterEach(() => jest.restoreAllMocks())
	function setup() {
		const api = new GoogleApiService()
		api.isGoogleLoggedIn = true
		const find = jest.spyOn(GAPI, 'find').mockResolvedValue([])
		const metadata = jest.spyOn(GAPI, 'getFileMetadata').mockResolvedValue(file())
		const create = jest.spyOn(GAPI, 'createDocument').mockResolvedValue(file('copy'))
		const upload = jest.spyOn(GAPI, 'updateDocument')
		return { api, find, metadata, create, upload }
	}

	it('новый файл отправляется одной create-операцией, metadata содержит version', async () => {
		const { api, find, create, upload } = setup()
		expect(await api.saveFile('Demo.json', '{"a":1}', 'application/json', 'root')).toEqual({
			status: 'success',
			file: file('copy')
		})
		expect(find.mock.calls[0][2]).toBe(DRIVE_DOCUMENT_FIELDS)
		expect(create).toHaveBeenCalledWith('Demo.json', '{"a":1}', 'application/json', ['root'], undefined)
		expect(upload).not.toHaveBeenCalled()
	})

	it('после отказа инициализации вход повторяет init вместо ожидания отклонённого Promise', async () => {
		const api = new GoogleApiService()
		const init = jest
			.spyOn(GAPI, 'init')
			.mockImplementationOnce(async options => options.onFailure?.())
			.mockImplementationOnce(async options => options.onSuccess?.())
		jest.spyOn(GAPI, 'logIn').mockResolvedValue(undefined)
		jest.spyOn(GAPI, 'isLoggedIn').mockReturnValue(false)
		await expect(api.logIn()).rejects.toThrow('initialize')
		await expect(api.logIn()).resolves.toBeUndefined()
		expect(init).toHaveBeenCalledTimes(2)
	})

	it('изменившаяся ожидаемая версия возвращает конфликт до записи', async () => {
		const { api, metadata, create } = setup()
		metadata.mockResolvedValue(file('source', '2'))
		expect((await api.saveFile('Demo.json', '{}', 'application/json', 'root', 'drive', 'source', '1')).status).toBe(
			'conflict'
		)
		expect(create).not.toHaveBeenCalled()
	})

	it('гонка после проверки не теряет удалённую сторону: создаётся другой файл', async () => {
		const { api, create, upload } = setup()
		let original = 'Remote before check'
		create.mockImplementation(async (_name, content, _mime, _parents, source) => {
			expect(source!.id).toBe('source')
			expect(source!.version).toBe('1')
			original = 'Concurrent remote edit'
			expect(content).toBe('Local snapshot')
			return file('copy')
		})
		const result = await api.saveFile('Demo.json', 'Local snapshot', 'application/json', 'root', 'drive', 'source', '1')
		expect(result).toEqual({ status: 'success', file: file('copy') })
		expect(original).toBe('Concurrent remote edit')
		expect(upload).not.toHaveBeenCalled()
		expect(create.mock.calls[0][0]).toContain('(версия ')
	})

	it('не подтверждает запись без server version', async () => {
		const { api, create } = setup()
		create.mockResolvedValue({ id: 'copy', name: 'Demo', mimeType: 'application/json' })
		expect((await api.saveFile('Demo.json', '{}', 'application/json', 'root')).status).toBe('error')
	})

	it('следующая версия не накапливает суффиксы предыдущих сохранений', async () => {
		const { api, create } = setup()
		await api.saveFile(
			'Demo (версия 2026-10-31T10-00-00-000Z-ab1234).json',
			'{}',
			'application/json',
			'root',
			'drive',
			'source',
			'1'
		)
		expect(create.mock.calls[0][0].match(/\(версия /g)).toHaveLength(1)
		expect(create.mock.calls[0][0]).toMatch(/^Demo \(версия /)
	})

	test.each([null, 'Network error', { result: { error: { message: 'Unavailable' } } }])(
		'нормализует unknown %j',
		async error => {
			const { api, find } = setup()
			find.mockRejectedValue(error)
			expect((await api.saveFile('Demo.json', '{}', 'application/json', 'root')).status).toBe('error')
		}
	)
})

describe('Условное сохранение в текущий файл Drive', () => {
	afterEach(() => jest.restoreAllMocks())
	function setup() {
		const api = new GoogleApiService()
		api.isGoogleLoggedIn = true
		const condition = { file: file(), etag: '"etag-1"' }
		const read = jest.spyOn(GAPI, 'getFileWriteCondition').mockResolvedValue(condition)
		const update = jest.spyOn(GAPI, 'updateDocument').mockResolvedValue(file('source', '2'))
		const metadata = jest.spyOn(GAPI, 'getFileMetadata').mockResolvedValue(file('source', '3'))
		const create = jest.spyOn(GAPI, 'createDocument')
		return { api, condition, read, update, metadata, create }
	}

	it('отправляет условие того же снимка и подтверждает версию ответа записи без дополнительного GET', async () => {
		const { api, condition, update, metadata, create } = setup()
		expect(await api.updateFileContent('source', 'Local snapshot', 'application/json', '1')).toEqual({
			status: 'success',
			file: file('source', '2')
		})
		expect(update).toHaveBeenCalledWith('source', 'Local snapshot', 'application/json', condition)
		expect(metadata).not.toHaveBeenCalled()
		expect(create).not.toHaveBeenCalled()
	})

	it('изменившаяся версия до PUT возвращает конфликт без записи', async () => {
		const { api, read, update } = setup()
		read.mockResolvedValue({ file: file('source', '2'), etag: '"etag-2"' })
		expect(await api.updateFileContent('source', '{}', 'application/json', '1')).toEqual({
			status: 'conflict',
			existingFiles: [file('source', '2')]
		})
		expect(update).not.toHaveBeenCalled()
	})

	it('гонка между GET и PUT: 412 становится новым конфликтом без автоматического повтора', async () => {
		const { api, update, create } = setup()
		update.mockRejectedValue({ status: 412 })
		expect(await api.updateFileContent('source', 'Local', 'application/json', '1')).toEqual({
			status: 'conflict',
			existingFiles: [file('source', '3')]
		})
		expect(update).toHaveBeenCalledTimes(1)
		expect(create).not.toHaveBeenCalled()
	})

	it('412 с отказом повторного чтения не считается успешной записью', async () => {
		const { api, update, metadata } = setup()
		update.mockRejectedValue({ status: 412 })
		metadata.mockRejectedValue(new Error('Offline'))
		expect((await api.updateFileContent('source', '{}', 'application/json', '1')).status).toBe('error')
		expect(update).toHaveBeenCalledTimes(1)
	})

	test.each([
		{ ...file('source', '2'), id: 'different' },
		file('source', '1'),
		file('source', '0'),
		{ ...file('source', '2'), version: undefined },
		{ ...file('source', '2'), trashed: true }
	])('не подтверждает неверный ответ %j', async response => {
		const { api, update } = setup()
		update.mockResolvedValue(response)
		const result = await api.updateFileContent('source', '{}', 'application/json', '1')
		expect(result.status).toBe('error')
		if (result.status === 'error') expect(result.message).toContain('не подтверждён')
	})

	it('потерянный ответ не повторяется и не объявляется успехом', async () => {
		const { api, update } = setup()
		update.mockRejectedValue(new TypeError('Failed to fetch'))
		const result = await api.updateFileContent('source', '{}', 'application/json', '1')
		expect(result.status).toBe('error')
		if (result.status === 'error') expect(result.message).toContain('проверьте Drive')
		expect(update).toHaveBeenCalledTimes(1)
	})

	it('int64-версия проверяется без округления', async () => {
		const { api, read, update } = setup()
		read.mockResolvedValue({ file: file('source', '9007199254740993'), etag: '"large"' })
		update.mockResolvedValue(file('source', '9007199254740994'))
		expect((await api.updateFileContent('source', '{}', 'application/json', '9007199254740993')).status).toBe('success')
	})

	it('закрытая сессия после чтения условия не начинает PUT', async () => {
		const { api, condition, read, update } = setup()
		const response = deferred<typeof condition>()
		read.mockReturnValue(response.promise)
		let current = true
		const saving = api.updateFileContent('source', '{}', 'application/json', '1', () => current)
		current = false
		response.resolve(condition)
		expect((await saving).status).toBe('error')
		expect(update).not.toHaveBeenCalled()
	})
})
