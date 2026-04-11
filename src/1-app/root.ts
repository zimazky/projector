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

// 1. Инфраструктурные сервисы
export const uiStore = new UIStore()
export const googleApiService = new GoogleApiService()

// 2. Менеджер вкладок документов (больше не зависит от StorageService!)
export const documentTabsStore = new DocumentTabsStore(googleApiService)

// 3. StorageService — работает через documentTabsStore
export const storageService = new StorageService(documentTabsStore, () => uiStore.forceUpdate())

// 4. EventsCache — теперь работает через documentTabsStore (получает projectsStore из DocumentStores)
export const eventsCache = new EventsCache(documentTabsStore)

// 5. Сторы представления и функций приложения
export const weatherStore = new WeatherStore()
export const calendarStore = new CalendarStore(eventsCache, weatherStore)
export const dayListStore = new DayListStore(eventsCache, weatherStore, calendarStore)
export const eventFormStore = new EventFormStore()
// НОВОЕ: EventSearchStore и ProjectEditorStore работают через documentTabsStore
export const eventSearchStore = new EventSearchStore(documentTabsStore)
export const projectEditorStore = new ProjectEditorStore(documentTabsStore)

// 6. Оркестратор приложения (без глобальных сторов!)
export const mainStore = new MainStore(eventsCache, googleApiService, storageService, documentTabsStore)

// 7. Store диалога "Сохранить как"
export const saveToDriveStore = new SaveToDriveStore(googleApiService, mainStore, documentTabsStore)

// 8. Инициализация приложения
mainStore.init()

// Реэкспорт классов для внешнего использования
export {
	UIStore,
	GoogleApiService,
	StorageService,
	MainStore,
	EventsCache,
	WeatherStore,
	CalendarStore,
	DayListStore,
	EventFormStore,
	DocumentTabsStore
}
