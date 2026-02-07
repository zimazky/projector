import { ProjectsStore } from 'src/6-entities/stores/Projects/ProjectsStore'
import { EventsStore } from 'src/6-entities/stores/Events/EventsStore'
import { EventsCache } from 'src/6-entities/stores/EventsCache/EventsCache'
import { WeatherStore } from 'src/6-entities/stores/Weather/WeatherStore'
import { CalendarStore } from 'src/6-entities/stores/Calendar/CalendarStore'
import { DayListStore } from 'src/6-entities/stores/DayListStore/DayListStore'
import { EventFormStore } from 'src/6-entities/stores/EventForm/EventFormStore'
import { UIStore } from 'src/6-entities/stores/UIStore/UIStore'
import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { StorageService } from 'src/7-shared/services/StorageService'
import { MainStore } from 'src/6-entities/stores/MainStore'


// 1. Инстанцирование основных доменных хранилищ
export const projectsStore = new ProjectsStore()
export const eventsStore = new EventsStore(projectsStore)
export const eventsCache = new EventsCache(projectsStore, eventsStore)

// 2. Инстанцирование других доменных/функциональных хранилищ с их зависимостями
export const weatherStore = new WeatherStore()
export const calendarStore = new CalendarStore(eventsCache, weatherStore)
export const dayListStore = new DayListStore(eventsCache, weatherStore, calendarStore)
export const eventFormStore = new EventFormStore()

// 3. Инстанцирование общих сервисов
export const uiStore = new UIStore()
export const googleApiService = new GoogleApiService()
export const storageService = new StorageService(projectsStore, eventsStore, googleApiService)

// 4. Инстанцирование MainStore (оркестратора) с его основными зависимостями
export const mainStore = new MainStore(projectsStore, eventsStore, eventsCache, googleApiService, storageService)

// 5. Инициализация главного хранилища, которое в свою очередь инициализирует другие сервисы/хранилища
mainStore.init()

// Реэкспорт всех хранилищ и сервисов для удобного доступа из одной точки
export {
  UIStore,
  GoogleApiService,
  StorageService,
  MainStore,
  ProjectsStore,
  EventsStore,
  EventsCache,
  WeatherStore,
  CalendarStore,
  DayListStore,
  EventFormStore,
}