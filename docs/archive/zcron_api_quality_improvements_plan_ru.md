# План улучшения качества API ZCron

## Цель

Реализовать улучшения качества API без изменения текущей семантики совпадения, как описано в анализе `zcron_library_analysis_ru.md`.

---

## Обзор изменений

План состоит из трёх основных направлений:

1. **Добавление метода `parse()`** — компиляция строки расписания в структуру
2. **Добавление метода `match()`** — быстрая проверка совпадения по скомпилированной структуре
3. **Добавление метода `validateDetailed()`** — информативная валидация с диагностикой ошибок

---

## Этап 1: Определение типов данных

### 1.1. Создать типы для скомпилированного расписания

Добавить в `ZCron.ts` следующие типы:

```typescript
/** Режим расписания */
export type ScheduleMode = 'absolute' | 'relative' | 'empty'

/** Скомпилированное абсолютное расписание (cron-подобное) */
export interface AbsoluteSchedule {
  mode: 'absolute'
  /** Дни месяца (1-31), отсортированы, без дубликатов */
  days: number[]
  /** Месяцы (1-12), отсортированы, без дубликатов */
  months: number[]
  /** Дни недели (0-6), отсортированы, без дубликатов */
  weekdays: number[]
}

/** Скомпилированное относительное расписание (/d) */
export interface RelativeSchedule {
  mode: 'relative'
  /** Интервал в днях от startTimestamp */
  intervalDays: number
}

/** Пустое расписание (неповторяемое событие) */
export interface EmptySchedule {
  mode: 'empty'
}

/** Скомпилированное расписание */
export type ParsedSchedule = AbsoluteSchedule | RelativeSchedule | EmptySchedule
```

### 1.2. Создать типы для детальной валидации

```typescript
/** Поле расписания */
export type ScheduleField = 'days' | 'months' | 'weekdays' | 'general'

/** Ошибка валидации */
export interface ValidationError {
  /** Поле, в котором обнаружена ошибка */
  field: ScheduleField
  /** Токен, вызвавший ошибку */
  token: string
  /** Сообщение об ошибке для пользователя */
  message: string
}

/** Результат детальной валидации */
export interface ValidationResult {
  ok: boolean
  error?: ValidationError
}
```

---

## Этап 2: Реализация метода `parse()`

### 2.1. Сигнатура метода

```typescript
/**
 * Компилирует строку расписания в структуру для быстрого многократного использования.
 * @param scheduleString Строка-шаблон расписания
 * @returns Скомпилированная структура расписания
 * @throws Error если строка содержит некорректный синтаксис
 */
static parse(scheduleString: string): ParsedSchedule
```

### 2.2. Логика реализации

1. Обработать пустую строку → вернуть `EmptySchedule`
2. Определить режим:
   - Если первое поле начинается с `/` → `RelativeSchedule`
   - Иначе → `AbsoluteSchedule`
3. Для абсолютного режима:
   - Разобрать каждое поле через `split(',')`
   - Для каждого токена вызвать `parseToken()` (новая вспомогательная функция)
   - Нормализовать результат: удалить дубликаты, отсортировать
4. Для относительного режима:
   - Извлечь число после `/` как `intervalDays`

### 2.3. Вспомогательная функция `parseToken()`

```typescript
/**
 * Разбирает один токен (например, '1-5', '*/4', '3') в массив чисел.
 */
private static parseToken(token: string, min: number, max: number): number[]
```

Логика:
- `'*'` → диапазон от `min` до `max`
- `'a'` → `[a]`
- `'a-b'` → `[a, a+1, ..., b]`
- `'a/b'` → `[a, a+b, a+2b, ...]` до `max`
- `'*/b'` → `[min, min+b, min+2b, ...]` до `max`

---

## Этап 3: Реализация метода `match()`

### 3.1. Сигнатура метода

```typescript
/**
 * Проверяет, соответствует ли дата скомпилированному расписанию.
 * @param schedule Скомпилированное расписание (результат parse())
 * @param startTimestamp Начало действия шаблона (актуально для relative режима)
 * @param timestamp Дата для проверки
 * @returns true если дата соответствует расписанию
 */
static match(schedule: ParsedSchedule, startTimestamp: timestamp, timestamp: timestamp): boolean
```

### 3.2. Логика реализации

```typescript
static match(schedule: ParsedSchedule, startTimestamp: timestamp, timestamp: timestamp): boolean {
  switch (schedule.mode) {
    case 'empty':
      return false
    
    case 'relative':
      const diff = DateTime.getDifferenceInDays(startTimestamp, timestamp)
      if (diff < 0) return false
      return diff % schedule.intervalDays === 0
    
    case 'absolute':
      const { day, month, weekday } = DateTime.getDayMonthWeekday(timestamp)
      return schedule.months.includes(month + 1)
          && schedule.days.includes(day)
          && schedule.weekdays.includes(weekday)
  }
}
```

### 3.3. Оптимизация с использованием `Set<number>`

Для критичных по производительности участков можно изменить типы:

```typescript
export interface AbsoluteSchedule {
  mode: 'absolute'
  days: Set<number>
  months: Set<number>
  weekdays: Set<number>
}
```

Преимущества `Set`:
- `O(1)` для проверки `has()` вместо `O(n)` для `includes()`
- Автоматическое удаление дубликатов

---

## Этап 4: Реализация внутреннего кэша

### 4.1. Добавить кэш в класс

```typescript
private static parseCache: Map<string, ParsedSchedule> = new Map()
```

### 4.2. Метод `parseWithCache()`

```typescript
/**
 * Получает скомпилированное расписание из кэша или компилирует и кэширует.
 */
static parseWithCache(scheduleString: string): ParsedSchedule {
  const trimmed = scheduleString.trim()
  const cached = this.parseCache.get(trimmed)
  if (cached) return cached
  
  const parsed = this.parse(trimmed)
  this.parseCache.set(trimmed, parsed)
  return parsed
}
```

### 4.3. Очистка кэша (опционально)

```typescript
/** Очищает кэш скомпилированных расписаний */
static clearCache(): void {
  this.parseCache.clear()
}
```

---

## Этап 5: Реализация метода `validateDetailed()`

### 5.1. Сигнатура метода

```typescript
/**
 * Валидирует строку расписания с детальной диагностикой ошибок.
 * @param scheduleString Строка-шаблон для проверки
 * @returns Объект с результатом валидации и детальной информацией об ошибке
 */
static validateDetailed(scheduleString: string): ValidationResult
```

### 5.2. Примеры возвращаемых значений

```typescript
// Корректное расписание
{ ok: true }

// День вне диапазона
{
  ok: false,
  error: {
    field: 'days',
    token: '0',
    message: 'День месяца должен быть от 1 до 31'
  }
}

// Некорректный синтаксис
{
  ok: false,
  error: {
    field: 'days',
    token: '1-5-10',
    message: 'Некорректный формат диапазона. Используйте "a-b" где a <= b'
  }
}

// Слишком много полей
{
  ok: false,
  error: {
    field: 'general',
    token: '* * * *',
    message: 'Ожидается не более 3 полей: days months weekdays'
  }
}
```

### 5.3. Вспомогательные функции валидации

Рефакторинг существующих функций `validateDaysPattern`, `validateMonthsPattern`, `validateWeekdaysPattern`:

```typescript
interface FieldValidationResult {
  valid: boolean
  error?: { token: string, message: string }
}

private static validateDaysField(s: string): FieldValidationResult
private static validateMonthsField(s: string): FieldValidationResult
private static validateWeekdaysField(s: string): FieldValidationResult
```

---

## Этап 6: Обновление существующих методов

### 6.1. Рефакторинг `isMatch()`

Использовать новый `parse()` внутри `isMatch()` для консистентности:

```typescript
static isMatch(scheduleString: string, startTimestamp: timestamp, timestamp: timestamp): boolean {
  const schedule = this.parseWithCache(scheduleString)
  return this.match(schedule, startTimestamp, timestamp)
}
```

### 6.2. Рефакторинг `validate()`

Использовать `validateDetailed()`:

```typescript
static validate(scheduleString: string): boolean {
  return this.validateDetailed(scheduleString).ok
}
```

---

## Этап 7: Тестирование

### 7.1. Тесты для `parse()`

- Пустая строка → `{ mode: 'empty' }`
- `'/4'` → `{ mode: 'relative', intervalDays: 4 }`
- `'* * *'` → корректный `AbsoluteSchedule` с полными наборами
- `'1,5,10 * *'` → `{ days: [1,5,10], ... }`
- `'1-5 * *'` → `{ days: [1,2,3,4,5], ... }`
- `'*/4 * *'` → `{ days: [1,5,9,13,17,21,25,29], ... }`
- Нормализация дубликатов: `'1,1,5'` → `{ days: [1,5], ... }`
- Нормализация порядка: `'5,1'` → `{ days: [1,5], ... }`

### 7.2. Тесты для `match()`

- `EmptySchedule` всегда возвращает `false`
- `RelativeSchedule` корректно считает дни
- `AbsoluteSchedule` проверяет все три условия (AND)
- Граничные случаи: первое совпадение, последнее совпадение в месяце

### 7.3. Тесты для `validateDetailed()`

- Все текущие тесты `validate` адаптировать для `validateDetailed`
- Проверить корректность сообщений об ошибках
- Проверить корректность поля `field` в ошибке

### 7.4. Тесты для кэша

- Повторный вызов `parseWithCache` с той же строкой возвращает тот же объект
- `clearCache()` очищает кэш

---

## Этап 8: Интеграция с существующим кодом

### 8.1. Места использования `isMatch()`

Найти все использования `ZCron.isMatch()` в проекте и убедиться, что поведение не изменилось:

- `src/3-pages/Calendar/` — рендеринг календаря
- `src/6-entities/Events/` — работа с повторяемыми событиями

### 8.2. Места использования `validate()`

Найти использования в форме события и, при необходимости, обновить для использования `validateDetailed()`:

- `src/4-widgets/EventForm/` — валидация поля repeat

---

## План реализации по шагам

| Шаг | Задача | Файл | Приоритет |
|-----|--------|------|-----------|
| 1 | Определить типы `ParsedSchedule`, `ValidationResult`, etc. | `ZCron.ts` | Высокий |
| 2 | Реализовать `parse()` с нормализацией | `ZCron.ts` | Высокий |
| 3 | Реализовать `match()` | `ZCron.ts` | Высокий |
| 4 | Добавить кэш `parseWithCache()` | `ZCron.ts` | Средний |
| 5 | Реализовать `validateDetailed()` | `ZCron.ts` | Высокий |
| 6 | Рефакторинг `isMatch()` для использования `parse/match` | `ZCron.ts` | Средний |
| 7 | Рефакторинг `validate()` для использования `validateDetailed` | `ZCron.ts` | Низкий |
| 8 | Написать тесты для новых методов | `ZCron.spec.ts` | Высокий |
| 9 | Проверить интеграцию с существующим кодом | - | Средний |

---

## Риски и mitigation

| Риск | Вероятность | Влияние | Mitigation |
|------|-------------|---------|------------|
| Изменение поведения существующих методов | Средняя | Высокое | Полное покрытие тестами, сравнение до/после |
| Проблемы производительности кэша при большом количестве расписаний | Низкая | Среднее | Лимит размера кэша, LRU-механизм при необходимости |
| Сложность поддержки двух API (старый + новый) | Низкая | Низкое | Плавная миграция, документация |

---

## Ожидаемый результат

1. **Производительность**: Устранение повторного парсинга при рендеринге календаря
2. **UX**: Информативные сообщения об ошибках в форме события
3. **Расширяемость**: Готовая структура для будущих расширений синтаксиса (зависимые события)
4. **Тестируемость**: Возможность тестировать парсинг и матчинг независимо
