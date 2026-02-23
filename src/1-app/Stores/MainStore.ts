import { makeAutoObservable } from 'mobx'

import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'
import { EventsCache } from 'src/6-entities/EventsCache/EventsCache'
import { EventsStore } from 'src/6-entities/Events/EventsStore'

import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { StorageService } from 'src/7-shared/services/StorageService'
import { PathSegment } from 'src/5-features/DriveFileList/model/DriveFileListStore'
import { Observable } from 'src/7-shared/libs/Observable/Observable'
import { DocumentSessionStore } from 'src/6-entities/Document/model'

/** Главный orchestrator-стор приложения */
export class MainStore {
  /** Стор проектов */
  projectsStore: ProjectsStore
  /** Стор событий */
  eventsStore: EventsStore
  /** Кэш событий для календарных представлений */
  eventsCache: EventsCache

  /** Триггер принудительного обновления UI */
  mustForceUpdate: {} = {}

  private googleApiService: GoogleApiService
  private storageService: StorageService
  private documentSessionStore: DocumentSessionStore

  /**
   * Сохраненное состояние проводника Google Drive по пространствам
   * (`drive` и `appDataFolder`), чтобы помнить последнюю открытую папку.
   */
  driveExplorerPersistentState = new Map<string, { folderId: string; path: PathSegment[] }>()

  /** Нотификатор успешного сохранения файла в Drive */
  fileSavedNotifier = new Observable<void>()

  constructor(
    projectsStore: ProjectsStore,
    eventsStore: EventsStore,
    eventsCache: EventsCache,
    googleApiService: GoogleApiService,
    storageService: StorageService,
    documentSessionStore: DocumentSessionStore
  ) {
    this.projectsStore = projectsStore
    this.eventsStore = eventsStore
    this.eventsCache = eventsCache
    this.googleApiService = googleApiService
    this.storageService = storageService
    this.documentSessionStore = documentSessionStore

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
    // Обработчик изменений событий назначаем до загрузки данных.
    this.eventsStore.onChangeList = () => {
      this.eventsStore.sort()
      this.eventsCache.init()
      this.storageService.desyncWithStorages()
      if (this.documentSessionStore.isOpened && !this.documentSessionStore.state.isLoading) {
        this.documentSessionStore.markDirty()
      }
    }

    this.storageService.init()
    this.eventsCache.init()
    this.googleApiService.initGapi()
    void this.googleApiService
      .waitForGapiReady()
      .then(() => this.documentSessionStore.restoreLastOpenedDocument())
      .catch((e) => {
        console.error('GAPI init failed, skip restoring last opened document:', e)
      })
  }

  /** Триггернуть обновление UI */
  forceUpdate() {
    this.mustForceUpdate = {}
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
