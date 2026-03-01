import { makeAutoObservable } from 'mobx'
import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import ZCron from 'src/7-shared/libs/ZCron/ZCron'
import { EventsStore } from 'src/6-entities/Events/EventsStore'
import { RepeatableEventModel } from 'src/6-entities/Events/RepeatableEventModel'

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
/** Максимальное количество итераций для генерации вхождений повторяемых событий (защитный предел) */
const MAX_OCCURRENCE_ITERATIONS = 500

export class EventSearchStore {
  /** Поисковый запрос */
  query: string = ''
  /** Результаты поиска (отсортированы по дате) */
  results: SearchResult[] = []
  /** Индекс текущего выбранного результата */
  currentIndex: number = -1
  /** Признак активности поиска */
  isActive: boolean = false

  /** Метка времени самого раннего найденного результата */
  private earliestFound: timestamp = 0 as timestamp
  /** Метка времени самого позднего найденного результата */
  private latestFound: timestamp = 0 as timestamp

  /** Флаги достижения границ (нет больше событий) */
  hasMoreBefore: boolean = true
  hasMoreAfter: boolean = true

  private eventsStore: EventsStore

  constructor(eventsStore: EventsStore) {
    this.eventsStore = eventsStore
    makeAutoObservable(this)
  }

  /** Выполнить начальный поиск — найти COUNT_BEFORE + COUNT_AFTER событий вокруг сегодняшнего дня */
  search(query: string) {
    this.query = query.trim().toLowerCase()
    this.currentIndex = -1
    this.results = []

    if (!this.query) {
      this.hasMoreBefore = false
      this.hasMoreAfter = false
      return
    }

    const today = DateTime.getBeginDayTimestamp(Date.now() / 1000)

    // Собираем ВСЕ подходящие события (одиночные — конечные, повторяемые имеют защитный предел)
    const allResults = this.collectAllMatchingEvents()

    if (allResults.length === 0) {
      this.hasMoreBefore = false
      this.hasMoreAfter = false
      return
    }

    // Сортируем все результаты по метке времени
    allResults.sort((a, b) => a.timestamp - b.timestamp)

    // Определяем, какие результаты оставить по количеству
    const beforeToday = allResults.filter(r => r.timestamp < today)
    const afterToday = allResults.filter(r => r.timestamp >= today)

    // Берём COUNT_BEFORE из прошлого (ближайшие) и COUNT_AFTER из будущего
    const selectedBefore = beforeToday.slice(-COUNT_BEFORE)
    const selectedAfter = afterToday.slice(0, COUNT_AFTER)

    this.results = [...selectedBefore, ...selectedAfter]

    // Обновляем флаги границ на основе доступных событий
    this.hasMoreBefore = beforeToday.length > COUNT_BEFORE
    this.hasMoreAfter = afterToday.length > COUNT_AFTER

    // Запоминаем границы ОТОБРАЖАЕМЫХ результатов (не всех найденных!)
    if (this.results.length > 0) {
      this.earliestFound = this.results[0].timestamp
      this.latestFound = this.results[this.results.length - 1].timestamp
    }

    if (this.results.length > 0) {
      // Устанавливаем индекс на первое событие сегодня или позже, либо на последнее событие
      const todayIndex = this.results.findIndex(r => r.timestamp >= today)
      this.currentIndex = todayIndex >= 0 ? todayIndex : Math.max(0, this.results.length - 1)
    }
  }

  /** Собрать все подходящие события из всех источников */
  private collectAllMatchingEvents(): SearchResult[] {
    const results: SearchResult[] = []
    const addedKeys = new Set<string>()

    // Поиск по запланированным одиночным событиям (конечный список)
    this.eventsStore.planned.forEach(event => {
      if (this.matchesQuery(event.name) || this.matchesQuery(event.comment)) {
        const key = `p-${event.id}`
        if (!addedKeys.has(key)) {
          results.push({
            eventId: event.id,
            timestamp: event.start,
            name: event.name,
            completed: false,
            repeatable: false
          })
          addedKeys.add(key)
        }
      }
    })

    // Поиск по завершённым событиям (конечный список)
    this.eventsStore.completed.forEach(event => {
      if (this.matchesQuery(event.name) || this.matchesQuery(event.comment)) {
        const key = `c-${event.id}`
        if (!addedKeys.has(key)) {
          results.push({
            eventId: event.id,
            timestamp: event.start,
            name: event.name,
            completed: true,
            repeatable: false
          })
          addedKeys.add(key)
        }
      }
    })

    // Поиск по повторяемым событиям (генерация вхождений с защитным пределом)
    this.eventsStore.plannedRepeatable.forEach(event => {
      if (this.matchesQuery(event.name) || this.matchesQuery(event.comment)) {
        const occurrences = this.getOccurrences(event)
        occurrences.forEach(ts => {
          const key = `r-${event.id}-${ts}`
          if (!addedKeys.has(key)) {
            results.push({
              eventId: event.id,
              timestamp: ts,
              name: event.name,
              completed: false,
              repeatable: true
            })
            addedKeys.add(key)
          }
        })
      }
    })

    return results
  }

  /** Получить вхождения повторяемого события (с защитным пределом для бесконечных расписаний) */
  private getOccurrences(event: RepeatableEventModel): timestamp[] {
    const occurrences: timestamp[] = []

    const schedule = ZCron.parse(event.repeat)
    if (schedule.mode === 'empty') {
      // Неповторяемое событие
      occurrences.push(event.start)
      return occurrences
    }

    // Для повторяемых событий генерируем вхождения с защитным пределом
    let current: timestamp | null = event.start
    let iterations = 0

    while (current !== null && iterations < MAX_OCCURRENCE_ITERATIONS) {
      iterations++

      // Проверяем, не закончилось ли событие
      if (event.end && current >= event.end) {
        break
      }

      occurrences.push(current)
      current = ZCron.nextAfter(schedule, event.start, current)
    }

    return occurrences
  }

  /** Проверить соответствие текста запросу */
  private matchesQuery(text: string | undefined): boolean {
    if (!text) return false
    return text.toLowerCase().includes(this.query)
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

  /** Загрузить ещё результаты в будущем */
  private loadMoreAfter() {
    if (!this.hasMoreAfter || !this.query) return

    // Получаем все подходящие события и фильтруем те, что после текущего последнего
    const allResults = this.collectAllMatchingEvents()
    const newResults = allResults.filter(r => r.timestamp > this.latestFound)

    if (newResults.length === 0) {
      this.hasMoreAfter = false
      return
    }

    // Сортируем и берём COUNT_LOAD
    newResults.sort((a, b) => a.timestamp - b.timestamp)
    const toAdd = newResults.slice(0, COUNT_LOAD)

    if (toAdd.length === 0) {
      this.hasMoreAfter = false
      return
    }

    // Обновляем последний найденный
    this.latestFound = toAdd[toAdd.length - 1].timestamp
    this.hasMoreAfter = newResults.length > COUNT_LOAD

    // Добавляем к результатам
    this.results = [...this.results, ...toAdd].sort((a, b) => a.timestamp - b.timestamp)
  }

  /** Загрузить ещё результаты в прошлом */
  private loadMoreBefore() {
    if (!this.hasMoreBefore || !this.query) return

    // Получаем все подходящие события и фильтруем те, что до текущего первого
    const allResults = this.collectAllMatchingEvents()
    const newResults = allResults.filter(r => r.timestamp < this.earliestFound)

    if (newResults.length === 0) {
      this.hasMoreBefore = false
      return
    }

    // Сортируем и берём COUNT_LOAD (ближайшие из прошлого)
    newResults.sort((a, b) => a.timestamp - b.timestamp)
    const toAdd = newResults.slice(-COUNT_LOAD)

    if (toAdd.length === 0) {
      this.hasMoreBefore = false
      return
    }

    // Обновляем первый найденный
    this.earliestFound = toAdd[0].timestamp
    this.hasMoreBefore = newResults.length > COUNT_LOAD

    // Вставляем в начало и пересчитываем индекс
    const oldIndex = this.currentIndex
    this.results = [...toAdd, ...this.results].sort((a, b) => a.timestamp - b.timestamp)
    this.currentIndex = oldIndex + toAdd.length
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
    this.query = ''
    this.results = []
    this.currentIndex = -1
    this.isActive = false
    this.earliestFound = 0 as timestamp
    this.latestFound = 0 as timestamp
    this.hasMoreBefore = true
    this.hasMoreAfter = true
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
