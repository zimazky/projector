# Анализ проблемы: новый документ не обновляет содержимое календаря

## Описание проблемы

При открытии нового документа создаётся новая вкладка, но содержимое календаря не меняется — отображается содержимое предыдущего документа вместо нового.

## Подтверждение догадки: проблема в колбэке

**Догадка пользователя подтверждена:** при открытии новой вкладки не выполняется колбэк, связанный с изменением активной вкладки.

### Анализ потока данных

#### Как работает переключение вкладок (штатный режим):

```
Клик на вкладку → activateDocument(id) →
  this.state.activeDocumentId = id (MobX observable) →
  this.onActiveDocumentChanged?.(documentId) (КОЛБЭК) →
  MainStore: this.eventsCache.init() →
  EventsCache читает новый activeEventsStore →
  Calendar re-render (через MobX observer)
```

#### Как работает открытие нового документа (ПРОБЛЕМА):

```
Кнопка "+" → openNewDocument(name) →
  this.state.activeDocumentId = id (MobX observable) →
  НЕТ ВЫЗОВА onActiveDocumentChanged! →
  EventsCache НЕ инвалидируется →
  Calendar НЕ обновляется
```

### Код с проблемой

Файл: `src/6-entities/Document/model/DocumentTabsStore.ts`

#### Метод `openNewDocument()` (строки 102-123):

```typescript
openNewDocument(name: string = 'Новый документ') {
    const id = generateDocumentId()
    const session: DocumentSession = { /* ... */ }
    this.state.documents.set(id, session)
    this.state.documentOrder.push(id)
    this.state.activeDocumentId = id  // ← Меняется observable

    session.state.isLoading = true
    this.documentStoreManager.createStores(id)
    session.state.isLoading = false

    this.persistToLocalStorage()
    this.persistDocumentDataToLocalStorage(id)
    // ← НЕТ ВЫЗОВА onActiveDocumentChanged!
}
```

#### Метод `activateDocument()` (строки 207-224):

```typescript
activateDocument(documentId: DocumentId) {
    const session = this.state.documents.get(documentId)
    if (!session) return

    this.state.activeDocumentId = documentId
    session.lastAccessedAt = Date.now()

    const previousLoadingState = session.state.isLoading
    session.state.isLoading = true
    if (!this.documentStoreManager.hasStores(documentId)) {
        this.documentStoreManager.createStores(documentId)
    }
    session.state.isLoading = previousLoadingState

    // ← ЕСТЬ ВЫЗОВ КОЛБЭКА!
    this.onActiveDocumentChanged?.(documentId)

    this.persistToLocalStorage()
}
```

### Вывод

Метод `openNewDocument()` напрямую устанавливает `activeDocumentId`, но **не вызывает колбэк** `onActiveDocumentChanged`. Это приводит к тому, что `EventsCache` не инвалидируется и календарь продолжает показывать данные старого документа.

---

## Предложение пользователя: использование MobX reaction

### Идея

Завязать смену содержимого календаря не на явный колбэк, а на **реактивное изменение** идентификатора активного документа через `reaction` или `autorun` в MobX.

### Вариант реализации

Вместо:
```typescript
// В MainStore.init():
this.documentTabsStore.setOnActiveDocumentChanged(() => {
    this.eventsCache.init()
})
```

Использовать:
```typescript
// В MainStore.init():
reaction(
    () => this.documentTabsStore.activeDocumentId,
    (documentId) => {
        if (documentId) {
            this.eventsCache.init()
        }
    }
)
```

Или с `autorun`:
```typescript
autorun(() => {
    const documentId = this.documentTabsStore.activeDocumentId
    if (documentId) {
        this.eventsCache.init()
    }
})
```

### Оценка подхода

#### ✅ Преимущества

1. **Декларативность**: Реакция явно выражает зависимость "activeDocumentId → invalidate cache"
2. **Автоматическое срабатывание**: Reaction сработает при **любом** изменении `activeDocumentId`, независимо от того, из какого метода оно произошло (`openNewDocument`, `activateDocument`, `closeDocument`, `restoreFromLocalStorage`)
3. **Уменьшение boilerplate**: Нет необходимости явно вызывать колбэки в каждом методе
4. **Устойчивость к человеческому фактору**: При добавлении нового метода, изменяющего `activeDocumentId`, не нужно помнить о вызове колбэка
5. **Соответствие принципам MobX**: MobX спроектирован для реактивного программирования, reaction — стандартный паттерн

#### ⚠️ Недостатки и риски

1. **Потеря контроля над порядком выполнения**:
   - Reaction выполняется **асинхронно** (в следующем тике event loop) по умолчанию
   - Колбэк выполняется **синхронно** сразу после установки `activeDocumentId`
   - Это может привести к race condition, если код после изменения `activeDocumentId` зависит от инвалидации кэша

2. **Сложность отладки**:
   - При использовании колбэков цепочка вызовов очевидна из кода
   - Reaction "магически" реагирует на изменения, что усложняет tracing

3. **Возможные лишние срабатывания**:
   - Reaction сработает при **любом** изменении `activeDocumentId`, даже если это промежуточное значение
   - Например, при закрытии документа `activeDocumentId` может меняться дважды (null → новый id)

4. **Производительность**:
   - Минимальный overhead от отслеживания reaction (обычно пренебрежимо)

#### ⚡ Важное замечание про `reaction` vs `autorun`

- **`reaction`**: отслеживает конкретное значение и вызывает колбэк только при его изменении
- **`autorun`**: запускается при любом изменении используемых observables

Для данного случая **`reaction` предпочтительнее**, т.к.:
- Нужно реагировать только на изменение `activeDocumentId`
- `autorun` будет запускаться чаще, чем нужно

---

## Рекомендуемые варианты решения

### Вариант 1: Исправить колбэк (быстрое решение) 🔧

**Подход**: Добавить вызов `onActiveDocumentChanged` в `openNewDocument()`

**Изменения**:
```typescript
// В DocumentTabsStore.openNewDocument()
openNewDocument(name: string = 'Новый документ') {
    const id = generateDocumentId()
    // ... создание документа ...
    this.state.activeDocumentId = id

    session.state.isLoading = true
    this.documentStoreManager.createStores(id)
    session.state.isLoading = false

    this.persistToLocalStorage()
    this.persistDocumentDataToLocalStorage(id)

    // ← ДОБАВИТЬ:
    this.onActiveDocumentChanged?.(id)
}
```

**Плюсы**:
- ✅ Минимальные изменения
- ✅ Сохраняется текущая архитектура
- ✅ Синхронное выполнение (нет race condition)

**Минусы**:
- ❌ Не решает архитектурную проблему
- ❌ Нужно помнить о колбэках в каждом методе
- ❌ Boilerplate код

**Оценка**: Подходит как hotfix, но не как долгосрочное решение

---

### Вариант 2: Использовать MobX reaction (рекомендуемый) 🎯

**Подход**: Заменить колбэки на `reaction` в `MainStore`

**Изменения**:

1. **MainStore.ts**:
```typescript
import { makeAutoObservable, reaction } from 'mobx'

init() {
    // ... остальной код ...

    // РЕАКТИВНАЯ инвалидация кэша при смене документа
    reaction(
        () => this.documentTabsStore.activeDocumentId,
        (documentId) => {
            if (documentId) {
                this.eventsCache.init()
            }
        }
    )

    this.eventsCache.init()
    // ...
}
```

2. **DocumentTabsStore.ts**:
- Удалить `onActiveDocumentChanged` и `setOnActiveDocumentChanged()`
- Удалить все вызовы `this.onActiveDocumentChanged?.()`

**Плюсы**:
- ✅ Декларативная реактивность
- ✅ Автоматическое срабатывание при любом изменении
- ✅ Уменьшение boilerplate
- ✅ Современный подход в MobX
- ✅ Устойчивость к человеческому фактору

**Минусы**:
- ⚠️ Нужно убедиться, что reaction не ломает асинхронность
- ⚠️ Требуется тестирование edge cases

**Оценка**: **Рекомендуемый подход**, соответствует современным паттернам MobX

---

### Вариант 3: Computed property + автореакция в UI (альтернативный) 🔄

**Подход**: Использовать computed property для получения активного eventsStore и позволить MobX автоматически отслеживать изменения

**Изменения**:

1. **EventsCache.ts**:
```typescript
// Вместо ручного init()
get activeEventsStore() {
    return this.provider.activeEventsStore  // <- computed getter
}

getEvents(date: timestamp): EventCacheStructure[] {
    const eventsStore = this.activeEventsStore
    // MobX автоматически отслеживает изменения eventsStore!
}
```

2. Удалить ручную инвалидацию кэша

**Плюсы**:
- ✅ Полностью реактивный подход
- ✅ Нет явных колбэков или reaction
- ✅ MobX сам управляет зависимостями

**Минусы**:
- ❌ Требует глубокого рефакторинга EventsCache
- ❌ Кэш должен перестроиться на computed values
- ❌ Высокий риск регрессий
- ❌ Потеря производительности (пересчёт при каждом access)

**Оценка**: Интересный подход, но слишком рискованный для текущей архитектуры

---

### Вариант 4: Гибридный подход (лучший для текущей архитектуры) 🏆

**Подход**: Комбинация reaction для автоматической инвалидации + явные колбэки для специфичной логики

**Изменения**:

1. **MainStore.ts**:
```typescript
init() {
    // Колбэки на изменения данных (events, projects) — остаются
    this.documentTabsStore.setOnStoresChanged({
        onEventsChanged: (stores) => { /* ... */ },
        onProjectsChanged: (stores) => { /* ... */ }
    })

    // РЕАКТИВНАЯ инвалидация при смене документа
    reaction(
        () => this.documentTabsStore.activeDocumentId,
        (documentId) => {
            if (documentId) {
                this.eventsCache.init()
            }
        }
    )

    this.eventsCache.init()
    // ...
}
```

2. **DocumentTabsStore.ts**:
- Удалить `onActiveDocumentChanged` и связанные методы
- Удалить все вызовы колбэка

**Плюсы**:
- ✅ Сохраняется специфичная логика колбэков для данных
- ✅ Автоматическая инвалидация при смене документа
- ✅ Минимальные изменения в DocumentTabsStore
- ✅ Современный и устойчивый подход

**Минусы**:
- ⚠️ Небольшая сложность (две системы: reaction + колбэки)

**Оценка**: **Лучший баланс** между современными паттернами и текущей архитектурой

---

## Сравнительная таблица вариантов

| Вариант | Сложность | Риск | Долгосрочная поддержка | Современность |
|---------|-----------|------|------------------------|---------------|
| 1. Исправить колбэк | ⭐ | Низкий | ⭐⭐ | ⭐⭐ |
| 2. MobX reaction | ⭐⭐ | Средний | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 3. Computed property | ⭐⭐⭐⭐ | Высокий | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 4. Гибридный | ⭐⭐ | Низкий | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## Итоговая рекомендация

**Рекомендуем Вариант 4 (Гибридный)** как оптимальный баланс:

1. **Быстрая фиксация бага**: Использовать `reaction` для `activeDocumentId`
2. **Сохранение существующих колбэков** для `onStoresChanged` (events/projects)
3. **Удаление** `onActiveDocumentChanged` колбэка как избыточного

### План реализации

1. В `MainStore.init()` добавить `reaction` на `activeDocumentId`
2. Удалить `setOnActiveDocumentChanged` из `DocumentTabsStore`
3. Удалить все вызовы `onActiveDocumentChanged` из методов
4. Протестировать все сценарии:
   - Открытие нового документа
   - Переключение между вкладками
   - Закрытие документа
   - Восстановление из localStorage
   - Открытие из Google Drive

### Риски и mitigation

| Риск | Mitigation |
|------|------------|
| Reaction выполняется асинхронно | Использовать `{ fireImmediately: true }` |
| Лишние срабатывания | Добавить проверку `if (documentId)` |
| Regression | Полное тестирование всех сценариев |

---

## Заключение

Проблема подтверждена: `openNewDocument()` не вызывает `onActiveDocumentChanged`, из-за чего кэш не инвалидируется.

**Рекомендуемый подход**: Переход на `reaction` для отслеживания изменений `activeDocumentId` — современный, устойчивый и декларативный паттерн в MobX.

**Почему reaction лучше колбэков**:
- ✅ Автоматическое срабатывание (не нужно помнить о вызове)
- ✅ Декларативность (ясная зависимость в коде)
- ✅ Соответствие принципам реактивного программирования
- ✅ Уменьшение boilerplate и человеческих ошибок
