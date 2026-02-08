import { makeAutoObservable } from 'mobx'

import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'
import { EventsCache } from 'src/6-entities/EventsCache/EventsCache'
import { EventsStore } from 'src/6-entities/Events/EventsStore'

import { GoogleApiService } from 'src/7-shared/services/GoogleApiService' // Import the type
import { StorageService } from 'src/7-shared/services/StorageService' // Import the type

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


  constructor(projectsStore: ProjectsStore, eventsStore: EventsStore, eventsCache: EventsCache, googleApiService: GoogleApiService, storageService: StorageService) {
    this.projectsStore = projectsStore
    this.eventsStore = eventsStore
    this.eventsCache = eventsCache
    this.googleApiService = googleApiService
    this.storageService = storageService
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
}
