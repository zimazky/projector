import { EventsCache } from 'src/6-entities/EventsCache/EventsCache'
import { WeatherStore } from 'src/5-features/Weather/WeatherStore'
import { CalendarStore } from 'src/3-pages/Calendar/CalendarStore'
import { DayListStore } from 'src/3-pages/DayList/DayListStore'
import { EventFormStore } from 'src/4-widgets/EventForm/EventFormStore'
import { UIStore } from 'src/1-app/Stores/UIStore'
import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { MainStore } from 'src/1-app/Stores/MainStore'
import { SaveToDriveStore } from 'src/4-widgets/SaveToDrive/model/SaveToDriveStore'
import { DocumentTabsStore } from 'src/6-entities/Document/model'
import { EventSearchStore } from 'src/5-features/EventSearch/EventSearchStore'
import ProjectEditorStore from 'src/5-features/ProjectManager/ProjectEditor/ProjectEditorStore'

import { DriveSyncCoordinator } from 'src/6-entities/Document/model/DriveSyncCoordinator'
import type { DocumentPersistence } from 'src/6-entities/Document/model/DocumentPersistence'
import type { DocumentRuntime, DocumentRuntimeSnapshot } from 'src/6-entities/Document/model/DocumentRuntime'
import type { IRootStore } from './Providers/StoreContext'

export interface Application {
	stores: IRootStore
	start(): void
	dispose(): void
}

/** Создаёт независимые сторы; переданный сервис принадлежит экземпляру приложения.
 * start/dispose идемпотентны. После dispose требуется новый экземпляр.
 */
export function createApplication(
	options: {
		googleApiService?: GoogleApiService
		persistence?: DocumentPersistence<DocumentRuntimeSnapshot>
		/** Внутренний маршрут разработки R04–R08; публичный запуск использует прежний формат. */
		documentRuntime?: DocumentRuntime
	} = {}
): Application {
	const uiStore = new UIStore()
	const googleApiService = options.googleApiService ?? new GoogleApiService()
	const documentTabsStore = new DocumentTabsStore(googleApiService, options.persistence, options.documentRuntime)
	const eventsCache = new EventsCache(documentTabsStore)
	const weatherStore = new WeatherStore()
	const calendarStore = new CalendarStore(eventsCache, weatherStore)
	const dayListStore = new DayListStore(eventsCache, weatherStore, calendarStore)
	const eventFormStore = new EventFormStore(documentTabsStore)
	const eventSearchStore = new EventSearchStore(documentTabsStore)
	const projectEditorStore = new ProjectEditorStore(documentTabsStore)
	const mainStore = new MainStore(googleApiService, documentTabsStore)
	const fileSavedNotifier = mainStore.fileSavedNotifier
	const saveToDriveStore = new SaveToDriveStore(googleApiService, () => fileSavedNotifier.fire(), documentTabsStore)
	const coordinator = new DriveSyncCoordinator(documentTabsStore, googleApiService)
	let started = false
	let disposed = false
	return {
		stores: {
			uiStore,
			googleApiService,
			documentTabsStore,
			eventsCache,
			weatherStore,
			calendarStore,
			dayListStore,
			eventFormStore,
			eventSearchStore,
			projectEditorStore,
			mainStore,
			fileSavedNotifier,
			saveToDriveStore
		},
		start() {
			if (started || disposed) return
			started = true
			mainStore.start()
			if (options.documentRuntime?.resourceAccounting) eventsCache.start()
			coordinator.start()
		},
		dispose() {
			if (disposed) return
			disposed = true
			coordinator.dispose()
			saveToDriveStore.dispose()
			eventSearchStore.clear()
			weatherStore.dispose()
			mainStore.dispose()
			documentTabsStore.dispose()
			googleApiService.dispose()
			eventsCache.dispose()
		}
	}
}
