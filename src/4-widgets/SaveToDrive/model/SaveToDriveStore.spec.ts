import { storedDocument } from 'src/test-utils/storedDocument'
import { expect } from '@jest/globals'
import { SaveToDriveStore } from './SaveToDriveStore'
import { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'
import { GoogleLoginCancelledError } from 'src/7-shared/services/GoogleAuthError'
import { deferred } from 'src/test-utils/deferred'

const file = (id = 'fake-file', name = 'Demo') => ({ id, name, mimeType: 'application/json', version: '1' })
const success = { status: 'success', file: file() }

function setup() {
	let loggedIn = true
	const api = {
		get isGoogleLoggedIn() {
			return loggedIn
		},
		set isGoogleLoggedIn(value: boolean) {
			loggedIn = value
		},
		logIn: jest.fn(),
		saveFile: jest.fn()
	}
	const documents = new DocumentTabsStore(api as any)
	documents.openNewDocument('Demo')
	const document = documents.activeDocument!
	const fire = jest.fn()
	const store = new SaveToDriveStore(api as any, { fileSavedNotifier: { fire } } as any, documents)
	return { store, api, documents, document, fire }
}

describe('Сохранить как и конфликт имени', () => {
	beforeEach(() => localStorage.clear())

	it('старый снимок диалога не подтверждает более новые правки исходной вкладки', async () => {
		const { store, api, documents, document } = setup()
		const projects = documents.getDocumentStores(document.id)!.projectsStore
		projects.add('Aa', 'black', 'white')
		const completion = store.openForDocument(document.id)
		const sentVersion = document.sync.localVersion
		projects.update('Aa', { name: 'BB' })
		documents.openNewDocument('B')
		const b = documents.activeDocument!
		api.saveFile.mockResolvedValue(success)
		expect((await store.saveFile('folder', 'drive')).status).toBe('saved')
		expect((await completion).status).toBe('saved')
		expect(JSON.parse(api.saveFile.mock.calls[0][1]).projectsList[0].name).toBe('Aa')
		expect(document.sync.baseLocalVersion).toBe(sentVersion)
		expect(document.data.projectsList[0].name).toBe('BB')
		expect(document.state.isDirty).toBe(true)
		expect(storedDocument(document.id)!.data.projectsList[0].name).toBe('BB')
		expect(b.ref!.fileId).toBeNull()
		expect(documents.activeDocumentId).toBe(b.id)
	})

	it('не отправляет снимок закрытого документа из оставшегося диалога', async () => {
		const { store, api, documents, document } = setup()
		const completion = store.openForDocument(document.id)
		documents.closeDocument(document.id)
		documents.openNewDocument('B')
		expect(await store.saveFile('folder', 'drive')).toEqual({ status: 'cancelled' })
		expect(await completion).toEqual({ status: 'cancelled' })
		expect(api.saveFile).not.toHaveBeenCalled()
		expect(documents.activeDocument!.ref!.fileId).toBeNull()
		store.close()
	})

	test.each(['success', 'error'])('поздний %s «Сохранить как» закрытой вкладки игнорируется', async outcome => {
		const { store, api, documents, document, fire } = setup()
		const completion = store.openForDocument(document.id)
		const response = deferred<any>()
		api.saveFile.mockReturnValue(response.promise)
		const saving = store.saveFile('folder', 'drive')
		documents.closeDocument(document.id)
		documents.openNewDocument('B')
		const b = documents.activeDocument!
		if (outcome === 'success') response.resolve(success)
		else response.reject(new Error('Late failure'))
		expect(await saving).toEqual({ status: 'cancelled' })
		expect(await completion).toEqual({ status: 'cancelled' })
		expect(b.ref!.fileId).toBeNull()
		expect(b.error).toBeNull()
		expect(fire).not.toHaveBeenCalled()
		store.close()
	})

	it('отмена завершает Promise и позволяет открыть повторно', async () => {
		const { store, document } = setup()
		const saving = store.openForDocument(document.id)
		store.close()
		expect(await saving).toEqual({ status: 'cancelled' })
		const retry = store.openForDocument(document.id)
		store.close()
		expect(await retry).toEqual({ status: 'cancelled' })
	})

	it('связывает успешную запись с исходным документом после переключения', async () => {
		const { store, api, documents, document } = setup()
		const saving = store.openForDocument(document.id)
		documents.openNewDocument('Other')
		const other = documents.activeDocument!
		api.saveFile.mockResolvedValue(success)
		expect(await store.saveFile('folder-a', 'drive')).toEqual({ status: 'saved' })
		expect(await saving).toEqual({ status: 'saved' })
		expect(document.ref!.fileId).toBe('fake-file')
		expect(other.ref!.fileId).toBeNull()
		expect(documents.activeDocument?.id).toBe(other.id)
	})

	it('не закрывает диалог и завершает ожидание при сетевой ошибке; повторная попытка работает', async () => {
		const { store, api, document, fire } = setup()
		const saving = store.openForDocument(document.id)
		api.saveFile.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(success)
		expect((await store.saveFile('folder', 'drive')).status).toBe('failed')
		expect((await saving).status).toBe('failed')
		expect(store.isOpen).toBe(true)
		expect(document.ref!.fileId).toBeNull()
		expect(fire).not.toHaveBeenCalled()
		expect((await store.saveFile('folder', 'drive')).status).toBe('saved')
		expect(fire).toHaveBeenCalledTimes(1)
	})

	it('отмена входа завершает ожидание и не вызывает запись', async () => {
		const { store, api, document } = setup()
		api.isGoogleLoggedIn = false
		api.logIn.mockRejectedValue(new GoogleLoginCancelledError())
		const saving = store.openForDocument(document.id)
		expect(await store.saveFile('folder', 'drive')).toEqual({ status: 'cancelled' })
		expect(await saving).toEqual({ status: 'cancelled' })
		expect(api.saveFile).not.toHaveBeenCalled()
		expect(document.ref!.fileId).toBeNull()
	})

	it('переименовывает файл без расширения и повторно проверяет конфликт', async () => {
		const { store, api, document } = setup()
		const saving = store.openForDocument(document.id)
		api.saveFile
			.mockResolvedValueOnce({ status: 'conflict', existingFiles: [file()] })
			.mockResolvedValueOnce({ status: 'conflict', existingFiles: [file('second', 'Demo (1)')] })
			.mockResolvedValueOnce(success)
		await store.saveFile('original-folder', 'appDataFolder')
		expect(store.newFileNameForConflict).toBe('Demo (1)')
		await store.resolveConflict('rename')
		expect(api.saveFile.mock.calls[1][0]).toBe('Demo (1)')
		expect(api.saveFile.mock.calls[1].slice(3)).toEqual(['original-folder', 'appDataFolder', null])
		expect(store.showConflictDialog).toBe(true)
		expect(store.newFileNameForConflict).toBe('Demo (1) (1)')
		await store.resolveConflict('rename')
		expect(await saving).toEqual({ status: 'saved' })
	})

	it('перезаписывает выбранный ID среди нескольких одинаковых имён', async () => {
		const { store, api, document } = setup()
		const saving = store.openForDocument(document.id)
		api.saveFile
			.mockResolvedValueOnce({ status: 'conflict', existingFiles: [file('first'), file('second')] })
			.mockResolvedValueOnce(success)
		await store.saveFile('folder', 'drive')
		expect(store.selectedConflictFileId).toBe('')
		store.setSelectedConflictFileId('second')
		await store.resolveConflict('overwrite')
		expect(api.saveFile.mock.calls[1][5]).toBe('second')
		expect(await saving).toEqual({ status: 'saved' })
	})

	test.each(['rename', 'overwrite'] as const)('не пишет при пустом решении %s', async resolution => {
		const { store, api, document } = setup()
		const saving = store.openForDocument(document.id)
		api.saveFile.mockResolvedValue({ status: 'conflict', existingFiles: [file('first'), file('second')] })
		await store.saveFile('folder', 'drive')
		store.setNewFileNameForConflict('   ')
		expect((await store.resolveConflict(resolution)).status).toBe('failed')
		expect((await saving).status).toBe('failed')
		expect(api.saveFile).toHaveBeenCalledTimes(1)
		expect(store.showConflictDialog).toBe(true)
	})

	it('отмена конфликта завершает ожидание без перезаписи', async () => {
		const { store, api, document } = setup()
		const saving = store.openForDocument(document.id)
		api.saveFile.mockResolvedValue({ status: 'conflict', existingFiles: [file()] })
		await store.saveFile('folder', 'drive')
		await store.resolveConflict('cancel')
		expect(await saving).toEqual({ status: 'cancelled' })
		expect(api.saveFile).toHaveBeenCalledTimes(1)
		expect(document.ref!.fileId).toBeNull()
	})

	test.each(['overwrite', 'rename'] as const)(
		'сетевая ошибка после %s не отмечает документ сохранённым',
		async resolution => {
			const { store, api, document } = setup()
			const completion = store.openForDocument(document.id)
			api.saveFile
				.mockResolvedValueOnce({ status: 'conflict', existingFiles: [file()] })
				.mockRejectedValueOnce(new Error('Offline after choice'))
			await store.saveFile('folder', 'drive')
			expect((await store.resolveConflict(resolution)).status).toBe('failed')
			expect((await completion).status).toBe('failed')
			expect(document.ref!.fileId).toBeNull()
			expect(store.isOpen).toBe(true)
		}
	)

	test.each([
		['Demo.json', 'Demo (1).json'],
		['report.tar.gz', 'report.tar (1).gz']
	])('сохраняет расширение при конфликте %s', async (name, expected) => {
		const { store, api } = setup()
		const completion = store.open(name, '{}')
		api.saveFile.mockResolvedValue({ status: 'conflict', existingFiles: [file('fake', name)] })
		await store.saveFile('folder', 'drive')
		expect(store.newFileNameForConflict).toBe(expected)
		store.close()
		expect(await completion).toEqual({ status: 'cancelled' })
	})

	it('не запускает повторную запись и не закрывает диалог во время запроса', async () => {
		const { store, api, document } = setup()
		const completion = store.openForDocument(document.id)
		const response = deferred<any>()
		api.saveFile.mockReturnValue(response.promise)
		const saving = store.saveFile('folder', 'drive')
		store.close()
		expect(store.isOpen).toBe(true)
		expect((await store.saveFile('folder', 'drive')).status).toBe('failed')
		expect(api.saveFile).toHaveBeenCalledTimes(1)
		response.resolve(success)
		await saving
		expect(await completion).toEqual({ status: 'saved' })
	})
})
