import { storedDocument } from 'src/test-utils/storedDocument'
import { confirmedDocument } from 'src/test-utils/confirmedDocument'
import { expect } from '@jest/globals'
import { DocumentTabsStore } from './DocumentTabsStore'
import type { DocumentSaveResult } from './DocumentTabsStore.types'
import { deferred } from 'src/test-utils/deferred'
import { getIsDirty } from './DocumentSyncSelectors'

function setup() {
	const api = {
		updateFileContent: jest.fn(),
		getFileMetadata: jest
			.fn()
			.mockImplementation(async (id: string) => ({ id, name: id, mimeType: 'application/json', version: '1' }))
	}
	const store = new DocumentTabsStore(api as any)
	store.openNewDocument('Demo')
	const document = store.activeDocument!
	store.updateActiveDocumentData({ projectsList: [], completedList: [], plannedList: [] })
	return { store, document, api }
}

describe('Общая команда закрытия документа', () => {
	beforeEach(() => localStorage.clear())

	test.each<DocumentSaveResult>([
		{ status: 'cancelled' },
		{ status: 'failed', message: 'Network failure' },
		{ status: 'conflict', message: 'Conflict' }
	])('оставляет документ и его локальный снимок при $status', async result => {
		const { store, document } = setup()
		const before = storedDocument(document.id)
		expect(
			await store.requestCloseDocument(
				document.id,
				async () => 'save',
				async () => result
			)
		).toEqual(result)
		expect(store.activeDocument?.id).toBe(document.id)
		expect(storedDocument(document.id)).toEqual(before)
	})

	it('закрывает новый документ только после подтверждённого сохранения', async () => {
		const { store, document } = setup()
		const response = deferred<DocumentSaveResult>()
		const save = jest.fn().mockReturnValue(response.promise)
		const closing = store.requestCloseDocument(document.id, async () => 'save', save)
		await Promise.resolve()
		expect(save).toHaveBeenCalledWith(document.id)
		expect(store.documents).toHaveLength(1)
		response.resolve({ status: 'saved' })
		expect(await closing).toEqual({ status: 'closed' })
		expect(storedDocument(document.id)).toBeNull()
	})

	test.each(['discard', 'cancel'] as const)('завершает решение %s без сохранения', async decision => {
		const { store, document } = setup()
		const save = jest.fn()
		const result = await store.requestCloseDocument(document.id, async () => decision, save)
		expect(result.status).toBe(decision === 'discard' ? 'closed' : 'cancelled')
		expect(store.documents).toHaveLength(decision === 'discard' ? 0 : 1)
		expect(save).not.toHaveBeenCalled()
	})

	it('предупреждает о несинхронизированной предыдущей сессии даже без isDirty', async () => {
		const { store, document } = setup()
		confirmedDocument(document, 'fake')
		document.sync.baseLocalVersion = document.sync.localVersion
		document.sync.needsRemoteCheck = true
		const decide = jest.fn().mockResolvedValue('cancel')
		await store.requestCloseDocument(document.id, decide, jest.fn())
		expect(decide).toHaveBeenCalledWith(expect.objectContaining({ remoteUnknown: true }))
	})

	it('позволяет повторить закрытие после отклонённой записи', async () => {
		const { store, document } = setup()
		const save = jest.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ status: 'saved' })
		expect((await store.requestCloseDocument(document.id, async () => 'save', save)).status).toBe('failed')
		expect((await store.requestCloseDocument(document.id, async () => 'save', save)).status).toBe('closed')
	})

	it('не закрывает документ при новых правках во время сохранения', async () => {
		const { store, document } = setup()
		const response = deferred<DocumentSaveResult>()
		const closing = store.requestCloseDocument(
			document.id,
			async () => 'save',
			() => response.promise
		)
		await Promise.resolve()
		store.getDocumentStores(document.id)!.eventsStore.addPlannedEventDto({ name: 'New edit', start: '2026.10.31' })
		response.resolve({ status: 'saved' })
		expect((await closing).status).toBe('failed')
		expect(store.documents).toHaveLength(1)
	})

	it('относит отказ записи исходной вкладке после переключения', async () => {
		const { store, document, api } = setup()
		confirmedDocument(document, 'fake-a')
		const response = deferred<never>()
		api.updateFileContent.mockReturnValue(response.promise)
		const saving = store.saveDocument(document.id)
		await Promise.resolve()
		store.openNewDocument('B')
		const other = store.activeDocument!
		response.reject(new Error('Offline'))
		expect((await saving).status).toBe('failed')
		expect(document.error?.message).toBe('Offline')
		expect(other.error).toBeNull()
	})

	it('сохраняет новые данные во время записи и оставляет dirty при коллизии Aa/BB', async () => {
		const { store, document, api } = setup()
		confirmedDocument(document, 'fake-a')
		const data = (name: string) => ({
			projectsList: [],
			completedList: [],
			plannedList: [{ name, start: '2026.10.31', projectId: 'default' }]
		})
		store.updateActiveDocumentData(data('Aa'))
		store.getDocumentStores(document.id)!.eventsStore.init(data('Aa'))
		const response = deferred<any>()
		api.updateFileContent.mockReturnValue(response.promise)
		const saving = store.saveDocument(document.id)
		await Promise.resolve()
		store.updateActiveDocumentData(data('BB'))
		store.getDocumentStores(document.id)!.eventsStore.init(data('BB'))
		response.resolve({
			status: 'success',
			file: { id: 'fake-a', name: 'Demo', mimeType: 'application/json', version: '1' }
		})
		expect((await saving).status).toBe('saved')
		expect(getIsDirty(document)).toBe(true)
		expect(document.data).toEqual(data('BB'))
		expect(storedDocument(document.id)!.data).toEqual(data('BB'))
	})
})
