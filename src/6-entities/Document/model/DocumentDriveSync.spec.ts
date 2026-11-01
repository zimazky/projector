import { observable } from 'mobx'
import { DocumentTabsStore } from './DocumentTabsStore'
import { DriveSyncCoordinator } from './DriveSyncCoordinator'
import { driveVersion } from './DocumentDriveProtocol'
import { getDocumentUiState } from './DocumentSyncSelectors'
import { deferred } from 'src/test-utils/deferred'
import type { DocumentData } from './DocumentTabsStore.types'

const data = (name: string): DocumentData => ({
	projectsList: [{ name, color: 'black', background: 'white' }],
	completedList: [],
	plannedList: []
})
const meta = (version = '1', id = 'source') => ({
	id,
	name: 'Demo.json',
	mimeType: 'application/json',
	version,
	modifiedTime: '2026-10-31T10:00:00Z',
	parents: ['root']
})

/** Два клиента используют одно серверное хранилище, но разные локальные сессии. */
function drive() {
	const auth = observable({ loggedIn: true })
	const files = new Map([['source', { metadata: meta(), data: data('Base') }]])

	const api = {
		get isGoogleLoggedIn() {
			return auth.loggedIn
		},
		logIn: jest.fn(async () => {
			auth.loggedIn = true
		}),
		getFileMetadata: jest.fn(async (id: string) => ({ ...files.get(id)!.metadata })),
		downloadFileContent: jest.fn(async (id: string) => JSON.parse(JSON.stringify(files.get(id)!.data))),
		updateFileContent: jest.fn(
			async (source: string, content: string, _mime: string, expected: string): Promise<any> => {
				const current = files.get(source)!
				if (current.metadata.version !== expected)
					return { status: 'conflict', existingFiles: [{ ...current.metadata }] }
				current.metadata.version = (BigInt(expected) + 1n).toString()
				current.data = JSON.parse(content)
				return { status: 'success', file: { ...current.metadata } }
			}
		)
	}
	const update = (name: string) => {
		const entry = files.get('source')!
		entry.metadata.version = (BigInt(entry.metadata.version) + 1n).toString()
		entry.data = data(name)
	}
	return { api, files, auth, update }
}

async function client(server: ReturnType<typeof drive>) {
	const store = new DocumentTabsStore(server.api as any)
	expect((await store.openFromDrive('source')).status).toBe('opened')
	return store
}

describe('Серверная база и безопасные версии Drive', () => {
	beforeEach(() => localStorage.clear())

	it('одинаковый fileId с новой version обнаруживается обоими клиентами без изменения содержимого', async () => {
		const server = drive(),
			a = await client(server),
			b = await client(server)
		server.update('Remote')
		for (const store of [a, b]) {
			const result = await store.checkDocument(store.activeDocumentId!)
			expect(result.status).toBe('conflict')
			expect(store.activeDocument!.data).toEqual(data('Base'))
			expect(getDocumentUiState(store.activeDocument!).status).toBe('remote-ahead')
		}
	})

	test.each([1, 9_999_999_999_999])('часы клиента %s не определяют удалённый конфликт', async now => {
		const server = drive(),
			store = await client(server)
		const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
		try {
			expect((await store.checkDocument(store.activeDocumentId!)).status).toBe('success')
			server.update('Remote')
			expect((await store.checkDocument(store.activeDocumentId!)).status).toBe('conflict')
		} finally {
			clock.mockRestore()
		}
	})

	it('обычное сохранение обязательно проверяет Drive даже при свежем TTL', async () => {
		const server = drive(),
			store = await client(server),
			doc = store.activeDocument!
		store.getDocumentStores(doc.id)!.projectsStore.update('Base', { name: 'Local' })
		server.api.getFileMetadata.mockClear()
		server.update('Remote')
		const result = await store.saveDocument(doc.id)
		expect(result.status).toBe('conflict')
		expect(server.api.getFileMetadata).toHaveBeenCalledWith('source')
		expect(server.api.updateFileContent).not.toHaveBeenCalled()
		expect(server.files.get('source')!.data).toEqual(data('Remote'))
		expect(doc.data).toEqual(data('Local'))
	})

	it('обновление того же файла обнаруживается вторым клиентом и требует решения конфликта', async () => {
		const server = drive(),
			a = await client(server),
			b = await client(server)
		a.getActiveDocumentStores()!.projectsStore.update('Base', { name: 'Local A' })
		b.getActiveDocumentStores()!.projectsStore.update('Base', { name: 'Local B' })
		expect((await a.saveDocument(a.activeDocumentId!)).status).toBe('saved')
		expect((await b.saveDocument(b.activeDocumentId!)).status).toBe('conflict')
		expect(server.files.size).toBe(1)
		expect(server.files.get('source')!.data).toEqual({ schemaVersion: 1, ...data('Local A') })
		expect(a.activeDocument!.ref!.fileId).toBe('source')
		expect(b.activeDocument!.ref!.fileId).toBe('source')
		expect(b.activeDocument!.data).toEqual(data('Local B'))
		expect(getDocumentUiState(a.activeDocument!).status).toBe('synced')
		expect(getDocumentUiState(b.activeDocument!).status).toBe('conflict')
	})

	it('гонка после проверки до условного обновления возвращает конфликт, не теряя ни одну сторону', async () => {
		const server = drive(),
			store = await client(server)
		store.getActiveDocumentStores()!.projectsStore.update('Base', { name: 'Local' })
		const update = server.api.updateFileContent.getMockImplementation()!
		server.api.updateFileContent.mockImplementationOnce(async (...args) => {
			server.update('Concurrent')
			return update(...args)
		})
		const result = await store.saveDocument(store.activeDocumentId!)
		expect(result.status).toBe('conflict')
		expect(server.files.size).toBe(1)
		expect(server.files.get('source')!.data).toEqual(data('Concurrent'))
		expect(store.activeDocument!.data).toEqual(data('Local'))
		expect(getDocumentUiState(store.activeDocument!).status).toBe('conflict')
	})

	it('служебная version с тем же содержимым не создаёт ложный конфликт при повторном сохранении', async () => {
		const server = drive(),
			store = await client(server)
		const doc = store.activeDocument!
		store.getActiveDocumentStores()!.projectsStore.update('Base', { name: 'First' })
		expect((await store.saveDocument(doc.id)).status).toBe('saved')
		server.files.get('source')!.metadata.version = '3'
		store.getActiveDocumentStores()!.projectsStore.update('First', { name: 'Second' })
		expect((await store.saveDocument(doc.id)).status).toBe('saved')
		expect(server.files.get('source')!.metadata.version).toBe('4')
		expect(server.files.get('source')!.data).toEqual({ schemaVersion: 1, ...data('Second') })
		expect(doc.data).toEqual(data('Second'))
		expect(server.files.size).toBe(1)
	})

	it('служебная версия не подтверждает неизвестную базу даже при совпадении данных', async () => {
		const server = drive(),
			store = await client(server)
		store.activeDocument!.sync.baseLocalVersion = null
		store.activeDocument!.sync.baseRevisionId = null
		server.files.get('source')!.metadata.version = '2'
		expect((await store.saveDocument(store.activeDocumentId!)).status).toBe('conflict')
		expect(server.api.updateFileContent).not.toHaveBeenCalled()
		expect(store.activeDocument!.sync.baseLocalVersion).toBeNull()
	})

	it('повторное сохранение обновляет связанный файл версии, сохраняя ID, имя и ссылку', async () => {
		const server = drive()
		server.files.get('source')!.metadata.name = 'Demo (версия previous).json'
		const store = await client(server)
		const ref = { ...store.activeDocument!.ref! }
		store.getActiveDocumentStores()!.projectsStore.update('Base', { name: 'First' })
		expect((await store.saveDocument(store.activeDocumentId!)).status).toBe('saved')
		store.getActiveDocumentStores()!.projectsStore.update('First', { name: 'Second' })
		expect((await store.saveDocument(store.activeDocumentId!)).status).toBe('saved')
		expect(server.files.size).toBe(1)
		expect(store.activeDocument!.ref).toEqual({ ...ref, space: 'drive' })
		expect(server.files.get('source')!.metadata.version).toBe('3')
		expect(store.activeDocument!.sync.baseRevisionId).toBe(driveVersion(meta('3')))
	})

	test.each(['local', 'remote'] as const)('решение %s проверяет конкретную версию повторно', async choice => {
		const server = drive(),
			store = await client(server)
		store.getActiveDocumentStores()!.projectsStore.update('Base', { name: 'Local' })
		server.update('Remote 1')
		const check = await store.checkDocument(store.activeDocumentId!)
		if (check.status !== 'conflict') throw new Error('Expected conflict')
		server.update('Remote 2')
		const result = await store.resolveDocumentConflict(check.context, choice)
		expect(result.status).toBe('conflict')
		expect(store.activeDocument!.data).toEqual(data('Local'))
		expect(server.files.size).toBe(1)
		expect(server.files.get('source')!.data).toEqual(data('Remote 2'))
	})

	it('явный выбор локальной версии обновляет проверенный исходный файл', async () => {
		const server = drive(),
			store = await client(server)
		store.getActiveDocumentStores()!.projectsStore.update('Base', { name: 'Local' })
		server.update('Remote')
		const check = await store.checkDocument(store.activeDocumentId!)
		if (check.status !== 'conflict') throw new Error('Expected conflict')
		expect((await store.resolveDocumentConflict(check.context, 'local')).status).toBe('saved')
		expect(server.files.size).toBe(1)
		expect(store.activeDocument!.ref!.fileId).toBe('source')
		expect(server.files.get('source')!.data).toEqual({ schemaVersion: 1, ...data('Local') })
	})

	it('чтение повторяется при смене версии между metadata и content', async () => {
		const server = drive()
		server.api.downloadFileContent.mockImplementationOnce(async () => {
			server.update('New')
			return data('Torn')
		})
		const store = await client(server)
		expect(store.activeDocument!.data).toEqual(data('New'))
		expect(server.api.downloadFileContent).toHaveBeenCalledTimes(2)
		expect(store.activeDocument!.sync.baseRevisionId).toBe(driveVersion(meta('2')))
	})

	it('неполный JSON меняющейся версии не применяется: повтор читает согласованную версию', async () => {
		const server = drive()
		server.api.downloadFileContent.mockImplementationOnce(async () => {
			server.update('New')
			return '{"incomplete":'
		})
		const store = await client(server)
		expect(store.activeDocument!.data).toEqual(data('New'))
	})

	it('check не меняет нормализованное содержимое и локальную версию', async () => {
		const server = drive()
		server.files.get('source')!.data = {
			projectsList: [],
			completedList: [],
			plannedList: [{ name: 'Event', start: '2026.10.31', time: '00:00', credit: 0, comment: '' }]
		}
		const store = await client(server),
			doc = store.activeDocument!
		const before = JSON.stringify(doc.data),
			version = doc.sync.localVersion
		expect((await store.checkDocument(doc.id)).status).toBe('success')
		expect(JSON.stringify(doc.data)).toBe(before)
		expect(doc.sync.localVersion).toBe(version)
		expect(getDocumentUiState(doc).status).toBe('synced')
	})

	it('пакетный check выбирает восстановленные dirty-документы по модели, а не legacy offline', async () => {
		const server = drive(),
			original = await client(server)
		original.getActiveDocumentStores()!.projectsStore.update('Base', { name: 'Local' })
		const restored = new DocumentTabsStore(server.api as any)
		await restored.restoreFromLocalStorage()
		expect(getDocumentUiState(restored.activeDocument!).status).toBe('dirty')
		expect((await restored.syncAllDocumentsWithDrive()).size).toBe(1)
	})

	it('непрерывная смена версии не заменяет локальные данные', async () => {
		const server = drive(),
			store = await client(server)
		server.api.downloadFileContent.mockImplementation(async () => {
			server.update('Changing')
			return data('Torn')
		})
		expect((await store.pullDocument(store.activeDocumentId!)).status).toBe('conflict')
		expect(store.activeDocument!.data).toEqual(data('Base'))
	})

	test.each([
		null,
		{ name: 'Bad', start: '2026.02.30' },
		{ name: 'Bad', start: '2026.10.31', repeat: 'invalid' },
		{ name: 'Bad', start: '2026.10.31', credit: 'NaN' }
	])('невалидный EventDto не меняет документ: %j', async event => {
		const server = drive(),
			store = await client(server)
		server.api.downloadFileContent.mockResolvedValue({ projectsList: [], plannedList: [event], completedList: [] })
		expect((await store.pullDocument(store.activeDocumentId!)).status).toBe('failed')
		expect(store.activeDocument!.data).toEqual(data('Base'))
		expect(store.getActiveDocumentStores()!.projectsStore.getList()).toEqual(data('Base').projectsList)
	})

	it('после восстановления нет неподтверждённого synced; свежий check подтверждает известную базу', async () => {
		const server = drive(),
			original = await client(server)
		const restored = new DocumentTabsStore(server.api as any)
		await restored.restoreFromLocalStorage()
		expect(getDocumentUiState(restored.activeDocument!).status).toBe('unknown')
		expect(restored.activeDocument!.sync.lastRemoteCheckAt).toBeNull()
		expect((await restored.checkDocument(original.activeDocumentId!)).status).toBe('success')
		expect(getDocumentUiState(restored.activeDocument!).status).toBe('synced')
	})

	it('unknown-ошибка не скрывает dirty и не запрещает повторную попытку', async () => {
		const server = drive(),
			store = await client(server)
		store.getActiveDocumentStores()!.projectsStore.update('Base', { name: 'Local' })
		server.api.getFileMetadata.mockRejectedValueOnce({ result: { error: { message: 'Offline' } } })
		expect((await store.saveDocument(store.activeDocumentId!)).status).toBe('failed')
		const ui = getDocumentUiState(store.activeDocument!)
		expect(ui.isDirty).toBe(true)
		expect(ui.canSave).toBe(true)
		expect(ui.tooltip).toContain('Offline')
		expect((await store.saveDocument(store.activeDocumentId!)).status).toBe('saved')
	})

	it('version int64 не теряет точность и fileId не является версией', () => {
		expect(driveVersion(meta('9007199254740993'))).not.toBe(driveVersion(meta('9007199254740992')))
		expect(() => driveVersion({ id: 'source', name: 'Demo', mimeType: 'application/json' })).toThrow()
	})
})

describe('Координатор Drive: TTL, доступность, dispose', () => {
	let coordinator: DriveSyncCoordinator | undefined
	beforeEach(() => {
		localStorage.clear()
		jest.useFakeTimers({ now: Date.parse('2026-10-31T12:00:00Z') })
	})
	afterEach(() => {
		coordinator?.dispose()
		coordinator = undefined
		jest.useRealTimers()
	})

	it('дедуплицирует фоновые запросы и после dispose игнорирует ответ', async () => {
		const server = drive(),
			store = await client(server)
		const response = deferred<any>()
		server.api.getFileMetadata.mockReturnValue(response.promise)
		coordinator = new DriveSyncCoordinator(store, server.api as any)
		coordinator.start()
		const first = coordinator.refresh(store.activeDocumentId!, true)
		expect(coordinator.refresh(store.activeDocumentId!, true)).toBe(first)
		coordinator.dispose()
		response.resolve(meta('2'))
		await first
		expect(store.activeDocument!.operation).toBe('idle')
		expect(store.activeDocument!.sync.needsRemoteCheck).toBe(true)
		expect(store.activeDocument!.sync.remoteRevisionId).toBe(driveVersion(meta()))
	})

	it('не вызывает OAuth в фоне; вход, TTL и возврат сети запускают проверки', async () => {
		const server = drive(),
			store = await client(server)
		server.auth.loggedIn = false
		server.api.getFileMetadata.mockClear()
		coordinator = new DriveSyncCoordinator(store, server.api as any)
		coordinator.start()
		await coordinator.refreshAll(true)
		expect(server.api.logIn).not.toHaveBeenCalled()
		expect(server.api.getFileMetadata).not.toHaveBeenCalled()
		server.auth.loggedIn = true
		await coordinator.refreshAll()
		expect(server.api.getFileMetadata).toHaveBeenCalledTimes(1)
		await coordinator.refreshAll()
		expect(server.api.getFileMetadata).toHaveBeenCalledTimes(1)
		await jest.advanceTimersByTimeAsync(60_000)
		expect(server.api.getFileMetadata).toHaveBeenCalledTimes(2)
		window.dispatchEvent(new Event('offline'))
		expect(getDocumentUiState(store.activeDocument!).status).toBe('unknown')
		window.dispatchEvent(new Event('online'))
		await coordinator.refreshAll()
		expect(server.api.getFileMetadata).toHaveBeenCalledTimes(3)
		coordinator.dispose()
		window.dispatchEvent(new Event('online'))
		await jest.advanceTimersByTimeAsync(120_000)
		expect(server.api.getFileMetadata).toHaveBeenCalledTimes(3)
	})

	it('вытесненный фоновый запрос не блокирует следующую проверку', async () => {
		const server = drive(),
			store = await client(server)
		const old = deferred<any>()
		server.api.getFileMetadata.mockClear().mockReturnValueOnce(old.promise).mockResolvedValue(meta())
		coordinator = new DriveSyncCoordinator(store, server.api as any)
		coordinator.start()
		const background = coordinator.refresh(store.activeDocumentId!, true)
		expect((await store.checkDocument(store.activeDocumentId!)).status).toBe('success')
		const fresh = coordinator.refresh(store.activeDocumentId!, true)
		expect(server.api.getFileMetadata).toHaveBeenCalledTimes(3)
		await fresh
		old.resolve(meta('2'))
		await background
		expect(store.activeDocument!.sync.remoteRevisionId).toBe(driveVersion(meta()))
	})
})
