# Анализ и рекомендации по плану миграции DocumentStoreManager

**Дата:** 11 апреля 2026 г.  
**Рецензент:** AI Assistant  
**Предмет анализа:** [document-store-manager-migration-plan.md](./document-store-manager-migration-plan.md) и [per-document-eventstore-analysis.md](./per-document-eventstore-analysis.md)  
**Статус:** Архитектурный обзор

---

## 1. Общая оценка

План миграции с глобальных `EventsStore`/`ProjectsStore` на пер-документный `DocumentStoreManager` является **архитектурно обоснованным и стратегически верным**. Предлагаемое решение устраняет ключевую проблему текущей архитектуры — полную перезагрузку данных при переключении вкладок — и закладывает фундамент для общего календаря.

Однако при детальном анализе выявлен ряд проблем, которые при отсутствии корректировки могут привести к техническим долгам, хрупкости реактивности и нарушению принципов FSD. Ниже представлен подробный разбор.

---

## 2. Сильные стороны плана

### 2.1 ✅ Правильный выбор композиции над наследованием

Решение сделать `DocumentStoreManager` приватным полем `DocumentTabsStore` (композиция), а не отдельным глобальным сервисом — архитектурно корректно. Это:

- Устраняет циклические зависимости между `DocumentStoreManager` и `DocumentTabsStore`
- Соблюдает принцип **ownership** — менеджер сторов принадлежит менеджеру вкладок
- Упрощает инициализацию — не нужно прокидывать `DocumentStoreManager` через `StoreContext`

### 2.2 ✅ Поэтапная миграция

Разбивка на 7 фаз с чек-листами — правильный подход. Каждая фаза завершается компилируемым состоянием, что снижает риск «сломанного окна».

### 2.3 ✅ Отказ от LRU-кэша на данном этапе

Прагматичное решение. Для типичного сценария (3–10 документов) накладные расходы на LRU не оправданы. Откладывание оптимизации до появления реальной проблемы — правильный подход (YAGNI).

### 2.4 ✅ Естественная изоляция данных

Пер-документные сторы устраняют необходимость модификации ID событий для общего календаря — это серьёзное упрощение по сравнению с подходом «виртуальный документ с составными ID».

---

## 3. Критические проблемы

### 3.1 🔴 Нарушение слоёв FSD: `6-entities` → `3-pages`

**Проблема:** План размещает `DocumentStoreManager` в `src/6-entities/Document/model/`, при этом класс импортирует `ProjectsStore` из `src/3-pages/Projects/ProjectsStore`. В методологии FSD слой `entities` (6) **не может зависеть** от слоя `pages` (3). Это прямое нарушение правила импортов FSD: импорты разрешены только внутрь, не наружу.

```typescript
// DocumentStoreManager.ts — НАРУШЕНИЕ FSD
import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'  // 6 → 3 ❌
import { EventsStore } from 'src/6-entities/Events/EventsStore'    // 6 → 6 ✅
```

**Решение:** Перенести `ProjectsStore` из `src/3-pages/Projects/` в `src/6-entities/Projects/`. Проект — это сущность предметной области, а не страница. `ProjectsStore` не содержит UI-логики и логически принадлежит слою `entities`. Альтернативно — вынести интерфейс `IProjectsStore` в `6-entities` и использовать инверсию зависимостей.

### 3.2 🔴 Ручное управление реактивностью через `_lastChangeTimestamp`

**Проблема:** План предлагает использовать `_lastChangeTimestamp` и ручной колбэк `onStoresChange` для триггера реактивности MobX:

```typescript
// Из плана — АНТИПАТТЕРН MobX
private _lastChangeTimestamp: number = 0

eventsStore.onChangeList = () => {
  this._lastChangeTimestamp = Date.now()  // Ручной триггер
  this.onStoresChange?.(documentId, { ... })
}
```

Это **антипаттерн** в MobX. Библиотека предоставляет декларативные механизмы реактивности:

- `@computed` — автоматическое кэширование и пересчёт при изменении зависимостей
- `reaction()` / `autorun()` — декларативные побочные эффекты
- `@observable` — автоматическое отслеживание изменений

Ручной timestamp не гарантирует корректную работу с `shouldComponentUpdate`, `React.memo`, и может приводить к «потерянным» обновлениям при быстром переключении.

**Решение:** Использовать `@computed` геттер для `activeEventsStore` и `reaction()` для побочных эффектов:

```typescript
export class DocumentStoreManager {
  @observable private stores = new Map<DocumentId, DocumentStores>()

  @computed
  get activeStores(): DocumentStores | null {
    const activeId = this.documentTabsStore.activeDocumentId
    return activeId ? this.stores.get(activeId) ?? null : null
  }
}

// В MainStore.init():
reaction(
  () => this.documentStoreManager.activeStores,
  (stores) => {
    if (!stores) return
    stores.eventsStore.sort()
    this.eventsCache.rebuild(stores)
    this.storageService.desyncWithStorages()
  }
)
```

### 3.3 🔴 Отсутствие `dispose()` для динамически создаваемых сторов

**Проблема:** При создании каждого `EventsStore` и `ProjectsStore` через `makeAutoObservable()` MobX создаёт внутренние подписки и прокси. При удалении документа через `removeStores()` эти ресурсы **не освобождаются**, что приводит к утечкам памяти.

```typescript
// Из плана — нет очистки
removeStores(documentId: DocumentId): void {
  this.stores.delete(documentId)  // ❌ MobX-подписки не очищаются
}
```

**Решение:** Реализовать паттерн `Disposable`:

```typescript
export interface IDisposable {
  dispose(): void
}

export class DocumentStoreManager {
  removeStores(documentId: DocumentId): void {
    const stores = this.stores.get(documentId)
    if (stores) {
      // Очистка MobX-реакций, если они создавались внутри сторов
      stores.eventsStore.dispose?.()
      stores.projectsStore.dispose?.()
    }
    this.stores.delete(documentId)
  }
}
```

### 3.4 🔴 `any[]` в типах `updateStoresData`

**Проблема:** Метод `updateStoresData` использует `any[]` для параметров:

```typescript
updateStoresData(documentId: DocumentId, data: {
  projectsList: any[]; completedList: any[]; plannedList: any[]  // ❌ any
}): void
```

Это полностью лишает TypeScript защиты от ошибок и нарушает принцип type-safety.

**Решение:** Использовать существующие типы:

```typescript
updateStoresData(documentId: DocumentId, data: DocumentData): void {
  const stores = this.getOrCreateStores(documentId)
  stores.projectsStore.init(data.projectsList)
  stores.eventsStore.init({
    completedList: data.completedList,
    plannedList: data.plannedList
  })
}
```

Тип `DocumentData` уже определён в `DocumentTabsStore.types.ts` и содержит именно нужные поля.

---

## 4. Существенные замечания

### 4.1 🟡 `getActiveStores(getActiveId)` — неестественный API

**Проблема:** Метод `getActiveStores` принимает функцию-геттер вместо прямой ссылки:

```typescript
getActiveStores(getActiveId: () => DocumentId | null): DocumentStores | null {
  const id = getActiveId()
  return id ? this.getOrCreateStores(id) : null
}
```

Это нарушает принцип **Tell, Don't Ask** — `DocumentStoreManager` вынужден запрашивать состояние извне вместо того, чтобы иметь прямой доступ.

**Решение:** Передать ссылку на `DocumentTabsStore` в конструктор `DocumentStoreManager`:

```typescript
constructor(private documentTabsStore: DocumentTabsStore) {
  makeAutoObservable(this)
}

@computed
get activeStores(): DocumentStores | null {
  const activeId = this.documentTabsStore.activeDocumentId
  return activeId ? this.stores.get(activeId) ?? null : null
}
```

Это создаёт циклическую зависимость? Нет — `DocumentStoreManager` создаётся внутри `DocumentTabsStore` и не экспортируется наружу. Цикл разрывается через композицию.

### 4.2 🟡 `StorageService` — неполная миграция

**Проблема:** В Фазе 4 план предлагает переписать `StorageService`, но метод `saveToLocalStorage` всё ещё использует единый ключ `'data'`:

```typescript
// Из плана — Фаза 4
saveToLocalStorage = (documentId: DocumentId) => {
  const stores = this.documentTabsStore.getDocumentStores(documentId)
  if (!stores) return
  const data = { projectsList: stores.projectsStore.getList(), ...stores.eventsStore.prepareToSave() }
  localStorage.setItem('data', JSON.stringify(data))  // ❌ Единый ключ для всех документов
}
```

Это означает, что при сохранении документа B данные документа A будут перезаписаны.

**Решение:** Использовать пер-документные ключи, как уже реализовано в `DocumentTabsStore.persistDocumentDataToLocalStorage()`:

```typescript
saveToLocalStorage = (documentId: DocumentId) => {
  const stores = this.documentTabsStore.getDocumentStores(documentId)
  if (!stores) return
  const data = { projectsList: stores.projectsStore.getList(), ...stores.eventsStore.prepareToSave() }
  localStorage.setItem(`document_${documentId}`, JSON.stringify(data))
  this.isSyncWithLocalstorage = true
}
```

### 4.3 🟡 `DocumentSessionStore` не учтён в плане

**Проблема:** В [`root.ts`](../src/1-app/root.ts:36) существует `DocumentSessionStore`, который также работает с `StorageService` и `GoogleApiService`. План не описывает, что происходит с этим стором при миграции. В текущем коде `DocumentSessionStore` и `DocumentTabsStore` сосуществуют, но их взаимодействие неясно.

**Решение:** Явно указать в плане судьбу `DocumentSessionStore`:
- Если он дублирует функциональность `DocumentTabsStore` — удалить в отдельной фазе
- Если он отвечает за другой аспект — описать, как он будет взаимодействовать с `DocumentStoreManager`

### 4.4 🟡 Отсутствие стратегии отката (rollback)

**Проблема:** План не содержит стратегии отката на случай, если одна из фаз окажется неработоспособной. При 7 фазах и ~7.5 днях работы вероятность необходимости отката существенна.

**Решение:** Добавить в каждую фазу:
- Условие отката (критерий провала)
- Шаги отката (как вернуть код в предыдущее состояние)
- Флаг feature-toggle для переключения между старой и новой логикой

### 4.5 🟡 Компоненты получают `DocumentStores` вместо нужного стора

**Проблема:** План предлагает всем UI-компонентам вызывать `getActiveDocumentStores()`, который возвращает объект с обоими сторами:

```typescript
const stores = documentTabsStore.getActiveDocumentStores()
stores?.eventsStore.updateEvent(id, dto)   // Компоненту нужен только EventsStore
stores?.projectsStore.list.map(...)         // Компоненту нужен только ProjectsStore
```

Это нарушает **Principle of Least Privilege** и **Interface Segregation Principle** — компонент получает доступ к обоим сторам, хотя нужен только один.

**Решение:** Добавить удобные геттеры:

```typescript
class DocumentTabsStore {
  get activeEventsStore(): EventsStore | null {
    return this.getActiveDocumentStores()?.eventsStore ?? null
  }
  
  get activeProjectsStore(): ProjectsStore | null {
    return this.getActiveDocumentStores()?.projectsStore ?? null
  }
}
```

Компоненты используют только нужный геттер:

```typescript
const { documentTabsStore } = useContext(StoreContext)
documentTabsStore.activeEventsStore?.updateEvent(id, dto)
```

### 4.6 🟡 `EventsCache` — потеря инкапсуляции

**Проблема:** В Фазе 3 `EventsCache` получает прямой доступ к `documentTabsStore` и начинает работать с `getActiveDocumentStores()`. Однако `EventsCache` — это слой кэширования, который не должен знать о менеджере документов. Это нарушение **Single Responsibility Principle**.

**Решение:** Вместо передачи `DocumentTabsStore` в `EventsCache`, использовать паттерн **Strategy** или **Adapter**:

```typescript
// EventsCache работает с абстракцией, а не с конкретным DocumentTabsStore
interface IEventsStoreProvider {
  get activeEventsStore(): EventsStore | null
  get activeProjectsStore(): ProjectsStore | null
}

class EventsCache {
  constructor(private provider: IEventsStoreProvider) {}
  
  getEvents(date: timestamp): EventCacheStructure[] {
    const eventsStore = this.provider.activeEventsStore
    const projectsStore = this.provider.activeProjectsStore
    // ...
  }
}

// DocumentTabsStore реализует IEventsStoreProvider
```

Это также упростит тестирование — можно передать мок-провайдер без создания полного `DocumentTabsStore`.

### 4.7 🟡 `DocumentSessionStore` — мёртвый код

**Проблема:** Анализ кодовой базы показывает, что `DocumentSessionStore` является **полностью мёртвым кодом**. Он был создан для управления сессией одного документа до внедрения многодокументности (`DocumentTabsStore`). Сейчас:

- Инстанцируется в [`root.ts`](../src/1-app/root.ts:36): `new DocumentSessionStore(googleApiService, storageService)`
- Прокидывается через [`StoreContext`](../src/1-app/Providers/StoreContext.ts:38) и [`index.tsx`](../src/1-app/index.tsx:49)
- Хранится как поле в [`MainStore`](../src/1-app/Stores/MainStore.ts:25): `private documentSessionStore: DocumentSessionStore`
- **Но ни один метод не вызывается из активного кода** — `this.documentSessionStore` используется только для присвоения в конструкторе

Все функции `DocumentSessionStore` полностью дублируются `DocumentTabsStore`:

| Функция | `DocumentSessionStore` | `DocumentTabsStore` |
|---------|----------------------|---------------------|
| Создание документа | `createNew()` | `openNewDocument()` |
| Открытие из Drive | `openFromDriveFile()` | `openFromDrive()` |
| Сохранение | `saveToCurrentFile()` | `saveActiveDocument()` |
| Закрытие | `close()` | `closeDocument()` |
| Пометка dirty | `markDirty()` | `updateActiveDocumentData()` |
| Персистентность | `persistSessionToLocalStorage()` | `persistToLocalStorage()` + `persistDocumentDataToLocalStorage()` |

**Решение:** Удалить `DocumentSessionStore` в отдельной фазе (см. раздел 5.8).

### 4.8 🟡 `StorageService` — легаси-методы

**Проблема:** `StorageService` содержит методы, которые являются реликтом однодокументной архитектуры и либо не вызываются, либо дублируют функциональность `DocumentTabsStore`:

| Метод | Статус | Описание |
|-------|--------|----------|
| `saveToLocalStorage()` | ❌ Не вызывается | 0 ссылок в кодовой базе. Сохраняет в единый ключ `'data'` — конфликтует с пер-документным хранением |
| `init()` | ⚠️ Дублирует | Загружает из ключа `'data'`, но `DocumentTabsStore.restoreFromLocalStorage()` уже загружает из пер-документных ключей `document_*` |
| `applyContent()` | ⚠️ Используется | Вызывается из `DocumentTabsStore` и `CalendarIconBar` — именно этот метод должен быть мигрирован |
| `resetToEmptyContent()` | ⚠️ Используется | Вызывается из `DocumentTabsStore.closeDocument()` при закрытии последнего документа |
| `getContentToSave()` | ⚠️ Используется | Вызывается из `CalendarIconBar.handleSaveAsToDrive()` и `DocumentSessionStore` (мёртвый код) |

**Ключевое наблюдение:** `storageService.init()` в [`MainStore.init()`](../src/1-app/Stores/MainStore.ts:102) загружает данные из старого ключа `'data'`, но затем `documentTabsStore.restoreFromLocalStorage()` загружает данные из новых ключей `document_*` и вызывает `storageService.applyContent()`, перезаписывая результат `init()`. Это означает, что `storageService.init()` — **холостая операция**, если миграция уже выполнена.

**Решение:** См. раздел 5.9 — поэтапная очистка `StorageService`.

### 4.9 🟡 `CalendarIconBar` — прямое использование `storageService.applyContent()`

**Проблема:** В [`CalendarIconBar.tsx`](../src/4-widgets/CalendarIconBar/CalendarIconBar.tsx:130) при выборе удалённой версии при конфликте вызывается:

```typescript
storageService.applyContent(session.data)
```

Это прямой вызов глобального `StorageService`, который применяет данные к глобальным сторам. После миграции на пер-документные сторы этот вызов нужно заменить на обновление сторов конкретного документа через `DocumentStoreManager`.

Аналогично, `storageService.getContentToSave()` в [`CalendarIconBar.tsx`](../src/4-widgets/CalendarIconBar/CalendarIconBar.tsx:63) получает данные из глобальных сторов, а должен — из сторов активного документа.

**Решение:** Заменить на `documentTabsStore.activeDocumentStores` после миграции.

---

## 5. Рекомендации по улучшению

### 5.1 📌 Пересмотреть порядок фаз

Текущий порядок: `1→2→3→4→5→6→7`. Проблема в том, что Фаза 5 (миграция UI) и Фаза 6 (удаление глобальных сторов) — самые рискованные, но идут подряд. Рекомендую:

1. **Фаза 1** — Создание `DocumentStoreManager` (без изменений)
2. **Фаза 2** — Интеграция с `DocumentTabsStore` (без изменений)
3. **Фаза 3** — Миграция `EventsCache` (с учётом замечания 4.6)
4. **Фаза 4** — Миграция `StorageService` и `MainStore` (с учётом замечания 4.2)
5. **Фаза 5a** — Миграция `EventSearchStore` и `ProjectEditorStore` (сторы, не UI)
6. **Фаза 5b** — Миграция UI-компонентов (`EventForm`, `Calendar`, `ProjectList`)
7. **Фаза 6** — Удаление глобальных сторов
8. **Фаза 7** — Тестирование

Разделение Фазы 5 на «сторы» и «UI» позволяет проверить бизнес-логику до изменения компонентов.

### 5.2 📌 Добавить Feature Toggle

Для безопасной миграции рекомендую добавить feature toggle:

```typescript
// В UIStore или отдельном конфиге
usePerDocumentStores: boolean = false

// В DocumentTabsStore.activateDocument()
activateDocument(documentId: DocumentId) {
  if (this.uiStore.usePerDocumentStores) {
    // Новая логика: DocumentStoreManager
    this.documentStoreManager.getOrCreateStores(documentId)
  } else {
    // Старая логика: storageService.applyContent()
    this.storageService.applyContent(session.data)
  }
}
```

Это позволяет:
- Мгновенно откатиться на старую логику при обнаружении багов
- A/B-тестировать новую архитектуру
- Постепенно включать новый функционал

### 5.3 📌 Использовать MobX `reaction()` вместо `onStoresChange`

Замена императивного колбэка на декларативную реакцию:

```typescript
// Вместо onStoresChange (из плана)
this.documentTabsStore.onStoresChange = (documentId, stores) => {
  stores.eventsStore.sort()
  this.eventsCache.init()
  // ...
}

// Рекомендация: reaction()
this._disposers.push(
  reaction(
    () => {
      const stores = this.documentTabsStore.activeDocumentStores
      return stores ? { events: stores.eventsStore.planned.length, ts: Date.now() } : null
    },
    () => {
      const stores = this.documentTabsStore.activeDocumentStores
      if (!stores) return
      stores.eventsStore.sort()
      this.eventsCache.rebuild(stores)
      this.storageService.desyncWithStorages()
    }
  )
)
```

### 5.4 📌 Добавить `dispose()` в `MainStore`

При использовании `reaction()` и `autorun()` необходимо очищать подписки:

```typescript
export class MainStore {
  private _disposers: (() => void)[] = []

  dispose() {
    this._disposers.forEach(d => d())
    this._disposers = []
  }
}
```

### 5.5 📌 Усилить типизацию `DocumentStoreManager`

```typescript
// Вместо any[]
export interface DocumentStores {
  projectsStore: ProjectsStore
  eventsStore: EventsStore
  documentId: DocumentId
  isInitialized: boolean
}

// Конструктор с инъекцией через интерфейс
interface IDocumentSessionProvider {
  getDocumentSession(id: DocumentId): DocumentSession | null
  readonly activeDocumentId: DocumentId | null
}

export class DocumentStoreManager {
  constructor(private sessionProvider: IDocumentSessionProvider) {
    makeAutoObservable(this)
  }
}
```

### 5.6 📌 Рассмотреть паттерн Unit of Work для сохранения

Текущий подход к сохранению (каждый стор сохраняется отдельно) может привести к рассинхронизации. Рекомендую:

```typescript
// DocumentStoreManager обеспечивает атомарность сохранения
saveDocument(documentId: DocumentId): DocumentData {
  const stores = this.stores.get(documentId)
  if (!stores) throw new Error(`No stores for document ${documentId}`)
  
  return {
    projectsList: stores.projectsStore.getList(),
    ...stores.eventsStore.prepareToSave()
  }
}
```

Это гарантирует, что данные проектов и событий всегда сохраняются вместе.

### 5.7 📌 Добавить метрики производительности

План упоминает «переключение <10ms», но не описывает, как это измерять. Рекомендую:

```typescript
// В DocumentTabsStore.activateDocument()
activateDocument(documentId: DocumentId) {
  const startTime = performance.now()
  
  // ... логика активации
  
  const duration = performance.now() - startTime
  if (duration > 10) {
    console.warn(`Document activation took ${duration.toFixed(1)}ms`)
  }
}
```

### 5.8 📌 Удалить `DocumentSessionStore` (новая Фаза 0a)

**Обоснование:** Как показано в разделе 4.7, `DocumentSessionStore` — полностью мёртвый код. Все его функции дублируются `DocumentTabsStore`. Его удаление **до начала миграции** упростит кодовую базу и снизит риск путаницы.

**Затрагиваемые файлы:**
- `src/6-entities/Document/model/DocumentSessionStore.ts` — **УДАЛИТЬ**
- `src/6-entities/Document/model/DocumentSessionStore.spec.ts` — **УДАЛИТЬ**
- `src/6-entities/Document/model/index.ts` — убрать экспорт
- `src/1-app/root.ts` — убрать инстанцирование
- `src/1-app/Providers/StoreContext.ts` — убрать из интерфейса `IRootStore`
- `src/1-app/index.tsx` — убрать проп из `StoreProvider`
- `src/1-app/Stores/MainStore.ts` — убрать поле и параметр конструктора

**Шаги:**

1. Удалить файлы `DocumentSessionStore.ts` и `DocumentSessionStore.spec.ts`
2. Обновить `index.ts`:
   ```typescript
   // Убрать: export * from './DocumentSessionStore'
   ```
3. Обновить `root.ts`:
   ```typescript
   // Убрать: import { DocumentSessionStore } from 'src/6-entities/Document/model'
   // Убрать: export const documentSessionStore = new DocumentSessionStore(...)
   ```
4. Обновить `StoreContext.ts`:
   ```typescript
   // Убрать: documentSessionStore: DocumentSessionStore
   ```
5. Обновить `index.tsx`:
   ```typescript
   // Убрать: documentSessionStore={documentSessionStore}
   ```
6. Обновить `MainStore.ts`:
   ```typescript
   // Убрать: private documentSessionStore: DocumentSessionStore
   // Убрать параметр из конструктора
   ```
7. Проверить: `npm run build` без ошибок

**Оценка времени:** 0.5 дня

### 5.9 📌 Очистить легаси-методы `StorageService` (новая Фаза 0b)

**Обоснование:** Как показано в разделе 4.8, `StorageService` содержит мёртвые и дублирующие методы. Очистка **до начала миграции** упростит Фазу 4 (миграция `StorageService`) — не придётся мигрировать мёртвый код.

**Шаги:**

1. **Удалить `saveToLocalStorage()`** — не вызывается нигде (0 ссылок). Сохранение теперь через `DocumentTabsStore.persistDocumentDataToLocalStorage()`.

2. **Удалить `init()`** — загружает данные из старого ключа `'data'`, но это уже делается через `MigrationService.migrateFromSingleDocument()` + `DocumentTabsStore.restoreFromLocalStorage()`. Вызов `this.storageService.init()` в [`MainStore.init()`](../src/1-app/Stores/MainStore.ts:102) является холостой операцией после миграции.

   Заменить в `MainStore.init()`:
   ```typescript
   // Было:
   this.storageService.init()
   this.eventsCache.init()
   
   // Стало (init уже не нужен — данные загружаются через DocumentTabsStore):
   this.eventsCache.init()
   ```

3. **Удалить `resetToEmptyContent()`** — вызывается из `DocumentTabsStore.closeDocument()` при закрытии последнего документа. После миграции на пер-документные сторы это не нужно: если документов нет, `getActiveDocumentStores()` вернёт `null`, и UI отобразит пустое состояние.

   Заменить в `DocumentTabsStore.closeDocument()`:
   ```typescript
   // Было:
   if (this.state.documentOrder.length === 0) {
     this.storageService.resetToEmptyContent()
   }
   
   // Стало: ничего не делаем — DocumentStoreManager не имеет активных сторов
   ```

4. **Оставить `applyContent()` и `getContentToSave()`** — они используются в `CalendarIconBar` и будут мигрированы в Фазе 5b.

5. **Удалить `normalizeMainStoreData()` из публичного API** — функция используется только внутри `applyContent()`, но не экспортируется. Оставить как есть.

**Итоговый `StorageService` после очистки:**

```typescript
export class StorageService {
  isSyncWithLocalstorage: boolean = false
  isSyncWithGoogleDrive: boolean = false

  private projectsStore: ProjectsStore
  private eventsStore: EventsStore
  private onContentApplied?: () => void

  constructor(projectsStore: ProjectsStore, eventsStore: EventsStore, onContentApplied?: () => void) {
    this.projectsStore = projectsStore
    this.eventsStore = eventsStore
    this.onContentApplied = onContentApplied
    makeAutoObservable(this)
  }

  desyncWithStorages = () => { /* без изменений */ }
  markGoogleDriveSynced = () => { /* без изменений */ }
  getContentToSave = () => { /* без изменений */ }
  applyContent = (content: unknown) => { /* без изменений */ }
}
```

**Оценка времени:** 0.5 дня

---

## 6. Анализ рисков

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Нарушение реактивности MobX | Высокая | Критическое | Использовать `@computed`/`reaction()` вместо ручных триггеров |
| Утечки памяти | Средняя | Высокое | Реализовать `dispose()` для динамических сторов |
| FSD-нарушение (6→3) | Высокая | Среднее | Перенести `ProjectsStore` в `6-entities` |
| Рассинхронизация данных при сохранении | Средняя | Высокое | Unit of Work для атомарного сохранения |
| Поломка UI при миграции Фазы 5 | Средняя | Высокое | Feature toggle + разделение на 5a/5b |
| Мёртвый код `DocumentSessionStore` | Высокая | Среднее | Удалить до начала миграции (Фаза 0a) |
| Легаси-методы `StorageService` | Высокая | Среднее | Очистить до начала миграции (Фаза 0b) |
| `CalendarIconBar` использует глобальный `storageService` | Средняя | Высокое | Мигрировать на `documentTabsStore` в Фазе 5b |

---

## 7. Сводка рекомендаций

| # | Рекомендация | Приоритет | Фаза |
|---|-------------|-----------|------|
| 1 | Перенести `ProjectsStore` в `6-entities` | 🔴 Критический | До Фазы 1 |
| 2 | Заменить `_lastChangeTimestamp` на `@computed`/`reaction()` | 🔴 Критический | Фаза 1 |
| 3 | Добавить `dispose()` для динамических сторов | 🔴 Критический | Фаза 1 |
| 4 | Убрать `any[]` из `updateStoresData` | 🔴 Критический | Фаза 1 |
| 5 | Передать `DocumentTabsStore` в конструктор `DocumentStoreManager` | 🟡 Важный | Фаза 1 |
| 6 | Исправить `saveToLocalStorage` с пер-документными ключами | 🟡 Важный | Фаза 4 |
| 7 | Удалить `DocumentSessionStore` (мёртвый код) | 🟡 Важный | Фаза 0a (до миграции) |
| 8 | Очистить легаси-методы `StorageService` | 🟡 Важный | Фаза 0b (до миграции) |
| 9 | Добавить feature toggle | 🟡 Важный | Фаза 2 |
| 10 | Добавить удобные геттеры `activeEventsStore`/`activeProjectsStore` | 🟡 Важный | Фаза 1 |
| 11 | Использовать `IEventsStoreProvider` для `EventsCache` | 🟢 Желательный | Фаза 3 |
| 12 | Разделить Фазу 5 на 5a (сторы) и 5b (UI) | 🟢 Желательный | Фаза 5 |
| 13 | Мигрировать `CalendarIconBar` с `storageService` на `documentTabsStore` | 🟡 Важный | Фаза 5b |
| 14 | Добавить метрики производительности | 🟢 Желательный | Фаза 7 |
| 15 | Добавить стратегию отката в каждую фазу | 🟡 Важный | Все фазы |

---

## 8. Обновлённый порядок фаз

С учётом всех рекомендаций, предлагаемый порядок фаз:

| Фаза | Описание | Время |
|------|----------|-------|
| **0a** | Удалить `DocumentSessionStore` (мёртвый код) | 0.5 дня |
| **0b** | Очистить легаси-методы `StorageService` | 0.5 дня |
| **1** | Создание `DocumentStoreManager` (с `dispose()`, `@computed`, типизацией) | 1.5 дня |
| **2** | Интеграция с `DocumentTabsStore` (с feature toggle) | 1.5 дня |
| **3** | Миграция `EventsCache` (через `IEventsStoreProvider`) | 1 день |
| **4** | Миграция `StorageService` и `MainStore` (с `reaction()`) | 1 день |
| **5a** | Миграция `EventSearchStore` и `ProjectEditorStore` | 1 день |
| **5b** | Миграция UI-компонентов (`EventForm`, `Calendar`, `CalendarIconBar`, `ProjectList`) | 1.5 дня |
| **6** | Удаление глобальных сторов | 0.5 дня |
| **7** | Тестирование и метрики | 1 день |
| **ИТОГО** | | **~9.5 дней** |

---

## 9. Заключение

План миграции **архитектурно верен** — переход на пер-документные сторы решает реальную проблему и соответствует принципам модульности. Однако реализация содержит несколько критических проблем:

1. **Нарушение FSD** (импорт из `3-pages` в `6-entities`) — сделает архитектуру хрупкой
2. **Ручное управление реактивностью** — антипаттерн в MobX, ведёт к багам обновления UI
3. **Отсутствие очистки ресурсов** — утечки памяти при удалении документов
4. **Слабая типизация** — `any[]` подрывает защиту TypeScript
5. **Мёртвый код** — `DocumentSessionStore` и легаси-методы `StorageService` засоряют кодовую базу и усложняют миграцию

При исправлении этих проблем план станет надёжным и реализуемым. Ожидаемый срок реализации с учётом рекомендаций: **~9.5 дней** (вместо 7.5), но с существенно меньшим риском технического долга.

Ключевое преимущество добавления Фаз 0a и 0b: удаление мёртвого кода **до** миграции снижает объём кода, который нужно мигрировать, и устраняет источник путаницы при рефакторинге.

---

**Дата анализа:** 11 апреля 2026 г.
**Статус:** ✅ Требует доработки перед реализацией
**Приоритет доработки:** Высокий
