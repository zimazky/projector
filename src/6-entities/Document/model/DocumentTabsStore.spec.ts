import { DocumentTabsStore } from './DocumentTabsStore'
import { DocumentSession } from './DocumentTabsStore.types'

const DOCUMENT_TABS_KEY = 'documentTabs'

type GoogleApiServiceMock = {
	isGoogleLoggedIn: boolean
	getFileMetadata: jasmine.Spy
	downloadFileContent: jasmine.Spy
	saveFile: jasmine.Spy
	logIn: jasmine.Spy
}

type StorageServiceMock = {
	applyContent: jasmine.Spy
	getContentToSave: jasmine.Spy
	desyncWithStorages: jasmine.Spy
	resetToEmptyContent: jasmine.Spy
}

function createGoogleApiServiceMock(): GoogleApiServiceMock {
	let loggedIn = true

	return {
		get isGoogleLoggedIn() {
			return loggedIn
		},
		set isGoogleLoggedIn(value: boolean) {
			loggedIn = value
		},
		getFileMetadata: jasmine.createSpy('getFileMetadata'),
		downloadFileContent: jasmine.createSpy('downloadFileContent'),
		saveFile: jasmine.createSpy('saveFile'),
		logIn: jasmine.createSpy('logIn')
	}
}

function createStorageServiceMock(): StorageServiceMock {
	return {
		applyContent: jasmine.createSpy('applyContent'),
		getContentToSave: jasmine.createSpy('getContentToSave').and.returnValue({
			projectsList: [],
			completedList: [],
			plannedList: []
		}),
		desyncWithStorages: jasmine.createSpy('desyncWithStorages'),
		resetToEmptyContent: jasmine.createSpy('resetToEmptyContent')
	}
}

function createStore() {
	const googleApiService = createGoogleApiServiceMock()
	const store = new DocumentTabsStore(googleApiService as any)
	return { store, googleApiService }
}

function clearLocalStorage() {
	localStorage.removeItem(DOCUMENT_TABS_KEY)
	// Удаляем все ключи document_*
	const keysToRemove: string[] = []
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i)
		if (key && key.startsWith('document_')) {
			keysToRemove.push(key)
		}
	}
	keysToRemove.forEach(key => localStorage.removeItem(key))
}

describe('DocumentTabsStore', () => {
	beforeEach(() => {
		clearLocalStorage()
	})

	afterEach(() => {
		clearLocalStorage()
	})

	describe('openNewDocument', () => {
		it('создаёт новую вкладку с пустыми данными', () => {
			const { store } = createStore()

			store.openNewDocument('Тестовый документ')

			expect(store.documents.length).toBe(1)
			expect(store.activeDocument?.ref?.name).toBe('Тестовый документ')
			expect(store.activeDocument?.ref?.fileId).toBeNull()
			expect(store.activeDocument?.state.isDirty).toBeFalse()
			expect(store.activeDocument?.state.syncStatus).toBe('offline')
		})

		it('создаёт сторы для нового документа через DocumentStoreManager', () => {
			const { store } = createStore()

			store.openNewDocument('Тест')

			// Проверяем что сторы созданы
			const stores = store.getActiveDocumentStores()
			expect(stores).not.toBeNull()
			expect(stores?.documentId).toBe(store.activeDocument?.id)
		})

		it('сохраняет метаданные в localStorage', () => {
			const { store } = createStore()

			store.openNewDocument('Тест')

			const rawSnapshot = localStorage.getItem(DOCUMENT_TABS_KEY)
			expect(rawSnapshot).not.toBeNull()
			const snapshot = JSON.parse(rawSnapshot!)
			expect(snapshot.activeDocumentId).toBe(store.activeDocument?.id)
			expect(snapshot.documentOrder.length).toBe(1)
		})
	})

	describe('closeDocument', () => {
		it('закрывает вкладку и переключается на первую', () => {
			const { store } = createStore()

			store.openNewDocument('Doc 1')
			const doc1Id = store.activeDocument!.id
			store.openNewDocument('Doc 2')
			const doc2Id = store.activeDocument!.id

			store.closeDocument(doc2Id)

			expect(store.documents.length).toBe(1)
			expect(store.activeDocument?.id).toBe(doc1Id)
		})

		it('закрывает последнюю вкладку и сбрасывает activeDocumentId', () => {
			const { store } = createStore()

			store.openNewDocument('Doc 1')
			const docId = store.activeDocument!.id

			store.closeDocument(docId)

			expect(store.documents.length).toBe(0)
			expect(store.activeDocumentId).toBeNull()
		})

		it('удаляет сторы при закрытии последнего документа', () => {
			const { store } = createStore()

			store.openNewDocument('Doc 1')
			const docId = store.activeDocument!.id
			store.closeDocument(docId)

			expect(store.documents.length).toBe(0)
			expect(store.activeDocumentId).toBeNull()
			// Сторы удалены через DocumentStoreManager
			expect(store.getAllDocumentStores().length).toBe(0)
		})
	})

	describe('activateDocument', () => {
		it('переключает активный документ', () => {
			const { store } = createStore()

			store.openNewDocument('Doc 1')
			const doc1Id = store.activeDocument!.id
			store.openNewDocument('Doc 2')

			store.activateDocument(doc1Id)

			expect(store.activeDocument?.id).toBe(doc1Id)
		})

		it('убеждается что сторы существуют без очистки/перезагрузки', () => {
			const { store } = createStore()

			store.openNewDocument('Doc 1')
			const doc1Id = store.activeDocument!.id
			store.openNewDocument('Doc 2')

			// Переключаемся на Doc 1 и получаем сторы
			store.activateDocument(doc1Id)
			const storesForDoc1 = store.getActiveDocumentStores()

			// Переключаемся на Doc 2 и обратно
			store.openNewDocument('Doc 3')
			store.activateDocument(doc1Id)
			const storesForDoc1Again = store.getActiveDocumentStores()

			// Сторы для Doc 1 те же самые (не пересозданы)
			expect(storesForDoc1Again).toBe(storesForDoc1)
			expect(storesForDoc1Again?.documentId).toBe(doc1Id)
		})

		it('обновляет lastAccessedAt', () => {
			const { store } = createStore()

			store.openNewDocument('Doc 1')
			const doc1Id = store.activeDocument!.id
			store.openNewDocument('Doc 2')

			const beforeActivate = Date.now()
			store.activateDocument(doc1Id)
			const afterActivate = Date.now()

			const doc = store.documents.find(d => d.id === doc1Id)
			expect(doc!.lastAccessedAt).toBeGreaterThanOrEqual(beforeActivate)
			expect(doc!.lastAccessedAt).toBeLessThanOrEqual(afterActivate)
		})
	})

	describe('updateActiveDocumentData', () => {
		it('устанавливает isDirty = true при обновлении данных', () => {
			const { store } = createStore()

			store.openNewDocument('Тест')
			expect(store.activeDocument?.state.isDirty).toBeFalse()

			store.updateActiveDocumentData({
				projectsList: [],
				completedList: [],
				plannedList: []
			})

			expect(store.activeDocument?.state.isDirty).toBeTrue()
		})

		it('не обновляет isDirty, если документ сохраняется', () => {
			const { store } = createStore()

			store.openNewDocument('Тест')
			const session = store.activeDocument!
			session.state.isSaving = true

			store.updateActiveDocumentData({
				projectsList: [],
				completedList: [],
				plannedList: []
			})

			expect(session.state.isDirty).toBeFalse()
		})

		it('устанавливает syncStatus = needs-sync при изменении синхронизированного документа', () => {
			const { store } = createStore()

			store.openNewDocument('Тест')
			store.activeDocument!.state.syncStatus = 'synced' as const

			store.updateActiveDocumentData({
				projectsList: [],
				completedList: [],
				plannedList: []
			})

			expect(store.activeDocument?.state.syncStatus as string).toBe('needs-sync')
		})
	})

	describe('syncActiveDocumentWithDrive', () => {
		it('возвращает error, если нет активного документа', async () => {
			const { store } = createStore()

			const result = await store.syncActiveDocumentWithDrive()

			expect(result.status).toBe('error')
			if (result.status === 'error') {
				expect(result.message).toBe('Нет документа для синхронизации')
			}
		})

		it('возвращает error, если у документа нет fileId', async () => {
			const { store } = createStore()

			store.openNewDocument('Тест')

			const result = await store.syncActiveDocumentWithDrive()

			expect(result.status).toBe('error')
		})

		it('выполняет авторизацию при необходимости', async () => {
			const { store, googleApiService } = createStore()

			store.openNewDocument('Тест')
			store.activeDocument!.ref!.fileId = 'file-1'
			googleApiService.isGoogleLoggedIn = false

			await store.syncActiveDocumentWithDrive()

			expect(googleApiService.logIn).toHaveBeenCalled()
		})

		it('возвращает conflict при локальных изменениях', async () => {
			const { store, googleApiService } = createStore()

			store.openNewDocument('Тест')
			store.activeDocument!.ref!.fileId = 'file-1'
			store.updateActiveDocumentData({
				projectsList: [],
				completedList: [],
				plannedList: []
			})

			googleApiService.getFileMetadata.and.resolveTo({
				id: 'file-1',
				name: 'Тест',
				mimeType: 'application/json',
				modifiedTime: new Date().toISOString()
			})

			const result = await store.syncActiveDocumentWithDrive()

			expect(result.status).toBe('conflict')
			if (result.status === 'conflict') {
				expect(result.hasLocalChanges).toBeTrue()
			}
		})

		it('возвращает conflict при изменениях в Drive', async () => {
			const { store, googleApiService } = createStore()

			store.openNewDocument('Тест')
			const session = store.activeDocument!
			session.ref!.fileId = 'file-1'
			session.state.lastSavedAt = Date.now() - 10000 // 10 секунд назад

			const futureDate = new Date(Date.now() + 10000).toISOString()
			googleApiService.getFileMetadata.and.resolveTo({
				id: 'file-1',
				name: 'Тест',
				mimeType: 'application/json',
				modifiedTime: futureDate
			})

			const result = await store.syncActiveDocumentWithDrive()

			expect(result.status).toBe('conflict')
			if (result.status === 'conflict') {
				expect(result.hasRemoteChanges).toBeTrue()
			}
		})

		it('возвращает success при отсутствии изменений', async () => {
			const { store, googleApiService } = createStore()

			store.openNewDocument('Тест')
			const session = store.activeDocument!
			session.ref!.fileId = 'file-1'
			session.state.lastSavedAt = Date.now()

			googleApiService.getFileMetadata.and.resolveTo({
				id: 'file-1',
				name: 'Тест',
				mimeType: 'application/json',
				modifiedTime: new Date().toISOString()
			})

			googleApiService.downloadFileContent.and.resolveTo({
				projectsList: [],
				completedList: [],
				plannedList: []
			})

			const result = await store.syncActiveDocumentWithDrive()

			expect(result.status).toBe('success')
			// Сторы обновлены через DocumentStoreManager
			const stores = store.getActiveDocumentStores()
			expect(stores).not.toBeNull()
			expect(session.state.syncStatus).toBe('synced')
		})
	})

	describe('saveActiveDocument', () => {
		it('возвращает false, если нет активного документа', async () => {
			const { store } = createStore()

			const result = await store.saveActiveDocument()

			expect(result).toBeFalse()
		})

		it('возвращает false, если у документа нет fileId', async () => {
			const { store } = createStore()

			store.openNewDocument('Тест')

			const result = await store.saveActiveDocument()

			expect(result).toBeFalse()
		})

		it('сохраняет документ в Drive и сбрасывает isDirty', async () => {
			const { store, googleApiService } = createStore()

			store.openNewDocument('Тест')
			const session = store.activeDocument!
			session.ref!.fileId = 'file-1'
			session.state.isDirty = true

			googleApiService.saveFile.and.resolveTo({
				status: 'success',
				file: {
					id: 'file-1',
					name: 'Тест',
					mimeType: 'application/json',
					parents: ['root'],
					webViewLink: 'https://drive.google.com/file/d/file-1/view'
				}
			})

			const result = await store.saveActiveDocument()

			expect(result).toBeTrue()
			expect(googleApiService.saveFile).toHaveBeenCalled()
			expect(session.state.isDirty).toBeFalse()
			expect(session.state.syncStatus).toBe('synced')
		})

		it('возвращает false при ошибке сохранения', async () => {
			const { store, googleApiService } = createStore()

			store.openNewDocument('Тест')
			const session = store.activeDocument!
			session.ref!.fileId = 'file-1'

			googleApiService.saveFile.and.resolveTo({
				status: 'error',
				message: 'Network error'
			})

			const result = await store.saveActiveDocument()

			expect(result).toBeFalse()
			expect(session.state.error).toBe('Network error')
		})
	})

	describe('restoreFromLocalStorage', () => {
		it('восстанавливает сессию из localStorage', async () => {
			const { store } = createStore()

			// Создаём документ
			store.openNewDocument('Тест')
			const docId = store.activeDocument!.id
			const docName = store.activeDocument!.ref!.name

			// Сохраняем snapshot перед закрытием
			const snapshot = localStorage.getItem(DOCUMENT_TABS_KEY)

			// Очищаем store
			store.closeDocument(docId)

			// Восстанавливаем snapshot
			if (snapshot) {
				localStorage.setItem(DOCUMENT_TABS_KEY, snapshot)
			}

			const restored = await store.restoreFromLocalStorage()

			expect(restored).toBeTrue()
			expect(store.documents.length).toBe(1)
			expect(store.activeDocument?.ref?.name).toBe(docName)
		})

		it('возвращает false, если нет сохранённой сессии', async () => {
			const { store } = createStore()

			const restored = await store.restoreFromLocalStorage()

			expect(restored).toBeFalse()
		})

		it('загружает данные каждого документа из localStorage', async () => {
			const { store } = createStore()

			store.openNewDocument('Тест')
			const docId = store.activeDocument!.id
			store.updateActiveDocumentData({
				projectsList: [{ name: 'Проект 1', color: '#ff0000', background: '#ffffff' }],
				completedList: [],
				plannedList: []
			})

			// Сохраняем snapshot и данные перед закрытием
			const tabsSnapshot = localStorage.getItem(DOCUMENT_TABS_KEY)
			const dataSnapshot = localStorage.getItem(`document_${docId}`)

			// Закрываем и восстанавливаем
			store.closeDocument(docId)

			if (tabsSnapshot) {
				localStorage.setItem(DOCUMENT_TABS_KEY, tabsSnapshot)
			}
			if (dataSnapshot) {
				localStorage.setItem(`document_${docId}`, dataSnapshot)
			}

			await store.restoreFromLocalStorage()

			expect(store.activeDocument?.data.projectsList.length).toBe(1)
		})
	})

	describe('dirtyDocumentsCount', () => {
		it('возвращает количество изменённых документов', () => {
			const { store } = createStore()

			store.openNewDocument('Doc 1')
			store.openNewDocument('Doc 2')
			store.openNewDocument('Doc 3')

			store.activateDocument(store.documents[0].id)
			store.updateActiveDocumentData({
				projectsList: [],
				completedList: [],
				plannedList: []
			})

			store.activateDocument(store.documents[1].id)
			store.updateActiveDocumentData({
				projectsList: [],
				completedList: [],
				plannedList: []
			})

			expect(store.dirtyDocumentsCount).toBe(2)
		})
	})

	describe('offlineDocumentsCount', () => {
		it('возвращает количество офлайн-документов с fileId', () => {
			const { store } = createStore()

			store.openNewDocument('Doc 1')
			store.openNewDocument('Doc 2')

			// Устанавливаем fileId и offline статус
			store.documents[0].ref!.fileId = 'file-1'
			store.documents[0].state.syncStatus = 'offline'
			store.documents[1].ref!.fileId = 'file-2'
			store.documents[1].state.syncStatus = 'synced'

			expect(store.offlineDocumentsCount).toBe(1)
		})
	})
})
