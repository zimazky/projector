# Анализ кода EventSearchStore

## Обзор

Документ содержит анализ реализации поиска событий в файле `src/5-features/EventSearch/EventSearchStore.ts` с рекомендациями по улучшению и оптимизации.

---

## Положительные аспекты

### 1. Архитектура и структура

- **Соответствие FSD**: Store правильно размещён в слое `5-features`, что соответствует назначению слоя (пользовательские взаимодействия)
- **Инкапсуляция**: Вся логика поиска сосредоточена в одном классе
- **Чистый интерфейс**: `SearchResult` чётко определяет структуру результата поиска

### 2. Observable state

```typescript
constructor(eventsStore: EventsStore) {
  this.eventsStore = eventsStore
  makeAutoObservable(this)
}
```

Корректное использование MobX с `makeAutoObservable` для реактивности.

### 3. Защитные механизмы

```typescript
const MAX_OCCURRENCE_ITERATIONS = 500
```

Защита от бесконечного цикла при генерации вхождений повторяемых событий.

### 4. Ленивая загрузка

Реализована инкрементальная загрузка результатов через `loadMoreAfter()` и `loadMoreBefore()`, что позволяет не загружать все события сразу.

---

## Проблемы и рекомендации

### 1. Критическая проблема: Неэффективность `collectAllMatchingEvents()`

#### Проблема

Метод `collectAllMatchingEvents()` вызывается многократно:

- При начальном поиске (`search`)
- При каждой дозагрузке (`loadMoreAfter`, `loadMoreBefore`)

Каждый вызов:
1. Перебирает ВСЕ события в `eventsStore`
2. Генерирует ВСЕ вхождения повторяемых событий (до 500 штук на каждое)
3. Сортирует полный список

```typescript
// В loadMoreAfter():
const allResults = this.collectAllMatchingEvents()  // ← Полный перебор!
const newResults = allResults.filter(r => r.timestamp > this.latestFound)
```

#### Решение

Кэшировать результаты поиска и использовать инкрементальный подход:

```typescript
export class EventSearchStore {
  /** Кэш всех найденных результатов */
  private allMatchingEvents: SearchResult[] | null = null

  search(query: string) {
    this.query = query.trim().toLowerCase()
    this.currentIndex = -1
    this.results = []
    this.allMatchingEvents = null  // Сброс кэша

    if (!this.query) {
      this.hasMoreBefore = false
      this.hasMoreAfter = false
      return
    }

    // Первичный сбор всех результатов (один раз!)
    this.allMatchingEvents = this.collectAllMatchingEvents()
    
    // ... остальная логика
  }

  private loadMoreAfter() {
    if (!this.hasMoreAfter || !this.query || !this.allMatchingEvents) return

    // Используем кэш вместо повторного сбора
    const newResults = this.allMatchingEvents.filter(r => r.timestamp > this.latestFound)
    // ...
  }
}
```

### 2. Проблема: Неоптимальная генерация вхождений

#### Проблема

Метод `getOccurrences()` всегда начинает с `event.start`, даже если нужно найти вхождения после определённой даты:

```typescript
private getOccurrences(event: RepeatableEventModel): timestamp[] {
  let current: timestamp | null = event.start  // ← Всегда с начала!
  let iterations = 0

  while (current !== null && iterations < MAX_OCCURRENCE_ITERATIONS) {
    // ...
    current = ZCron.nextAfter(schedule, event.start, current)
  }
}
```

При `MAX_OCCURRENCE_ITERATIONS = 500` и ежедневном повторении это ~1.4 года событий. Для каждого повторяемого события генерируется до 500 вхождений.

#### Решение

Использовать инкрементальный поиск вхождений с опорной точкой:

```typescript
private getOccurrencesFrom(
  event: RepeatableEventModel, 
  fromTimestamp: timestamp,
  direction: 'forward' | 'backward',
  limit: number
): timestamp[] {
  const schedule = ZCron.parse(event.repeat)
  if (schedule.mode === 'empty') {
    return [event.start]
  }

  const occurrences: timestamp[] = []
  let current: timestamp | null = fromTimestamp
  let iterations = 0

  if (direction === 'forward') {
    while (current !== null && occurrences.length < limit && iterations < limit * 2) {
      iterations++
      if (event.end && current >= event.end) break
      
      // Пропускаем вхождения до fromTimestamp
      if (current >= fromTimestamp) {
        occurrences.push(current)
      }
      current = ZCron.nextAfter(schedule, event.start, current)
    }
  } else {
    // Для обратного направления нужен метод ZCron.prevBefore
    // или альтернативный подход
  }

  return occurrences
}
```

### 3. Проблема: Дублирование логики в `loadMoreBefore`/`loadMoreAfter`

#### Проблема

Методы имеют почти идентичную структуру:

```typescript
private loadMoreAfter() {
  if (!this.hasMoreAfter || !this.query) return
  const allResults = this.collectAllMatchingEvents()
  const newResults = allResults.filter(r => r.timestamp > this.latestFound)
  // ... сортировка, обновление
}

private loadMoreBefore() {
  if (!this.hasMoreBefore || !this.query) return
  const allResults = this.collectAllMatchingEvents()
  const newResults = allResults.filter(r => r.timestamp < this.earliestFound)
  // ... сортировка, обновление
}
```

#### Решение

Вынести общую логику в параметризованный метод:

```typescript
private loadMore(direction: 'before' | 'after') {
  const canLoad = direction === 'before' ? this.hasMoreBefore : this.hasMoreAfter
  if (!canLoad || !this.query) return

  const allResults = this.collectAllMatchingEvents()
  const boundary = direction === 'before' ? this.earliestFound : this.latestFound
  
  const newResults = direction === 'before'
    ? allResults.filter(r => r.timestamp < boundary)
    : allResults.filter(r => r.timestamp > boundary)

  if (newResults.length === 0) {
    if (direction === 'before') this.hasMoreBefore = false
    else this.hasMoreAfter = false
    return
  }

  newResults.sort((a, b) => a.timestamp - b.timestamp)
  const toAdd = direction === 'before'
    ? newResults.slice(-COUNT_LOAD)
    : newResults.slice(0, COUNT_LOAD)

  // Обновление состояния...
}

nextResult() {
  if (this.results.length === 0) return
  if (this.currentIndex >= this.results.length - 2) {
    this.loadMore('after')
  }
  if (this.currentIndex < this.results.length - 1) {
    this.currentIndex++
  }
}
```

### 4. Проблема: Неточная логика границ

#### Проблема

Поля `earliestFound` и `latestFound` устанавливаются по `allResults`, но не обновляются корректно после дозагрузки:

```typescript
// В search():
if (allResults.length > 0) {
  this.earliestFound = allResults[0].timestamp
  this.latestFound = allResults[allResults.length - 1].timestamp
}

// В loadMoreAfter():
this.latestFound = toAdd[toAdd.length - 1].timestamp
// Но earliestFound не обновляется, хотя теоретически может измениться!
```

#### Решение

Использовать границы отображаемых результатов, а не всех найденных:

```typescript
private updateBoundaries() {
  if (this.results.length > 0) {
    this.earliestFound = this.results[0].timestamp
    this.latestFound = this.results[this.results.length - 1].timestamp
  }
}
```

### 5. Проблема: Отсутствие debounce

#### Проблема

Метод `search()` вызывается при каждом изменении ввода без задержки:

```typescript
// В EventSearchInput.tsx (предполагаемый код)
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  eventSearchStore.search(e.target.value)  // ← Вызывается на каждый символ!
}
```

Для быстрого ввода это вызовет множество ненужных поисков.

#### Решение

Добавить debounce в store или в компонент:

```typescript
import { debounce } from 'lodash-es' // или собственная реализация

export class EventSearchStore {
  private debouncedSearch = debounce((query: string) => {
    this.performSearch(query)
  }, 300)

  search(query: string) {
    this.query = query.trim().toLowerCase()
    this.debouncedSearch(query)
  }

  private performSearch(query: string) {
    // Фактическая логика поиска
  }

  clear() {
    this.debouncedSearch.cancel()
    // ... остальная очистка
  }
}
```

### 6. Проблема: Отсутствие обработки краевых случаев

#### Проблема

Нет проверки на пустой `eventsStore` или отсутствие необходимых полей:

```typescript
this.eventsStore.planned.forEach(event => {
  if (this.matchesQuery(event.name) || this.matchesQuery(event.comment)) {
    // Что если event.name undefined? → matchesQuery обрабатывает
    // Что если eventsStore.planned null? → Ошибка!
  }
})
```

#### Решение

Добавить защитные проверки:

```typescript
private collectAllMatchingEvents(): SearchResult[] {
  const results: SearchResult[] = []
  const addedKeys = new Set<string>()

  // Защитная проверка
  const planned = this.eventsStore?.planned ?? []
  const completed = this.eventsStore?.completed ?? []
  const plannedRepeatable = this.eventsStore?.plannedRepeatable ?? []

  planned.forEach(event => {
    // ...
  })

  // ...
}
```

### 7. Проблема: Сортировка в `loadMoreBefore`

#### Проблема

В `loadMoreBefore` после добавления новых результатов происходит полная сортировка:

```typescript
this.results = [...toAdd, ...this.results].sort((a, b) => a.timestamp - b.timestamp)
```

Это избыточно, так как оба массива уже отсортированы. Можно использовать merge.

#### Решение

Использовать merge двух отсортированных массивов:

```typescript
private mergeSortedArrays(arr1: SearchResult[], arr2: SearchResult[]): SearchResult[] {
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
```

---

## Отклонения от проектной документации

Сравнение с `docs/calendar_event_search_implementation_analysis.md`:

| Аспект | В документации | В реализации | Оценка |
|--------|---------------|--------------|--------|
| Метод поиска | По количеству событий | По количеству событий | ✅ Соответствует |
| Начальное количество | COUNT_BEFORE=4, COUNT_AFTER=4 | Те же значения | ✅ Соответствует |
| Защитный предел | MAX_OCCURRENCE_ITERATIONS | 500 | ✅ Реализовано |
| Кэширование | Не указано | Не реализовано | ⚠️ Можно улучшить |
| Debounce | Не указано | Не реализовано | ⚠️ Можно улучшить |
| Оптимизация merge | Не указано | Не реализовано | ⚠️ Можно улучшить |

---

## Предложения по рефакторингу

### Приоритет 1: Критические изменения

1. **Добавить кэширование результатов** — исключит повторные полные переборы
2. **Добавить debounce** — улучшит производительность при вводе

### Приоритет 2: Оптимизации

3. **Оптимизировать генерацию вхождений** — использовать инкрементальный подход
4. **Заменить сортировку на merge** — для уже отсортированных массивов
5. **Рефакторинг loadMoreBefore/loadMoreAfter** — уменьшить дублирование

### Приоритет 3: Улучшения кода

6. **Добавить защитные проверки** — обработка null/undefined
7. **Улучшить типизацию** — использовать строгие типы
8. **Добавить unit-тесты** — покрытие критических сценариев

---

## Рекомендуемая обновлённая архитектура

```
EventSearchStore
├── Состояние
│   ├── query: string
│   ├── results: SearchResult[]
│   ├── currentIndex: number
│   ├── isActive: boolean
│   ├── hasMoreBefore/After: boolean
│   └── private cachedResults: SearchResult[] | null
│
├── Публичные методы
│   ├── search(query)          — с debounce
│   ├── nextResult()
│   ├── prevResult()
│   ├── clear()
│   └── toggleActive()
│
├── Приватные методы
│   ├── performSearch()        — фактический поиск
│   ├── collectAllMatching()   — сбор результатов (кэшируемый)
│   ├── loadMore(direction)    — унифицированный метод
│   ├── getOccurrencesFrom()   — инкрементальная генерация
│   ├── mergeResults()         — эффективное слияние
│   └── updateBoundaries()     — обновление границ
│
└── Геттеры
    ├── currentResult
    └── resultText
```

---

## Заключение

Реализация `EventSearchStore` функционально корректна и соответствует основным требованиям проектной документации. Однако есть несколько критических проблем с производительностью:

1. **Повторный полный перебор** при каждой дозагрузке — главный источник проблем
2. **Отсутствие debounce** — множественные ненужные поиски при вводе
3. **Неоптимальная генерация вхождений** — до 500 итераций на каждое повторяемое событие

Рекомендуется реализовать предложения из Приоритета 1 перед использованием в production, особенно при большом количестве событий.
