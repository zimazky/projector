import { makeAutoObservable } from 'mobx'

import { EventsCache } from 'src/6-entities/EventsCache/EventsCache'

import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { PathSegment } from 'src/5-features/DriveFileList/model/DriveFileListStore'
import { Observable } from 'src/7-shared/libs/Observable/Observable'
import { DocumentTabsStore } from 'src/6-entities/Document/model'
import type { DocumentStores } from 'src/6-entities/Document/model/DocumentStoreManager.types'

/** Главный orchestrator-стор приложения */
export class MainStore {
	/** Кэш событий для календарных представлений */
	eventsCache: EventsCache

	private googleApiService: GoogleApiService
	private documentTabsStore: DocumentTabsStore
	private started = false
	private disposed = false

	/**
	 * Сохраненное состояние проводника Google Drive по пространствам
	 * (`drive` и `appDataFolder`), чтобы помнить последнюю открытую папку.
	 */
	driveExplorerPersistentState = new Map<string, { folderId: string; path: PathSegment[] }>()

	/** Нотификатор успешного сохранения файла в Drive */
	fileSavedNotifier = new Observable<void>()

	constructor(eventsCache: EventsCache, googleApiService: GoogleApiService, documentTabsStore: DocumentTabsStore) {
		this.eventsCache = eventsCache
		this.googleApiService = googleApiService
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
	start() {
		if (this.started || this.disposed) return
		this.started = true
		// Настраиваем колбэки на изменения в пер-документных сторах
		this.documentTabsStore.setOnStoresChanged({
			// onEventsChanged
			onEventsChanged: (stores: DocumentStores) => {
				stores.eventsStore.sort()
				if (stores.eventsStore === this.documentTabsStore.activeEventsStore) this.eventsCache.init()
			},
			// onProjectsChanged
			onProjectsChanged: stores => {
				if (stores.projectsStore === this.documentTabsStore.activeProjectsStore) this.eventsCache.init()
			}
		})

		// Инвалидировать кэш при смене активного документа (переключение вкладки)
		this.documentTabsStore.setOnActiveDocumentChanged(() => {
			this.eventsCache.init()
		})

		this.eventsCache.init()
		// Локальные данные не зависят от сети, GIS и успешного входа.
		void this.documentTabsStore.restoreFromLocalStorage()
		this.googleApiService.initGapi()
		// Обработчик ошибки подключается сразу, даже если никто не запрашивает вход.
		void this.googleApiService.waitForGapiReady().catch(() => {
			if (!this.disposed) console.error('Google API недоступен; локальные документы доступны.')
		})
	}

	dispose(): void {
		if (this.disposed) return
		this.disposed = true
		this.documentTabsStore.setOnStoresChanged({})
		this.documentTabsStore.setOnActiveDocumentChanged(undefined)
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
