import React, { useContext, useRef, useEffect, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { StoreContext } from 'src/1-app/Providers/StoreContext'
import { debounce } from 'src/7-shared/helpers/utils'
import styles from './EventSearch.module.css'

/** Задержка debounce при вводе (мс) */
const DEBOUNCE_MS = 300

export const EventSearchInput: React.FC = observer(() => {
  const { eventSearchStore, calendarStore, uiStore } = useContext(StoreContext)
  const inputRef = useRef<HTMLInputElement>(null)

  // Создаём debounced функцию поиска один раз при монтировании
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useMemo(
    () => debounce((query: string) => {
      eventSearchStore.search(query)
    }, DEBOUNCE_MS),
    []
  )

  // Очистка при unmount
  useEffect(() => {
    return () => debouncedSearch.cancel()
  }, [debouncedSearch])

  useEffect(() => {
    if (eventSearchStore.isActive && inputRef.current) {
      inputRef.current.focus()
    }
  }, [eventSearchStore.isActive])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Обновляем query немедленно для отображения в UI
    eventSearchStore.setQuery(value)
    // Выполняем поиск с debounce
    debouncedSearch(value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // При Enter выполняем поиск немедленно
      debouncedSearch.cancel()
      eventSearchStore.search(eventSearchStore.query)
      
      if (e.shiftKey) {
        eventSearchStore.prevResult()
      } else {
        eventSearchStore.nextResult()
      }
      navigateToCurrentResult()
    } else if (e.key === 'Escape') {
      debouncedSearch.cancel()
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

  const handleClose = () => {
    debouncedSearch.cancel()
    eventSearchStore.clear()
  }

  if (!eventSearchStore.isActive) {
    return (
      <button
        className={styles.searchToggle}
        onClick={() => eventSearchStore.toggleActive()}
        title="Поиск событий"
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
        placeholder="Поиск событий..."
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
        title="Предыдущее (Shift+Enter)"
      >
        ◀
      </button>
      <button
        className={styles.navButton}
        onClick={handleNextClick}
        disabled={eventSearchStore.results.length === 0}
        title="Следующее (Enter)"
      >
        ▶
      </button>
      <button
        className={styles.closeButton}
        onClick={handleClose}
        title="Закрыть (Esc)"
      >
        ✕
      </button>
    </div>
  )
})
