import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'
import { EventsStore } from 'src/6-entities/Events/EventsStore'
import { EventsCache } from 'src/6-entities/EventsCache/EventsCache'
import { WeatherStore } from 'src/5-features/Weather/WeatherStore'
import { CalendarStore } from 'src/3-pages/Calendar/CalendarStore'
import { DayListStore } from 'src/3-pages/DayList/DayListStore'
import { EventFormStore } from 'src/4-widgets/EventForm/EventFormStore'
import { UIStore } from 'src/1-app/Stores/UIStore'
import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { StorageService } from 'src/7-shared/services/StorageService'
import { MainStore } from 'src/1-app/Stores/MainStore'
import { SaveToDriveStore } from 'src/5-features/SaveToDrive/model/SaveToDriveStore';


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
export const saveToDriveStore = new SaveToDriveStore(googleApiService);

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
  // saveToDriveStore // REMOVE THIS LINE
}