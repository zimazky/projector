import React from 'react'

import { MainStore } from 'src/1-app/Stores/MainStore'
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

export interface IRootStore {
  mainStore: MainStore;
  projectsStore: ProjectsStore;
  eventsStore: EventsStore;
  eventsCache: EventsCache;
  weatherStore: WeatherStore;
  calendarStore: CalendarStore;
  dayListStore: DayListStore;
  eventFormStore: EventFormStore;
  uiStore: UIStore;
  googleApiService: GoogleApiService;
  storageService: StorageService;
}

export const StoreContext = React.createContext<IRootStore>({} as IRootStore);
