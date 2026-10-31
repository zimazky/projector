import GAPI, { DRIVE_DOCUMENT_FIELDS } from './gapi'
import { GoogleApiService } from './GoogleApiService'

const file = (id = 'source', version = '1') => ({
	id,
	version,
	name: 'Demo.json',
	mimeType: 'application/json',
	parents: ['root']
})

describe('Запись Drive создаёт отдельные версии', () => {
	afterEach(() => jest.restoreAllMocks())
	function setup() {
		const api = new GoogleApiService()
		api.isGoogleLoggedIn = true
		const find = jest.spyOn(GAPI, 'find').mockResolvedValue([])
		const metadata = jest.spyOn(GAPI, 'getFileMetadata').mockResolvedValue(file())
		const create = jest.spyOn(GAPI, 'createDocument').mockResolvedValue(file('copy'))
		const upload = jest.spyOn(GAPI, 'upload')
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
