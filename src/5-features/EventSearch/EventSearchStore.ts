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

/** Number of events to find before today */
const COUNT_BEFORE = 4
/** Number of events to find after today */
const COUNT_AFTER = 4
/** Number of events to load on boundary approach */
const COUNT_LOAD = 4
/** Maximum search range in days (prevents infinite search with repeatable events) */
const MAX_SEARCH_DAYS = 365
/** Step size in days when extending search */
const SEARCH_STEP_DAYS = 30

export class EventSearchStore {
  /** Search query */
  query: string = ''
  /** Search results (sorted by date) */
  results: SearchResult[] = []
  /** Index of currently selected result */
  currentIndex: number = -1
  /** Is search active */
  isActive: boolean = false

  /** Timestamp of the earliest searched date */
  private searchedFrom: timestamp = 0 as timestamp
  /** Timestamp of the latest searched date */
  private searchedTo: timestamp = 0 as timestamp

  /** Flags for reaching boundaries */
  hasMoreBefore: boolean = true
  hasMoreAfter: boolean = true

  private eventsStore: EventsStore

  constructor(eventsStore: EventsStore) {
    this.eventsStore = eventsStore
    makeAutoObservable(this)
  }

  /** Execute initial search - find COUNT_BEFORE + COUNT_AFTER events around today */
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

    // Start with initial search range around today
    this.searchedFrom = (today - SEARCH_STEP_DAYS * 86400) as timestamp
    this.searchedTo = (today + SEARCH_STEP_DAYS * 86400) as timestamp

    // Collect all matching events
    let allResults = this.collectAllMatchingEvents()

    // Extend search range until we have enough events or reach limits
    while (true) {
      const beforeToday = allResults.filter(r => r.timestamp < today)
      const afterToday = allResults.filter(r => r.timestamp >= today)

      const needMoreBefore = beforeToday.length < COUNT_BEFORE
      const needMoreAfter = afterToday.length < COUNT_AFTER

      if (!needMoreBefore && !needMoreAfter) break

      let extended = false

      if (needMoreBefore && this.hasMoreBefore) {
        const daysSearched = (today - this.searchedFrom) / 86400
        if (daysSearched >= MAX_SEARCH_DAYS) {
          this.hasMoreBefore = false
        } else {
          this.searchedFrom = (this.searchedFrom - SEARCH_STEP_DAYS * 86400) as timestamp
          extended = true
        }
      }

      if (needMoreAfter && this.hasMoreAfter) {
        const daysSearched = (this.searchedTo - today) / 86400
        if (daysSearched >= MAX_SEARCH_DAYS) {
          this.hasMoreAfter = false
        } else {
          this.searchedTo = (this.searchedTo + SEARCH_STEP_DAYS * 86400) as timestamp
          extended = true
        }
      }

      if (!extended) break

      // Re-collect with extended range
      allResults = this.collectAllMatchingEvents()
    }

    // Sort all results
    allResults.sort((a, b) => a.timestamp - b.timestamp)

    // Determine which results to keep
    const beforeToday = allResults.filter(r => r.timestamp < today)
    const afterToday = allResults.filter(r => r.timestamp >= today)

    // Take COUNT_BEFORE from before (most recent) and COUNT_AFTER from after
    const selectedBefore = beforeToday.slice(-COUNT_BEFORE)
    const selectedAfter = afterToday.slice(0, COUNT_AFTER)

    this.results = [...selectedBefore, ...selectedAfter]

    if (this.results.length > 0) {
      // Set index to first event on or after today, or last before today
      const todayIndex = this.results.findIndex(r => r.timestamp >= today)
      this.currentIndex = todayIndex >= 0 ? todayIndex : Math.max(0, this.results.length - 1)
    }
  }

  /** Collect all matching events within current search range */
  private collectAllMatchingEvents(): SearchResult[] {
    const results: SearchResult[] = []
    const addedKeys = new Set<string>()

    // Search in planned single events
    this.eventsStore.planned.forEach(event => {
      if (event.start >= this.searchedFrom && event.start < this.searchedTo) {
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
      }
    })

    // Search in repeatable events
    this.eventsStore.plannedRepeatable.forEach(event => {
      if (this.matchesQuery(event.name) || this.matchesQuery(event.comment)) {
        const occurrences = this.getOccurrencesInRange(event, this.searchedFrom, this.searchedTo)
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

    // Search in completed events
    this.eventsStore.completed.forEach(event => {
      if (event.start >= this.searchedFrom && event.start < this.searchedTo) {
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
      }
    })

    return results
  }

  /** Get occurrences of repeatable event in range */
  private getOccurrencesInRange(
    event: RepeatableEventModel,
    from: timestamp,
    to: timestamp
  ): timestamp[] {
    const occurrences: timestamp[] = []

    const schedule = ZCron.parse(event.repeat)
    if (schedule.mode === 'empty') {
      if (event.start >= from && event.start < to) {
        occurrences.push(event.start)
      }
      return occurrences
    }

    // Use ZCron.nextAfter for efficient iteration
    const searchStart = Math.max(event.start, from)
    const beforeFrom = DateTime.getBeginDayTimestamp(searchStart) - 86400

    let current = ZCron.nextAfter(schedule, event.start, beforeFrom as timestamp)

    const maxIterations = 200
    let iterations = 0

    while (current !== null && current < to && iterations < maxIterations) {
      iterations++

      // Check if event has ended
      if (event.end && current >= event.end) {
        break
      }

      occurrences.push(current)
      current = ZCron.nextAfter(schedule, event.start, current)
    }

    return occurrences
  }

  /** Check if text matches query */
  private matchesQuery(text: string | undefined): boolean {
    if (!text) return false
    return text.toLowerCase().includes(this.query)
  }

  /** Navigate to next result with lazy loading */
  nextResult() {
    if (this.results.length === 0) return

    // Check if we need to load more results
    if (this.currentIndex >= this.results.length - 2) {
      this.loadMoreAfter()
    }

    if (this.currentIndex < this.results.length - 1) {
      this.currentIndex++
    }
  }

  /** Navigate to previous result with lazy loading */
  prevResult() {
    if (this.results.length === 0) return

    // Check if we need to load more results
    if (this.currentIndex <= 1) {
      this.loadMoreBefore()
    }

    if (this.currentIndex > 0) {
      this.currentIndex--
    }
  }

  /** Load more results in the future */
  private loadMoreAfter() {
    if (!this.hasMoreAfter || !this.query) return

    const today = DateTime.getBeginDayTimestamp(Date.now() / 1000)
    const daysSearched = (this.searchedTo - today) / 86400

    if (daysSearched >= MAX_SEARCH_DAYS) {
      this.hasMoreAfter = false
      return
    }

    // Extend search range
    const prevTo = this.searchedTo
    this.searchedTo = (this.searchedTo + SEARCH_STEP_DAYS * 86400) as timestamp

    // Collect new results only from extended range
    const newResults = this.collectMatchingEventsInRange(prevTo, this.searchedTo)

    if (newResults.length === 0) {
      // Continue searching if nothing found
      this.loadMoreAfter()
      return
    }

    // Add new results and take COUNT_LOAD
    const sortedNew = newResults.sort((a, b) => a.timestamp - b.timestamp)
    const toAdd = sortedNew.slice(0, COUNT_LOAD)

    this.results = [...this.results, ...toAdd].sort((a, b) => a.timestamp - b.timestamp)
  }

  /** Load more results in the past */
  private loadMoreBefore() {
    if (!this.hasMoreBefore || !this.query) return

    const today = DateTime.getBeginDayTimestamp(Date.now() / 1000)
    const daysSearched = (today - this.searchedFrom) / 86400

    if (daysSearched >= MAX_SEARCH_DAYS) {
      this.hasMoreBefore = false
      return
    }

    // Extend search range
    const prevFrom = this.searchedFrom
    this.searchedFrom = (this.searchedFrom - SEARCH_STEP_DAYS * 86400) as timestamp

    // Collect new results only from extended range
    const newResults = this.collectMatchingEventsInRange(this.searchedFrom, prevFrom)

    if (newResults.length === 0) {
      // Continue searching if nothing found
      this.loadMoreBefore()
      return
    }

    // Add new results and take COUNT_LOAD (most recent from the past)
    const sortedNew = newResults.sort((a, b) => a.timestamp - b.timestamp)
    const toAdd = sortedNew.slice(-COUNT_LOAD)

    // Insert at beginning and recalculate index
    const oldIndex = this.currentIndex
    this.results = [...toAdd, ...this.results].sort((a, b) => a.timestamp - b.timestamp)
    this.currentIndex = oldIndex + toAdd.length
  }

  /** Collect matching events within specific range */
  private collectMatchingEventsInRange(from: timestamp, to: timestamp): SearchResult[] {
    const results: SearchResult[] = []
    const addedKeys = new Set<string>()

    // Search in planned single events
    this.eventsStore.planned.forEach(event => {
      if (event.start >= from && event.start < to) {
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
      }
    })

    // Search in repeatable events
    this.eventsStore.plannedRepeatable.forEach(event => {
      if (this.matchesQuery(event.name) || this.matchesQuery(event.comment)) {
        const occurrences = this.getOccurrencesInRange(event, from, to)
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

    // Search in completed events
    this.eventsStore.completed.forEach(event => {
      if (event.start >= from && event.start < to) {
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
      }
    })

    return results
  }

  /** Get currently selected result */
  get currentResult(): SearchResult | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.results.length) return null
    return this.results[this.currentIndex]
  }

  /** Check if event is highlighted */
  isHighlighted(eventId: number, ts: timestamp): boolean {
    const current = this.currentResult
    return current !== null &&
           current.eventId === eventId &&
           current.timestamp === ts
  }

  /** Clear search */
  clear() {
    this.query = ''
    this.results = []
    this.currentIndex = -1
    this.isActive = false
    this.searchedFrom = 0 as timestamp
    this.searchedTo = 0 as timestamp
    this.hasMoreBefore = true
    this.hasMoreAfter = true
  }

  /** Toggle search active state */
  toggleActive() {
    this.isActive = !this.isActive
    if (!this.isActive) {
      this.clear()
    }
  }

  /** Get result count text */
  get resultText(): string {
    if (this.results.length === 0) return ''
    return `${this.currentIndex + 1} / ${this.results.length}`
  }
}
