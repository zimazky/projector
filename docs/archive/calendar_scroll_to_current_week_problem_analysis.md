# Анализ проблемы: Невозможность вернуться на текущую неделю при дальнем скролле календаря

## Описание проблемы

При клике на таймер в компоненте Header календарь должен вернуться на текущую неделю. Это работает корректно, если календарь прокручен недалеко от текущей даты, но при дальнем скролле возврат не происходит.

## Анализ кода

### Механизм возврата к текущей неделе

При клике на таймер в [Header.tsx](../src/4-widgets/Header/Header.tsx#L38-L41) выполняется:

```typescript
<Time onClick={()=>{
  calendarStore.setWeek(Date.now()/1000)
  uiStore.forceUpdate()
}}/>
```

Метод `setWeek` устанавливает значение `week` — метку времени текущей недели.

В [Calendar.tsx](../src/3-pages/Calendar/Calendar.tsx#L31-L37) есть эффект, который должен прокрутить календарь к нужной неделе:

```typescript
React.useEffect(() => {
  const container = bodyRef.current
  if (!container) return
  const selector = `[data-week-timestamp=\"${calendarStore.week}\"]`
  const weekDiv = container.querySelector<HTMLElement>(selector)
  weekDiv?.scrollIntoView({ block: 'start' })
}, [calendarStore.week, uiStore.mustForceUpdate])
```

### Механизм генерации структуры календаря

Ключевой момент находится в методе `getCalendarDataStructure` в [CalendarStore.ts](../src/3-pages/Calendar/CalendarStore.ts#L84-L111):

```typescript
getCalendarDataStructure(weekTimestamp: timestamp): CalendarWeekStructure[] {
  let currentTimestamp = weekTimestamp - this.shift*7*86400
  // ... генерация renderingSize (20) недель
}
```

Структура календаря генерируется начиная с даты: `weekTimestamp - shift * 7 дней`.

### Механизм корректировки сдвига

При скролле вызывается `correctShift` в [CalendarStore.ts](../src/3-pages/Calendar/CalendarStore.ts#L75-L78):

```typescript
correctShift(topBufferSize: number, bottomBufferSize: number) {
  if(topBufferSize < minBufferSize) this.shift += minBufferSize
  else if(bottomBufferSize < minBufferSize) this.shift -= minBufferSize
}
```

Этот метод поддерживает буферы (запас недель до и после видимой области) для плавного скроллинга.

### Корневая причина проблемы

**Проблема в том, что при установке новой недели через `setWeek()` не сбрасывается значение `shift`!**

#### Сценарий воспроизведения:

1. Пользователь открывает календарь, `shift = 4` (минимальный буфер)
2. Пользователь скроллит далеко в будущее
3. При скролле `correctShift` уменьшает `shift` (может стать отрицательным или очень маленьким)
4. Пользователь скроллит далеко в прошлое
5. `correctShift` увеличивает `shift` (может стать 20, 40, 100 и более)
6. Пользователь кликает на таймер
7. `setWeek(Date.now()/1000)` устанавливает `week` = текущая неделя
8. **НО `shift` остаётся большим (например, 100)**
9. `getCalendarDataStructure` генерирует структуру с `renderingSize = 20` недель, начиная с:
   - `текущая_неделя - 100 * 7 дней` = ~2 года назад
   - Диапазон отображаемых недель: ~2 года назад до ~1.5 года назад
10. Элемент с `data-week-timestamp` равным текущей неделе **не существует в DOM**
11. `querySelector` возвращает `null`
12. `scrollIntoView` не выполняется

## Решение

### Вариант 1: Сброс shift при установке недели (рекомендуемый)

В методе `setWeek` добавить сброс сдвига:

```typescript
setWeek(timestamp: timestamp) {
  this.week = DateTime.getBegintWeekTimestamp(timestamp)
  this.resetShift() // Сбросить сдвиг для корректного отображения
}
```

**Преимущества:**
- Минимальное изменение кода
- Гарантирует, что установленная неделя будет в центре отображаемой области
- Использует уже существующий метод `resetShift()`

**Недостатки:**
- При каждом переходе на конкретную неделю буфер пересоздаётся

### Вариант 2: Вычисление оптимального shift

Альтернативно, можно вычислить `shift` так, чтобы целевая неделя находилась в центре отображаемой области:

```typescript
setWeek(timestamp: timestamp) {
  this.week = DateTime.getBegintWeekTimestamp(timestamp)
  this.shift = Math.floor(renderingSize / 2)
}
```

Это поместит целевую неделю примерно в середину отображаемой области.

### Вариант 3: Интеллектуальный сброс в Header

В обработчике клика в Header явно вызывать сброс:

```typescript
<Time onClick={()=>{
  calendarStore.resetShift()
  calendarStore.setWeek(Date.now()/1000)
  uiStore.forceUpdate()
}}/>
```

**Преимущества:**
- Явное управление в месте использования
- Не влияет на другие случаи использования `setWeek`

**Недостатки:**
- Нужно помнить о сбросе в каждом месте использования
- Нарушает инкапсуляцию логики

## Рекомендация

**Рекомендуется Вариант 1** — изменить метод `setWeek` в CalendarStore:

```typescript
setWeek(timestamp: timestamp) {
  this.week = DateTime.getBegintWeekTimestamp(timestamp)
  this.resetShift()
}
```

Это обеспечит консистентное поведение при любом способе установки недели (клик на таймере, навигация и т.д.).

## Дополнительные замечания

1. При текущем `renderingSize = 20` недель и `minBufferSize = 4`, максимальный "запас" в каждую сторону составляет ~16 недель. Этого достаточно для обычного использования, но при активном скролле значение `shift` может выйти за разумные пределы.

2. Возможно, стоит добавить ограничения на минимальное и максимальное значение `shift`:

```typescript
correctShift(topBufferSize: number, bottomBufferSize: number) {
  if(topBufferSize < minBufferSize) {
    this.shift = Math.min(this.shift + minBufferSize, renderingSize - minBufferSize)
  } else if(bottomBufferSize < minBufferSize) {
    this.shift = Math.max(this.shift - minBufferSize, minBufferSize)
  }
}
```

Это предотвратит выход `shift` за границы отображаемой области.
