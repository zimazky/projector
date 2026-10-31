# План реализации зависимых событий в ZCron

## Контекст

Данный план является расширением плана улучшения качества API и добавляет поддержку зависимых событий с синтаксисом `@id+offset/step`.

---

## Обзор синтаксиса

### Существующие режимы

| Синтаксис | Режим | Описание |
|-----------|-------|----------|
| `days months weekdays` | `absolute` | Cron-подобный шаблон |
| `/d` | `relative` | Каждые d дней от startTimestamp |
| `` (пусто) | `empty` | Неповторяемое событие |

### Новый режим: зависимые события

| Синтаксис | Подрежим | Описание |
|-----------|----------|----------|
| `@id` | `dependent-single` | Однократное событие в момент базового события |
| `@id+3d` | `dependent-single` | Однократное через 3 дня после базового |
| `@id/1d` | `dependent-repeating` | Повторяющееся каждый день от базового события |
| `@id+3d/1d` | `dependent-repeating` | Через 3 дня после базового, затем каждый день |

---

## Этап 1: Определение типов данных

### 1.1. Типы для представления длительности

```typescript
/** Длительность в различных единицах */
export interface Duration {
  /** Дни */
  days: number
  /** Часы (0-23) */
  hours?: number
  /** Минуты (0-59) */
  minutes?: number
  /** Секунды (0-59) */
  seconds?: number
}

/** Parses duration string like "3d", "5d12h", "2d4h30m" into Duration */
export type DurationParser = (s: string) => Duration | null
```

### 1.2. Расширенные типы расписаний

```typescript
/** Режим расписания */
export type ScheduleMode = 'empty' | 'absolute' | 'relative' | 'dependent'

/** Пустое расписание (неповторяемое событие) */
export interface EmptySchedule {
  mode: 'empty'
}

/** Абсолютное расписание (cron-подобное) */
export interface AbsoluteSchedule {
  mode: 'absolute'
  days: Set<number>
  months: Set<number>
  weekdays: Set<number>
}

/** Относительное расписание (/d) */
export interface RelativeSchedule {
  mode: 'relative'
  intervalDays: number
}

/** Зависимое однократное событие */
export interface DependentSingleSchedule {
  mode: 'dependent'
  /** ID базового события */
  baseEventId: string
  /** Смещение от базового события */
  offset: Duration
  /** Нет шага — однократное событие */
  step: null
}

/** Зависимое повторяющееся событие */
export interface DependentRepeatingSchedule {
  mode: 'dependent'
  /** ID базового события */
  baseEventId: string
  /** Смещение от базового события */
  offset: Duration
  /** Шаг повторения */
  step: Duration
}

/** Зависимое расписание (объединение) */
export type DependentSchedule = DependentSingleSchedule | DependentRepeatingSchedule

/** Скомпилированное расписание (объединение всех типов) */
export type ParsedSchedule = 
  | EmptySchedule 
  | AbsoluteSchedule 
  | RelativeSchedule 
  | DependentSchedule
```

### 1.3. Результат валидации

```typescript
export type ScheduleField = 'days' | 'months' | 'weekdays' | 'general' | 'eventId' | 'offset' | 'step'

export interface ValidationError {
  field: ScheduleField
  token: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  error?: ValidationError
}
```

---

## Этап 2: Парсинг синтаксиса `@id+offset/step`

### 2.1. Грамматика синтаксиса

```
dependentSchedule := '@' eventId [offset] ['/' step]

eventId            := alphanumericString

offset             := '+' duration

step               := duration

duration           := durationPart+

durationPart       := number ('d' | 'h' | 'm' | 's')

number             := digit+
```

**Примеры:**
- `@abc123` → baseEventId: "abc123", offset: {days: 0}, step: null
- `@abc123+3d` → baseEventId: "abc123", offset: {days: 3}, step: null
- `@abc123/1d` → baseEventId: "abc123", offset: {days: 0}, step: {days: 1}
- `@abc123+3d/7d` → baseEventId: "abc123", offset: {days: 3}, step: {days: 7}
- `@abc123+2d4h/1d` → baseEventId: "abc123", offset: {days: 2, hours: 4}, step: {days: 1}

### 2.2. Функция парсинга длительности

```typescript
/**
 * Парсит строку длительности в объект Duration.
 * @param s Строка вида "3d", "5d12h", "2d4h30m15s"
 * @returns Duration или null если строка невалидна
 */
private static parseDuration(s: string): Duration | null {
  if (!s || s.length === 0) return null
  
  const result: Duration = { days: 0 }
  const regex = /(\d+)([dhms])/g
  let match
  let hasMatch = false
  
  while ((match = regex.exec(s)) !== null) {
    hasMatch = true
    const value = parseInt(match[1], 10)
    const unit = match[2]
    
    switch (unit) {
      case 'd': result.days = value; break
      case 'h': result.hours = value; break
      case 'm': result.minutes = value; break
      case 's': result.seconds = value; break
    }
  }
  
  // Проверка, что вся строка была потреблена
  if (!hasMatch || regex.lastIndex !== s.length) return null
  
  // Валидация диапазонов
  if ((result.hours ?? 0) > 23) return null
  if ((result.minutes ?? 0) > 59) return null
  if ((result.seconds ?? 0) > 59) return null
  
  return result
}
```

### 2.3. Функция парсинга зависимого расписания

```typescript
/**
 * Парсит строку зависимого расписания вида @id+offset/step
 * @param s Строка без ведущего '@'
 * @returns DependentSchedule или null если строка невалидна
 */
private static parseDependentSchedule(s: string): DependentSchedule | null {
  // Разделяем на части: id+offset и опциональный step
  const slashIndex = s.indexOf('/')
  
  let basePart: string
  let stepPart: string | null = null
  
  if (slashIndex !== -1) {
    basePart = s.substring(0, slashIndex)
    stepPart = s.substring(slashIndex + 1)
  } else {
    basePart = s
  }
  
  // Разделяем id и offset
  const plusIndex = basePart.indexOf('+')
  
  let eventId: string
  let offsetStr: string | null = null
  
  if (plusIndex !== -1) {
    eventId = basePart.substring(0, plusIndex)
    offsetStr = basePart.substring(plusIndex + 1)
  } else {
    eventId = basePart
  }
  
  // Валидация eventId
  if (!eventId || !/^[a-zA-Z0-9_-]+$/.test(eventId)) {
    return null
  }
  
  // Парсинг offset
  const offset: Duration = offsetStr 
    ? this.parseDuration(offsetStr) ?? { days: 0 }
    : { days: 0 }
  
  // Парсинг step
  const step: Duration | null = stepPart 
    ? this.parseDuration(stepPart) 
    : null
  
  // Валидация: step должен быть положительным
  if (step && !this.isPositiveDuration(step)) {
    return null
  }
  
  if (step) {
    return {
      mode: 'dependent',
      baseEventId: eventId,
      offset,
      step
    }
  } else {
    return {
      mode: 'dependent',
      baseEventId: eventId,
      offset,
      step: null
    }
  }
}

private static isPositiveDuration(d: Duration): boolean {
  const totalSeconds = (d.days * 86400) + 
                       ((d.hours ?? 0) * 3600) + 
                       ((d.minutes ?? 0) * 60) + 
                       (d.seconds ?? 0)
  return totalSeconds > 0
}
```

### 2.4. Обновлённый метод `parse()`

```typescript
static parse(scheduleString: string): ParsedSchedule {
  const trimmed = scheduleString.trim()
  
  // Пустая строка
  if (trimmed === '') {
    return { mode: 'empty' }
  }
  
  // Зависимое расписание (префикс @)
  if (trimmed[0] === '@') {
    const dependent = this.parseDependentSchedule(trimmed.substring(1))
    if (dependent) return dependent
    throw new Error(`Invalid dependent schedule: ${scheduleString}`)
  }
  
  // Относительное расписание (префикс /)
  if (trimmed[0] === '/') {
    const intervalDays = parseInt(trimmed.substring(1), 10)
    if (isNaN(intervalDays) || intervalDays <= 0) {
      throw new Error(`Invalid relative schedule: ${scheduleString}`)
    }
    return { mode: 'relative', intervalDays }
  }
  
  // Абсолютное расписание (cron-подобное)
  return this.parseAbsoluteSchedule(trimmed)
}
```

---

## Этап 3: Валидация зависимого расписания

### 3.1. Расширение `validateDetailed()`

```typescript
static validateDetailed(scheduleString: string): ValidationResult {
  const trimmed = scheduleString.trim()
  
  // Пустая строка — валидна
  if (trimmed === '') {
    return { ok: true }
  }
  
  // Зависимое расписание
  if (trimmed[0] === '@') {
    return this.validateDependentSchedule(trimmed.substring(1))
  }
  
  // Относительное расписание
  if (trimmed[0] === '/') {
    return this.validateRelativeSchedule(trimmed.substring(1))
  }
  
  // Абсолютное расписание
  return this.validateAbsoluteSchedule(trimmed)
}
```

### 3.2. Валидация зависимого расписания

```typescript
private static validateDependentSchedule(s: string): ValidationResult {
  const slashIndex = s.indexOf('/')
  
  let basePart: string
  let stepPart: string | null = null
  
  if (slashIndex !== -1) {
    basePart = s.substring(0, slashIndex)
    stepPart = s.substring(slashIndex + 1)
    
    // Step не может быть пустым
    if (!stepPart) {
      return {
        ok: false,
        error: { field: 'step', token: '', message: 'Шаг повторения не указан после "/"' }
      }
    }
  } else {
    basePart = s
  }
  
  // Разделяем id и offset
  const plusIndex = basePart.indexOf('+')
  
  let eventId: string
  let offsetStr: string | null = null
  
  if (plusIndex !== -1) {
    eventId = basePart.substring(0, plusIndex)
    offsetStr = basePart.substring(plusIndex + 1)
    
    // Offset не может быть пустым
    if (!offsetStr) {
      return {
        ok: false,
        error: { field: 'offset', token: '', message: 'Смещение не указано после "+"' }
      }
    }
  } else {
    eventId = basePart
  }
  
  // Валидация eventId
  if (!eventId) {
    return {
      ok: false,
      error: { field: 'eventId', token: '', message: 'ID базового события не указан' }
    }
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(eventId)) {
    return {
      ok: false,
      error: { field: 'eventId', token: eventId, message: 'ID события может содержать только буквы, цифры, _ и -' }
    }
  }
  
  // Валидация offset
  if (offsetStr) {
    const offset = this.parseDuration(offsetStr)
    if (!offset) {
      return {
        ok: false,
        error: { field: 'offset', token: offsetStr, message: 'Некорректный формат смещения. Используйте формат: 3d, 5d12h, 2d4h30m' }
      }
    }
  }
  
  // Валидация step
  if (stepPart) {
    const step = this.parseDuration(stepPart)
    if (!step) {
      return {
        ok: false,
        error: { field: 'step', token: stepPart, message: 'Некорректный формат шага. Используйте формат: 1d, 7d, 2d12h' }
      }
    }
    
    if (!this.isPositiveDuration(step)) {
      return {
        ok: false,
        error: { field: 'step', token: stepPart, message: 'Шаг повторения должен быть больше нуля' }
      }
    }
  }
  
  return { ok: true }
}
```

---

## Этап 4: Матчинг зависимых событий

### 4.1. Проблема разрешения зависимостей

Зависимое событие требует знания о базовом событии. Это означает, что `match()` не может работать автономно — нужен доступ к хранилищу событий.

### 4.2. Интерфейс разрешения событий

```typescript
/** Интерфейс для получения информации о событиях */
export interface EventResolver {
  /**
   * Получить все вхождения события в заданном интервале.
   * @param eventId ID события
   * @param start Начало интервала (timestamp)
   * @param end Конец интервала (timestamp)
   * @returns Массив timestamp вхождений события
   */
  getOccurrences(eventId: string, start: timestamp, end: timestamp): timestamp[]
  
  /**
   * Получить следующее вхождение события после указанной даты.
   * @param eventId ID события
   * @param after Дата после которой искать (timestamp)
   * @returns timestamp следующего вхождения или null
   */
  getNextOccurrence(eventId: string, after: timestamp): timestamp | null
}
```

### 4.3. Обновлённый метод `match()` с резолвером

```typescript
/**
 * Проверяет, соответствует ли дата расписанию.
 * Для зависимых расписаний требуется EventResolver.
 */
static match(
  schedule: ParsedSchedule, 
  startTimestamp: timestamp, 
  timestamp: timestamp,
  resolver?: EventResolver
): boolean {
  switch (schedule.mode) {
    case 'empty':
      return false
    
    case 'relative':
      return this.matchRelative(schedule, startTimestamp, timestamp)
    
    case 'absolute':
      return this.matchAbsolute(schedule, timestamp)
    
    case 'dependent':
      if (!resolver) {
        throw new Error('EventResolver is required for dependent schedules')
      }
      return this.matchDependent(schedule, startTimestamp, timestamp, resolver)
  }
}

private static matchRelative(
  schedule: RelativeSchedule, 
  startTimestamp: timestamp, 
  ts: timestamp
): boolean {
  const diff = DateTime.getDifferenceInDays(startTimestamp, ts)
  if (diff < 0) return false
  return diff % schedule.intervalDays === 0
}

private static matchAbsolute(
  schedule: AbsoluteSchedule, 
  ts: timestamp
): boolean {
  const { day, month, weekday } = DateTime.getDayMonthWeekday(ts)
  return schedule.months.has(month + 1)
      && schedule.days.has(day)
      && schedule.weekdays.has(weekday)
}

private static matchDependent(
  schedule: DependentSchedule,
  startTimestamp: timestamp,
  ts: timestamp,
  resolver: EventResolver
): boolean {
  const offsetSeconds = this.durationToSeconds(schedule.offset)
  
  if (schedule.step === null) {
    // Однократное зависимое событие
    // Ищем вхождения базового события и проверяем, совпадает ли ts с база+offset
    const baseOccurrences = resolver.getOccurrences(
      schedule.baseEventId, 
      ts - offsetSeconds - 86400, // -1 день для запаса
      ts - offsetSeconds + 86400  // +1 день для запаса
    )
    
    return baseOccurrences.some(baseTs => 
      baseTs + offsetSeconds === ts
    )
  } else {
    // Повторяющееся зависимое событие
    const stepSeconds = this.durationToSeconds(schedule.step)
    
    // Для каждого вхождения базового события
    // проверяем, попадает ли ts в цепочку base+offset + k*step
    const baseOccurrences = resolver.getOccurrences(
      schedule.baseEventId,
      ts - offsetSeconds - stepSeconds, // Запас назад
      ts - offsetSeconds + 86400        // Запас вперёд
    )
    
    for (const baseTs of baseOccurrences) {
      const chainStart = baseTs + offsetSeconds
      if (ts < chainStart) continue
      
      const diff = ts - chainStart
      if (diff % stepSeconds === 0) {
        return true
      }
    }
    
    return false
  }
}

private static durationToSeconds(d: Duration): number {
  return (d.days * 86400) + 
         ((d.hours ?? 0) * 3600) + 
         ((d.minutes ?? 0) * 60) + 
         (d.seconds ?? 0)
}
```

---

## Этап 5: Интеграция с существующим кодом

### 5.1. Адаптер для EventsStore

```typescript
// В файле src/6-entities/Events/EventsStore.ts или отдельном файле

import { EventResolver } from 'src/7-shared/libs/ZCron/ZCron'
import EventsStore from './EventsStore'

export class EventsStoreResolver implements EventResolver {
  constructor(private store: EventsStore) {}
  
  getOccurrences(eventId: string, start: timestamp, end: timestamp): timestamp[] {
    const event = this.store.getById(eventId)
    if (!event) return []
    
    // Для однократного события — проверить попадание в интервал
    if (!event.repeat) {
      if (event.startTimestamp >= start && event.startTimestamp < end) {
        return [event.startTimestamp]
      }
      return []
    }
    
    // Для повторяемого события — найти все вхождения в интервале
    // Используем ZCron.ariseInInterval или итерируем по дням
    const occurrences: timestamp[] = []
    const schedule = ZCron.parse(event.repeat)
    
    for (let ts = start; ts < end; ts += 86400) {
      if (ZCron.match(schedule, event.startTimestamp, ts)) {
        occurrences.push(ts)
      }
    }
    
    return occurrences
  }
  
  getNextOccurrence(eventId: string, after: timestamp): timestamp | null {
    const event = this.store.getById(eventId)
    if (!event) return null
    
    if (!event.repeat) {
      return event.startTimestamp > after ? event.startTimestamp : null
    }
    
    // Ищем следующее вхождение в пределах разумного диапазона (год)
    const schedule = ZCron.parse(event.repeat)
    return ZCron.first(event.repeat, event.startTimestamp, 366) || null
  }
}
```

### 5.2. Обновление использования в календаре

```typescript
// В Calendar.tsx или CalendarStore.ts

const resolver = new EventsStoreResolver(eventsStore)

// При проверке повторяемых событий
for (const event of events) {
  if (!event.repeat) continue
  
  const schedule = ZCron.parseWithCache(event.repeat)
  
  if (schedule.mode === 'dependent') {
    // Для зависимых событий используем резолвер
    if (ZCron.match(schedule, event.startTimestamp, dayTimestamp, resolver)) {
      // Событие попадает на этот день
    }
  } else {
    // Для обычных расписаний
    if (ZCron.match(schedule, event.startTimestamp, dayTimestamp)) {
      // Событие попадает на этот день
    }
  }
}
```

---

## Этап 6: Оптимизация производительности

### 6.1. Кэширование вхождений базовых событий

Для каждого зависимого события кэшировать найденные вхождения базового события:

```typescript
export class CachedEventResolver implements EventResolver {
  private cache: Map<string, Map<string, timestamp[]>> = new Map()
  
  constructor(private baseResolver: EventResolver) {}
  
  getOccurrences(eventId: string, start: timestamp, end: timestamp): timestamp[] {
    const cacheKey = `${start}-${end}`
    
    let eventCache = this.cache.get(eventId)
    if (!eventCache) {
      eventCache = new Map()
      this.cache.set(eventId, eventCache)
    }
    
    const cached = eventCache.get(cacheKey)
    if (cached) return cached
    
    const occurrences = this.baseResolver.getOccurrences(eventId, start, end)
    eventCache.set(cacheKey, occurrences)
    return occurrences
  }
  
  clearCache(): void {
    this.cache.clear()
  }
}
```

### 6.2. Предвычисление зависимых событий

При рендеринге календаря на месяц можно предварительно вычислить все зависимые события:

```typescript
function precomputeDependentEvents(
  events: Event[],
  startDate: timestamp,
  endDate: timestamp,
  resolver: EventResolver
): Map<timestamp, Event[]> {
  const result = new Map<timestamp, Event[]>()
  
  for (const event of events) {
    if (!event.repeat) continue
    
    const schedule = ZCron.parse(event.repeat)
    if (schedule.mode !== 'dependent') continue
    
    // Найти все вхождения базового события
    const offsetSeconds = ZCron.durationToSeconds(schedule.offset)
    const stepSeconds = schedule.step ? ZCron.durationToSeconds(schedule.step) : null
    
    // Расширяем интервал поиска с учётом offset
    const searchStart = startDate - offsetSeconds - (stepSeconds ?? 0) * 100
    const searchEnd = endDate
    
    const baseOccurrences = resolver.getOccurrences(
      schedule.baseEventId, 
      searchStart, 
      searchEnd
    )
    
    // Для каждого вхождения базового события
    for (const baseTs of baseOccurrences) {
      const chainStart = baseTs + offsetSeconds
      
      if (stepSeconds === null) {
        // Однократное
        if (chainStart >= startDate && chainStart < endDate) {
          addToMap(result, chainStart, event)
        }
      } else {
        // Повторяющееся
        for (let ts = chainStart; ts < endDate; ts += stepSeconds) {
          if (ts >= startDate) {
            addToMap(result, ts, event)
          }
        }
      }
    }
  }
  
  return result
}
```

---

## Этап 7: Тестирование

### 7.1. Тесты парсинга длительности

```typescript
describe('parseDuration', () => {
  it('парсит дни', () => {
    expect(ZCron.parseDuration('3d')).toEqual({ days: 3 })
  })
  
  it('парсит комбинированную длительность', () => {
    expect(ZCron.parseDuration('2d12h30m15s')).toEqual({
      days: 2, hours: 12, minutes: 30, seconds: 15
    })
  })
  
  it('возвращает null для невалидной строки', () => {
    expect(ZCron.parseDuration('')).toBeNull()
    expect(ZCron.parseDuration('d')).toBeNull()
    expect(ZCron.parseDuration('25h')).toBeNull() // часы > 23
  })
})
```

### 7.2. Тесты парсинга зависимых расписаний

```typescript
describe('parse dependent schedule', () => {
  it('парсит @id', () => {
    const result = ZCron.parse('@abc123')
    expect(result).toEqual({
      mode: 'dependent',
      baseEventId: 'abc123',
      offset: { days: 0 },
      step: null
    })
  })
  
  it('парсит @id+3d', () => {
    const result = ZCron.parse('@abc123+3d')
    expect(result).toEqual({
      mode: 'dependent',
      baseEventId: 'abc123',
      offset: { days: 3 },
      step: null
    })
  })
  
  it('парсит @id/1d', () => {
    const result = ZCron.parse('@abc123/1d')
    expect(result).toEqual({
      mode: 'dependent',
      baseEventId: 'abc123',
      offset: { days: 0 },
      step: { days: 1 }
    })
  })
  
  it('парсит @id+3d/7d', () => {
    const result = ZCron.parse('@abc123+3d/7d')
    expect(result).toEqual({
      mode: 'dependent',
      baseEventId: 'abc123',
      offset: { days: 3 },
      step: { days: 7 }
    })
  })
})
```

### 7.3. Тесты валидации

```typescript
describe('validateDetailed for dependent schedules', () => {
  it('отклоняет пустой ID', () => {
    const result = ZCron.validateDetailed('@+3d')
    expect(result.ok).toBe(false)
    expect(result.error?.field).toBe('eventId')
  })
  
  it('отклоняет некорректный offset', () => {
    const result = ZCron.validateDetailed('@abc+xyz')
    expect(result.ok).toBe(false)
    expect(result.error?.field).toBe('offset')
  })
  
  it('отклоняет нулевой step', () => {
    const result = ZCron.validateDetailed('@abc/0d')
    expect(result.ok).toBe(false)
    expect(result.error?.field).toBe('step')
  })
})
```

### 7.4. Тесты матчинга с моком резолвера

```typescript
describe('match dependent schedule', () => {
  const mockResolver: EventResolver = {
    getOccurrences: (id, start, end) => {
      if (id === 'event1') {
        return [ts('2024.01.01'), ts('2024.02.01'), ts('2024.03.01')]
      }
      return []
    },
    getNextOccurrence: () => null
  }
  
  it('матчит однократное зависимое событие', () => {
    const schedule = ZCron.parse('@event1+3d')
    
    expect(ZCron.match(schedule, 0, ts('2024.01.04'), mockResolver)).toBe(true)
    expect(ZCron.match(schedule, 0, ts('2024.01.05'), mockResolver)).toBe(false)
  })
  
  it('матчит повторяющееся зависимое событие', () => {
    const schedule = ZCron.parse('@event1+1d/7d')
    
    // 2 января (2024.01.01 + 1d) — первое вхождение
    expect(ZCron.match(schedule, 0, ts('2024.01.02'), mockResolver)).toBe(true)
    // 9 января (2024.01.01 + 1d + 7d) — второе вхождение
    expect(ZCron.match(schedule, 0, ts('2024.01.09'), mockResolver)).toBe(true)
  })
})
```

---

## Этап 8: План реализации по шагам

| Шаг | Задача | Файл | Приоритет |
|-----|--------|------|-----------|
| 1 | Определить типы `Duration`, `DependentSchedule`, etc. | `ZCron.ts` | Высокий |
| 2 | Реализовать `parseDuration()` | `ZCron.ts` | Высокий |
| 3 | Реализовать `parseDependentSchedule()` | `ZCron.ts` | Высокий |
| 4 | Обновить `parse()` для поддержки префикса `@` | `ZCron.ts` | Высокий |
| 5 | Реализовать `validateDependentSchedule()` | `ZCron.ts` | Высокий |
| 6 | Создать интерфейс `EventResolver` | `ZCron.ts` | Высокий |
| 7 | Реализовать `matchDependent()` | `ZCron.ts` | Высокий |
| 8 | Создать `EventsStoreResolver` | `Events/` | Средний |
| 9 | Реализовать `CachedEventResolver` | `ZCron.ts` | Средний |
| 10 | Написать тесты для новых методов | `ZCron.spec.ts` | Высокий |
| 11 | Интегрировать с календарём | `Calendar/` | Средний |
| 12 | Оптимизация: предвычисление зависимых событий | `Calendar/` | Низкий |

---

## Риски и митигация

| Риск | Вероятность | Влияние | Mitigation |
|------|-------------|---------|------------|
| Циклические зависимости между событиями | Средняя | Высокое | Детекция циклов при валидации, ограничение глубины |
| Производительность при большом количестве зависимых событий | Средняя | Среднее | Кэширование, предвычисление, ленивое разрешение |
| Изменение базового события (редактирование/удаление) | Высокая | Высокое | События-призраки, уведомления о разорванных связях |
| Сложность UI для редактирования зависимых событий | Средняя | Среднее | Специальный UI-компонент, визуализация связей |

---

## Дополнительные улучшения (future work)

### 8.1. Детекция циклов

```typescript
static validateNoCycles(
  eventId: string, 
  schedule: ParsedSchedule,
  resolver: EventResolver,
  visited: Set<string> = new Set()
): boolean {
  if (schedule.mode !== 'dependent') return true
  
  if (visited.has(schedule.baseEventId)) return false
  visited.add(schedule.baseEventId)
  
  const baseEvent = resolver.getEvent(schedule.baseEventId)
  if (!baseEvent || !baseEvent.repeat) return true
  
  const baseSchedule = this.parse(baseEvent.repeat)
  return this.validateNoCycles(schedule.baseEventId, baseSchedule, resolver, visited)
}
```

### 8.2. Альтернативный синтаксис `@id+offset | cron`

Если потребуется больше гибкости, можно добавить поддержку pipe-синтаксиса:

```typescript
// @id+3d | */1 * * — через 3 дня после события, затем каждый день по cron-шаблону
interface DependentCronSchedule {
  mode: 'dependent'
  baseEventId: string
  offset: Duration
  cronTemplate: AbsoluteSchedule // cron-шаблон для повторений
}
```

---

## Ожидаемый результат

1. **Новый режим расписаний** — поддержка синтаксиса `@id+offset/step`
2. **Обратная совместимость** — все существующие расписания работают без изменений
3. **Гибкость** — возможность выражать сложные зависимости между событиями
4. **Производительность** — кэширование и оптимизации для большого количества событий
5. **Тестируемость** — изолированные тесты для каждого компонента
