import { makeAutoObservable } from 'mobx'

import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'
import { EventsCache } from 'src/6-entities/EventsCache/EventsCache'
import { EventsStore } from 'src/6-entities/Events/EventsStore'

import { GoogleApiService } from 'src/7-shared/services/GoogleApiService' // Import the type
import { StorageService } from 'src/7-shared/services/StorageService' // Import the type
import { PathSegment } from 'src/5-features/DriveFileList/model/DriveFileListStore'; // Import PathSegment

/** Класс главного хранилища приложения */
export class MainStore {
  /** Ссылка на хранилище проектов */
  projectsStore: ProjectsStore
  /** Ссылка на хранилище событий */
  eventsStore: EventsStore
  /** Ссылка на кэш событий */
  eventsCache: EventsCache
  /** Структура сигнализирующая необходимость обновления страницы */
  mustForceUpdate: {} = {}
  private googleApiService: GoogleApiService
  private storageService: StorageService

  // New property for Drive Explorer persistence
  driveExplorerPersistentState = new Map<string, { folderId: string; path: PathSegment[] }>();


  constructor(projectsStore: ProjectsStore, eventsStore: EventsStore, eventsCache: EventsCache, googleApiService: GoogleApiService, storageService: StorageService) {
    this.projectsStore = projectsStore
    this.eventsStore = eventsStore
    this.eventsCache = eventsCache
    this.googleApiService = googleApiService
    this.storageService = storageService

    this.driveExplorerPersistentState.set('drive', { folderId: 'root', path: [{ id: 'root', name: 'Мой диск' }] });
    this.driveExplorerPersistentState.set('appDataFolder', { folderId: 'appDataFolder', path: [{ id: 'appDataFolder', name: 'Раздел приложения' }] });
    makeAutoObservable(this)
  }

  /** 
   * Инициализация главного хранилища приложения
   * Загружаются данные из localstorage
   */
  init() {
    this.storageService.init()
    this.eventsCache.init()
    this.googleApiService.initGapi()
    // Задание обработчика, вызываемого при изменении списка событий
    // Список пересортируется и сбрасывается кэш
    this.eventsStore.onChangeList = () => {
      this.eventsStore.sort()
      this.eventsCache.init()
      this.storageService.desyncWithStorages()
    }
  }

  forceUpdate() {
    this.mustForceUpdate = {}
  }

  updateDriveExplorerPersistentState(space: string, folderId: string, path: PathSegment[]) {
    this.driveExplorerPersistentState.set(space, { folderId, path });
  }

  getDriveExplorerPersistentState(space: string): { folderId: string; path: PathSegment[] } {
    return this.driveExplorerPersistentState.get(space)!; 
  }
}
