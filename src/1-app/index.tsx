import React from 'react'
import {createRoot} from "react-dom/client"

import App from './App/App'

import './index.css'

import { mainStore, projectsStore, eventsStore, eventsCache, weatherStore, calendarStore, dayListStore, eventFormStore, uiStore, googleApiService, storageService, saveToDriveStore } from './root'
import StoreProvider from './Providers/StoreProvider'

const rootElement = document.getElementById('root')
if(rootElement === null) throw new Error('Не найден DOM элемент #root')
const root = createRoot(rootElement)
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
  >
    <App />
  </StoreProvider>
)