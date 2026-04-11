import { makeAutoObservable } from 'mobx'

import { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'
import { EventsStore } from 'src/6-entities/Events/EventsStore'

import type { DocumentId, DocumentData } from './DocumentTabsStore.types'
import type { DocumentStores, IDocumentDataProvider } from './DocumentStoreManager.types'

/**
 * Менеджер сторов документов (приватный для DocumentTabsStore).
 * НЕ экспортируется в StoreContext.
 *
 * Управляет жизненным циклом пар {ProjectsStore, EventsStore}
 * для каждого открытого документа.
 */
export class DocumentStoreManager {
	private stores: Map<DocumentId, DocumentStores> = new Map()
	private dataProvider: IDocumentDataProvider

	constructor(dataProvider: IDocumentDataProvider) {
		this.dataProvider = dataProvider
		makeAutoObservable(this, {}, { autoBind: true })
	}

	// === Создание и доступ ===

	/** Получить или создать сторы для документа */
	getOrCreateStores(documentId: DocumentId): DocumentStores {
		const existing = this.stores.get(documentId)
		if (existing) return existing

		const data = this.dataProvider.getDocumentData(documentId)
		if (!data) throw new Error(`Document data not found: ${documentId}`)

		const projectsStore = new ProjectsStore()
		projectsStore.init(data.projectsList)

		const eventsStore = new EventsStore(projectsStore)
		eventsStore.init({
			completedList: data.completedList,
			plannedList: data.plannedList
		})

		const stores: DocumentStores = {
			projectsStore,
			eventsStore,
			documentId,
			isInitialized: true
		}

		this.stores.set(documentId, stores)
		return stores
	}

	/** Проверить наличие сторов для документа */
	hasStores(documentId: DocumentId): boolean {
		return this.stores.has(documentId)
	}

	/** Получить сторы документа (без создания) */
	getStores(documentId: DocumentId): DocumentStores | null {
		return this.stores.get(documentId) ?? null
	}

	/** Получить сторы активного документа */
	get activeStores(): DocumentStores | null {
		const activeId = this.dataProvider.activeDocumentId
		return activeId ? this.getOrCreateStores(activeId) : null
	}

	/** Получить активный EventsStore (удобный геттер) */
	get activeEventsStore(): EventsStore | null {
		return this.activeStores?.eventsStore ?? null
	}

	/** Получить активный ProjectsStore (удобный геттер) */
	get activeProjectsStore(): ProjectsStore | null {
		return this.activeStores?.projectsStore ?? null
	}

	// === Модификация ===

	/** Обновить данные сторов документа (при загрузке из Drive) */
	updateStoresData(documentId: DocumentId, data: DocumentData): void {
		const stores = this.getOrCreateStores(documentId)
		stores.projectsStore.init(data.projectsList)
		stores.eventsStore.init({
			completedList: data.completedList,
			plannedList: data.plannedList
		})
	}

	/** Удалить сторы документа (при закрытии) */
	removeStores(documentId: DocumentId): void {
		this.stores.delete(documentId)
	}

	/** Получить данные документа для сохранения (Unit of Work) */
	getDocumentDataForSave(documentId: DocumentId): DocumentData | null {
		const stores = this.stores.get(documentId)
		if (!stores) return null

		const { completedList, plannedList } = stores.eventsStore.prepareToSave()
		return {
			projectsList: stores.projectsStore.getList(),
			completedList,
			plannedList
		}
	}

	// === Агрегация ===

	/** Получить все сторы документов (для общего календаря) */
	getAllDocumentStores(): DocumentStores[] {
		return Array.from(this.stores.values())
	}

	/** Количество управляемых сторов */
	get storesCount(): number {
		return this.stores.size
	}

	// === Жизненный цикл ===

	/** Очистить все сторы */
	clear(): void {
		this.stores.clear()
	}

	/** Освободить ресурсы (вызывается при уничтожении DocumentTabsStore) */
	dispose(): void {
		this.stores.clear()
	}
}
