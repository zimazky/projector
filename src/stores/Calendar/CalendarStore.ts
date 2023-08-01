import { makeAutoObservable } from "mobx"
import DateTime, { timestamp } from "src/utils/DateTime"
import { max } from "src/utils/utils"
import { EventsCache, EventsCacheSkipStructure } from "src/stores/EventsCache/EventsCache"
import { ForecastData1d, WeatherStore } from "src/stores/Weather/WeatherStore"
import { EventCacheStructure } from "src/stores/EventsCache/EventCacheStructure"

/** Минимальный размер буфера в неделях */
const minBufferSize = 4
/** Размер отображаемой области в неделях */
const renderingSize = 20

/*
 * Пояснение: 
 *   Область отображения больше видимой области. 
 *   За пределами видимой области поддерживается буфер размером большим минимального значения minBufferSize.
 *   Буфер обеспечивает плавность скроллинга
 *     ---------------------------------- Начало отображаемой области
 *     topBufferSize >= minBufferSize
 *     ---------------------------------- Начало видимой области
 *     Видимая область
 *     ---------------------------------- Конец видимой области
 *     bottomBufferSize >= minBufferSize
 *     ---------------------------------- Конец отображаемой области
 */

/** Класс хранилища модуля отображения календаря */
export class CalendarStore {
  /** Ссылка на кэш событий */
  eventsCache: EventsCache
  /** Ссылка на хранилище данных погоды */
  weatherStore: WeatherStore
  /** Год видимой области (для вывода в заголовке) */
  year: number
  /** Месяц видимой области (для вывода в заголовке) */
  month: number
  /** 
   * Сдвиг отображаемой области в неделях относительно текущей недели
   * Положительные числа определяют сдвиг в сторону более ранних недель
   */
  shift: number = minBufferSize

  constructor(eventsCache: EventsCache, weatherStore: WeatherStore) {
    this.eventsCache = eventsCache
    this.weatherStore = weatherStore
    const {year, month} = DateTime.getYearMonthDay(Date.now()/1000)
    this.year = year
    this.month = month
    makeAutoObservable(this)
  }

  setMonthYear(month: number, year: number) {
    this.month = month
    this.year = year
  }

  /** Строка заголовка, представляющая год и месяц отображаемой области */
  get caption(): string {
    return this.year + ' ' + DateTime.MONTHS_FULL[this.month]
  }

  /**
   * Корректировка значения сдвига отображаемой области
   * для поддержания необходимого размера буферов
   * @param topBufferSize 
   * @param bottomBufferSize 
   */
  correctShift(topBufferSize: number, bottomBufferSize: number) {
    if(topBufferSize < minBufferSize) this.shift += minBufferSize
    else if(bottomBufferSize < minBufferSize) this.shift -= minBufferSize
  }

  /** Инициализировать сдвиг отображаемой области */
  resetShift() { this.shift = minBufferSize }

  /** Получить массив данных для отображения календаря по неделям */
  getCalendarDataStructure(weekTimestamp: timestamp): CalendarWeekStructure[] {
    let currentTimestamp = weekTimestamp - this.shift*7*86400
    console.log(weekTimestamp, currentTimestamp)
    const lastActualBalanceDate = this.eventsCache.lastActualBalanceDate
    const firstPlannedEventDate = this.eventsCache.getFirstPlannedEventDate()
    const weeks: CalendarWeekStructure[] = []
    for(let i=0; i<=renderingSize; i++) {
      const list: CalendarDayStructure[] = []
      let maxCount = 0
      let stack = [] as EventsCacheSkipStructure[]
      for(let j=0; j<=6; j++) {
        const weather = this.weatherStore.state === 'ready'? this.weatherStore.data1d.find(d => d.timestamp==currentTimestamp) : undefined;
        list.push({
          timestamp: currentTimestamp,
          weather,
          events: this.eventsCache.getEventsWithPlaceholders(currentTimestamp, stack),
          actualBalance: this.eventsCache.getActualBalance(currentTimestamp),
          plannedBalance: this.eventsCache.getPlannedBalance(currentTimestamp),
          plannedBalanceChange: this.eventsCache.getPlannedBalanceChange(currentTimestamp),
          style: currentTimestamp>=lastActualBalanceDate ? 'normal' : (firstPlannedEventDate!==0 && currentTimestamp>=firstPlannedEventDate ? 'uncompleted' : 'completed')
        })
        maxCount = max(maxCount, list.at(-1)?.events.length ?? 0)
        currentTimestamp += 86400
      }
      weeks.push({list, maxCount})
    }
    return weeks
  }
}

/** Структура данных для отображения компонента CalendarDay*/
export type CalendarDayStructure = {
  timestamp: timestamp
  weather?: ForecastData1d
  events: EventCacheStructure[]
  actualBalance: number
  plannedBalance: number
  plannedBalanceChange: number
  style: 'normal' | 'uncompleted' | 'completed'
}

/** Набор данных одной недели */
type CalendarWeekStructure = {
  list: CalendarDayStructure[]
  maxCount: number
}
