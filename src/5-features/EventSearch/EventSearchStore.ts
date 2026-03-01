import { makeAutoObservable } from 'mobx'
import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import ZCron, { ParsedSchedule } from 'src/7-shared/libs/ZCron/ZCron'
import { EventsStore } from 'src/6-entities/Events/EventsStore'
import { RepeatableEventModel } from 'src/6-entities/Events/RepeatableEventModel'
import { SingleEventModel } from 'src/6-entities/Events/SingleEventModel'

export interface SearchResult {
  eventId: number
  timestamp: timestamp
  name: string
  completed: boolean
  repeatable: boolean
}

/** Количество событий до сегодняшнего дня */
const COUNT_BEFORE = 4
/** Количество событий после сегодняшнего дня */
const COUNT_AFTER = 4
/** Количество событий для загрузки при приближении к границе */
const COUNT_LOAD = 4
/** Задержка debounce при вводе (мс) */
const DEBOUNCE_MS = 300

export class EventSearchStore {
  /** Поисковый запрос */
  query: string = ''
  /** Результаты поиска (отсортированы по дате) */
  results: SearchResult[] = []
  /** Индекс текущего выбранного результата */
  currentIndex: number = -1
  /** Признак активности поиска */
  isActive: boolean = false

  /** Метка времени самого раннего отображаемого результата */
  private earliestFound: timestamp = 0 as timestamp
  /** Метка времени самого позднего отображаемого результата */
  private latestFound: timestamp = 0 as timestamp

  /** Флаги достижения границ (нет больше событий) */
  hasMoreBefore: boolean = true
  hasMoreAfter: boolean = true

  private eventsStore: EventsStore
  /** Кэш скомпилированных расписаний */
  private scheduleCache: Map<string, ParsedSchedule> = new Map()
  /** Таймер debounce */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(eventsStore: EventsStore) {
    this.eventsStore = eventsStore
    makeAutoObservable(this)
  }

  /** 
   * Выполнить поиск с debounce.
   * При быстром вводе поиск выполняется только после паузы.
   */
  search(query: string) {
    // Обновляем query немедленно для отображения в UI
    this.query = query.trim().toLowerCase()

    // Отменяем предыдущий таймер
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
    }

    // Если запрос пустой, очищаем немедленно
    if (!this.query) {
      this.performClear()
      return
    }

    // Устанавливаем новый таймер
    this.debounceTimer = setTimeout(() => {
      this.performSearch()
    }, DEBOUNCE_MS)
  }

  /** 
   * Выполнить поиск немедленно (без debounce).
   * Используется для программного вызова или в тестах.
   */
  searchImmediate(query: string) {
    // Отменяем pending debounce
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    this.query = query.trim().toLowerCase()

    if (!this.query) {
      this.performClear()
      return
    }

    this.performSearch()
  }

  /** Фактическое выполнение поиска (без debounce) */
  private performSearch() {
    this.currentIndex = -1
    this.results = []
    this.scheduleCache.clear()

    if (!this.query) {
      this.hasMoreBefore = false
      this.hasMoreAfter = false
      return
    }

    const today = DateTime.getBeginDayTimestamp(Date.now() / 1000)

    // Ищем события до и после сегодня ИНКРЕМЕНТАЛЬНО (без сбора всех событий)
    // Запрашиваем на 1 больше, чтобы узнать, есть ли ещё
    const beforeResults = this.findNearestBefore(today, COUNT_BEFORE + 1)
    const afterResults = this.findNearestAfter(today, COUNT_AFTER + 1)

    // Определяем, есть ли ещё события за границами
    this.hasMoreBefore = beforeResults.length > COUNT_BEFORE
    this.hasMoreAfter = afterResults.length > COUNT_AFTER

    // Берём только нужное количество
    const selectedBefore = beforeResults.slice(0, COUNT_BEFORE)
    const selectedAfter = afterResults.slice(0, COUNT_AFTER)

    this.results = [...selectedBefore.reverse(), ...selectedAfter]

    if (this.results.length === 0) {
      this.hasMoreBefore = false
      this.hasMoreAfter = false
      return
    }

    // Запоминаем границы отображаемых результатов
    this.earliestFound = this.results[0].timestamp
    this.latestFound = this.results[this.results.length - 1].timestamp

    // Устанавливаем индекс на первое событие сегодня или позже
    const todayIndex = this.results.findIndex(r => r.timestamp >= today)
    this.currentIndex = todayIndex >= 0 ? todayIndex : Math.max(0, this.results.length - 1)
  }

  /** Найти ближайшие N событий ПОСЛЕ указанной даты (включительно) */
  private findNearestAfter(fromTimestamp: timestamp, limit: number): SearchResult[] {
    const candidates: SearchResult[] = []

    // 1. Одиночные события (планируемые)
    for (const event of this.eventsStore.planned) {
      if (event.start >= fromTimestamp && this.matchesEvent(event)) {
        candidates.push(this.singleEventToResult(event, false))
      }
    }

    // 2. Завершённые события
    for (const event of this.eventsStore.completed) {
      if (event.start >= fromTimestamp && this.matchesEvent(event)) {
        candidates.push(this.singleEventToResult(event, true))
      }
    }

    // 3. Повторяемые события — инкрементальная генерация только limit вхождений
    for (const event of this.eventsStore.plannedRepeatable) {
      if (this.matchesEvent(event)) {
        // Ищем с дня перед fromTimestamp, чтобы включить совпадения на fromTimestamp
        const searchFrom = DateTime.getBeginDayTimestamp(fromTimestamp) - 86400
        const occurrences = this.getOccurrencesAfter(event, searchFrom, limit)
        candidates.push(...occurrences)
      }
    }

    // Сортируем и берём limit ближайших
    return candidates
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, limit)
  }

  /** Найти ближайшие N событий ДО указанной даты (строго до) */
  private findNearestBefore(beforeTimestamp: timestamp, limit: number): SearchResult[] {
    const candidates: SearchResult[] = []

    // 1. Одиночные события (планируемые)
    for (const event of this.eventsStore.planned) {
      if (event.start < beforeTimestamp && this.matchesEvent(event)) {
        candidates.push(this.singleEventToResult(event, false))
      }
    }

    // 2. Завершённые события
    for (const event of this.eventsStore.completed) {
      if (event.start < beforeTimestamp && this.matchesEvent(event)) {
        candidates.push(this.singleEventToResult(event, true))
      }
    }

    // 3. Повторяемые события — инкрементальная генерация назад
    for (const event of this.eventsStore.plannedRepeatable) {
      if (this.matchesEvent(event)) {
        const occurrences = this.getOccurrencesBefore(event, beforeTimestamp, limit)
        candidates.push(...occurrences)
      }
    }

    // Сортируем и берём limit ближайших (с конца, т.к. ищем назад)
    return candidates
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  /** Получить N вхождений повторяемого события ПОСЛЕ указанной даты */
  private getOccurrencesAfter(
    event: RepeatableEventModel,
    fromTimestamp: timestamp,
    limit: number
  ): SearchResult[] {
    const schedule = this.getSchedule(event.repeat)
    
    // Неповторяемое событие
    if (schedule.mode === 'empty') {
      if (event.start > fromTimestamp) {
        return [this.repeatableEventToResult(event, event.start)]
      }
      return []
    }

    const results: SearchResult[] = []
    let current: timestamp | null = fromTimestamp

    // Находим первое вхождение после fromTimestamp
    current = ZCron.nextAfter(schedule, event.start, fromTimestamp)

    while (current !== null && results.length < limit) {
      // Проверяем, не закончилось ли событие
      if (event.end && current >= event.end) {
        break
      }

      results.push(this.repeatableEventToResult(event, current))
      current = ZCron.nextAfter(schedule, event.start, current)
    }

    return results
  }

  /** Получить N вхождений повторяемого события ДО указанной даты */
  private getOccurrencesBefore(
    event: RepeatableEventModel,
    beforeTimestamp: timestamp,
    limit: number
  ): SearchResult[] {
    const schedule = this.getSchedule(event.repeat)

    // Неповторяемое событие
    if (schedule.mode === 'empty') {
      if (event.start < beforeTimestamp) {
        return [this.repeatableEventToResult(event, event.start)]
      }
      return []
    }

    const results: SearchResult[] = []
    let current: timestamp | null = beforeTimestamp

    // Находим вхождения, идя назад от beforeTimestamp
    while (current !== null && results.length < limit) {
      current = ZCron.prevBefore(schedule, event.start, current)
      
      if (current === null) break
      if (event.end && current >= event.end) continue

      results.push(this.repeatableEventToResult(event, current))
    }

    return results
  }

  /** Получить скомпилированное расписание из кэша */
  private getSchedule(repeat: string): ParsedSchedule {
    let schedule = this.scheduleCache.get(repeat)
    if (!schedule) {
      schedule = ZCron.parse(repeat)
      this.scheduleCache.set(repeat, schedule)
    }
    return schedule
  }

  /** Проверить соответствие события запросу */
  private matchesEvent(event: { name: string; comment?: string }): boolean {
    return this.matchesQuery(event.name) || this.matchesQuery(event.comment)
  }

  /** Проверить соответствие текста запросу */
  private matchesQuery(text: string | undefined): boolean {
    if (!text) return false
    return text.toLowerCase().includes(this.query)
  }

  /** Преобразовать одиночное событие в результат поиска */
  private singleEventToResult(event: SingleEventModel, completed: boolean): SearchResult {
    return {
      eventId: event.id,
      timestamp: event.start,
      name: event.name,
      completed,
      repeatable: false
    }
  }

  /** Преобразовать повторяемое событие в результат поиска */
  private repeatableEventToResult(event: RepeatableEventModel, timestamp: timestamp): SearchResult {
    return {
      eventId: event.id,
      timestamp,
      name: event.name,
      completed: false,
      repeatable: true
    }
  }

  /** Перейти к следующему результату с ленивой загрузкой */
  nextResult() {
    if (this.results.length === 0) return

    // Проверяем, нужно ли загрузить ещё результаты
    if (this.currentIndex >= this.results.length - 2) {
      this.loadMoreAfter()
    }

    if (this.currentIndex < this.results.length - 1) {
      this.currentIndex++
    }
  }

  /** Перейти к предыдущему результату с ленивой загрузкой */
  prevResult() {
    if (this.results.length === 0) return

    // Проверяем, нужно ли загрузить ещё результаты
    if (this.currentIndex <= 1) {
      this.loadMoreBefore()
    }

    if (this.currentIndex > 0) {
      this.currentIndex--
    }
  }

  /** Загрузить ещё результаты в будущем (инкрементально) */
  private loadMoreAfter() {
    if (!this.hasMoreAfter || !this.query) return

    // Ищем только COUNT_LOAD + 1 событий строго ПОСЛЕ latestFound
    const candidates: SearchResult[] = []

    // Одиночные события
    for (const event of this.eventsStore.planned) {
      if (event.start > this.latestFound && this.matchesEvent(event)) {
        candidates.push(this.singleEventToResult(event, false))
      }
    }
    for (const event of this.eventsStore.completed) {
      if (event.start > this.latestFound && this.matchesEvent(event)) {
        candidates.push(this.singleEventToResult(event, true))
      }
    }

    // Повторяемые события
    for (const event of this.eventsStore.plannedRepeatable) {
      if (this.matchesEvent(event)) {
        const occurrences = this.getOccurrencesAfter(event, this.latestFound, COUNT_LOAD + 1)
        candidates.push(...occurrences)
      }
    }

    const newResults = candidates
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, COUNT_LOAD + 1)

    if (newResults.length === 0) {
      this.hasMoreAfter = false
      return
    }

    // Определяем, есть ли ещё
    this.hasMoreAfter = newResults.length > COUNT_LOAD
    const toAdd = newResults.slice(0, COUNT_LOAD)

    if (toAdd.length === 0) {
      return
    }

    // Обновляем границу
    this.latestFound = toAdd[toAdd.length - 1].timestamp

    // Добавляем к результатам (оба массива уже отсортированы)
    this.results = this.mergeSorted(this.results, toAdd)
  }

  /** Загрузить ещё результаты в прошлом (инкрементально) */
  private loadMoreBefore() {
    if (!this.hasMoreBefore || !this.query) return

    // Ищем только COUNT_LOAD + 1 событий строго ДО earliestFound
    const candidates: SearchResult[] = []

    // Одиночные события
    for (const event of this.eventsStore.planned) {
      if (event.start < this.earliestFound && this.matchesEvent(event)) {
        candidates.push(this.singleEventToResult(event, false))
      }
    }
    for (const event of this.eventsStore.completed) {
      if (event.start < this.earliestFound && this.matchesEvent(event)) {
        candidates.push(this.singleEventToResult(event, true))
      }
    }

    // Повторяемые события
    for (const event of this.eventsStore.plannedRepeatable) {
      if (this.matchesEvent(event)) {
        const occurrences = this.getOccurrencesBefore(event, this.earliestFound, COUNT_LOAD + 1)
        candidates.push(...occurrences)
      }
    }

    const newResults = candidates
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, COUNT_LOAD + 1)

    if (newResults.length === 0) {
      this.hasMoreBefore = false
      return
    }

    // Определяем, есть ли ещё
    this.hasMoreBefore = newResults.length > COUNT_LOAD
    const toAdd = newResults.slice(0, COUNT_LOAD)

    if (toAdd.length === 0) {
      return
    }

    // Обновляем границу
    this.earliestFound = toAdd[toAdd.length - 1].timestamp

    // Добавляем к результатам (оба массива уже отсортированы)
    const oldIndex = this.currentIndex
    this.results = this.mergeSorted(toAdd.reverse(), this.results)
    this.currentIndex = oldIndex + toAdd.length
  }

  /** Слияние двух отсортированных массивов */
  private mergeSorted(arr1: SearchResult[], arr2: SearchResult[]): SearchResult[] {
    const result: SearchResult[] = []
    let i = 0, j = 0

    while (i < arr1.length && j < arr2.length) {
      if (arr1[i].timestamp <= arr2[j].timestamp) {
        result.push(arr1[i++])
      } else {
        result.push(arr2[j++])
      }
    }

    return result.concat(arr1.slice(i)).concat(arr2.slice(j))
  }

  /** Получить текущий выбранный результат */
  get currentResult(): SearchResult | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.results.length) return null
    return this.results[this.currentIndex]
  }

  /** Проверить, подсвечено ли событие */
  isHighlighted(eventId: number, ts: timestamp): boolean {
    const current = this.currentResult
    return current !== null &&
           current.eventId === eventId &&
           current.timestamp === ts
  }

  /** Очистить поиск */
  clear() {
    // Отменяем pending debounce
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.performClear()
  }

  /** Внутренняя очистка состояния */
  private performClear() {
    this.query = ''
    this.results = []
    this.currentIndex = -1
    this.isActive = false
    this.earliestFound = 0 as timestamp
    this.latestFound = 0 as timestamp
    this.hasMoreBefore = false
    this.hasMoreAfter = false
    this.scheduleCache.clear()
  }

  /** Переключить состояние активности */
  toggleActive() {
    this.isActive = !this.isActive
    if (!this.isActive) {
      this.clear()
    }
  }

  /** Получить текст с количеством результатов */
  get resultText(): string {
    if (this.results.length === 0) return ''
    return `${this.currentIndex + 1} / ${this.results.length}`
  }
}
