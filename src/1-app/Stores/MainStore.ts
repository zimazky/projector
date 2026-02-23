import { makeAutoObservable } from 'mobx'

import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'
import { EventsCache } from 'src/6-entities/EventsCache/EventsCache'
import { EventsStore } from 'src/6-entities/Events/EventsStore'

import { GoogleApiService } from 'src/7-shared/services/GoogleApiService' // Import the type
import { StorageService } from 'src/7-shared/services/StorageService' // Import the type
import { PathSegment } from 'src/5-features/DriveFileList/model/DriveFileListStore'; // Import PathSegment
import { Observable } from 'src/7-shared/libs/Observable/Observable';
import { DocumentSessionStore } from 'src/6-entities/Document/model';

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
  private documentSessionStore: DocumentSessionStore

  // New property for Drive Explorer persistence
  driveExplorerPersistentState = new Map<string, { folderId: string; path: PathSegment[] }>();

  /** Уведомитель об успешном сохранении файла на Google Диске */
  fileSavedNotifier = new Observable<void>();


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
      this.documentSessionStore.markDirty()
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
