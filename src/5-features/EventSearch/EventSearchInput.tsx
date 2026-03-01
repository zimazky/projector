import React, { useContext, useRef, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { StoreContext } from 'src/1-app/Providers/StoreContext'
import styles from './EventSearch.module.css'

export const EventSearchInput: React.FC = observer(() => {
  const { eventSearchStore, calendarStore, uiStore } = useContext(StoreContext)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (eventSearchStore.isActive && inputRef.current) {
      inputRef.current.focus()
    }
  }, [eventSearchStore.isActive])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    eventSearchStore.search(e.target.value)
    navigateToCurrentResult()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        eventSearchStore.prevResult()
      } else {
        eventSearchStore.nextResult()
      }
      navigateToCurrentResult()
    } else if (e.key === 'Escape') {
      eventSearchStore.clear()
    }
  }

  const navigateToCurrentResult = () => {
    const current = eventSearchStore.currentResult
    if (current) {
      calendarStore.setWeek(current.timestamp)
      uiStore.forceUpdate()
    }
  }

  const handlePrevClick = () => {
    eventSearchStore.prevResult()
    navigateToCurrentResult()
  }

  const handleNextClick = () => {
    eventSearchStore.nextResult()
    navigateToCurrentResult()
  }

  if (!eventSearchStore.isActive) {
    return (
      <button
        className={styles.searchToggle}
        onClick={() => eventSearchStore.toggleActive()}
        title="Search events"
      >
        🔍
      </button>
    )
  }

  return (
    <div className={styles.searchContainer}>
      <input
        ref={inputRef}
        type="text"
        className={styles.searchInput}
        placeholder="Search events..."
        value={eventSearchStore.query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {eventSearchStore.results.length > 0 && (
        <span className={styles.resultCount}>
          {eventSearchStore.resultText}
        </span>
      )}
      <button
        className={styles.navButton}
        onClick={handlePrevClick}
        disabled={eventSearchStore.results.length === 0}
        title="Previous (Shift+Enter)"
      >
        ◀
      </button>
      <button
        className={styles.navButton}
        onClick={handleNextClick}
        disabled={eventSearchStore.results.length === 0}
        title="Next (Enter)"
      >
        ▶
      </button>
      <button
        className={styles.closeButton}
        onClick={() => eventSearchStore.clear()}
        title="Close (Esc)"
      >
        ✕
      </button>
    </div>
  )
})
