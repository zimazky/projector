import { makeAutoObservable } from "mobx"
import DateTime, { timestamp } from "src/utils/DateTime"
import { ForecastData3h, WeatherStore } from "src/stores/Weather/WeatherStore"
import { EventCacheStructure } from "src/stores/EventsCache/EventCacheStructure"
import { EventsCache } from "src/stores/EventsCache/EventsCache"
import { CalendarStore } from "src/stores/Calendar/CalendarStore"

export class DayListStore {
  /** Метка времени отображаемого дня, unixtime */
  date: timestamp
  /** Ссылка на кэш событий */
  eventsCache: EventsCache
  /** Ссылка на хранилище данных погоды */
  weatherStore: WeatherStore
  calendarStore: CalendarStore

  constructor(eventsCache: EventsCache, weatherStore: WeatherStore, calendarStore: CalendarStore) {
    this.eventsCache = eventsCache
    this.weatherStore = weatherStore
    this.calendarStore = calendarStore
    this.date = Date.now()/1000
    makeAutoObservable(this)
  }

  get caption(): string {
    return DateTime.getYYYYMMDD(this.date)
  }

  setDate(timestamp: timestamp) {
    this.date = timestamp
    this.calendarStore.setWeek(timestamp)
  }

  getDayListStructure(): DayListStructure {
    const weather = this.weatherStore.state === 'ready'
      ? this.weatherStore.data3h.filter(d => DateTime.getBeginDayTimestamp(d.timestamp)===this.date) 
      : undefined
    return {
      timestamp: this.date,
      weather, 
      events: this.eventsCache.getEvents(this.date),
      actualBalance: this.eventsCache.getActualBalance(this.date),
      plannedBalance: this.eventsCache.getPlannedBalance(this.date),
      plannedBalanceChange: this.eventsCache.getPlannedBalanceChange(this.date)
    }
  }
}

/** Структура данных для отображения компонента DayList */
export type DayListStructure = {
  timestamp: timestamp
  weather?: ForecastData3h[]
  events: EventCacheStructure[]
  actualBalance: number
  plannedBalance: number
  plannedBalanceChange: number
}