import { expect } from '@jest/globals'
import { DocumentTabsStore } from './DocumentTabsStore'
import type { DocumentSaveResult } from './DocumentTabsStore.types'
import { deferred } from 'src/test-utils/deferred'

function setup() {
	const api = { saveFile: jest.fn() }
	const store = new DocumentTabsStore(api as any)
	store.openNewDocument('Demo')
	const document = store.activeDocument!
	document.state.isDirty = true
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
		const before = localStorage.getItem(`document_${document.id}`)
		expect(
			await store.requestCloseDocument(
				document.id,
				async () => 'save',
				async () => result
			)
		).toEqual(result)
		expect(store.activeDocument?.id).toBe(document.id)
		expect(localStorage.getItem(`document_${document.id}`)).toBe(before)
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
		expect(localStorage.getItem(`document_${document.id}`)).toBeNull()
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
		document.state.isDirty = false
		document.state.hasUnsyncedChanges = true
		const decide = jest.fn().mockResolvedValue('cancel')
		await store.requestCloseDocument(document.id, decide, jest.fn())
		expect(decide).toHaveBeenCalledWith(true)
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
		document.ref!.fileId = 'fake-a'
		const response = deferred<never>()
		api.saveFile.mockReturnValue(response.promise)
		const saving = store.saveDocument(document.id)
		store.openNewDocument('B')
		const other = store.activeDocument!
		response.reject(new Error('Offline'))
		expect((await saving).status).toBe('failed')
		expect(document.state.error).toBe('Offline')
		expect(other.state.error).toBeNull()
	})

	it('сохраняет новые данные во время записи и оставляет dirty при коллизии Aa/BB', async () => {
		const { store, document, api } = setup()
		document.ref!.fileId = 'fake-a'
		const data = (name: string) => ({
			projectsList: [],
			completedList: [],
			plannedList: [{ name, start: '2026.10.31' }]
		})
		store.updateActiveDocumentData(data('Aa'))
		store.getDocumentStores(document.id)!.eventsStore.init(data('Aa'))
		const response = deferred<any>()
		api.saveFile.mockReturnValue(response.promise)
		const saving = store.saveDocument(document.id)
		store.updateActiveDocumentData(data('BB'))
		store.getDocumentStores(document.id)!.eventsStore.init(data('BB'))
		response.resolve({ status: 'success', file: { id: 'fake-a', name: 'Demo', mimeType: 'application/json' } })
		expect((await saving).status).toBe('saved')
		expect(document.state.isDirty).toBe(true)
		expect(document.data).toEqual(data('BB'))
		expect(JSON.parse(localStorage.getItem(`document_${document.id}`)!).data).toEqual(data('BB'))
	})
})
