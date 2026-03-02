import React from 'react'
import { createRoot } from 'react-dom/client'

import App from './App/App'

import './index.css'

import {
	mainStore,
	projectsStore,
	eventsStore,
	eventsCache,
	weatherStore,
	calendarStore,
	dayListStore,
	eventFormStore,
	uiStore,
	googleApiService,
	storageService,
	saveToDriveStore,
	documentSessionStore,
	eventSearchStore
} from './root'
import StoreProvider from './Providers/StoreProvider'

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('Не найден DOM элемент #root')

const root = createRoot(rootElement)

// Регистрируем все сторы в едином провайдере контекста приложения.
root.render(
	<StoreProvider
		mainStore={mainStore}
		projectsStore={projectsStore}
		eventsStore={eventsStore}
		eventsCache={eventsCache}
		weatherStore={weatherStore}
		calendarStore={calendarStore}
		dayListStore={dayListStore}
		eventFormStore={eventFormStore}
		uiStore={uiStore}
		googleApiService={googleApiService}
		storageService={storageService}
		saveToDriveStore={saveToDriveStore}
		documentSessionStore={documentSessionStore}
		fileSavedNotifier={mainStore.fileSavedNotifier}
		eventSearchStore={eventSearchStore}
	>
		<App />
	</StoreProvider>
)
