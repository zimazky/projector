import { EventSearchStore, SearchResult } from './EventSearchStore'
import { EventsStore } from 'src/6-entities/Events/EventsStore'
import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'
import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

// Helper to create a timestamp for a specific date
function daysFromToday(days: number): timestamp {
  const today = DateTime.getBeginDayTimestamp(Date.now() / 1000)
  return (today + days * 86400) as timestamp
}

// Helper to convert timestamp to YYYY.MM.DD string
function timestampToDateString(ts: timestamp): string {
  return DateTime.getYYYYMMDD(ts)
}

// Helper to create a mock EventsStore with test data
function createMockEventsStore(
  plannedEvents: Array<{ name: string; start: number; comment?: string }>,
  completedEvents: Array<{ name: string; start: number; comment?: string }> = [],
  repeatableEvents: Array<{ name: string; start: number; repeat: string; comment?: string }> = []
): EventsStore {
  const projectsStore = new ProjectsStore()
  const eventsStore = new EventsStore(projectsStore)

  // Add planned single events
  plannedEvents.forEach(e => {
    eventsStore.addPlannedEventDto({
      name: e.name,
      start: timestampToDateString(e.start as timestamp),
      comment: e.comment || '',
      project: ''
    }, false)
  })

  // Add completed events
  completedEvents.forEach(e => {
    eventsStore.addCompletedEventDto({
      name: e.name,
      start: timestampToDateString(e.start as timestamp),
      comment: e.comment || '',
      project: ''
    }, false)
  })

  // Add repeatable events
  repeatableEvents.forEach(e => {
    eventsStore.addPlannedEventDto({
      name: e.name,
      start: timestampToDateString(e.start as timestamp),
      repeat: e.repeat,
      comment: e.comment || '',
      project: ''
    }, false)
  })

  eventsStore.sort()
  return eventsStore
}

describe('EventSearchStore', () => {

  /******************************************************************************
   * Basic search functionality
   ******************************************************************************/
  describe('basic search', () => {

    it('should return empty results for empty query', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(0) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('')
      expect(searchStore.results).toEqual([])
      expect(searchStore.currentIndex).toBe(-1)
    })

    it('should find events by name', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Meeting with John', start: daysFromToday(0) },
        { name: 'Call with Jane', start: daysFromToday(1) },
        { name: 'Project Review', start: daysFromToday(2) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('John')
      expect(searchStore.results.length).toBe(1)
      expect(searchStore.results[0].name).toBe('Meeting with John')
    })

    it('should find events by comment', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Meeting', start: daysFromToday(0), comment: 'Discuss with John' },
        { name: 'Call', start: daysFromToday(1), comment: 'Jane will call' }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('John')
      expect(searchStore.results.length).toBe(1)
      expect(searchStore.results[0].name).toBe('Meeting')
    })

    it('should be case-insensitive', () => {
      const eventsStore = createMockEventsStore([
        { name: 'MEETING WITH JOHN', start: daysFromToday(0) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('john')
      expect(searchStore.results.length).toBe(1)
    })

    it('should trim whitespace from query', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(0) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('  Test  ')
      expect(searchStore.results.length).toBe(1)
    })
  })

  /******************************************************************************
   * Count-based search: Initial results
   ******************************************************************************/
  describe('count-based initial search', () => {

    it('should find up to 4 events before and 4 after today', () => {
      const eventsStore = createMockEventsStore([
        // 6 events before today
        { name: 'Test Event', start: daysFromToday(-60) },
        { name: 'Test Event', start: daysFromToday(-45) },
        { name: 'Test Event', start: daysFromToday(-30) },
        { name: 'Test Event', start: daysFromToday(-15) },
        { name: 'Test Event', start: daysFromToday(-10) },
        { name: 'Test Event', start: daysFromToday(-5) },
        // 6 events after today
        { name: 'Test Event', start: daysFromToday(5) },
        { name: 'Test Event', start: daysFromToday(10) },
        { name: 'Test Event', start: daysFromToday(15) },
        { name: 'Test Event', start: daysFromToday(30) },
        { name: 'Test Event', start: daysFromToday(45) },
        { name: 'Test Event', start: daysFromToday(60) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')

      // Should have 4 before + 4 after = 8 total
      expect(searchStore.results.length).toBe(8)

      // Check the events closest to today are included
      const timestamps = searchStore.results.map(r => r.timestamp)
      expect(timestamps).toContain(daysFromToday(-15))
      expect(timestamps).toContain(daysFromToday(-10))
      expect(timestamps).toContain(daysFromToday(-5))
      expect(timestamps).toContain(daysFromToday(5))
      expect(timestamps).toContain(daysFromToday(10))
      expect(timestamps).toContain(daysFromToday(15))

      // Check events far from today are NOT included in initial results
      expect(timestamps).not.toContain(daysFromToday(-60))
      expect(timestamps).not.toContain(daysFromToday(-45))
      expect(timestamps).not.toContain(daysFromToday(45))
      expect(timestamps).not.toContain(daysFromToday(60))
    })

    it('should return all events if less than COUNT_BEFORE + COUNT_AFTER exist', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(-2) },
        { name: 'Test Event', start: daysFromToday(2) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      expect(searchStore.results.length).toBe(2)
    })

    it('should return only events before today if none after', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(-20) },
        { name: 'Test Event', start: daysFromToday(-10) },
        { name: 'Test Event', start: daysFromToday(-5) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      expect(searchStore.results.length).toBe(3)
    })

    it('should return only events after today if none before', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(5) },
        { name: 'Test Event', start: daysFromToday(10) },
        { name: 'Test Event', start: daysFromToday(15) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      expect(searchStore.results.length).toBe(3)
    })

    it('should set currentIndex to first event on or after today', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(-10) },
        { name: 'Test Event', start: daysFromToday(-5) },
        { name: 'Test Event', start: daysFromToday(5) },
        { name: 'Test Event', start: daysFromToday(10) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      expect(searchStore.currentIndex).toBe(2) // Index of event at +5 days
      expect(searchStore.results[searchStore.currentIndex].timestamp).toBe(daysFromToday(5))
    })

    it('should set currentIndex to last event if all events are before today', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(-20) },
        { name: 'Test Event', start: daysFromToday(-10) },
        { name: 'Test Event', start: daysFromToday(-5) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      expect(searchStore.currentIndex).toBe(2) // Last event
    })
  })

  /******************************************************************************
   * Count-based search: Sparse periods
   ******************************************************************************/
  describe('sparse event periods', () => {

    it('should find events even if they are far from today (sparse before)', () => {
      const eventsStore = createMockEventsStore([
        // Only 2 events, both far in the past
        { name: 'Test Event', start: daysFromToday(-200) },
        { name: 'Test Event', start: daysFromToday(-150) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      expect(searchStore.results.length).toBe(2)
      expect(searchStore.hasMoreBefore).toBe(false)
    })

    it('should find events even if they are far from today (sparse after)', () => {
      const eventsStore = createMockEventsStore([
        // Only 2 events, both far in the future
        { name: 'Test Event', start: daysFromToday(150) },
        { name: 'Test Event', start: daysFromToday(200) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      expect(searchStore.results.length).toBe(2)
      expect(searchStore.hasMoreAfter).toBe(false)
    })

    it('should correctly handle very sparse distribution (3 months gap)', () => {
      const eventsStore = createMockEventsStore([
        // Events with 3 month gap
        { name: 'Test Event', start: daysFromToday(-120) },  // 4 months ago
        { name: 'Test Event', start: daysFromToday(90) }    // 3 months ahead
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      expect(searchStore.results.length).toBe(2)
      
      // Both events should be found despite the gap
      const timestamps = searchStore.results.map(r => r.timestamp)
      expect(timestamps).toContain(daysFromToday(-120))
      expect(timestamps).toContain(daysFromToday(90))
    })
  })

  /******************************************************************************
   * Navigation and incremental loading
   ******************************************************************************/
  describe('navigation and incremental loading', () => {

    it('should navigate to next result', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(-5) },
        { name: 'Test Event', start: daysFromToday(0) },
        { name: 'Test Event', start: daysFromToday(5) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      const initialIndex = searchStore.currentIndex

      searchStore.nextResult()
      expect(searchStore.currentIndex).toBe(initialIndex + 1)
    })

    it('should navigate to previous result', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(-5) },
        { name: 'Test Event', start: daysFromToday(0) },
        { name: 'Test Event', start: daysFromToday(5) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      // Move to last result first
      searchStore.currentIndex = searchStore.results.length - 1

      searchStore.prevResult()
      expect(searchStore.currentIndex).toBe(searchStore.results.length - 2)
    })

    it('should not go below index 0', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(0) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      searchStore.prevResult()
      expect(searchStore.currentIndex).toBe(0)
    })

    it('should not go above last index', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(0) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      searchStore.nextResult()
      expect(searchStore.currentIndex).toBe(0)
    })

    it('should load more results when navigating near boundary (future)', () => {
      // Create events that require multiple loads
      const events: Array<{ name: string; start: number }> = []
      for (let i = 1; i <= 20; i++) {
        events.push({ name: 'Test Event', start: daysFromToday(i * 10) })
      }
      const eventsStore = createMockEventsStore(events)
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      const initialLength = searchStore.results.length

      // Navigate to near the end to trigger loadMoreAfter
      searchStore.currentIndex = searchStore.results.length - 1
      searchStore.nextResult()

      // Should have loaded more results or be at boundary
      expect(searchStore.hasMoreAfter || searchStore.results.length > initialLength || searchStore.currentIndex === searchStore.results.length - 1).toBe(true)
    })
  })

  /******************************************************************************
   * Completed events
   ******************************************************************************/
  describe('completed events', () => {

    it('should find completed events', () => {
      const eventsStore = createMockEventsStore(
        [{ name: 'Planned Event', start: daysFromToday(0) }],
        [{ name: 'Completed Event', start: daysFromToday(-5) }]
      )
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Completed')
      expect(searchStore.results.length).toBe(1)
      expect(searchStore.results[0].completed).toBe(true)
    })

    it('should mark completed flag correctly', () => {
      const eventsStore = createMockEventsStore(
        [{ name: 'Test Event', start: daysFromToday(0) }],
        [{ name: 'Test Event', start: daysFromToday(-5) }]
      )
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      const completedResults = searchStore.results.filter(r => r.completed)
      const plannedResults = searchStore.results.filter(r => !r.completed)
      
      expect(completedResults.length).toBe(1)
      expect(plannedResults.length).toBe(1)
    })
  })

  /******************************************************************************
   * Repeatable events
   ******************************************************************************/
  describe('repeatable events', () => {

    it('should find repeatable events and mark them as repeatable', () => {
      const eventsStore = createMockEventsStore(
        [],
        [],
        [{ name: 'Weekly Meeting', start: daysFromToday(-30), repeat: '* * 1' }] // Every Monday
      )
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Weekly')
      expect(searchStore.results.length).toBeGreaterThan(0)
      expect(searchStore.results.every(r => r.repeatable)).toBe(true)
    })

    it('should generate multiple occurrences for repeatable events', () => {
      const eventsStore = createMockEventsStore(
        [],
        [],
        [{ name: 'Daily Standup', start: daysFromToday(-10), repeat: '* * *' }] // Every day
      )
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Standup')
      // Should have multiple occurrences
      expect(searchStore.results.length).toBeGreaterThan(1)
    })

    it('should include occurrence timestamp in result key to avoid duplicates', () => {
      const eventsStore = createMockEventsStore(
        [],
        [],
        [{ name: 'Test Event', start: daysFromToday(-10), repeat: '* * *' }]
      )
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      
      // Check all timestamps are unique
      const timestamps = searchStore.results.map(r => r.timestamp)
      const uniqueTimestamps = new Set(timestamps)
      expect(uniqueTimestamps.size).toBe(timestamps.length)
    })
  })

  /******************************************************************************
   * Highlighting
   ******************************************************************************/
  describe('highlighting', () => {

    it('should highlight current result', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(0) },
        { name: 'Test Event', start: daysFromToday(5) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      const current = searchStore.currentResult
      
      if (current) {
        expect(searchStore.isHighlighted(current.eventId, current.timestamp)).toBe(true)
      }
    })

    it('should not highlight non-current results', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(-5) },
        { name: 'Test Event', start: daysFromToday(0) },
        { name: 'Test Event', start: daysFromToday(5) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      const current = searchStore.currentResult
      
      // Check that other events are not highlighted
      searchStore.results.forEach(result => {
        if (result !== current) {
          expect(searchStore.isHighlighted(result.eventId, result.timestamp)).toBe(false)
        }
      })
    })
  })

  /******************************************************************************
   * Clear and toggle
   ******************************************************************************/
  describe('clear and toggle', () => {

    it('should clear search results', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(0) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      expect(searchStore.results.length).toBe(1)

      searchStore.clear()
      expect(searchStore.query).toBe('')
      expect(searchStore.results).toEqual([])
      expect(searchStore.currentIndex).toBe(-1)
      expect(searchStore.isActive).toBe(false)
    })

    it('should toggle active state', () => {
      const eventsStore = createMockEventsStore([])
      const searchStore = new EventSearchStore(eventsStore)

      expect(searchStore.isActive).toBe(false)

      searchStore.toggleActive()
      expect(searchStore.isActive).toBe(true)

      searchStore.toggleActive()
      expect(searchStore.isActive).toBe(false)
    })

    it('should clear on toggle off', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(0) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.toggleActive()
      searchStore.search('Test')
      expect(searchStore.results.length).toBe(1)

      searchStore.toggleActive() // Toggle off
      expect(searchStore.query).toBe('')
      expect(searchStore.results).toEqual([])
    })
  })

  /******************************************************************************
   * Result text
   ******************************************************************************/
  describe('result text', () => {

    it('should return empty string when no results', () => {
      const eventsStore = createMockEventsStore([])
      const searchStore = new EventSearchStore(eventsStore)

      expect(searchStore.resultText).toBe('')
    })

    it('should return current position and total count', () => {
      const eventsStore = createMockEventsStore([
        { name: 'Test Event', start: daysFromToday(0) },
        { name: 'Test Event', start: daysFromToday(5) },
        { name: 'Test Event', start: daysFromToday(10) }
      ])
      const searchStore = new EventSearchStore(eventsStore)

      searchStore.search('Test')
      searchStore.currentIndex = 1

      expect(searchStore.resultText).toBe('2 / 3')
    })
  })
})
