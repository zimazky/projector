import React from 'react'

import { MainStore } from 'src/6-entities/stores/MainStore'
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
