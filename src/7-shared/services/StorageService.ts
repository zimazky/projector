import { makeAutoObservable, runInAction } from 'mobx'

import { ProjectData } from 'src/3-pages/Projects/ProjectsStore'
import { EventsStoreData } from 'src/6-entities/Events/EventsStore'
import { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'

/** Сериализуемая структура данных приложения */
export type MainStoreData = {
	projectsList: ProjectData[]
} & EventsStoreData

/** Узкий type-guard для проверки "объектоподобного" значения */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

/** Проверка структуры одного проекта в JSON-документе */
function isProjectData(value: unknown): value is ProjectData {
	if (!isRecord(value)) return false
	return typeof value.name === 'string' && typeof value.color === 'string' && typeof value.background === 'string'
}

/**
 * Нормализация и валидация входного контента документа.
 * При ошибке структуры бросает исключение с понятным текстом.
 */
function normalizeMainStoreData(rawContent: unknown): MainStoreData {
	const parsedContent = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent

	if (!isRecord(parsedContent)) {
		throw new Error('Invalid document format: root value must be an object')
	}

	const rawProjects = parsedContent.projectsList
	const rawCompleted = parsedContent.completedList
	const rawPlanned = parsedContent.plannedList

	if (!Array.isArray(rawProjects)) {
		throw new Error('Invalid document format: projectsList must be an array')
	}
	if (!Array.isArray(rawCompleted)) {
		throw new Error('Invalid document format: completedList must be an array')
	}
	if (!Array.isArray(rawPlanned)) {
		throw new Error('Invalid document format: plannedList must be an array')
	}

	const projectsList = rawProjects.filter(isProjectData)
	if (projectsList.length !== rawProjects.length) {
		throw new Error('Invalid document format: projectsList contains invalid entries')
	}

	return {
		projectsList,
		completedList: rawCompleted as EventsStoreData['completedList'],
		plannedList: rawPlanned as EventsStoreData['plannedList']
	}
}

/**
 * Сервис хранения/загрузки данных приложения.
 * Работает через DocumentTabsStore для доступа к per-document сторам.
 *
 * @deprecated Методы applyContent, resetToEmptyContent, init устарели —
 * DocumentTabsStore теперь управляет сторами напрямую через DocumentStoreManager.
 */
export class StorageService {
	/** Флаг синхронизации с localStorage */
	isSyncWithLocalstorage: boolean = false
	/** Флаг синхронизации с Google Drive */
	isSyncWithGoogleDrive: boolean = false

	private documentTabsStore: DocumentTabsStore
	private onContentApplied?: () => void

	constructor(documentTabsStore: DocumentTabsStore, onContentApplied?: () => void) {
		this.documentTabsStore = documentTabsStore
		this.onContentApplied = onContentApplied
		makeAutoObservable(this)
	}

	/** Сбросить признаки синхронизации после локальных изменений */
	desyncWithStorages = () => {
		this.isSyncWithGoogleDrive = false
		this.isSyncWithLocalstorage = false
	}

	/** Отметить, что текущее состояние синхронизировано с Google Drive */
	markGoogleDriveSynced = () => {
		this.isSyncWithGoogleDrive = true
	}

	/**
	 * Сохранить данные активного документа в localStorage.
	 * Использует сторы активного документа через DocumentTabsStore.
	 */
	saveToLocalStorage = () => {
		const stores = this.documentTabsStore.getActiveDocumentStores()
		if (!stores) return

		const data: MainStoreData = {
			projectsList: stores.projectsStore.getList(),
			...stores.eventsStore.prepareToSave()
		}
		localStorage.setItem('data', JSON.stringify(data))
		this.isSyncWithLocalstorage = true
	}

	/**
	 * Получить снапшот данных активного документа для сохранения во внешнее хранилище.
	 */
	getContentToSave = () => {
		const stores = this.documentTabsStore.getActiveDocumentStores()
		if (!stores) return null

		const data: MainStoreData = {
			projectsList: stores.projectsStore.getList(),
			...stores.eventsStore.prepareToSave()
		}
		return data
	}

	/**
	 * @deprecated Не используется — DocumentTabsStore управляет сторами напрямую.
	 * Сбросить данные приложения к пустому состоянию.
	 */
	resetToEmptyContent = () => {
		console.warn('resetToEmptyContent is deprecated — use DocumentTabsStore.openNewDocument() instead')
		runInAction(() => {
			this.isSyncWithLocalstorage = false
			this.isSyncWithGoogleDrive = false
			this.onContentApplied?.()
		})
	}

	/**
	 * @deprecated Не используется — DocumentTabsStore применяет данные через DocumentStoreManager.
	 * Применить контент документа к сторам приложения.
	 */
	applyContent = (content: unknown) => {
		console.warn('applyContent is deprecated — DocumentTabsStore applies data via DocumentStoreManager')
		runInAction(() => {
			this.isSyncWithLocalstorage = false
			this.isSyncWithGoogleDrive = true
			this.onContentApplied?.()
		})
	}

	/**
	 * @deprecated Не используется — инициализация теперь происходит через DocumentTabsStore.restoreFromLocalStorage().
	 * Инициализация состояния приложения из localStorage.
	 */
	init = () => {
		console.warn('StorageService.init is deprecated — use DocumentTabsStore.restoreFromLocalStorage()')
		this.isSyncWithLocalstorage = true
	}
}
