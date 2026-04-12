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

	// === createStores ===

	describe('createStores', () => {
		test('should create stores for a document', () => {
			mockData.set('doc_1', createEmptyDocumentData())
			const stores = manager.createStores('doc_1')

			expect(stores.projectsStore).toBeDefined()
			expect(stores.eventsStore).toBeDefined()
			expect(stores.documentId).toBe('doc_1')
			expect(stores.isInitialized).toBe(true)
			expect(manager.storesCount).toBe(1)
		})

		test('should throw if stores already exist', () => {
			mockData.set('doc_1', createEmptyDocumentData())
			manager.createStores('doc_1')
			expect(() => manager.createStores('doc_1')).toThrow('Stores already exist for document: doc_1')
		})

		test('should throw if document data not found', () => {
			expect(() => manager.createStores('missing')).toThrow('Document data not found')
		})
	})

	// === getStores ===

	describe('getStores', () => {
		test('should return null if stores not created yet', () => {
			mockData.set('doc_1', createEmptyDocumentData())
			expect(manager.getStores('doc_1')).toBeNull()
		})

		test('should return stores after creation', () => {
			mockData.set('doc_1', createEmptyDocumentData())
			manager.createStores('doc_1')
			const stores = manager.getStores('doc_1')!
			expect(stores.documentId).toBe('doc_1')
		})
	})

	// === getOrCreateStores ===

	describe('getOrCreateStores', () => {
		test('should create stores if not exist', () => {
			mockData.set('doc_1', createEmptyDocumentData())
			const stores = manager.getOrCreateStores('doc_1')
			expect(stores.projectsStore).toBeDefined()
			expect(stores.eventsStore).toBeDefined()
			expect(stores.documentId).toBe('doc_1')
			expect(manager.storesCount).toBe(1)
		})

		test('should return existing stores on second call', () => {
			mockData.set('doc_1', createEmptyDocumentData())
			const s1 = manager.getOrCreateStores('doc_1')
			const s2 = manager.getOrCreateStores('doc_1')
			expect(s1.documentId).toBe(s2.documentId)
			expect(manager.storesCount).toBe(1)
		})

		test('should throw if document data not found', () => {
			expect(() => manager.getOrCreateStores('missing')).toThrow('Document data not found')
		})
	})

	// === activeStores ===

	describe('activeStores', () => {
		test('should return stores for active document (without implicit creation)', () => {
			mockData.set('doc_1', createEmptyDocumentData())
			mockActiveId = 'doc_1'
			manager.createStores('doc_1')
			const stores = manager.activeStores
			expect(stores).toBeDefined()
			expect(stores!.documentId).toBe('doc_1')
		})

		test('should return null when no active document', () => {
			mockActiveId = null
			expect(manager.activeStores).toBeNull()
		})

		test('should return null when active document has no stores (no implicit creation)', () => {
			mockData.set('doc_1', createEmptyDocumentData())
			mockActiveId = 'doc_1'
			// Сторы не созданы — activeStores должен вернуть null, а не создавать неявно
			expect(manager.activeStores).toBeNull()
		})
	})

	// === activeEventsStore / activeProjectsStore ===

	test('should return activeEventsStore and activeProjectsStore', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		mockActiveId = 'doc_1'
		manager.createStores('doc_1')
		expect(manager.activeEventsStore).toBeDefined()
		expect(manager.activeProjectsStore).toBeDefined()
	})

	// === updateStoresData ===

	describe('updateStoresData', () => {
		test('should update stores data', () => {
			mockData.set('doc_1', createEmptyDocumentData())
			manager.createStores('doc_1')

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

		test('should throw if stores not found', () => {
			const newData: DocumentData = {
				projectsList: [],
				completedList: [],
				plannedList: []
			}
			expect(() => manager.updateStoresData('missing', newData)).toThrow('Stores not found for document: missing')
		})
	})

	// === removeStores ===

	test('should remove stores', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		manager.createStores('doc_1')
		manager.removeStores('doc_1')
		expect(manager.storesCount).toBe(0)
		expect(manager.getStores('doc_1')).toBeNull()
	})

	// === getDocumentDataForSave ===

	test('should get document data for save', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		manager.createStores('doc_1')

		const data = manager.getDocumentDataForSave('doc_1')
		expect(data).toBeDefined()
		expect(data!.projectsList).toBeDefined()
		expect(data!.completedList).toBeDefined()
		expect(data!.plannedList).toBeDefined()
	})

	test('should return null for save if stores not found', () => {
		expect(manager.getDocumentDataForSave('missing')).toBeNull()
	})

	// === getAllDocumentStores ===

	test('should get all document stores', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		mockData.set('doc_2', createEmptyDocumentData())
		manager.createStores('doc_1')
		manager.createStores('doc_2')

		const all = manager.getAllDocumentStores()
		expect(all.length).toBe(2)
	})

	// === clear / dispose ===

	test('should clear all stores', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		manager.createStores('doc_1')
		manager.clear()
		expect(manager.storesCount).toBe(0)
	})

	test('should check hasStores', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		expect(manager.hasStores('doc_1')).toBe(false)
		manager.createStores('doc_1')
		expect(manager.hasStores('doc_1')).toBe(true)
	})

	test('should dispose clears all stores', () => {
		mockData.set('doc_1', createEmptyDocumentData())
		manager.createStores('doc_1')
		manager.dispose()
		expect(manager.storesCount).toBe(0)
	})

	// === Callbacks ===

	test('should call onEventsChanged callback when events change', () => {
		const onEventsChanged = jest.fn()
		const onProjectsChanged = jest.fn()

		mockData.set('doc_1', createEmptyDocumentData())

		const dataProvider: IDocumentDataProvider = {
			getDocumentData: id => mockData.get(id) ?? null,
			get activeDocumentId() {
				return mockActiveId
			}
		}

		const managerWithCallbacks = new DocumentStoreManager(dataProvider, {
			onEventsChanged,
			onProjectsChanged
		})

		managerWithCallbacks.createStores('doc_1')

		// init() triggers onChangeList on eventsStore
		expect(onEventsChanged).toHaveBeenCalledTimes(1)
		expect(onEventsChanged.mock.calls[0][0].documentId).toBe('doc_1')
	})

	test('should call onProjectsChanged callback when projects change', () => {
		const onEventsChanged = jest.fn()
		const onProjectsChanged = jest.fn()

		mockData.set('doc_1', createEmptyDocumentData())

		const dataProvider: IDocumentDataProvider = {
			getDocumentData: id => mockData.get(id) ?? null,
			get activeDocumentId() {
				return mockActiveId
			}
		}

		const managerWithCallbacks = new DocumentStoreManager(dataProvider, {
			onEventsChanged,
			onProjectsChanged
		})

		managerWithCallbacks.createStores('doc_1')

		// init() on projectsStore triggers onChangeList
		expect(onProjectsChanged).toHaveBeenCalled()
	})

	test('should set callbacks via setCallbacks', () => {
		const onEventsChanged = jest.fn()
		const onProjectsChanged = jest.fn()

		mockData.set('doc_1', createEmptyDocumentData())

		// Create manager without callbacks
		const dataProvider: IDocumentDataProvider = {
			getDocumentData: id => mockData.get(id) ?? null,
			get activeDocumentId() {
				return mockActiveId
			}
		}

		const managerNoCallbacks = new DocumentStoreManager(dataProvider)
		managerNoCallbacks.setCallbacks({ onEventsChanged, onProjectsChanged })

		managerNoCallbacks.createStores('doc_1')

		expect(onEventsChanged).toHaveBeenCalled()
		expect(onProjectsChanged).toHaveBeenCalled()
	})
})
