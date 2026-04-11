import { DocumentStoreManager } from './DocumentStoreManager'
import type { IDocumentDataProvider } from './DocumentStoreManager.types'
import type { DocumentId, DocumentData } from './DocumentTabsStore.types'
import { createEmptyDocumentData } from './DocumentTabsStore.types'

describe('DocumentStoreManager', () => {
	let manager: DocumentStoreManager
	let mockData: Map<DocumentId, DocumentData>
	let mockActiveId: DocumentId | null

	beforeEach(() => {
		mockData = new Map()
		mockActiveId = null

		const dataProvider: IDocumentDataProvider = {
			getDocumentData: id => mockData.get(id) ?? null,
			get activeDocumentId() {
				return mockActiveId
			}
		}

		manager = new DocumentStoreManager(dataProvider)
	})

	test('should create stores for a document', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		const stores = manager.getOrCreateStores('doc_1')

		expect(stores.projectsStore).toBeDefined()
		expect(stores.eventsStore).toBeDefined()
		expect(stores.documentId).toBe('doc_1')
		expect(stores.isInitialized).toBe(true)
		expect(manager.storesCount).toBe(1)
	})

	test('should return existing stores on second call', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		const s1 = manager.getOrCreateStores('doc_1')
		const s2 = manager.getOrCreateStores('doc_1')
		expect(s1).toBe(s2)
	})

	test('should throw if document data not found', () => {
		expect(() => manager.getOrCreateStores('missing')).toThrow('Document data not found')
	})

	test('should remove stores', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		manager.getOrCreateStores('doc_1')
		manager.removeStores('doc_1')
		expect(manager.storesCount).toBe(0)
		expect(manager.getStores('doc_1')).toBeNull()
	})

	test('should return active stores', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		mockActiveId = 'doc_1'
		const stores = manager.activeStores
		expect(stores).toBeDefined()
		expect(stores!.documentId).toBe('doc_1')
	})

	test('should return null active stores when no active document', () => {
		mockActiveId = null
		expect(manager.activeStores).toBeNull()
	})

	test('should return activeEventsStore and activeProjectsStore', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		mockActiveId = 'doc_1'
		expect(manager.activeEventsStore).toBeDefined()
		expect(manager.activeProjectsStore).toBeDefined()
	})

	test('should update stores data', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		manager.getOrCreateStores('doc_1')

		const newData: DocumentData = {
			projectsList: [{ name: 'Test', color: 'red', background: 'blue' }],
			completedList: [],
			plannedList: []
		}
		manager.updateStoresData('doc_1', newData)

		// Default project + Test = 2
		const stores = manager.getStores('doc_1')!
		expect(stores.projectsStore.list.length).toBe(2)
	})

	test('should get document data for save', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		manager.getOrCreateStores('doc_1')

		const data = manager.getDocumentDataForSave('doc_1')
		expect(data).toBeDefined()
		expect(data!.projectsList).toBeDefined()
		expect(data!.completedList).toBeDefined()
		expect(data!.plannedList).toBeDefined()
	})

	test('should return null for save if stores not found', () => {
		expect(manager.getDocumentDataForSave('missing')).toBeNull()
	})

	test('should get all document stores', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		mockData.set('doc_2', createEmptyDocumentData())
		manager.getOrCreateStores('doc_1')
		manager.getOrCreateStores('doc_2')

		const all = manager.getAllDocumentStores()
		expect(all.length).toBe(2)
	})

	test('should clear all stores', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		manager.getOrCreateStores('doc_1')
		manager.clear()
		expect(manager.storesCount).toBe(0)
	})

	test('should check hasStores', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		expect(manager.hasStores('doc_1')).toBe(false)
		manager.getOrCreateStores('doc_1')
		expect(manager.hasStores('doc_1')).toBe(true)
	})

	test('should dispose clears all stores', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		manager.getOrCreateStores('doc_1')
		manager.dispose()
		expect(manager.storesCount).toBe(0)
	})
})
