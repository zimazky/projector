# Анализ и предложения по реализации поиска событий в календаре

## Постановка задачи

Необходимо реализовать поиск по событиям в календаре со следующими требованиями:
- Компонент поиска встроен в Header
- Подсветка найденных событий в календаре
- Навигация к следующему и предыдущему совпадению

## Анализ текущей архитектуры

### Структура данных событий

События хранятся в нескольких уровнях:

1. **EventsStore** (`src/6-entities/Events/EventsStore.ts`) — основное хранилище событий
   - `completed: SingleEventModel[]` — завершённые события
   - `planned: SingleEventModel[]` — запланированные одиночные события
   - `plannedRepeatable: RepeatableEventModel[]` — повторяемые события

2. **EventsCache** (`src/6-entities/EventsCache/EventsCache.ts`) — кэш для быстрого рендеринга
   - Хэш-таблица по временным меткам `cachedEvents[date]`
   - Метод `getEvents(date)` возвращает события за день

3. **EventCacheStructure** (`src/6-entities/EventsCache/EventCacheStructure.ts`) — компактная структура для рендеринга
   ```typescript
   type EventCacheStructure = {
     id: number
     name: string
     background: string
     color: string
     start: timestamp
     time: number | null
     end: timestamp
     days: number
     credit: number
     debit: number
     completed: boolean
     repeatable: boolean
   }
   ```

### Рендеринг событий

Компонент **CalendarEventItem** (`src/3-pages/Calendar/CalendarEventItem.tsx`) отображает отдельное событие:
- Использует CSS-классы: `.item`, `.completed`, `.repeatable`
- Получает данные через props из родительского компонента
- Идентификатор события: `event.id`

Компонент **Calendar** (`src/3-pages/Calendar/Calendar.tsx`):
- Генерирует структуру недель через `calendarStore.getCalendarDataStructure()`
- Рендерит недели с атрибутом `data-week-timestamp`
- Использует `scrollIntoView` для навигации

### Управление состоянием

**UIStore** (`src/1-app/Stores/UIStore.ts`) — управление состоянием UI:
- `viewMode` — режим отображения
- `mustForceUpdate` — триггер принудительного обновления
- `forceUpdate()` — метод обновления

**StoreContext** — контекст для доступа к сторам из компонентов.

### Архитектура FSD в проекте

| Слой | Назначение | Примеры |
|------|------------|---------|
| `1-app` | Инициализация приложения, провайдеры | MainStore, UIStore |
| `3-pages` | Страницы, компоновка виджетов | Calendar, DayList, Projects |
| `4-widgets` | Составные компоненты | Header, EventForm, SaveToDrive |
| `5-features` | Пользовательские взаимодействия | Weather, DriveFileList |
| `6-entities` | Бизнес-сущности | Events, EventsCache, Document |
| `7-shared` | Переиспользуемые компоненты | ui/, services/, libs/ |

## Предложения по реализации

### Вариант 1: Поиск в слое features (рекомендуемый)

Согласно FSD, features — это слой пользовательских взаимодействий. Поиск событий — это типичная feature.

#### Структура файлов

```
src/
├── 5-features/
│   └── EventSearch/
│       ├── EventSearchStore.ts        # Стор состояния поиска
│       ├── EventSearchInput.tsx       # Компонент поля ввода
│       ├── EventSearchNavigation.tsx  # Кнопки навигации
│       └── EventSearch.module.css     # Стили
├── 4-widgets/
│   └── Header/
│       └── Header.tsx                 # Интеграция компонента поиска
├── 3-pages/
│   └── Calendar/
│       └── CalendarEventItem.tsx      # Подсветка найденных событий
```

#### EventSearchStore

```typescript
// src/5-features/EventSearch/EventSearchStore.ts
import { makeAutoObservable } from 'mobx'
import { EventsStore } from 'src/6-entities/Events/EventsStore'
import { EventCacheStructure } from 'src/6-entities/EventsCache/EventCacheStructure'

export interface SearchResult {
  eventId: number
  timestamp: number      // Дата события для навигации
  name: string
  matchedText: string    // Подстрока совпадения
}

export class EventSearchStore {
  /** Поисковый запрос */
  query: string = ''
  /** Результаты поиска */
  results: SearchResult[] = []
  /** Индекс текущего выбранного результата */
  currentIndex: number = -1
  /** Признак активности поиска */
  isActive: boolean = false

  private eventsStore: EventsStore

  constructor(eventsStore: EventsStore) {
    this.eventsStore = eventsStore
    makeAutoObservable(this)
  }

  /** Выполнить поиск */
  search(query: string) {
    this.query = query.trim().toLowerCase()
    this.currentIndex = -1
    
    if (!this.query) {
      this.results = []
      return
    }

    this.results = this.performSearch()
    if (this.results.length > 0) {
      this.currentIndex = 0
    }
  }

  /** Внутренний метод поиска по всем событиям */
  private performSearch(): SearchResult[] {
    const results: SearchResult[] = []
    const addedIds = new Set<string>() // Для избежания дубликатов

    // Поиск по запланированным событиям
    this.eventsStore.planned.forEach(event => {
      if (this.matchesQuery(event.name) || this.matchesQuery(event.comment)) {
        const key = `${event.id}-${event.start}`
        if (!addedIds.has(key)) {
          results.push({
            eventId: event.id,
            timestamp: event.start,
            name: event.name,
            matchedText: this.getMatchedText(event.name)
          })
          addedIds.add(key)
        }
      }
    })

    // Поиск по повторяемым событиям (генерируем вхождения)
    this.eventsStore.plannedRepeatable.forEach(event => {
      if (this.matchesQuery(event.name) || this.matchesQuery(event.comment)) {
        // Для повторяемых событий добавляем ближайшие вхождения
        const occurrences = this.getUpcomingOccurrences(event, 10)
        occurrences.forEach(timestamp => {
          const key = `${event.id}-${timestamp}`
          if (!addedIds.has(key)) {
            results.push({
              eventId: event.id,
              timestamp: timestamp,
              name: event.name,
              matchedText: this.getMatchedText(event.name)
            })
            addedIds.add(key)
          }
        })
      }
    })

    // Поиск по завершённым событиям
    this.eventsStore.completed.forEach(event => {
      if (this.matchesQuery(event.name) || this.matchesQuery(event.comment)) {
        const key = `${event.id}-${event.start}`
        if (!addedIds.has(key)) {
          results.push({
            eventId: event.id,
            timestamp: event.start,
            name: event.name,
            matchedText: this.getMatchedText(event.name)
          })
          addedIds.add(key)
        }
      }
    })

    // Сортировка по дате
    return results.sort((a, b) => a.timestamp - b.timestamp)
  }

  private matchesQuery(text: string): boolean {
    return text?.toLowerCase().includes(this.query) ?? false
  }

  private getMatchedText(text: string): string {
    return text
  }

  private getUpcomingOccurrences(event: RepeatableEventModel, limit: number): number[] {
    // Заглушка - нужна интеграция с ZCron для генерации вхождений
    return [event.start]
  }

  /** Перейти к следующему результату */
  nextResult() {
    if (this.results.length === 0) return
    this.currentIndex = (this.currentIndex + 1) % this.results.length
  }

  /** Перейти к предыдущему результату */
  prevResult() {
    if (this.results.length === 0) return
    this.currentIndex = this.currentIndex === 0 
      ? this.results.length - 1 
      : this.currentIndex - 1
  }

  /** Получить текущий выбранный результат */
  get currentResult(): SearchResult | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.results.length) return null
    return this.results[this.currentIndex]
  }

  /** Проверить, подсвечено ли событие */
  isHighlighted(eventId: number, timestamp: number): boolean {
    const current = this.currentResult
    return current !== null && current.eventId === eventId && current.timestamp === timestamp
  }

  /** Очистить поиск */
  clear() {
    this.query = ''
    this.results = []
    this.currentIndex = -1
    this.isActive = false
  }

  /** Открыть/закрыть поиск */
  toggleActive() {
    this.isActive = !this.isActive
    if (!this.isActive) {
      this.clear()
    }
  }
}
```

#### Компонент EventSearchInput

```typescript
// src/5-features/EventSearch/EventSearchInput.tsx
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
          {eventSearchStore.currentIndex + 1} / {eventSearchStore.results.length}
        </span>
      )}
      <button 
        className={styles.navButton}
        onClick={() => { eventSearchStore.prevResult(); navigateToCurrentResult(); }}
        disabled={eventSearchStore.results.length === 0}
      >
        ◀
      </button>
      <button 
        className={styles.navButton}
        onClick={() => { eventSearchStore.nextResult(); navigateToCurrentResult(); }}
        disabled={eventSearchStore.results.length === 0}
      >
        ▶
      </button>
      <button 
        className={styles.closeButton}
        onClick={() => eventSearchStore.clear()}
      >
        ✕
      </button>
    </div>
  )
})
```

#### Модификация CalendarEventItem

```typescript
// В CalendarEventItem.tsx добавить подсветку
const CalendarEventItem: React.FC<CalendarEventItemProps> = (props) => {
  const { eventFormStore, eventsStore, eventSearchStore } = useContext(StoreContext)
  const { id, name, completed, background, color, ... } = props.event
  
  // Проверка подсветки
  const isHighlighted = eventSearchStore.isHighlighted(id, props.timestamp)
  
  return (
    <div 
      className={`
        ${completed ? styles.completed : repeatable ? styles.repeatable : styles.item}
        ${isHighlighted ? styles.highlighted : ''}
      `}
      // ... rest props
    >
      {/* ... content */}
    </div>
  )
}
```

#### CSS для подсветки

```css
/* EventSearch.module.css или CalendarEventItem.module.css */
.highlighted {
  outline: 3px solid #ff9800;
  outline-offset: -1px;
  box-shadow: 0 0 8px 2px rgba(255, 152, 0, 0.6);
  z-index: 10;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 8px 2px rgba(255, 152, 0, 0.6); }
  50% { box-shadow: 0 0 12px 4px rgba(255, 152, 0, 0.8); }
}
```

#### Интеграция в Header

```typescript
// Header.tsx
import { EventSearchInput } from 'src/5-features/EventSearch/EventSearchInput'

const Header: React.FC = observer(function() {
  return (
    <header className={styles.header}>
      <CalendarIconBar/>
      <EventSearchInput />  {/* <-- Добавить компонент поиска */}
      <span className={styles.documentName}>
        {documentTitle}
      </span>
      {/* ... rest */}
    </header>
  )
})
```

### Вариант 2: Вынесение логики поиска в entity

Если поиск должен быть доступен из разных мест приложения, логику можно вынести в слой entities:

```
src/
├── 6-entities/
│   └── EventSearch/
│       └── EventSearchEngine.ts   # Алгоритм поиска
├── 5-features/
│   └── EventSearch/
│       └── EventSearchStore.ts    # UI-состояние поиска
```

**Преимущества:**
- Переиспользование логики поиска
- Чистое разделение ответственности

**Недостатки:**
- Усложнение архитектуры для простой функции

### Вариант 3: Расширение EventsCache

Добавить методы поиска в EventsCache:

```typescript
// В EventsCache.ts
searchEvents(query: string): SearchResult[] {
  // Поиск по кэшированным данным
}
```

**Преимущества:**
- Использование существующего кэша
- Высокая производительность

**Недостатки:**
- Кэш не содержит все данные (только отображаемые недели)
- Нарушение SRP (EventsCache отвечает за кэширование, не за поиск)

## Рекомендуемый подход

**Рекомендуется Вариант 1** — реализация поиска как feature.

### Обоснование:

1. **Соответствие FSD:** Features — это слой пользовательских взаимодействий, поиск — типичное взаимодействие.

2. **Инкапсуляция:** Весь код поиска собран в одном месте, легко поддерживать.

3. **Расширяемость:** Легко добавить новые поля для поиска (комментарии, проекты, суммы).

4. **Тестируемость:** Изолированный стор легко тестировать.

### План реализации

1. **Создать EventSearchStore** в `src/5-features/EventSearch/`
2. **Добавить стор в StoreContext** и MainStore
3. **Создать UI-компоненты** (EventSearchInput, навигация)
4. **Интегрировать в Header**
5. **Модифицировать CalendarEventItem** для подсветки
6. **Добавить CSS** для стилизации подсветки
7. **Протестировать** сценарии использования

### Дополнительные улучшения

1. **Горячие клавиши:** Ctrl+F для открытия поиска
2. **История поиска:** Сохранение последних запросов
3. **Фильтры:** Поиск по проектам, датам, статусу завершения
4. **Подсветка текста:** Выделение совпадающей подстроки в названии события

## Проблема повторяемых событий

### Суть проблемы

Повторяемые события (RepeatableEventModel) имеют расписание, заданное ZCron-выражением, и теоретически могут иметь бесконечное количество вхождений. При попытке найти "все совпадения":

1. **Невозможно перебрать все вхождения** — их количество не ограничено
2. **Вычислительная сложность** — генерация вхождений на годы вперёд затратна
3. **Бесполезные результаты** — пользователю не нужны события через 10 лет

### Почему поиск по временному окну не подходит

Первоначальная идея искать в окне ±10 дней имеет критический недостаток:

```
Сценарий проблемы:
─────────────────────────────────────────────────────────────► время
     сегодня
        ▼
  ┌─────────┐                              ┌─────────────────┐
  │ Пусто   │    ... 3 месяца без событий  │ Совпадение тут! │
  └─────────┘                              └─────────────────┘
        │                                          │
        └── окно ±10 дней ──┘                      └── событие вне окна
```

**Результат:** Пользователь не узнает о существовании совпадения, даже если оно есть.

### Решение: Ленивый инкрементальный поиск по количеству событий

Вместо временного окна ищем фиксированное количество ближайших событий.

#### Принцип работы

```
Начальное состояние:
─────────────────────────────────────────────────────────────► время
                              сегодня
                                 ▼
  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
  │ #1   │ │ #2   │ │ #3   │ │ #4   │ │ #5   │ │ #6   │ │ #7   │ │ #8   │
  │ -60д │ │ -45д │ │ -30д │ │ -15д │ │ +20д │ │ +40д │ │ +55д │ │ +70д │
  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘
     ▲        ▲        ▲        ▲                    ▲        ▲        ▲
     └────────┴────────┴────────┘                    └────────┴────────┘
           4 события назад                              4 события вперёд
           
Всего найдено: 8 событий (COUNT_BEFORE + COUNT_AFTER)

При навигации вперёд (когда currentIndex приближается к концу):
─────────────────────────────────────────────────────────────► время
                                                              ▼
  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
  │ ...  │ │ ...  │ │ ...  │ │ ...  │ │ #5   │ │ #6   │ │ #7   │ │ #8   │ │ #9   │
  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘
                                                              ▲        ▲        ▲
                                                              └────────┴────────┘
                                                              Дозагрузка +4 события
```

#### Алгоритм

1. **Начальный поиск:**
   - Найти `COUNT_BEFORE` (например, 4) событий до текущей даты
   - Найти `COUNT_AFTER` (например, 4) событий после текущей даты
   - Результаты сортируются по дате
   - `currentIndex` указывает на ближайшее к текущей дате событие

2. **Навигация вперёд:**
   - Если `currentIndex >= results.length - THRESHOLD` (близко к концу)
   - Найти следующие `COUNT_LOAD` событий после последнего найденного
   - Добавить в конец `results`

3. **Навигация назад:**
   - Если `currentIndex <= THRESHOLD` (близко к началу)
   - Найти предыдущие `COUNT_LOAD` событий до первого найденного
   - Добавить в начало `results`, пересчитать `currentIndex`

#### Обновлённый EventSearchStore

```typescript
// src/5-features/EventSearch/EventSearchStore.ts
import { makeAutoObservable } from 'mobx'
import { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import ZCron from 'src/7-shared/libs/ZCron/ZCron'
import { EventsStore } from 'src/6-entities/Events/EventsStore'
import { RepeatableEventModel } from 'src/6-entities/Events/EventModel'

export interface SearchResult {
  eventId: number
  timestamp: number      // Дата события для навигации
  name: string
  completed: boolean
  repeatable: boolean
}

/** Размер окна поиска в днях */
const SEARCH_WINDOW_DAYS = 10
/** Порог для дозагрузки (сколько результатов до границы) */
const LOAD_THRESHOLD = 2

export class EventSearchStore {
  /** Поисковый запрос */
  query: string = ''
  /** Результаты поиска (отсортированы по дате) */
  results: SearchResult[] = []
  /** Индекс текущего выбранного результата */
  currentIndex: number = -1
  /** Признак активности поиска */
  isActive: boolean = false
  
  /** Границы поиска (unix timestamp) */
  private searchFrom: timestamp = 0
  private searchTo: timestamp = 0
  
  /** Флаги достижения границ */
  hasMoreBefore: boolean = true
  hasMoreAfter: boolean = true

  private eventsStore: EventsStore

  constructor(eventsStore: EventsStore) {
    this.eventsStore = eventsStore
    makeAutoObservable(this)
  }

  /** Выполнить начальный поиск */
  search(query: string) {
    this.query = query.trim().toLowerCase()
    this.currentIndex = -1
    this.results = []
    
    if (!this.query) {
      this.hasMoreBefore = false
      this.hasMoreAfter = false
      return
    }

    // Устанавливаем начальные границы поиска
    const today = DateTime.getBeginDayTimestamp(Date.now() / 1000)
    this.searchFrom = today - SEARCH_WINDOW_DAYS * 86400
    this.searchTo = today + SEARCH_WINDOW_DAYS * 86400
    
    // Предполагаем, что есть результаты за пределами окна
    this.hasMoreBefore = true
    this.hasMoreAfter = true

    this.results = this.performSearch(this.searchFrom, this.searchTo)
    
    if (this.results.length > 0) {
      // Находим ближайший результат к текущей дате
      const todayIndex = this.results.findIndex(r => r.timestamp >= today)
      this.currentIndex = todayIndex >= 0 ? todayIndex : 0
    }
  }

  /** Поиск в заданном диапазоне дат */
  private performSearch(from: timestamp, to: timestamp): SearchResult[] {
    const results: SearchResult[] = []
    const addedKeys = new Set<string>()

    // Поиск по запланированным одиночным событиям
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

    // Поиск по повторяемым событиям (генерируем вхождения в диапазоне)
    this.eventsStore.plannedRepeatable.forEach(event => {
      if (this.matchesQuery(event.name) || this.matchesQuery(event.comment)) {
        const occurrences = this.getOccurrencesInRange(event, from, to)
        occurrences.forEach(timestamp => {
          const key = `r-${event.id}-${timestamp}`
          if (!addedKeys.has(key)) {
            results.push({
              eventId: event.id,
              timestamp: timestamp,
              name: event.name,
              completed: false,
              repeatable: true
            })
            addedKeys.add(key)
          }
        })
      }
    })

    // Поиск по завершённым событиям
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

    return results.sort((a, b) => a.timestamp - b.timestamp)
  }

  /** Получить вхождения повторяемого события в диапазоне */
  private getOccurrencesInRange(
    event: RepeatableEventModel, 
    from: timestamp, 
    to: timestamp
  ): timestamp[] {
    const occurrences: timestamp[] = []
    
    // Начинаем с max(event.start, from)
    let current = Math.max(event.start, from)
    
    // Ограничиваем количеством итераций для безопасности
    const maxIterations = 100
    let iterations = 0
    
    while (current < to && iterations < maxIterations) {
      iterations++
      
      // Проверяем, есть ли событие в эту дату
      if (ZCron.isMatch(event.repeat, event.start, current)) {
        // Проверяем, не закончилось ли событие
        if (!event.end || current < event.end) {
          occurrences.push(current)
        }
      }
      
      current += 86400 // Следующий день
    }
    
    return occurrences
  }

  /** Проверка совпадения с запросом */
  private matchesQuery(text: string | undefined): boolean {
    if (!text) return false
    return text.toLowerCase().includes(this.query)
  }

  /** Перейти к следующему результату с дозагрузкой */
  nextResult() {
    if (this.results.length === 0) return
    
    // Проверяем необходимость дозагрузки
    if (this.currentIndex >= this.results.length - LOAD_THRESHOLD) {
      this.loadMoreAfter()
    }
    
    if (this.currentIndex < this.results.length - 1) {
      this.currentIndex++
    }
  }

  /** Перейти к предыдущему результату с дозагрузкой */
  prevResult() {
    if (this.results.length === 0) return
    
    // Проверяем необходимость дозагрузки
    if (this.currentIndex <= LOAD_THRESHOLD) {
      this.loadMoreBefore()
    }
    
    if (this.currentIndex > 0) {
      this.currentIndex--
    }
  }

  /** Дозагрузка результатов в будущем */
  private loadMoreAfter() {
    if (!this.hasMoreAfter || !this.query) return
    
    const newFrom = this.searchTo
    const newTo = this.searchTo + SEARCH_WINDOW_DAYS * 86400
    
    const newResults = this.performSearch(newFrom, newTo)
    
    if (newResults.length === 0) {
      // Если ничего не найдено, расширяем окно ещё больше или ставим флаг
      this.hasMoreAfter = newTo - this.searchTo < 365 * 86400 // Ограничение в 1 год
      if (this.hasMoreAfter) {
        this.searchTo = newTo
        this.loadMoreAfter() // Рекурсивно ищем дальше
      }
      return
    }
    
    this.searchTo = newTo
    this.results = [...this.results, ...newResults].sort((a, b) => a.timestamp - b.timestamp)
  }

  /** Дозагрузка результатов в прошлом */
  private loadMoreBefore() {
    if (!this.hasMoreBefore || !this.query) return
    
    const newFrom = this.searchFrom - SEARCH_WINDOW_DAYS * 86400
    const newTo = this.searchFrom
    
    const newResults = this.performSearch(newFrom, newTo)
    
    if (newResults.length === 0) {
      this.hasMoreBefore = this.searchFrom - newFrom < 365 * 86400
      if (this.hasMoreBefore) {
        this.searchFrom = newFrom
        this.loadMoreBefore()
      }
      return
    }
    
    this.searchFrom = newFrom
    
    // Вставляем в начало и пересчитываем индекс
    const oldIndex = this.currentIndex
    this.results = [...newResults, ...this.results].sort((a, b) => a.timestamp - b.timestamp)
    this.currentIndex = oldIndex + newResults.length
  }

  /** Получить текущий выбранный результат */
  get currentResult(): SearchResult | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.results.length) return null
    return this.results[this.currentIndex]
  }

  /** Проверить, подсвечено ли событие */
  isHighlighted(eventId: number, timestamp: number): boolean {
    const current = this.currentResult
    return current !== null && 
           current.eventId === eventId && 
           current.timestamp === timestamp
  }

  /** Очистить поиск */
  clear() {
    this.query = ''
    this.results = []
    this.currentIndex = -1
    this.isActive = false
    this.searchFrom = 0
    this.searchTo = 0
    this.hasMoreBefore = true
    this.hasMoreAfter = true
  }

  /** Открыть/закрыть поиск */
  toggleActive() {
    this.isActive = !this.isActive
    if (!this.isActive) {
      this.clear()
    }
  }
}
```

#### Оптимизация поиска вхождений

Метод `getOccurrencesInRange` можно оптимизировать, используя возможности ZCron для прямого вычисления следующих вхождений:

```typescript
/** Оптимизированный поиск вхождений с использованием ZCron */
private getOccurrencesInRangeOptimized(
  event: RepeatableEventModel,
  from: timestamp,
  to: timestamp
): timestamp[] {
  const occurrences: timestamp[] = []
  
  // Начинаем с event.start или from, что больше
  let current = Math.max(event.start, from)
  
  // Если start раньше from, нужно найти первое вхождение >= from
  if (event.start < from) {
    // ZCron может иметь метод для поиска следующего вхождения
    // Например: ZCron.nextOccurrence(event.repeat, event.start, from)
    current = ZCron.nextOccurrence?.(event.repeat, event.start, from) ?? from
  }
  
  const maxIterations = 100
  let iterations = 0
  
  while (current < to && iterations < maxIterations) {
    iterations++
    
    if (!event.end || current < event.end) {
      occurrences.push(current)
    }
    
    // Получаем следующее вхождение напрямую
    current = ZCron.nextOccurrence?.(event.repeat, event.start, current + 86400) ?? current + 86400
  }
  
  return occurrences
}
```

### Преимущества инкрементального подхода

| Аспект | Преимущество |
|--------|--------------|
| **Производительность** | Начальный поиск быстрый, ограничен небольшим окном |
| **Память** | Не хранятся тысячи результатов для повторяемых событий |
| **UX** | Пользователь получает результаты мгновенно |
| **Масштабируемость** | Работает с любым количеством событий и повторений |

### План реализации (обновлённый)

| Шаг | Задача | Детали |
|-----|--------|--------|
| 1 | Создать EventSearchStore | С инкрементальной загрузкой |
| 2 | Добавить метод getOccurrencesInRange | Интеграция с ZCron |
| 3 | Добавить стор в StoreContext | Регистрация в MainStore |
| 4 | Создать EventSearchInput | UI с отображением счётчика |
| 5 | Интегрировать в Header | Размещение компонента |
| 6 | Модифицировать CalendarEventItem | Подсветка текущего результата |
| 7 | Добавить CSS | Стили подсветки и анимации |
| 8 | Тестирование | Проверка граничных случаев |

## Оценка трудозатрат (обновлённая)

| Задача | Время |
|--------|-------|
| EventSearchStore (инкрементальный) | 4-5 часов |
| Интеграция с ZCron | 2-3 часа |
| UI-компоненты | 2-3 часа |
| Интеграция в Header | 1 час |
| Подсветка в CalendarEventItem | 1-2 часа |
| Тестирование и отладка | 2-3 часа |
| **Итого** | **12-17 часов** |

## Итоговое резюме подхода

### Выбранный метод: Ленивый инкрементальный поиск по количеству событий

**Принцип:** Вместо поиска в фиксированном временном окне (которое может быть пустым), ищем фиксированное количество ближайших событий.

**Ключевые константы:**
- `COUNT_BEFORE = 4` — начальный поиск в прошлое
- `COUNT_AFTER = 4` — начальный поиск в будущее  
- `COUNT_LOAD = 4` — дозагрузка при навигации
- `MAX_SEARCH_DAYS = 365` — защита от бесконечного перебора

**Преимущества перед поиском по окну:**
1. **Гарантированный результат** — пользователь всегда видит N событий
2. **Работает при любой плотности** распределения событий
3. **Пользователь точно знает**, есть ли совпадения вообще
