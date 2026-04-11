# Анализ предложения: Пер-документный EventStore

**Дата:** 9 апреля 2026 г.
**Автор:** AI Assistant
**Статус:** Анализ архитектурного предложения
**Связанные документы:**
- [shared-calendar-for-all-documents.md](./shared-calendar-for-all-documents.md)
- [shared-calendar-implementation-plan.md](./shared-calendar-implementation-plan.md)

---

## 1. Суть предложения

### 1.1 Текущая архитектура (проблема)

Сейчас существует **один глобальный EventsStore**, который используется для всех документов. При переключении между вкладками документов происходит следующее:

```
Document A активен → EventsStore содержит события A
         ↓ (пользователь кликает на вкладку Document B)
activateDocument(B) → storageService.applyContent(B.data)
         ↓
EventsStore.init() → ПОЛНАЯ ОЧИСТКА и перезагрузка данными из B
         ↓
eventsCache.init() → перестройка кэша
         ↓
CalendarStore.render() → обновление UI
```

**Проблемы текущего подхода:**
- **Очистка/загрузка данных** при каждом переключении вкладок
- **Потеря состояния** — при возврате к документу A нужно снова загружать данные
- **Производительность** — постоянные вызовы `init()`, которые сбрасывают `lastId`, вызывают `reset()` на менеджерах событий
- **Реактивность** — сложно реализовать мгновенное обновление при изменениях в документе

### 1.2 Предлагаемое решение

Создать **отдельный экземпляр EventsStore для каждого документа**. Таким образом:

```
Document A → EventsStore A (хранит события A)
Document B → EventsStore B (хранит события B)
Document C → EventsStore C (хранит события C)
         ↓
Общий календарь → агрегирует из EventsStore A + B + C
```

При переключении вкладок:
- **Не нужно очищать/загружать** — EventsStore уже содержит данные
- **Мгновенное переключение** — просто ссылаемся на другой EventsStore
- **Автоматическая агрегация** — для общего календаря собираем события из всех EventsStore

---

## 2. Детальный анализ

### 2.1 Плюсы предложения

#### ✅ 2.1.1 Устранение накладных расходов на переключение

**Текущее состояние:**
```typescript
// DocumentTabsStore.activateDocument()
activateDocument(documentId: DocumentId) {
  // ...
  session.state.isLoading = true  // Блокировка onChangeList
  this.storageService.applyContent(session.data)  // ← Вызывает eventsStore.init()
  session.state.isLoading = false
}
```

`eventsStore.init()` выполняет:
```typescript
init(d: EventsStoreData) {
  this.lastId = 1
  this.singleEventManager.reset()      // ← Очистка
  this.repeatableEventManager.reset()  // ← Очистка
  d.completedList?.forEach(e => {
    this.addCompletedEventDto(e, false)  // ← Добавление заново
  })
  d.plannedList?.forEach(e => {
    this.addPlannedEventDto(e, false)  // ← Добавление заново
  })
  this.onChangeList()  // ← Триггер перестройки eventsCache
}
```

**С пер-документным EventStore:**
```typescript
activateDocument(documentId: DocumentId) {
  this.state.activeDocumentId = documentId
  // Ничего не нужно загружать — EventsStore уже содержит данные!
  this.eventsCache.rebuild()  // Перестроить кэш из активного EventsStore
  this.persistToLocalStorage()
}
```

**Экономия:** Для документа с 100 событиями:
- **Сейчас:** 100× `addCompletedEventDto` + 100× `addPlannedEventDto` + `reset()` + `onChangeList()`
- **Предложение:** 0 операций — данные уже в памяти

#### ✅ 2.1.2 Естественная изоляция данных

Каждый документ имеет **собственный жизненный цикл**:
- События документа A не могут случайно попасть в документ B
- ID событий уникальны в рамках своего EventsStore (нет конфликтов)
- Удаление документа = удаление EventsStore (естественная очистка памяти)

#### ✅ 2.1.3 Упрощение агрегации для общего календаря

**Текущий подход (виртуальный документ):**
```typescript
// Нужно модифицировать ID событий для избежания коллизий
aggregated.completedList.push(
  ...doc.data.completedList.map(e => ({
    ...e,
    id: `${docPrefix}_${e.id}`  // ← Искусственная модификация
  }))
)
```

Затем при редактировании:
```typescript
// Нужно обратно преобразовать ID
const parsed = AggregatedEventResolver.parseAggregatedId(eventId)
// Найти исходный документ
// Активировать его
// Обновить событие с оригинальным ID
```

**С пер-документным EventStore:**
```typescript
// Агрегация без модификации ID
getAggregatedEvents(): EventCacheStructure[] {
  const allEvents: EventCacheStructure[] = []
  
  for (const [docId, eventsStore] of this.documentEventsStores) {
    const doc = this.documents.get(docId)
    const events = eventsStore.getAllEvents()
    
    // Добавляем метаданные о документе для визуальной маркировки
    events.forEach(e => {
      allEvents.push({
        ...e,
        sourceDocumentId: docId,  // ← Естественный идентификатор
        sourceDocumentColor: doc.color
      })
    })
  }
  
  return allEvents
}
```

**Преимущества:**
- Не нужно модифицировать ID событий
- Не нужен сложный резолвер составных ID
- Редактирование событий напрямую через исходный EventsStore
- `sourceDocumentId` — естественный составной ключ

#### ✅ 2.1.4 Упрощение управления балансом

**Текущий подход:** Баланс вычисляется в `EventsCache` на основе данных из одного EventsStore. Для виртуального документа нужно корректно агрегировать события из всех документов.

**С пер-документным EventStore:**
```typescript
getAggregatedBalance(): BalanceInfo {
  let totalActual = 0
  let totalPlanned = 0
  let maxActualBalanceDate = 0
  
  for (const eventsStore of this.documentEventsStores.values()) {
    const cache = new EventsCache(this.projectsStore, eventsStore)
    cache.init()
    
    totalActual += cache.lastActualBalance
    totalPlanned += cache.getPlannedBalance(today)
    maxActualBalanceDate = Math.max(maxActualBalanceDate, cache.lastActualBalanceDate)
  }
  
  return { totalActual, totalPlanned, maxActualBalanceDate }
}
```

**Важно:** Баланс можно вычислять **инкрементально** — при изменении одного документа пересчитывать только его вклад.

#### ✅ 2.1.5 Потенциал для параллельных операций

В будущем можно реализовать:
- Параллельное сохранение документов в Google Drive
- Фоновую синхронизацию без блокировки UI
- Частичную загрузку/выгрузку документов (LRU-кэш)

#### ✅ 2.1.6 Согласованность с FSD

Feature-Sliced Design поощряет **модульность и изоляцию**. Пер-документный EventsStore лучше соответствует принципам:
- Каждый документ — самодостаточный модуль
- Минимизация глобального состояния
- Явные зависимости между модулями

---

### 2.2 Минусы и риски предложения

#### ⚠️ 2.2.1 Увеличение потребления памяти

**Проблема:** Каждый EventsStore содержит:
- `SingleEventManager` с массивами `completed` и `planned`
- `RepeatableEventManager` с массивом `plannedRepeatable`
- Все связанные `EventModel` объекты

**Оценка:**
- 1 документ с 100 событиями ≈ ~50-100 КБ (зависит от сложности событий)
- 5 документов ≈ 250-500 КБ
- 20 документов ≈ 1-2 МБ

**Вердикт:** Для типичного сценария (3-10 открытых документов) **не критично**. Современные браузеры легко справляются с десятками МБ.

**Митигация:**
- Реализовать LRU-кэш для документов, которые давно не активировались
- Выгружать EventsStore неактивных документов в сериализованную форму (JSON) и хранить в `Map`
- При активации — десериализовать обратно

```typescript
class DocumentEventsStoreManager {
  private activeStores: Map<DocumentId, EventsStore> = new Map()
  private serializedStores: Map<DocumentId, string> = new Map()
  private readonly MAX_ACTIVE_STORES = 10  // Настройка
  
  getEventsStore(docId: DocumentId): EventsStore {
    let store = this.activeStores.get(docId)
    
    if (!store) {
      // Проверяем сериализованную версию
      const serialized = this.serializedStores.get(docId)
      if (serialized) {
        store = this.deserializeStore(serialized)
      } else {
        store = this.createNewStore(docId)
      }
      
      this.activeStores.set(docId, store)
      this.enforceMaxSize()
    }
    
    return store
  }
  
  private enforceMaxSize() {
    while (this.activeStores.size > this.MAX_ACTIVE_STORES) {
      // Удаляем наименее недавно использованный
      const [lruId, lruStore] = this.activeStores.entries().next().value
      const serialized = this.serializeStore(lruStore)
      this.serializedStores.set(lruId, serialized)
      this.activeStores.delete(lruId)
    }
  }
}
```

#### ⚠️ 2.2.2 Сложность управления множественными сторами

**Текущее состояние:**
```typescript
// Один EventsStore — простая инъекция зависимостей
constructor(
  private eventsStore: EventsStore,  // ← единственный экземпляр
  private projectsStore: ProjectsStore
) {
```

**С пер-документным EventStore:**
```typescript
// Нужен менеджер для управления коллекцией
constructor(
  private eventsStoreManager: EventsStoreManager,  // ← фабрика/менеджер
  private projectsStore: ProjectsStore
) {
```

**Влияние:**
- Нужно создать `EventsStoreManager` или `DocumentEventsStoreRegistry`
- Изменить все места инъекции `EventsStore`
- Обновить `StorageService`, `EventsCache`, `CalendarStore`

**Оценка сложности:** **Средняя** — требует рефакторинга, но концептуально просто.

#### ⚠️ 2.2.3 Реактивность и MobX

**Проблема:** MobX отслеживает изменения в observable-объектах. Сейчас `EventsStore` — единственный observable-объект, на который подписаны компоненты.

С множественными EventsStore нужно:
- Сделать `EventsStoreManager` observable
- Подписаться на изменения всех EventsStore
- При изменении любого EventsStore — уведомить подписчиков

**Решение:**
```typescript
class EventsStoreManager {
  @observable private stores = new Map<DocumentId, EventsStore>()
  @observable private lastChangeTimestamp = 0  // Для триггера реактивности
  
  get activeEventsStore(): EventsStore | null {
    const activeDocId = this.documentTabsStore.activeDocumentId
    return activeDocId ? this.stores.get(activeDocId) : null
  }
  
  @action
  updateActiveDocumentData(data: DocumentData) {
    const session = this.documentTabsStore.activeDocument
    if (!session) return
    
    let store = this.stores.get(session.id)
    if (!store) {
      store = this.createEventsStore(session.data)
      this.stores.set(session.id, store)
    }
    
    store.init(data)
    this.lastChangeTimestamp = Date.now()  // Триггер для MobX
  }
  
  // Для общего календаря
  @computed
  get aggregatedEvents(): EventCacheStructure[] {
    // MobX автоматически отслеживает изменения в this.stores
    const allEvents: EventCacheStructure[] = []
    for (const [docId, store] of this.stores) {
      const doc = this.documentTabsStore.documents.find(d => d.id === docId)
      store.getAllEvents().forEach(e => {
        allEvents.push({ ...e, sourceDocumentId: docId, sourceDocumentColor: doc.color })
      })
    }
    return allEvents
  }
}
```

**Важно:** `EventsStore` должен экспортировать observable-свойства (`completed`, `planned`, `plannedRepeatable`), чтобы MobX мог отслеживать изменения.

#### ⚠️ 2.2.4 EventsCache должен знать об активном EventsStore

**Текущее состояние:**
```typescript
// EventsCache читает из глобального eventsStore
getEvents(date: timestamp): EventCacheStructure[] {
  this.eventsStore.planned.reduce(...)
  this.eventsStore.plannedRepeatable.reduce(...)
  this.eventsStore.completed.reduce(...)
}
```

**С пер-документным EventStore:**
```typescript
// Вариант 1: EventsCache получает ссылку на активный EventsStore
getEvents(date: timestamp): EventCacheStructure[] {
  const activeStore = this.eventsStoreManager.activeEventsStore
  if (!activeStore) return []
  
  activeStore.planned.reduce(...)
  // ...
}

// Вариант 2: EventsCache работает с агрегированными данными
getAggregatedEvents(date: timestamp): EventCacheStructure[] {
  // Собирает из всех EventsStore
}
```

**Риск:** Нужно обновить `EventsCache` для работы с менеджером, а не прямым EventsStore.

#### ⚠️ 2.2.5 Инициализация при загрузке приложения

**Текущее состояние:**
```typescript
// В App.tsx или root.ts
const eventsStore = new EventsStore(projectsStore)
const storageService = new StorageService(projectsStore, eventsStore)
storageService.init()  // Загружает из localStorage
```

**С пер-документным EventStore:**
```typescript
// При загрузке нужно создать EventsStore для каждого документа
const eventsStoreManager = new EventsStoreManager(documentTabsStore)

for (const doc of documentTabsStore.documents) {
  const store = new EventsStore(projectsStore)
  store.init(doc.data)
  eventsStoreManager.register(doc.id, store)
}
```

**Сложность:** **Низкая** — одноразовая операция при старте.

---

### 2.3 Сравнение подходов

| Критерий | Текущий (один EventsStore) | Предложение (пер-документный) |
|----------|---------------------------|-------------------------------|
| **Переключение вкладок** | Очистка + загрузка (O(n)) | Мгновенное (O(1)) |
| **Потребление памяти** | 1× EventsStore | N× EventsStore (N = кол-во документов) |
| **Агрегация для общего календаря** | Сложная (модификация ID) | Простая (естественные ID) |
| **Редактирование событий** | Прямое | Прямое (через EventsStore документа) |
| **Реактивность** | Простая (один observable) | Сложнее (менеджер + подписки) |
| **Общий баланс** | Автоматический | Требует агрегации |
| **Сложность реализации** | Низкая | Средняя |
| **Масштабируемость** | Низкая | Высокая |

---

## 3. Рекомендации

### 3.1 Вердикт: ✅ ПРЕДЛОЖЕНИЕ ОДОБРЯЕТСЯ

Предложение о создании пер-документного EventStore **архитектурно корректно** и решает ключевые проблемы текущего подхода:

1. ✅ **Устраняет накладные расходы** на переключение вкладок
2. ✅ **Упрощает агрегацию** для общего календаря
3. ✅ **Обеспечивает естественную изоляцию** данных документов
4. ✅ **Снижает сложность** резолвинга составных ID

### 3.2 Рекомендации по реализации

#### 3.2.1 Создать EventsStoreManager

```typescript
// src/6-entities/Events/EventsStoreManager.ts
export class EventsStoreManager {
  @observable private stores = new Map<DocumentId, EventsStore>()
  
  constructor(
    private documentTabsStore: DocumentTabsStore,
    private projectsStore: ProjectsStore
  ) {}
  
  @action
  createOrGetStore(documentId: DocumentId): EventsStore {
    if (!this.stores.has(documentId)) {
      const doc = this.documentTabsStore.documents.find(d => d.id === documentId)
      if (!doc) throw new Error(`Document ${documentId} not found`)
      
      const store = new EventsStore(this.projectsStore)
      store.init(doc.data)
      this.stores.set(documentId, store)
    }
    return this.stores.get(documentId)!
  }
  
  @action
  removeStore(documentId: DocumentId): void {
    this.stores.delete(documentId)
  }
  
  get activeEventsStore(): EventsStore | null {
    const activeId = this.documentTabsStore.activeDocumentId
    return activeId ? this.stores.get(activeId) : null
  }
  
  // Для общего календаря
  @computed
  get allEventsStores(): EventsStore[] {
    return Array.from(this.stores.values())
  }
}
```

#### 3.2.2 Обновить DocumentTabsStore

```typescript
// Вместо вызова storageService.applyContent()
activateDocument(documentId: DocumentId) {
  this.state.activeDocumentId = documentId
  
  // EventsStore уже содержит данные — не нужно загружать
  this.eventsCache.rebuild()  // Перестроить кэш из активного store
  
  this.persistToLocalStorage()
}

openNewDocument(name: string) {
  const session = this.createNewDocument(name)
  
  // Создать EventsStore для нового документа
  this.eventsStoreManager.createOrGetStore(session.id)
  
  // Не нужно вызывать storageService.applyContent()!
}
```

#### 3.2.3 Обновить EventsCache

```typescript
// EventsCache получает ссылку на EventsStoreManager
class EventsCache {
  constructor(
    private eventsStoreManager: EventsStoreManager,
    private projectsStore: ProjectsStore
  ) {}
  
  init() {
    // Очищаем кэш — данные будут загружены лениво
    this.cachedEvents = []
    // ...
  }
  
  getEvents(date: timestamp): EventCacheStructure[] {
    const activeStore = this.eventsStoreManager.activeEventsStore
    if (!activeStore) return []
    
    // Используем activeStore вместо this.eventsStore
    activeStore.planned.reduce(...)
    // ...
  }
  
  // Новый метод для общего календаря
  getAggregatedEvents(date: timestamp): EventCacheStructure[] {
    const allEvents: EventCacheStructure[] = []
    
    for (const store of this.eventsStoreManager.allEventsStores) {
      const docId = this.getDocumentIdForStore(store)
      const doc = this.documentTabsStore.documents.find(d => d.id === docId)
      
      store.planned.forEach(e => {
        allEvents.push({
          ...singleEventToEventCache(e, date, false, 
            doc?.color ?? '#3B82F6', 
            doc?.background ?? '#EFF6FF'),
          sourceDocumentId: docId,
          sourceDocumentColor: doc?.color
        })
      })
      
      // ... для plannedRepeatable и completed
    }
    
    return allEvents
  }
}
```

#### 3.2.4 Обновить StorageService

```typescript
// StorageService больше не нужен eventsStore
class StorageService {
  constructor(
    private projectsStore: ProjectsStore,
    private eventsStoreManager: EventsStoreManager  // ← вместо eventsStore
  ) {}
  
  applyContent(documentId: DocumentId, content: unknown) {
    const normalized = normalizeMainStoreData(content)
    this.projectsStore.init(normalized.projectsList)
    
    // Обновляем EventsStore конкретного документа
    const store = this.eventsStoreManager.createOrGetStore(documentId)
    store.init(normalized)
  }
  
  saveToLocalStorage(documentId: DocumentId) {
    const store = this.eventsStoreManager.getStore(documentId)
    if (!store) return
    
    const data: MainStoreData = {
      projectsList: this.projectsStore.getList(),
      ...store.prepareToSave()
    }
    
    localStorage.setItem(`document_${documentId}`, JSON.stringify(data))
  }
}
```

#### 3.2.5 Инициализация при загрузке

```typescript
// В App.tsx или main.tsx
async function bootstrap() {
  const projectsStore = new ProjectsStore()
  const documentTabsStore = new DocumentTabsStore(googleApiService, storageService)
  
  // Восстановить документы из localStorage
  await documentTabsStore.restoreFromLocalStorage()
  
  // Создать EventsStore для каждого документа
  const eventsStoreManager = new EventsStoreManager(documentTabsStore, projectsStore)
  
  for (const doc of documentTabsStore.documents) {
    eventsStoreManager.createOrGetStore(doc.id)
  }
  
  // Создать EventsCache с менеджером
  const eventsCache = new EventsCache(eventsStoreManager, projectsStore)
  eventsCache.init()
  
  // Примонтировать приложение
  ReactDOM.render(<App stores={{ documentTabsStore, eventsStoreManager, eventsCache }} />, root)
}
```

### 3.3 Потенциальные проблемы и митигация

| Проблема | Митигация |
|----------|-----------|
| **Увеличение памяти** | LRU-кэш с сериализацией неактивных сторов (см. 2.2.1) |
| **Сложность реактивности** | Сделать `EventsStoreManager` observable с `@computed` геттерами |
| **Обратная совместимость** | Поэтапный рефакторинг — сначала создать менеджер, потом мигрировать компоненты |
| **Тестирование** | Каждый EventsStore тестируется изолированно — упрощает unit-тесты |

### 3.4 Поэтапный план миграции

**Не нужно переделывать всё сразу!** Предлагаю итеративный подход:

#### Этап 1: Создание EventsStoreManager (1 день)
- Создать класс `EventsStoreManager`
- Реализовать `createOrGetStore`, `removeStore`, `activeEventsStore`
- Написать unit-тесты

#### Этап 2: Интеграция с DocumentTabsStore (1 день)
- Обновить `DocumentTabsStore` для работы с `EventsStoreManager`
- Убрать вызовы `storageService.applyContent()` при активации
- Обновить `openNewDocument`, `closeDocument`, `restoreFromLocalStorage`

#### Этап 3: Обновление EventsCache (1 день)
- Изменить `EventsCache` для работы с `EventsStoreManager`
- Добавить метод `getAggregatedEvents` для общего календаря
- Обновить вычисление баланса

#### Этап 4: Обновление StorageService (0.5 дня)
- Изменить `StorageService` для работы с `EventsStoreManager`
- Обновить `applyContent`, `saveToLocalStorage`

#### Этап 5: Обновление UI-компонентов (1 день)
- Обновить `Calendar`, `DayList`, `Projects` для работы с новым подходом
- Протестировать переключение вкладок
- Убедиться в корректности реактивности

#### Этап 6: Реализация общего календаря (2 дня)
- Теперь, когда EventsStore пер-документный, реализовать виртуальную вкладку **гораздо проще**
- Не нужна модификация ID событий
- Не нужен `AggregatedEventResolver`
- Агрегация напрямую из EventsStore

**Итого:** ~6.5 дней vs ~3 дня (текущий план с виртуальным документом)

**НО:** Текущий план оставляет технический долг (составные ID, сложная агрегация), который будет мешать в будущем. Пер-документный подход — **более чистое архитектурное решение**.

---

## 4. Сравнение с текущим планом реализации

### 4.1 Текущий план (виртуальный документ с составными ID)

**Плюсы:**
- ✅ Меньше изменений в архитектуре
- ✅ Быстрее реализовать (~3 дня)
- ✅ Сохраняет один EventsStore

**Минусы:**
- ❌ Составные ID событий — **хрупкий хак**
- ❌ Сложный резолвинг при редактировании
- ❌ Постоянная очистка/загрузка при переключении
- ❌ Сложная агрегация баланса

### 4.2 Предложение (пер-документный EventStore)

**Плюсы:**
- ✅ Естественная изоляция данных
- ✅ Мгновенное переключение вкладок
- ✅ Простая агрегация для общего календаря
- ✅ Нет составных ID — события сохраняют оригинальные ID
- ✅ Легче тестировать (изоляция)
- ✅ Масштабируемость

**Минусы:**
- ❌ Больше изменений в архитектуре
- ❌ Дольше реализовать (~6.5 дней)
- ❌ Увеличение потребления памяти (но не критично)

---

## 5. Итоговая рекомендация

### 🎯 РЕАЛИЗОВАТЬ ПЕР-ДОКУМЕНТНЫЙ EVENTSTORE

**Обоснование:**

1. **Долгосрочная выгода превышает краткосрочные затраты.** Да, реализация займёт в 2 раза больше времени, но:
   - Устранит технический долг (составные ID)
   - Упростит будущие расширения (общий календарь, фильтрация по документам)
   - Улучшит производительность при переключении

2. **Архитектурная чистота.** Каждый документ — самодостаточный модуль со своим EventsStore. Это соответствует принципам FSD.

3. **Упрощение общего календаря.** С пер-документным EventsStore реализовать виртуальную вкладку "Общий календарь" **проще**, чем с текущим подходом:
   - Не нужна модификация ID
   - Не нужен `AggregatedEventResolver`
   - Агрегация напрямую из EventsStore
   - Редактирование событий через исходный EventsStore

4. **Масштабируемость.** В будущем можно добавить:
   - Фильтрацию событий по документам в календаре
   - Перетаскивание событий между документами
   - Сравнение календарей документов side-by-side

### Предупреждения

⚠️ **Важно:** При реализации уделить внимание:
1. **Реактивности MobX** — сделать `EventsStoreManager` правильно observable
2. **Управлению памятью** — реализовать LRU-кэш при >10 открытых документах
3. **Обратной совместимости** — поэтапная миграция, не ломая существующий функционал
4. **Тестированию** — каждый EventsStore тестируется изолированно

---

## 6. Заключение

Предложение о создании пер-документного EventStore **архитектурно корректно** и **рекомендуется к реализации**. Несмотря на большие первоначальные затраты времени, оно обеспечивает:

- ✅ Более чистую архитектуру
- ✅ Лучшую производительность при переключении
- ✅ Упрощённую реализацию общего календаря
- ✅ Масштабируемость для будущих расширений

**Следующий шаг:** Обновить план реализации в `shared-calendar-implementation-plan.md` с учётом пер-документного EventStore.

---

**Дата анализа:** 9 апреля 2026 г.
**Статус:** ✅ Готов к реализации
**Приоритет:** Высокий (рекомендуется реализовать до общего календаря)
