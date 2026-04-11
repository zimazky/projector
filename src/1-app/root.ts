import { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'
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
import { SaveToDriveStore } from 'src/4-widgets/SaveToDrive/model/SaveToDriveStore'
import { DocumentTabsStore } from 'src/6-entities/Document/model'
import { EventSearchStore } from 'src/5-features/EventSearch/EventSearchStore'
import ProjectEditorStore from 'src/5-features/ProjectManager/ProjectEditor/ProjectEditorStore'

// 1. Основные доменные сторы
export const projectsStore = new ProjectsStore()
export const projectEditorStore = new ProjectEditorStore(projectsStore)
export const eventsStore = new EventsStore(projectsStore)
export const eventsCache = new EventsCache(projectsStore, eventsStore)

// 2. Сторы представления и функций приложения
export const weatherStore = new WeatherStore()
export const calendarStore = new CalendarStore(eventsCache, weatherStore)
export const dayListStore = new DayListStore(eventsCache, weatherStore, calendarStore)
export const eventFormStore = new EventFormStore()
export const eventSearchStore = new EventSearchStore(eventsStore)

// 3. Инфраструктурные сервисы
export const uiStore = new UIStore()
export const googleApiService = new GoogleApiService()
export const storageService = new StorageService(projectsStore, eventsStore, () => uiStore.forceUpdate())

// 4. Менеджер вкладок документов (multi-document support)
export const documentTabsStore = new DocumentTabsStore(googleApiService, storageService)

// 5. Оркестратор приложения
export const mainStore = new MainStore(
	projectsStore,
	eventsStore,
	eventsCache,
	googleApiService,
	storageService,
	documentTabsStore
)

// 6. Store диалога "Сохранить как"
export const saveToDriveStore = new SaveToDriveStore(googleApiService, mainStore, documentTabsStore)

// 7. Инициализация приложения
mainStore.init()

// Реэкспорт классов для внешнего использования
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
	DocumentTabsStore
}
