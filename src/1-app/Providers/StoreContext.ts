import React from 'react'

import { MainStore } from 'src/1-app/Stores/MainStore'
import { EventsCache } from 'src/6-entities/EventsCache/EventsCache'
import { WeatherStore } from 'src/5-features/Weather/WeatherStore'
import { CalendarStore } from 'src/3-pages/Calendar/CalendarStore'
import { DayListStore } from 'src/3-pages/DayList/DayListStore'
import { EventFormStore } from 'src/4-widgets/EventForm/EventFormStore'
import { UIStore } from 'src/1-app/Stores/UIStore'
import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { StorageService } from 'src/7-shared/services/StorageService'
import { SaveToDriveStore } from 'src/4-widgets/SaveToDrive/model/SaveToDriveStore'
import { Observable } from 'src/7-shared/libs/Observable/Observable'
import { DocumentTabsStore } from 'src/6-entities/Document/model'
import { EventSearchStore } from 'src/5-features/EventSearch/EventSearchStore'
import ProjectEditorStore from 'src/5-features/ProjectManager/ProjectEditor/ProjectEditorStore'

/**
 * Контракт всех сторов/сервисов, доступных через React Context.
 * Нужен для единообразного DI в компонентах.
 *
 * НОВОЕ: projectsStore и eventsStore больше не экспортируются глобально.
 * Компоненты получают их через documentTabsStore.getActiveDocumentStores()
 * DocumentSessionStore удалён как дубликат DocumentTabsStore.
 */
export interface IRootStore {
	mainStore: MainStore
	projectEditorStore: ProjectEditorStore
	eventsCache: EventsCache
	weatherStore: WeatherStore
	calendarStore: CalendarStore
	dayListStore: DayListStore
	eventFormStore: EventFormStore
	uiStore: UIStore
	googleApiService: GoogleApiService
	storageService: StorageService
	saveToDriveStore: SaveToDriveStore
	documentTabsStore: DocumentTabsStore
	fileSavedNotifier: Observable<void>
	eventSearchStore: EventSearchStore
}

export const StoreContext = React.createContext<IRootStore>({} as IRootStore)
