import { legacySessionV1 } from 'src/test-utils/legacySession'
import { storedDocument } from 'src/test-utils/storedDocument'
import { confirmedDocument } from 'src/test-utils/confirmedDocument'
import { deferred } from 'src/test-utils/deferred'
import { DocumentTabsStore } from './DocumentTabsStore'
import { computeFingerprint } from './DocumentSyncFingerprint'
import { getIsDirty } from './DocumentSyncSelectors'
import type { DocumentData, DocumentSession } from './DocumentTabsStore.types'

const data = (name: string): DocumentData => ({
	projectsList: [{ name, color: 'black', background: 'white' }],
	completedList: [],
	plannedList: []
})
const metadata = (id = 'file-a') => ({ id, name: id, mimeType: 'application/json', version: '1' })
const success = (id = 'file-a') => ({ status: 'success', file: metadata(id) })

function setup() {
	const api = {
		isGoogleLoggedIn: true,
		logIn: jest.fn(),
		updateFileContent: jest.fn(),
		getFileMetadata: jest.fn().mockImplementation(async (id: string) => metadata(id)),
		downloadFileContent: jest.fn()
	}
	const store = new DocumentTabsStore(api as any)
	store.openNewDocument('A')
	const a = store.activeDocument!
	confirmedDocument(a, 'file-a')
	return { store, api, a }
}

/** Правка через настоящий доменный стор, без ручной установки legacy-флагов. */
function edit(store: DocumentTabsStore, document: DocumentSession, name: string) {
	const projects = store.getDocumentStores(document.id)!.projectsStore
	if (projects.exists('Aa')) projects.update('Aa', { name })
	else projects.add(name, 'black', 'white')
}

describe('Адресация асинхронных команд и версии локальных данных', () => {
	beforeEach(() => localStorage.clear())

	it('сохраняет отправленный Aa, оставляет BB локально и восстанавливает BB после перезапуска', async () => {
		const { store, api, a } = setup()
		edit(store, a, 'Aa')
		const response = deferred<any>()
		api.updateFileContent.mockReturnValue(response.promise)
		const saving = store.saveDocument(a.id)
		await Promise.resolve()
		const sentVersion = a.sync.localVersion
		store.openNewDocument('B')
		const b = store.activeDocument!
		edit(store, a, 'BB')
		expect(storedDocument(a.id)!.data).toEqual(data('BB'))
		expect(JSON.parse(api.updateFileContent.mock.calls[0][1])).toEqual({ schemaVersion: 1, ...data('Aa') })
		response.resolve(success())
		expect(await saving).toEqual({ status: 'saved' })
		expect(a.sync.baseLocalVersion).toBe(sentVersion)
		expect(a.sync.localVersion).toBeGreaterThan(sentVersion)
		expect(getIsDirty(a)).toBe(true)
		expect(store.activeDocumentId).toBe(b.id)
		expect(b.ref!.fileId).toBeNull()
		const restored = new DocumentTabsStore(api as any)
		expect(await restored.restoreFromLocalStorage()).toBe(true)
		const restoredA = restored.documents.find(document => document.id === a.id)!
		expect(restoredA.data).toEqual(data('BB'))
		expect(getIsDirty(restoredA)).toBe(true)
		expect(restoredA.operation).toBe('idle')
		expect(restoredA.operationToken).toBeNull()
	})

	it('дедуплицирует сохранения одной сессии; следующая запись отправляет новые данные', async () => {
		const { store, api, a } = setup()
		edit(store, a, 'Aa')
		const response = deferred<any>()
		api.updateFileContent.mockReturnValueOnce(response.promise).mockResolvedValueOnce(success())
		const first = store.saveDocument(a.id)
		await Promise.resolve()
		edit(store, a, 'BB')
		const second = store.saveDocument(a.id)
		expect(second).toBe(first)
		expect(api.updateFileContent).toHaveBeenCalledTimes(1)
		response.resolve(success())
		await Promise.all([first, second])
		expect(getIsDirty(a)).toBe(true)
		await store.saveDocument(a.id)
		expect(JSON.parse(api.updateFileContent.mock.calls[1][1])).toEqual({ schemaVersion: 1, ...data('BB') })
		expect(getIsDirty(a)).toBe(false)
	})

	it('независимые сохранения A и B завершаются в обратном порядке', async () => {
		const { store, api, a } = setup()
		const first = deferred<any>(),
			second = deferred<any>()
		api.updateFileContent.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
		edit(store, a, 'A edit')
		const savingA = store.saveDocument(a.id)
		await Promise.resolve()
		store.openNewDocument('B')
		const b = store.activeDocument!
		confirmedDocument(b, 'file-b')
		edit(store, b, 'B edit')
		const savingB = store.saveDocument(b.id)
		await Promise.resolve()
		second.resolve(success('file-b'))
		await savingB
		expect(a.operation).toBe('saving')
		expect(b.operation).toBe('idle')
		first.reject(new Error('A offline'))
		expect((await savingA).status).toBe('failed')
		expect(a.error?.message).toBe('A offline')
		expect(b.error).toBeNull()
		expect(store.activeDocumentId).toBe(b.id)
	})

	test.each(['success', 'error'])('ответ %s закрытой сессии не меняет новую с тем же ID', async outcome => {
		const { store, api, a } = setup()
		const response = deferred<any>()
		api.updateFileContent.mockReturnValue(response.promise)
		edit(store, a, 'Before close')
		const saving = store.saveDocument(a.id)
		await Promise.resolve()
		store.closeDocument(a.id)
		localStorage.setItem(
			'documentTabs',
			JSON.stringify({
				schemaVersion: 2,
				activeDocumentId: a.id,
				documentOrder: [a.id],
				savedAt: Date.now(),
				documents: [
					{
						id: a.id,
						ref: { ...a.ref!, name: 'Replacement' },
						sync: { ...a.sync },
						data: a.data,
						lastAccessedAt: Date.now()
					}
				]
			})
		)
		await store.restoreFromLocalStorage()
		const replacement = store.documents[0]
		if (outcome === 'success') response.resolve(success())
		else response.reject(new Error('Late failure'))
		expect(await saving).toEqual({ status: 'cancelled' })
		expect(replacement.ref!.name).toBe('Replacement')
		expect(replacement.error).toBeNull()
		expect(replacement.operation).toBe('idle')
		expect(replacement.operationToken).toBeNull()
	})

	test.each(['success', 'error'])('устаревшая проверка %s не сбрасывает более новую операцию', async outcome => {
		const { store, api, a } = setup()
		const first = deferred<any>(),
			second = deferred<any>()
		api.getFileMetadata.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
		const oldCheck = store.checkDocument(a.id)
		const newCheck = store.checkDocument(a.id)
		const token = a.operationToken
		if (outcome === 'success') first.resolve(metadata())
		else first.reject(new Error('Late failure'))
		expect(await oldCheck).toEqual({ status: 'cancelled' })
		expect(a.operation).toBe('checking')
		expect(a.operationToken).toBe(token)
		expect(a.error).toBeNull()
		second.resolve(metadata())
		expect(await newCheck).toEqual({ status: 'success' })
		expect(a.operation).toBe('idle')
	})

	it('поздняя старая проверка не заменяет новый результат', async () => {
		const { store, api, a } = setup()
		const first = deferred<any>(),
			second = deferred<any>()
		api.getFileMetadata.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
		const oldCheck = store.checkDocument(a.id),
			newCheck = store.checkDocument(a.id)
		second.resolve({ ...metadata(), modifiedTime: '2026-11-01T00:00:00Z', version: '2' })
		expect((await newCheck).status).toBe('conflict')
		const revision = a.sync.remoteRevisionId
		first.resolve(metadata())
		expect((await oldCheck).status).toBe('cancelled')
		expect(a.sync.remoteRevisionId).toBe(revision)
	})

	test.each(['metadata', 'content'])('закрытие во время открытия: задержан %s', async stage => {
		const { store, api } = setup()
		const response = deferred<any>()
		api.getFileMetadata.mockReturnValue(stage === 'metadata' ? response.promise : Promise.resolve(metadata('loading')))
		api.downloadFileContent.mockReturnValue(response.promise)
		const opening = store.openFromDrive('loading')
		const id = store.activeDocumentId!
		await Promise.resolve()
		store.closeDocument(id)
		const activeId = store.activeDocumentId
		response.resolve(stage === 'metadata' ? metadata('loading') : data('Remote'))
		expect(await opening).toEqual({ status: 'cancelled' })
		expect(store.activeDocumentId).toBe(activeId)
		expect(store.documents.some(document => document.id === id)).toBe(false)
		expect(storedDocument(id)).toBeNull()
	})

	it('открытие не перезаписывает правки, сделанные до ответа Drive', async () => {
		const { store, api } = setup()
		const response = deferred<any>()
		api.getFileMetadata.mockResolvedValue(metadata('loading'))
		api.downloadFileContent.mockReturnValue(response.promise)
		const opening = store.openFromDrive('loading')
		const document = store.activeDocument!
		// Повторная активация создаёт доменные сторы до завершения сети.
		store.activateDocument(document.id)
		store.activeProjectsStore!.add('Local while opening', 'black', 'white')
		response.resolve(data('Remote'))
		expect((await opening).status).toBe('conflict')
		expect(document.ref!.name).toBe('loading')
		expect(document.data).toEqual(data('Local while opening'))
		expect(getIsDirty(document)).toBe(true)
		expect(document.operation).toBe('idle')
		expect(storedDocument(document.id)!.data).toEqual(data('Local while opening'))
	})

	it('пакетное сохранение не переключает вкладку и не отменяет выбор пользователя', async () => {
		const { store, api, a } = setup()
		edit(store, a, 'Aa')
		store.openNewDocument('B')
		const b = store.activeDocument!
		confirmedDocument(b, 'file-b')
		edit(store, b, 'B edit')
		const response = deferred<any>()
		api.updateFileContent.mockReturnValueOnce(response.promise).mockResolvedValueOnce(success('file-b'))
		const all = store.saveAllDirtyDocuments()
		await Promise.resolve()
		expect(store.activeDocumentId).toBe(b.id)
		store.openNewDocument('C')
		const c = store.activeDocumentId
		response.resolve(success())
		expect(Array.from((await all).values())).toEqual([true, true])
		expect(store.activeDocumentId).toBe(c)
	})

	it('загрузка A после переключения на B меняет только A', async () => {
		const { store, api, a } = setup()
		const response = deferred<any>()
		api.downloadFileContent.mockReturnValue(response.promise)
		const pulling = store.pullDocument(a.id)
		store.openNewDocument('B')
		const b = store.activeDocument!
		response.resolve(data('Remote A'))
		expect(await pulling).toEqual({ status: 'pulled' })
		expect(a.data).toEqual(data('Remote A'))
		expect(b.data.projectsList).toEqual([])
		expect(store.activeDocumentId).toBe(b.id)
	})

	it('загрузка не перезаписывает правки, сделанные в полёте', async () => {
		const { store, api, a } = setup()
		const response = deferred<any>()
		api.downloadFileContent.mockReturnValue(response.promise)
		const pulling = store.pullDocument(a.id)
		edit(store, a, 'Local')
		response.resolve(data('Remote'))
		expect((await pulling).status).toBe('conflict')
		expect(a.data).toEqual(data('Local'))
		expect(getIsDirty(a)).toBe(true)
		expect(storedDocument(a.id)!.data).toEqual(data('Local'))
	})

	it('старый pull не заменяет результат нового', async () => {
		const { store, api, a } = setup()
		const first = deferred<any>(),
			second = deferred<any>()
		api.downloadFileContent.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
		const oldPull = store.pullDocument(a.id)
		await Promise.resolve()
		const newPull = store.pullDocument(a.id)
		second.resolve(data('New remote'))
		expect((await newPull).status).toBe('pulled')
		first.resolve(data('Old remote'))
		expect((await oldPull).status).toBe('cancelled')
		expect(a.data).toEqual(data('New remote'))
	})

	it('новые локальные правки делают старое решение конфликта недействительным', async () => {
		const { store, api, a } = setup()
		api.getFileMetadata.mockResolvedValue({ ...metadata(), modifiedTime: '2026-11-01T00:00:00Z', version: '2' })
		const result = await store.checkDocument(a.id)
		if (result.status !== 'conflict') throw new Error('Expected conflict')
		edit(store, a, 'Local')
		expect((await store.pullDocument(a.id, result.context)).status).toBe('conflict')
		expect((await store.resolveDocumentConflict(result.context, 'remote')).status).toBe('conflict')
		expect((await store.resolveDocumentConflict(result.context, 'local')).status).toBe('conflict')
		expect(api.downloadFileContent).not.toHaveBeenCalled()
		expect(api.updateFileContent).not.toHaveBeenCalled()
	})

	it('решение удалённого конфликта хранит ID исходной вкладки', async () => {
		const { store, api, a } = setup()
		api.getFileMetadata.mockResolvedValue({ ...metadata(), modifiedTime: '2026-11-01T00:00:00Z', version: '2' })
		api.downloadFileContent.mockResolvedValue(data('Remote A'))
		const result = await store.checkDocument(a.id)
		if (result.status !== 'conflict') throw new Error('Expected conflict')
		store.openNewDocument('B')
		const b = store.activeDocument!
		expect((await store.resolveDocumentConflict(result.context, 'remote')).status).toBe('pulled')
		expect(a.data).toEqual(data('Remote A'))
		expect(b.data.projectsList).toEqual([])
		expect(store.activeDocumentId).toBe(b.id)
	})

	it('снимок неизменяем, Aa/BB различаются, возврат к точной базе снимает dirty', async () => {
		const { store, api, a } = setup()
		edit(store, a, 'Aa')
		const snapshot = store.captureDocumentSnapshot(a.id)!
		expect(Object.isFrozen(snapshot.data.projectsList[0])).toBe(true)
		api.updateFileContent.mockResolvedValue(success())
		await store.saveDocument(a.id)
		edit(store, a, 'BB')
		expect(snapshot.data).toEqual(data('Aa'))
		expect(computeFingerprint(data('Aa'))).not.toBe(computeFingerprint(data('BB')))
		expect(getIsDirty(a)).toBe(true)
		store.getDocumentStores(a.id)!.projectsStore.update('BB', { name: 'Aa' })
		expect(getIsDirty(a)).toBe(false)
	})

	it('общие ссылки равны копиям по содержимому, цикл вызывает явную ошибку', () => {
		const project = data('Shared').projectsList[0]
		const shared = { ...data(''), projectsList: [project, project] }
		expect(computeFingerprint(shared)).toBe(computeFingerprint(JSON.parse(JSON.stringify(shared))))
		const cyclic: any = data('Cycle')
		cyclic.self = cyclic
		expect(() => computeFingerprint(cyclic)).toThrow()
	})

	it('прерывание между записью данных и метаданных не восстанавливает ложный clean', async () => {
		const { store, api, a } = setup()
		edit(store, a, 'Aa')
		api.updateFileContent.mockResolvedValue(success())
		await store.saveDocument(a.id)
		const legacy: any = legacySessionV1(JSON.parse(localStorage.getItem('documentTabs')!))
		delete legacy.schemaVersion
		localStorage.setItem('documentTabs', JSON.stringify(legacy))
		localStorage.setItem('document_' + a.id, JSON.stringify({ data: data('BB'), savedAt: Date.now() }))
		const restored = new DocumentTabsStore(api as any)
		await restored.restoreFromLocalStorage()
		expect(restored.activeDocument!.data).toEqual(data('BB'))
		expect(getIsDirty(restored.activeDocument!)).toBe(true)
	})

	it('старые dirty-флаги мигрируют в неизвестную базу без потери предупреждения', async () => {
		const { store, api, a } = setup()
		edit(store, a, 'Aa')
		const tabs: any = legacySessionV1(JSON.parse(localStorage.getItem('documentTabs')!))
		delete tabs.documents[0].sync
		localStorage.setItem('documentTabs', JSON.stringify(tabs))
		const restored = new DocumentTabsStore(api as any)
		await restored.restoreFromLocalStorage()
		expect(restored.activeDocument!.sync.baseLocalVersion).toBeNull()
		expect(getIsDirty(restored.activeDocument!)).toBe(true)
		expect(restored.activeDocument!.data).toEqual(data('Aa'))
	})

	it('невалидный pull не меняет текущий документ', async () => {
		const { store, api, a } = setup()
		edit(store, a, 'Aa')
		api.downloadFileContent.mockResolvedValue({ projectsList: 'invalid', completedList: [], plannedList: [] })
		expect((await store.pullDocument(a.id)).status).toBe('failed')
		expect(a.data).toEqual(data('Aa'))
		expect(getIsDirty(a)).toBe(true)
	})

	it('открытие сбрасывает кэш при загрузке активной вкладки и не активирует её после переключения', async () => {
		const { store, api, a } = setup()
		const changed = jest.fn()
		store.setOnActiveDocumentChanged(changed)
		api.getFileMetadata.mockResolvedValue(metadata('loading'))
		const response = deferred<any>()
		api.downloadFileContent.mockReturnValue(response.promise)
		const opening = store.openFromDrive('loading')
		const loadingId = store.activeDocumentId!
		expect(changed).toHaveBeenLastCalledWith(loadingId)
		store.activateDocument(a.id)
		changed.mockClear()
		response.resolve(data('Loaded'))
		expect((await opening).status).toBe('opened')
		expect(changed).not.toHaveBeenCalled()
		expect(store.activeDocumentId).toBe(a.id)
		changed.mockClear()
		store.applyContentToDocument(a.id, data('Active'))
		expect(changed).toHaveBeenCalledWith(a.id)
	})
})
