import { makeAutoObservable } from 'mobx'
import { DocumentId, DocumentSession } from './DocumentTabsStore.types'
import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'
import { EventsStore } from 'src/6-entities/Events/EventsStore'
import { DocumentStores } from './DocumentStoreManager.types'

/**
 * Менеджер сторов документов (приватный для DocumentTabsStore).
 * НЕ экспортируется в StoreContext.
 * Управляет созданием, хранением и удалением пар {ProjectsStore, EventsStore}
 * для каждого документа.
 */
export class DocumentStoreManager {
	/** Мапа сторов по ID документа */
	private stores: Map<DocumentId, DocumentStores> = new Map()
	/** Функция для получения сессии документа */
	private getDocumentSession: (documentId: DocumentId) => DocumentSession | null
	/** Метка времени последнего изменения (для реактивности MobX) */
	private _lastChangeTimestamp: number = 0
	/** Флаг блокировки onChangeList (для предотвращения рекурсии при инициализации) */
	private isInitializing: boolean = false
	/** Колбэк при изменении сторов (устанавливается в MainStore.init) */
	onStoresChange?: (documentId: DocumentId, stores: DocumentStores) => void
	/** Колбэк при переключении активного документа (устанавливается в MainStore.init) */
	onActiveDocumentChange?: (documentId: DocumentId) => void

	constructor(getDocumentSession: (documentId: DocumentId) => DocumentSession | null) {
		this.getDocumentSession = getDocumentSession
		makeAutoObservable(this)
	}

	/**
	 * Получить или создать сторы для документа.
	 * Если сторы уже существуют, возвращает их.
	 * Если нет — создаёт новые из сессии документа.
	 */
	getOrCreateStores(documentId: DocumentId): DocumentStores {
		const existing = this.stores.get(documentId)
		if (existing) return existing

		const session = this.getDocumentSession(documentId)
		if (!session) throw new Error(`Document session not found: ${documentId}`)

		// Создаём ProjectsStore и инициализируем данными из сессии
		const projectsStore = new ProjectsStore()
		projectsStore.init(session.data.projectsList)

		// Создаём EventsStore с привязкой к ProjectsStore
		const eventsStore = new EventsStore(projectsStore)
		// Устанавливаем колбэк для уведомления об изменениях
		eventsStore.onChangeList = () => {
			// Не вызываем onStoresChange во время инициализации (избегаем рекурсии)
			if (this.isInitializing) return
			this._lastChangeTimestamp = Date.now()
			this.onStoresChange?.(documentId, {
				projectsStore,
				eventsStore,
				documentId,
				isInitialized: true
			})
		}

		// Блокируем onChangeList во время начальной инициализации
		this.isInitializing = true
		// Инициализируем событиями из сессии
		eventsStore.init({
			completedList: session.data.completedList,
			plannedList: session.data.plannedList
		})
		this.isInitializing = false
		// НЕ вызываем onChangeList() после начальной инициализации
		// (он вызывается в MainStore.init после restoreFromLocalStorage)

		const stores: DocumentStores = {
			projectsStore,
			eventsStore,
			documentId,
			isInitialized: true
		}
		this.stores.set(documentId, stores)
		return stores
	}

	/** Проверить existence сторов для документа */
	hasStores(documentId: DocumentId): boolean {
		return this.stores.has(documentId)
	}

	/** Получить сторы документа (без создания) */
	getStores(documentId: DocumentId): DocumentStores | null {
		return this.stores.get(documentId) ?? null
	}

	/**
	 * Получить сторы активного документа.
	 * Вспомогательный метод для использования в компонентах.
	 */
	getActiveStores(getActiveId: () => DocumentId | null): DocumentStores | null {
		const id = getActiveId()
		return id ? this.getOrCreateStores(id) : null
	}

	/** Удалить сторы документа (при закрытии документа) */
	removeStores(documentId: DocumentId): void {
		this.stores.delete(documentId)
		this._lastChangeTimestamp = Date.now()
	}

	/**
	 * Обновить данные сторов (при загрузке из Drive или синхронизации).
	 * Переинициализирует сторы новыми данными.
	 */
	updateStoresData(
		documentId: DocumentId,
		data: {
			projectsList: any[]
			completedList: any[]
			plannedList: any[]
		}
	): void {
		const stores = this.getOrCreateStores(documentId)

		// Блокируем onChangeList во время обновления данных
		this.isInitializing = true
		stores.projectsStore.init(data.projectsList)
		stores.eventsStore.init({
			completedList: data.completedList,
			plannedList: data.plannedList
		})
		this.isInitializing = false

		// НЕ вызываем onChangeList() здесь — вызывается в DocumentTabsStore
	}

	/** Получить все сторы (для агрегации в общем календаре) */
	getAllStores(): DocumentStores[] {
		return Array.from(this.stores.values())
	}

	/** Количество управляемых сторов */
	get storesCount(): number {
		return this.stores.size
	}

	/** Очистить все сторы (для тестов) */
	clear(): void {
		this.stores.clear()
		this._lastChangeTimestamp = Date.now()
	}

	/** Метка времени последнего изменения (для MobX реактивности) */
	get lastChangeTimestamp(): number {
		return this._lastChangeTimestamp
	}
}
