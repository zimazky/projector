import React from 'react'
import { createRoot } from 'react-dom/client'

import App from './App/App'

import './index.css'

import {
	mainStore,
	projectEditorStore,
	eventsCache,
	weatherStore,
	calendarStore,
	dayListStore,
	eventFormStore,
	uiStore,
	googleApiService,
	saveToDriveStore,
	documentTabsStore,
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
		projectEditorStore={projectEditorStore}
		eventsCache={eventsCache}
		weatherStore={weatherStore}
		calendarStore={calendarStore}
		dayListStore={dayListStore}
		eventFormStore={eventFormStore}
		uiStore={uiStore}
		googleApiService={googleApiService}
		saveToDriveStore={saveToDriveStore}
		documentTabsStore={documentTabsStore}
		fileSavedNotifier={mainStore.fileSavedNotifier}
		eventSearchStore={eventSearchStore}
	>
		<App />
	</StoreProvider>
)
