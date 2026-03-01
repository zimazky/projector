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

## Корневая архитектурная проблема

### Противоречие между концепцией и реализацией

Проектная документация (`calendar_event_search_implementation_analysis.md`) описывает подход **"Ленивый инкрементальный поиск по количеству событий"**:

> Вместо временного окна ищем фиксированное количество ближайших событий.

Это правильная концепция: пользователь хочет видеть N ближайших событий, независимо от того, насколько они удалены во времени.

**Однако реализация делает прямо противоположное:**

```typescript
// search() вызывает:
const allResults = this.collectAllMatchingEvents()  // Собирает ВСЕ события!

// collectAllMatchingEvents() внутри делает:
this.eventsStore.plannedRepeatable.forEach(event => {
  const occurrences = this.getOccurrences(event)  // До 500 вхождений на каждое!
  // ...
})
```

### Почему это проблема

| Тип событий | Количество | Что делает текущий код |
|-------------|------------|------------------------|
| Одиночные | Конечное (например, 100) | Перебирает все — приемлемо |
| Повторяемые | Потенциально бесконечное | Генерирует до 500 вхождений на каждое |

При 10 повторяемых событиях с ежедневным расписанием:
- Генерируется 10 × 500 = 5000 вхождений
- Сортируется массив из 5000+ элементов
- Пользователю показывается только 8

**Это расточительно и противоречит идее "инкрементального поиска".**

### Правильная архитектура: Инкрементальный поиск без полного перебора

Вместо сбора всех событий и последующей фильтрации, нужно **искать ближайшие события напрямую**:

```
Текущий подход (неправильный):
┌─────────────────────────────────────────────────────────────────────┐
│  collectAllMatchingEvents()                                          │
│  ├── Перебрать все одиночные события                                │
│  ├── Для каждого повторяемого: сгенерировать 500 вхождений          │
│  ├── Отсортировать 5000+ результатов                                │
│  └── Вернуть всё                                                    │
│                                                                      │
│  Затем: filter + slice(8)                                           │
└─────────────────────────────────────────────────────────────────────┘

Правильный подход:
┌─────────────────────────────────────────────────────────────────────┐
│  findNearestEvents(fromTimestamp, direction, limit)                 │
│  ├── Одиночные: отфильтровать по запросу, найти ближайшие N         │
│  ├── Повторяемые: для каждого найти ближайшие N вхождений           │
│  │   └── Использовать ZCron.nextAfter() инкрементально              │
│  ├── Объединить и отсортировать только N результатов                │
│  └── Вернуть N ближайших                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Проблемы и рекомендации

### 1. Критическая проблема: Сбор всех событий вместо инкрементального поиска

#### Проблема

Метод `collectAllMatchingEvents()` собирает ВСЕ события, включая генерацию до 500 вхождений для каждого повторяемого события. Это противоречит концепции поиска ближайших событий.

Каждый вызов:
1. Перебирает ВСЕ события в `eventsStore`
2. Генерирует ВСЕ вхождения повторяемых событий (до 500 штук на каждое)
3. Сортирует полный список
4. Повторяется при каждой дозагрузке!

```typescript
// В loadMoreAfter():
const allResults = this.collectAllMatchingEvents()  // ← Полный перебор снова!
const newResults = allResults.filter(r => r.timestamp > this.latestFound)
```

#### Решение: Инкрементальный поиск ближайших событий

Вместо сбора всех событий, реализовать методы прямого поиска ближайших:

```typescript
export class EventSearchStore {
  /** Найти ближайшие N событий после указанной даты */
  private findNearestAfter(fromTimestamp: timestamp, limit: number): SearchResult[] {
    const candidates: SearchResult[] = []

    // Одиночные события — конечный список, фильтруем и берём ближайшие
    const matchingSingle = [
      ...this.eventsStore.planned.filter(e => this.matchesQuery(e.name) || this.matchesQuery(e.comment)),
      ...this.eventsStore.completed.filter(e => this.matchesQuery(e.name) || this.matchesQuery(e.comment))
    ]
      .filter(e => e.start > fromTimestamp)
      .sort((a, b) => a.start - b.start)
      .slice(0, limit)
      .map(e => this.toSearchResult(e))

    candidates.push(...matchingSingle)

    // Повторяемые события — инкрементальная генерация вхождений
    for (const event of this.eventsStore.plannedRepeatable) {
      if (!this.matchesQuery(event.name) && !this.matchesQuery(event.comment)) continue

      const occurrences = this.getOccurrencesAfter(event, fromTimestamp, limit)
      candidates.push(...occurrences)
    }

    // Сортируем только кандидатов и берём limit ближайших
    return candidates
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, limit)
  }

  /** Найти ближайшие N событий до указанной даты */
  private findNearestBefore(fromTimestamp: timestamp, limit: number): SearchResult[] {
    // Аналогично, но в обратном направлении
  }

  /** Получить ближайшие вхождения повторяемого события после даты */
  private getOccurrencesAfter(
    event: RepeatableEventModel, 
    fromTimestamp: timestamp, 
    limit: number
  ): SearchResult[] {
    const schedule = ZCron.parse(event.repeat)
    if (schedule.mode === 'empty') {
      return event.start > fromTimestamp ? [this.toSearchResult(event, event.start)] : []
    }

    const results: SearchResult[] = []
    let current: timestamp | null = event.start

    // Находим первое вхождение после fromTimestamp
    while (current !== null && current <= fromTimestamp) {
      current = ZCron.nextAfter(schedule, event.start, current)
    }

    // Генерируем только нужно количество
    while (current !== null && results.length < limit) {
      if (event.end && current >= event.end) break

      results.push({
        eventId: event.id,
        timestamp: current,
        name: event.name,
        completed: false,
        repeatable: true
      })

      current = ZCron.nextAfter(schedule, event.start, current)
    }

    return results
  }
}
```

**Преимущества:**
- Для повторяемых событий генерируется только нужное количество вхождений
- Нет полного перебора и сортировки тысяч элементов
- Соответствует концепции "поиск ближайших событий"

### 2. Проблема: Поиск в обратном направлении (prevResult)

#### Проблема

Для навигации назад нужны события **до** текущей даты. ZCron предоставляет `nextAfter()`, но не имеет встроенного метода для поиска предыдущих вхождений.

#### Решение

Вариант A: Добавить метод `prevBefore` в ZCron (требует изменений в библиотеке)

Вариант B: Использовать приближённый подход с буфером:

```typescript
/** При начальном поиске сохраняем больше событий в прошлое */
private findNearestBefore(fromTimestamp: timestamp, limit: number): SearchResult[] {
  // Для каждого повторяемого события храним буфер последних вхождений
  // или вычисляем от конца события (event.end) в обратном направлении
}
```

Вариант C: Для обратной навигации кэшировать уже найденные вхождения:

```typescript
// При движении вперёд сохраняем пройденные события
// При движении назад используем кэш
private visitedResults: SearchResult[] = []
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
| Метод поиска | По количеству событий | По количеству событий (на уровне UI) | ⚠️ Частично |
| Инкрементальность | Дозагрузка при навигации | Дозагрузка работает, но через полный перебор | ❌ Не соответствует |
| Генерация вхождений | Инкрементальная (предполагалась) | Генерация 500 вхождений с начала события | ❌ Не соответствует |
| Защитный предел | MAX_OCCURRENCE_ITERATIONS | 500 | ✅ Реализовано |
| Debounce | Не указано | Не реализовано | ⚠️ Можно улучшить |

### Ключевое несоответствие

Документация описывает принцип:

> "Вместо временного окна ищем фиксированное количество ближайших событий."

Но реализация делает:

> "Собираем ВСЕ события (до 500 вхождений на каждое повторяемое), затем фильтруем нужные."

Это фундаментальное расхождение между концепцией и реализацией.

---

## Предложения по рефакторингу

### Приоритет 1: Критические изменения

1. **Переписать поиск на инкрементальный подход** — вместо сбора всех событий реализовать `findNearestAfter`/`findNearestBefore`, которые ищут только нужное количество событий
2. **Реализовать инкрементальную генерацию вхождений** — `getOccurrencesAfter()` должен генерировать только N вхождений, начиная с нужной даты, а не 500 штук с начала события

### Приоритет 2: Оптимизации

3. **Решить проблему обратной навигации** — выбрать один из вариантов: добавить `prevBefore` в ZCron, использовать буфер или кэширование
4. **Добавить debounce** — улучшит производительность при вводе
5. **Заменить сортировку на merge** — для уже отсортированных массивов

### Приоритет 3: Улучшения кода

6. **Добавить защитные проверки** — обработка null/undefined
7. **Улучшить типизацию** — использовать строгие типы
8. **Добавить unit-тесты** — покрытие критических сценариев

---

## Рекомендуемая архитектура

```
EventSearchStore
├── Состояние
│   ├── query: string
│   ├── results: SearchResult[]           (только отображаемые)
│   ├── currentIndex: number
│   ├── isActive: boolean
│   ├── hasMoreBefore/After: boolean
│   └── earliestFound/latestFound         (границы отображаемых)
│
├── Публичные методы
│   ├── search(query)                     — с debounce
│   ├── nextResult()                      — вызывает loadMore('after')
│   ├── prevResult()                      — вызывает loadMore('before')
│   ├── clear()
│   └── toggleActive()
│
├── Приватные методы (новые)
│   ├── findNearestAfter(from, limit)     — инкрементальный поиск вперёд
│   ├── findNearestBefore(from, limit)    — инкрементальный поиск назад
│   ├── getOccurrencesAfter(event, from, limit) — только N вхождений
│   └── loadMore(direction)               — использует findNearest*
│
├── Удаляемые методы
│   └── collectAllMatchingEvents()        — больше не нужен!
│
└── Геттеры
    ├── currentResult
    └── resultText
```

---

## Заключение

Текущая реализация `EventSearchStore` содержит **фундаментальное архитектурное противоречие**:

- **Декларируется:** "Ленивый инкрементальный поиск по количеству событий"
- **Реализуется:** Полный сбор всех событий с генерацией до 500 вхождений на каждое повторяемое событие

Это приводит к:
1. Генерации тысяч ненужных вхождений
2. Сортировке массивов из тысяч элементов
3. Повторению всего процесса при каждой дозагрузке

**Главное recommendation:** Переписать поиск на истинно инкрементальный подход, где методы `findNearestAfter`/`findNearestBefore` ищут только запрошенное количество событий, используя `ZCron.nextAfter()` для инкрементальной генерации вхождений.

Это особенно важно для повторяемых событий — вместо генерации 500 вхождений с начала события, нужно найти первое вхождение после нужной даты и сгенерировать только N следующих.
