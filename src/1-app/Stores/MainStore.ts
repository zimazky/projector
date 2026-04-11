import { makeAutoObservable } from 'mobx'

import { EventsCache } from 'src/6-entities/EventsCache/EventsCache'

import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { StorageService } from 'src/7-shared/services/StorageService'
import { PathSegment } from 'src/5-features/DriveFileList/model/DriveFileListStore'
import { Observable } from 'src/7-shared/libs/Observable/Observable'
import { DocumentTabsStore } from 'src/6-entities/Document/model'
import { MigrationService } from 'src/1-app/Stores/MigrationService'

/** Главный orchestrator-стор приложения */
export class MainStore {
	/** Кэш событий для календарных представлений */
	eventsCache: EventsCache

	private googleApiService: GoogleApiService
	private storageService: StorageService
	private documentTabsStore: DocumentTabsStore

	/**
	 * Сохраненное состояние проводника Google Drive по пространствам
	 * (`drive` и `appDataFolder`), чтобы помнить последнюю открытую папку.
	 */
	driveExplorerPersistentState = new Map<string, { folderId: string; path: PathSegment[] }>()

	/** Нотификатор успешного сохранения файла в Drive */
	fileSavedNotifier = new Observable<void>()

	constructor(
		eventsCache: EventsCache,
		googleApiService: GoogleApiService,
		storageService: StorageService,
		documentTabsStore: DocumentTabsStore
	) {
		this.eventsCache = eventsCache
		this.googleApiService = googleApiService
		this.storageService = storageService
		this.documentTabsStore = documentTabsStore

		this.driveExplorerPersistentState.set('drive', {
			folderId: 'root',
			path: [{ id: 'root', name: 'Мой диск' }]
		})
		this.driveExplorerPersistentState.set('appDataFolder', {
			folderId: 'appDataFolder',
			path: [{ id: 'appDataFolder', name: 'Раздел приложения' }]
		})

		makeAutoObservable(this)
	}

	/** Инициализация приложения и зависимых сервисов */
	init() {
		// Выполняем миграцию старых данных в новую структуру
		MigrationService.migrateFromSingleDocument()

		// НОВОЕ: Колбэк при изменении сторов любого документа
		// Устанавливается ДО загрузки данных, чтобы реагировать на изменения
		this.documentTabsStore.onStoresChange = (documentId, stores) => {
			// Сортируем события и обновляем кэш
			stores.eventsStore.sort()
			this.eventsCache.init()
			this.storageService.desyncWithStorages()

			// Обновляем данные документа в DocumentTabsStore
			const activeDoc = this.documentTabsStore.activeDocument
			if (activeDoc && !activeDoc.state.isLoading && activeDoc.id === documentId) {
				this.documentTabsStore.updateActiveDocumentData({
					projectsList: stores.projectsStore.getList(),
					...stores.eventsStore.prepareToSave()
				})
			}
		}

		// НОВОЕ: Колбэк при переключении активного документа
		// Очищаем кэш событий при переключении, чтобы не показывать старые данные
		this.documentTabsStore.onActiveDocumentChange = _documentId => {
			this.eventsCache.init()
			this.storageService.desyncWithStorages()
		}

		this.googleApiService.initGapi()

		// Восстанавливаем сессию из localStorage через DocumentTabsStore
		// (сторы создадутся автоматически внутри restoreFromLocalStorage)
		void this.googleApiService
			.waitForGapiReady()
			.then(() => {
				return this.documentTabsStore.restoreFromLocalStorage()
			})
			.then(() => {
				// Инициализируем кэш после восстановления всех сторов
				// Вызываем напрямую, т.к. сторы уже созданы
				this.eventsCache.init()
			})
			.catch(e => {
				console.error('DocumentTabsStore restore failed:', e)
			})
	}

	/** Обновить сохраненное состояние проводника Drive */
	updateDriveExplorerPersistentState(space: string, folderId: string, path: PathSegment[]) {
		this.driveExplorerPersistentState.set(space, { folderId, path })
	}

	/** Получить сохраненное состояние проводника Drive */
	getDriveExplorerPersistentState(space: string): { folderId: string; path: PathSegment[] } {
		return this.driveExplorerPersistentState.get(space)!
	}
}
