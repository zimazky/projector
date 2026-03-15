import { MigrationService } from './MigrationService'

const OLD_DATA_KEY = 'data'
const OLD_LAST_OPENED_DOC_KEY = 'lastOpenedDocument'
const DOCUMENT_TABS_KEY = 'documentTabs'
const DOCUMENT_DATA_PREFIX = 'document_'

function clearLocalStorage() {
	localStorage.removeItem(OLD_DATA_KEY)
	localStorage.removeItem(OLD_LAST_OPENED_DOC_KEY)
	localStorage.removeItem(DOCUMENT_TABS_KEY)
	// Удаляем все ключи document_*
	const keysToRemove: string[] = []
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i)
		if (key && key.startsWith(DOCUMENT_DATA_PREFIX)) {
			keysToRemove.push(key)
		}
	}
	keysToRemove.forEach(key => localStorage.removeItem(key))
}

describe('MigrationService', () => {
	beforeEach(() => {
		clearLocalStorage()
	})

	afterEach(() => {
		clearLocalStorage()
	})

	describe('migrateFromSingleDocument', () => {
		it('выполняет миграцию при наличии старых данных', () => {
			// Setup старых данных
			const oldData = JSON.stringify({
				projectsList: [{ name: 'Проект 1', color: '#ff0000', background: '#ffffff' }],
				completedList: [],
				plannedList: []
			})
			const oldDoc = JSON.stringify({
				fileId: null,
				name: 'Мой документ',
				mimeType: 'application/json',
				space: null,
				parentFolderId: null,
				updatedAt: Date.now() - 10000
			})

			localStorage.setItem(OLD_DATA_KEY, oldData)
			localStorage.setItem(OLD_LAST_OPENED_DOC_KEY, oldDoc)

			// Execute миграции
			const result = MigrationService.migrateFromSingleDocument()

			// Assert
			expect(result).toBeTrue()
			expect(localStorage.getItem(DOCUMENT_TABS_KEY)).not.toBeNull()

			const tabsSnapshot = JSON.parse(localStorage.getItem(DOCUMENT_TABS_KEY)!)
			expect(tabsSnapshot.activeDocumentId).toBeDefined()
			expect(tabsSnapshot.documentOrder.length).toBe(1)
			expect(tabsSnapshot.documents[0].ref.name).toBe('Мой документ')
		})

		it('возвращает false при отсутствии старых данных', () => {
			const result = MigrationService.migrateFromSingleDocument()
			expect(result).toBeFalse()
		})

		it('возвращает false, если миграция уже выполнена', () => {
			// Setup старых данных
			localStorage.setItem(OLD_DATA_KEY, JSON.stringify({ projectsList: [], completedList: [], plannedList: [] }))
			localStorage.setItem(
				OLD_LAST_OPENED_DOC_KEY,
				JSON.stringify({
					fileId: null,
					name: 'Doc',
					mimeType: 'application/json',
					space: null,
					parentFolderId: null,
					updatedAt: Date.now()
				})
			)

			// Первая миграция
			MigrationService.migrateFromSingleDocument()

			// Вторая миграция
			const result = MigrationService.migrateFromSingleDocument()

			expect(result).toBeFalse()
		})

		it('сохраняет данные документа в новый формат', () => {
			// Setup
			const oldData = JSON.stringify({
				projectsList: [{ name: 'Проект 1', color: '#ff0000', background: '#ffffff' }],
				completedList: [{ id: '1', name: 'Завершённое' }],
				plannedList: [{ id: '2', name: 'Запланированное' }]
			})
			const oldDoc = JSON.stringify({
				fileId: 'file-123',
				name: 'Drive Document',
				mimeType: 'application/json',
				space: 'drive',
				parentFolderId: 'root',
				updatedAt: Date.now()
			})

			localStorage.setItem(OLD_DATA_KEY, oldData)
			localStorage.setItem(OLD_LAST_OPENED_DOC_KEY, oldDoc)

			// Execute
			MigrationService.migrateFromSingleDocument()

			// Assert
			const tabsSnapshot = JSON.parse(localStorage.getItem(DOCUMENT_TABS_KEY)!)
			const documentId = tabsSnapshot.activeDocumentId
			const dataSnapshot = JSON.parse(localStorage.getItem(`${DOCUMENT_DATA_PREFIX}${documentId}`)!)

			expect(dataSnapshot.data.projectsList.length).toBe(1)
			expect(dataSnapshot.data.projectsList[0].name).toBe('Проект 1')
			expect(dataSnapshot.data.completedList.length).toBe(1)
			expect(dataSnapshot.data.plannedList.length).toBe(1)
		})

		it('устанавливает syncStatus = offline для документа с fileId', () => {
			// Setup
			const oldData = JSON.stringify({ projectsList: [], completedList: [], plannedList: [] })
			const oldDoc = JSON.stringify({
				fileId: 'file-123',
				name: 'Drive Document',
				mimeType: 'application/json',
				space: 'drive',
				parentFolderId: 'root',
				updatedAt: Date.now()
			})

			localStorage.setItem(OLD_DATA_KEY, oldData)
			localStorage.setItem(OLD_LAST_OPENED_DOC_KEY, oldDoc)

			// Execute
			MigrationService.migrateFromSingleDocument()

			// Assert
			const tabsSnapshot = JSON.parse(localStorage.getItem(DOCUMENT_TABS_KEY)!)
			expect(tabsSnapshot.documents[0].state.syncStatus).toBe('offline')
		})

		it('сохраняет fileId из старого документа', () => {
			// Setup
			const oldData = JSON.stringify({ projectsList: [], completedList: [], plannedList: [] })
			const oldDoc = JSON.stringify({
				fileId: 'file-123',
				name: 'Drive Document',
				mimeType: 'application/json',
				space: 'drive',
				parentFolderId: 'folder-456',
				updatedAt: Date.now()
			})

			localStorage.setItem(OLD_DATA_KEY, oldData)
			localStorage.setItem(OLD_LAST_OPENED_DOC_KEY, oldDoc)

			// Execute
			MigrationService.migrateFromSingleDocument()

			// Assert
			const tabsSnapshot = JSON.parse(localStorage.getItem(DOCUMENT_TABS_KEY)!)
			expect(tabsSnapshot.documents[0].ref.fileId).toBe('file-123')
			expect(tabsSnapshot.documents[0].ref.parentFolderId).toBe('folder-456')
			expect(tabsSnapshot.documents[0].ref.space).toBe('drive')
		})
	})

	describe('hasOldData', () => {
		it('возвращает true при наличии старых данных', () => {
			localStorage.setItem(OLD_DATA_KEY, JSON.stringify({ projectsList: [] }))
			localStorage.setItem(
				OLD_LAST_OPENED_DOC_KEY,
				JSON.stringify({
					fileId: null,
					name: 'Doc',
					mimeType: 'application/json',
					space: null,
					parentFolderId: null,
					updatedAt: Date.now()
				})
			)

			expect(MigrationService.hasOldData()).toBeTrue()
		})

		it('возвращает false при отсутствии старых данных', () => {
			expect(MigrationService.hasOldData()).toBeFalse()
		})

		it('возвращает false при частичном наличии данных', () => {
			localStorage.setItem(OLD_DATA_KEY, JSON.stringify({ projectsList: [] }))
			// OLD_LAST_OPENED_DOC_KEY отсутствует

			expect(MigrationService.hasOldData()).toBeFalse()
		})
	})

	describe('isMigrated', () => {
		it('возвращает true, если миграция выполнена', () => {
			localStorage.setItem(
				DOCUMENT_TABS_KEY,
				JSON.stringify({
					activeDocumentId: 'doc-1',
					documentOrder: ['doc-1'],
					documents: [],
					savedAt: Date.now()
				})
			)

			expect(MigrationService.isMigrated()).toBeTrue()
		})

		it('возвращает false, если миграция не выполнена', () => {
			expect(MigrationService.isMigrated()).toBeFalse()
		})
	})

	describe('exportOldData', () => {
		it('экспортирует старые данные', () => {
			const testData = JSON.stringify({ projectsList: [] })
			const testDoc = JSON.stringify({
				fileId: null,
				name: 'Doc',
				mimeType: 'application/json',
				space: null,
				parentFolderId: null,
				updatedAt: Date.now()
			})

			localStorage.setItem(OLD_DATA_KEY, testData)
			localStorage.setItem(OLD_LAST_OPENED_DOC_KEY, testDoc)

			const exported = MigrationService.exportOldData()

			expect(exported.data).toBe(testData)
			expect(exported.lastOpenedDocument).toBe(testDoc)
		})
	})

	describe('importOldData', () => {
		it('импортирует старые данные и очищает новые', () => {
			// Setup новых данных
			localStorage.setItem(
				DOCUMENT_TABS_KEY,
				JSON.stringify({
					activeDocumentId: 'doc-1',
					documentOrder: ['doc-1'],
					documents: [],
					savedAt: Date.now()
				})
			)

			// Данные для импорта
			const testData = JSON.stringify({
				projectsList: [{ name: 'Импортированный проект', color: '#00ff00', background: '#ffffff' }]
			})
			const testDoc = JSON.stringify({
				fileId: null,
				name: 'Импортированный документ',
				mimeType: 'application/json',
				space: null,
				parentFolderId: null,
				updatedAt: Date.now()
			})

			// Execute импорта
			MigrationService.importOldData({
				data: testData,
				lastOpenedDocument: testDoc
			})

			// Assert
			expect(localStorage.getItem(OLD_DATA_KEY)).toBe(testData)
			expect(localStorage.getItem(OLD_LAST_OPENED_DOC_KEY)).toBe(testDoc)
			expect(localStorage.getItem(DOCUMENT_TABS_KEY)).toBeNull()

			// Проверка, что количество ключей document_* уменьшилось
			let documentKeysCount = 0
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i)
				if (key && key.startsWith(DOCUMENT_DATA_PREFIX)) {
					documentKeysCount++
				}
			}
			expect(documentKeysCount).toBe(0)
		})
	})
})
