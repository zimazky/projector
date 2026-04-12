import { makeAutoObservable } from 'mobx'

import { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'
import { EventsStore } from 'src/6-entities/Events/EventsStore'

import type { DocumentId, DocumentData } from './DocumentTabsStore.types'
import type { DocumentStores, IDocumentDataProvider } from './DocumentStoreManager.types'

/** Колбэки при изменении данных в пер-документных сторах */
export interface DocumentStoreCallbacks {
	/** Колбэк при изменении событий в любом документе */
	onEventsChanged?: (stores: DocumentStores) => void
	/** Колбэк при изменении проектов в любом документе */
	onProjectsChanged?: (stores: DocumentStores) => void
	/** Колбэк при смене активного документа (переключение вкладки) */
	onActiveDocumentChanged?: (documentId: DocumentId) => void
}

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

	/** Колбэк при изменении событий в любом документе */
	private onEventsChanged?: (stores: DocumentStores) => void
	/** Колбэк при изменении проектов в любом документе */
	private onProjectsChanged?: (stores: DocumentStores) => void

	constructor(dataProvider: IDocumentDataProvider, callbacks?: DocumentStoreCallbacks) {
		this.dataProvider = dataProvider
		this.onEventsChanged = callbacks?.onEventsChanged
		this.onProjectsChanged = callbacks?.onProjectsChanged
		makeAutoObservable(this, {}, { autoBind: true })
	}

	/** Установить колбэки после создания (вызывается из DocumentTabsStore) */
	setCallbacks(callbacks: DocumentStoreCallbacks): void {
		this.onEventsChanged = callbacks.onEventsChanged
		this.onProjectsChanged = callbacks.onProjectsChanged
	}

	// === Создание и доступ ===

	/** Создать сторы для документа (бросит ошибку, если уже существуют) */
	createStores(documentId: DocumentId): DocumentStores {
		if (this.stores.has(documentId)) {
			throw new Error(`Stores already exist for document: ${documentId}`)
		}

		const data = this.dataProvider.getDocumentData(documentId)
		if (!data) throw new Error(`Document data not found: ${documentId}`)

		const projectsStore = new ProjectsStore()
		const eventsStore = new EventsStore(projectsStore)

		const stores: DocumentStores = {
			projectsStore,
			eventsStore,
			documentId,
			isInitialized: true
		}

		// Устанавливаем колбэки ДО init(), чтобы они сработали при инициализации
		eventsStore.onChangeList = () => {
			this.onEventsChanged?.(stores)
		}
		projectsStore.onChangeList = () => {
			this.onProjectsChanged?.(stores)
		}

		projectsStore.init(data.projectsList)
		eventsStore.init({
			completedList: data.completedList,
			plannedList: data.plannedList
		})

		this.stores.set(documentId, stores)
		return stores
	}

	/** Получить или создать сторы для документа (композиция getStores + createStores) */
	getOrCreateStores(documentId: DocumentId): DocumentStores {
		return this.getStores(documentId) ?? this.createStores(documentId)
	}

	/** Проверить наличие сторов для документа */
	hasStores(documentId: DocumentId): boolean {
		return this.stores.has(documentId)
	}

	/** Получить сторы документа (без создания) */
	getStores(documentId: DocumentId): DocumentStores | null {
		return this.stores.get(documentId) ?? null
	}

	/** Получить сторы активного документа (без создания) */
	get activeStores(): DocumentStores | null {
		const activeId = this.dataProvider.activeDocumentId
		return activeId ? this.getStores(activeId) : null
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

	/** Обновить данные сторов документа (при загрузке из Drive). Бросает ошибку, если сторы не найдены. */
	updateStoresData(documentId: DocumentId, data: DocumentData): void {
		const stores = this.getStores(documentId)
		if (!stores) throw new Error(`Stores not found for document: ${documentId}`)
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
