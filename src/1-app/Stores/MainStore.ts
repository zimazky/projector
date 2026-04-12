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
	init() {
		// Настраиваем колбэки на изменения в пер-документных сторах
		this.documentTabsStore.setOnStoresChanged({
			// onEventsChanged
			onEventsChanged: (stores: DocumentStores) => {
				stores.eventsStore.sort()
				this.eventsCache.init()

				const activeDoc = this.documentTabsStore.activeDocument
				if (activeDoc && !activeDoc.state.isLoading && activeDoc.id === stores.documentId) {
					this.documentTabsStore.updateActiveDocumentData({
						projectsList: stores.projectsStore.getList(),
						...stores.eventsStore.prepareToSave()
					})
				}
			},
			// onProjectsChanged
			onProjectsChanged: (stores: DocumentStores) => {
				this.eventsCache.init()

				const activeDoc = this.documentTabsStore.activeDocument
				if (activeDoc && !activeDoc.state.isLoading && activeDoc.id === stores.documentId) {
					this.documentTabsStore.updateActiveDocumentData({
						projectsList: stores.projectsStore.getList(),
						...stores.eventsStore.prepareToSave()
					})
				}
			}
		})

		// Инвалидировать кэш при смене активного документа (переключение вкладки)
		this.documentTabsStore.setOnActiveDocumentChanged(() => {
			this.eventsCache.init()
		})

		this.eventsCache.init()
		this.googleApiService.initGapi()

		// Восстанавливаем сессию из localStorage через DocumentTabsStore
		void this.googleApiService
			.waitForGapiReady()
			.then(() => {
				return this.documentTabsStore.restoreFromLocalStorage()
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
