# План миграции: DocumentStoreManager (композиция)

**Дата:** 9 апреля 2026 г.
**Автор:** AI Assistant
**Статус:** Готов к реализации
**Связанные документы:**
- [per-document-eventstore-analysis.md](./per-document-eventstore-analysis.md)
- [shared-calendar-for-all-documents.md](./shared-calendar-for-all-documents.md)

---

## Обзор

Миграция с **глобальных EventsStore и ProjectsStore** на **DocumentStoreManager**, который создаётся внутри DocumentTabsStore (композиция) и управляет парами `{ProjectsStore, EventsStore}` для каждого документа.

### Текущая архитектура (проблема)

```
Глобальный ProjectsStore ← общий для всех документов
Глобальный EventsStore   ← общий для всех документов
         ↓
DocumentTabsStore.activateDocument()
         ↓
storageService.applyContent() → projectsStore.init() + eventsStore.init()
         ↓
ОЧИСТКА и ПЕРЕЗАГРУЗКА данных при каждом переключении!
```

### Целевая архитектура

```
DocumentTabsStore (содержит DocumentStoreManager приватно)
  ├── Document A → { ProjectsStore A, EventsStore A }
  ├── Document B → { ProjectsStore B, EventsStore B }
  └── Document C → { ProjectsStore C, EventsStore C }
         ↓
Компоненты: documentTabsStore.getActiveDocumentStores()
```

**Ключевое решение:** DocumentStoreManager — приватное поле DocumentTabsStore (композиция). Это:
- Устраняет циклические зависимости
- Упрощает инициализацию (не нужен documentStoreManager в StoreContext)
- Компоненты получают сторы через `documentTabsStore.getActiveDocumentStores()`

### Преимущества

1. **Мгновенное переключение вкладок** — нет очистки/загрузки данных
2. **Полная изоляция документов** — каждый документ имеет свои проекты и события
3. **Простая агрегация для общего календаря** — `documentTabsStore.getAllDocumentStores()`
4. **Естественная связь ProjectsStore ↔ EventsStore** — создаются вместе
5. **Без LRU-кэша** — все сторы в памяти до удаления (~1-3 МБ для 3-10 документов)
6. **Композиция** — нет циклических зависимостей, проще инициализация

### Затрагиваемые компоненты

| Компонент | Использование сейчас | Изменение |
|-----------|---------------------|-----------|
| EventsCache | `eventsStore.*`, `projectsStore.getById()` | Конструктор → `documentTabsStore` |
| EventSearchStore | `eventsStore.*` | Конструктор → `documentTabsStore` |
| EventForm.tsx | `eventsStore.*` из контекста | `documentTabsStore.getActiveDocumentStores()` |
| Calendar.tsx | `eventsStore.*` | `documentTabsStore.getActiveDocumentStores()` |
| ProjectList.tsx | `projectsStore.*` | `documentTabsStore.getActiveDocumentStores()` |
| ProjectEditorStore | `projectsStore.*` | Конструктор → `documentTabsStore` |
| MainStore | `onChangeList` handlers | `documentTabsStore.onStoresChange` |
| StorageService | `projectsStore.*, eventsStore.*` | Конструктор → `documentTabsStore` |

### Ожидаемый срок: ~7.5 дней (7 фаз)

---

## Фаза 1: Создание DocumentStoreManager

**Цель:** Создать менеджер сторов, который будет приватным полем DocumentTabsStore.

**Затрагиваемые файлы:**
- `src/6-entities/Document/model/DocumentStoreManager.ts` — **НОВЫЙ**
- `src/6-entities/Document/model/DocumentStoreManager.types.ts` — **НОВЫЙ**
- `src/6-entities/Document/model/DocumentTabsStore.ts` — обновление
- `src/6-entities/Document/model/index.ts` — экспорт

---

### Задача 1.1: Создать типы

**Файл:** `src/6-entities/Document/model/DocumentStoreManager.types.ts`

```typescript
import { DocumentId } from './DocumentTabsStore.types'
import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'
import { EventsStore } from 'src/6-entities/Events/EventsStore'

/** Пара сторов для конкретного документа */
export type DocumentStores = {
  projectsStore: ProjectsStore
  eventsStore: EventsStore
  documentId: DocumentId
  isInitialized: boolean
}
```

**Критерий:** Файл создан, типы экспортируются.

---

### Задача 1.2: Создать DocumentStoreManager

**Файл:** `src/6-entities/Document/model/DocumentStoreManager.ts`

```typescript
import { makeAutoObservable } from 'mobx'
import { DocumentId, DocumentSession } from './DocumentTabsStore.types'
import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'
import { EventsStore } from 'src/6-entities/Events/EventsStore'
import { DocumentStores } from './DocumentStoreManager.types'

/**
 * Менеджер сторов документов (приватный для DocumentTabsStore).
 * НЕ экспортируется в StoreContext.
 */
export class DocumentStoreManager {
  private stores: Map<DocumentId, DocumentStores> = new Map()
  private getDocumentSession: (documentId: DocumentId) => DocumentSession | null
  private _lastChangeTimestamp: number = 0
  onStoresChange?: (documentId: DocumentId, stores: DocumentStores) => void

  constructor(getDocumentSession: (documentId: DocumentId) => DocumentSession | null) {
    this.getDocumentSession = getDocumentSession
    makeAutoObservable(this)
  }

  getOrCreateStores(documentId: DocumentId): DocumentStores {
    const existing = this.stores.get(documentId)
    if (existing) return existing

    const session = this.getDocumentSession(documentId)
    if (!session) throw new Error(`Document session not found: ${documentId}`)

    const projectsStore = new ProjectsStore()
    projectsStore.init(session.data.projectsList)

    const eventsStore = new EventsStore(projectsStore)
    eventsStore.onChangeList = () => {
      this._lastChangeTimestamp = Date.now()
      this.onStoresChange?.(documentId, {
        projectsStore, eventsStore, documentId, isInitialized: true
      })
    }
    eventsStore.init({
      completedList: session.data.completedList,
      plannedList: session.data.plannedList
    })

    const stores: DocumentStores = { projectsStore, eventsStore, documentId, isInitialized: true }
    this.stores.set(documentId, stores)
    return stores
  }

  hasStores(documentId: DocumentId): boolean { return this.stores.has(documentId) }
  getStores(documentId: DocumentId): DocumentStores | null { return this.stores.get(documentId) ?? null }
  
  getActiveStores(getActiveId: () => DocumentId | null): DocumentStores | null {
    const id = getActiveId()
    return id ? this.getOrCreateStores(id) : null
  }

  removeStores(documentId: DocumentId): void { this.stores.delete(documentId) }

  updateStoresData(documentId: DocumentId, data: {
    projectsList: any[]; completedList: any[]; plannedList: any[]
  }): void {
    const stores = this.getOrCreateStores(documentId)
    stores.projectsStore.init(data.projectsList)
    stores.eventsStore.init({ completedList: data.completedList, plannedList: data.plannedList })
    this._lastChangeTimestamp = Date.now()
  }

  getAllStores(): DocumentStores[] { return Array.from(this.stores.values()) }
  get storesCount(): number { return this.stores.size }
  clear(): void { this.stores.clear(); this._lastChangeTimestamp = Date.now() }
  get lastChangeTimestamp(): number { return this._lastChangeTimestamp }
}
```

**Критерий:** Класс создан, компилируется.

---

### Задача 1.3: Обновить DocumentTabsStore (композиция)

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

Добавить приватное поле и методы:

```typescript
import { DocumentStoreManager } from './DocumentStoreManager'
import { DocumentStores } from './DocumentStoreManager.types'

export class DocumentTabsStore {
  private state: DocumentTabsState
  private documentStoreManager: DocumentStoreManager  // <-- КОМПОЗИЦИЯ

  constructor(
    private readonly googleApiService: GoogleApiService,
    private readonly storageService: StorageService
  ) {
    this.state = { documents: new Map(), activeDocumentId: null, documentOrder: [] }
    
    // Создаём менеджер внутри конструктора
    this.documentStoreManager = new DocumentStoreManager(
      (documentId) => this.getDocumentSession(documentId)
    )
    
    makeAutoObservable(this)
  }

  // === Методы доступа к сторам ===

  /** Получить сторы активного документа */
  getActiveDocumentStores(): DocumentStores | null {
    return this.documentStoreManager.getActiveStores(
      () => this.state.activeDocumentId
    )
  }

  /** Получить все сторы (для общего календаря) */
  getAllDocumentStores(): DocumentStores[] {
    return this.documentStoreManager.getAllStores()
  }

  /** Колбэк при изменении сторов (устанавливается в MainStore.init) */
  set onStoresChange(callback: (documentId: DocumentId, stores: DocumentStores) => void) {
    this.documentStoreManager.onStoresChange = callback
  }

  /** Получить сессию документа (для DocumentStoreManager) */
  getDocumentSession(documentId: DocumentId): DocumentSession | null {
    return this.state.documents.get(documentId) ?? null
  }
}
```

**Критерий:** DocumentTabsStore компилируется с композицией.

---

### Задача 1.4: Обновить index.ts

**Файл:** `src/6-entities/Document/model/index.ts`

```typescript
export * from './types'
export * from './DocumentSessionStore'
export * from './DocumentTabsStore'
export * from './DocumentTabsStore.types'
export { DocumentStoreManager } from './DocumentStoreManager'  // для тестов
export type { DocumentStores } from './DocumentStoreManager.types'
```

**Критерий:** Экспорты обновлены.

---

### ✅ Чек-лист Фазы 1

- [ ] Создан `DocumentStoreManager.types.ts`
- [ ] Создан `DocumentStoreManager.ts` (приватный для композиции)
- [ ] DocumentTabsStore содержит `documentStoreManager` как приватное поле
- [ ] Добавлены `getActiveDocumentStores()`, `getAllDocumentStores()`, `onStoresChange`
- [ ] Добавлен `getDocumentSession()` в DocumentTabsStore
- [ ] index.ts обновлён
- [ ] TypeScript компилируется
- [ ] Unit-тесты DocumentStoreManager (getOrCreateStores, removeStores, getAllStores)

---

## Фаза 2: Интеграция с DocumentTabsStore

**Цель:** Научить DocumentTabsStore использовать DocumentStoreManager при открытии/закрытии/переключении документов.

**Файлы:**
- `src/6-entities/Document/model/DocumentTabsStore.ts`

---

### Задача 2.1: Обновить openNewDocument

```typescript
openNewDocument(name: string = 'Новый документ') {
  const id = generateDocumentId()
  const session: DocumentSession = {
    id, ref: { fileId: null, name, mimeType: 'application/json', space: null, parentFolderId: null },
    data: createEmptyDocumentData(),
    state: { ...createInitialDocumentState(), syncStatus: 'offline' },
    createdAt: Date.now(), lastAccessedAt: Date.now()
  }
  this.state.documents.set(id, session)
  this.state.documentOrder.push(id)
  this.state.activeDocumentId = id

  // НОВОЕ: Сторы создаются через DocumentStoreManager
  this.documentStoreManager.getOrCreateStores(id)
  // УДАЛИТЬ: this.storageService.applyContent(session.data)

  this.persistToLocalStorage()
  this.persistDocumentDataToLocalStorage(id)
}
```

**Критерий:** Новый документ создаётся со сторами.

---

### Задача 2.2: Обновить openFromDrive

```typescript
async openFromDrive(fileId: string, space?: 'drive' | 'appDataFolder') {
  const existing = this.findDocumentByFileId(fileId)
  if (existing) { this.activateDocument(existing.id); return }

  const id = generateDocumentId()
  const session: DocumentSession = {
    id, ref: { fileId, name: 'Загрузка...', mimeType: 'application/json', space: space ?? null, parentFolderId: null },
    data: createEmptyDocumentData(),
    state: { ...createInitialDocumentState(), isLoading: true, syncStatus: 'syncing' },
    createdAt: Date.now(), lastAccessedAt: Date.now()
  }
  this.state.documents.set(id, session)
  this.state.documentOrder.push(id)
  this.state.activeDocumentId = id

  try {
    const metadata = await this.googleApiService.getFileMetadata(fileId)
    const content = await this.googleApiService.downloadFileContent(fileId)

    const loadedSession = this.state.documents.get(id)!
    loadedSession.ref = { fileId: metadata.id, name: metadata.name, mimeType: metadata.mimeType || 'application/json', space: space ?? null, parentFolderId: metadata.parents?.[0] ?? null, webViewLink: metadata.webViewLink }
    loadedSession.data = parseDocumentContent(content)
    loadedSession.state.syncStatus = 'synced'
    loadedSession.state.lastLoadedAt = Date.now()
    loadedSession.state.lastSyncedAt = Date.now()

    // НОВОЕ: Обновляем сторы через менеджер
    this.documentStoreManager.updateStoresData(id, {
      projectsList: loadedSession.data.projectsList,
      completedList: loadedSession.data.completedList,
      plannedList: loadedSession.data.plannedList
    })

    loadedSession.state.isLoading = false
    loadedSession.state.isDirty = false
    this.persistDocumentDataToLocalStorage(id)
    this.persistToLocalStorage()
  } catch (error: any) {
    const failedSession = this.state.documents.get(id)!
    failedSession.state.error = error.message
    failedSession.state.isLoading = false
    failedSession.state.syncStatus = 'error'
  }
}
```

**Критерий:** Документ из Drive загружается со сторами.

---

### Задача 2.3: Обновить activateDocument

```typescript
activateDocument(documentId: DocumentId) {
  const session = this.state.documents.get(documentId)
  if (!session) return

  this.state.activeDocumentId = documentId
  session.lastAccessedAt = Date.now()

  // НОВОЕ: Убеждаемся что сторы существуют
  this.documentStoreManager.getOrCreateStores(documentId)
  // УДАЛИТЬ: this.storageService.applyContent(session.data)

  this.persistToLocalStorage()
}
```

**Критерий:** Активация не вызывает очистку сторов.

---

### Задача 2.4: Обновить closeDocument

```typescript
closeDocument(documentId: DocumentId) {
  const session = this.state.documents.get(documentId)
  if (!session) return

  if (session.state.isDirty || session.state.hasUnsyncedChanges) {
    console.warn('Closing document with unsaved changes')
  }

  this.state.documents.delete(documentId)
  this.state.documentOrder = this.state.documentOrder.filter(id => id !== documentId)
  if (this.state.activeDocumentId === documentId) {
    this.state.activeDocumentId = this.state.documentOrder[0] ?? null
  }

  // НОВОЕ: Удаляем сторы
  this.documentStoreManager.removeStores(documentId)

  if (this.state.documentOrder.length === 0) {
    // Все документы закрыты
  } else if (this.state.activeDocumentId) {
    this.activateDocument(this.state.activeDocumentId)
  }

  this.removeDocumentDataFromLocalStorage(documentId)
  this.persistToLocalStorage()
}
```

**Критерий:** Закрытие удаляет сторы.

---

### Задача 2.5: Обновить restoreFromLocalStorage

```typescript
async restoreFromLocalStorage(): Promise<boolean> {
  const tabsJson = localStorage.getItem(DOCUMENT_TABS_KEY)
  if (!tabsJson) return false

  const snapshot = parseDocumentTabsSnapshot(tabsJson)
  if (!snapshot) return false

  for (const docSnapshot of snapshot.documents) {
    this.openFromLocalStorageSnapshot(docSnapshot)
  }
  this.state.documentOrder = snapshot.documentOrder
  this.state.activeDocumentId = snapshot.activeDocumentId

  // Загрузка данных и создание сторов
  for (const docSnapshot of snapshot.documents) {
    const dataJson = localStorage.getItem(`${DOCUMENT_DATA_PREFIX}${docSnapshot.id}`)
    if (dataJson) {
      try {
        const dataSnapshot = JSON.parse(dataJson) as DocumentDataSnapshot
        const session = this.state.documents.get(docSnapshot.id)!
        session.data = dataSnapshot.data

        // НОВОЕ: Создаём сторы
        this.documentStoreManager.updateStoresData(docSnapshot.id, {
          projectsList: session.data.projectsList,
          completedList: session.data.completedList,
          plannedList: session.data.plannedList
        })
      } catch (e) {
        console.error(`Failed to load data for document ${docSnapshot.id}:`, e)
      }
    }
  }

  return true
}
```

**Критерий:** Восстановление создаёт сторы.

---

### ✅ Чек-лист Фазы 2

- [ ] `openNewDocument` создаёт сторы
- [ ] `openFromDrive` обновляет сторы
- [ ] `activateDocument` не вызывает `storageService.applyContent`
- [ ] `closeDocument` удаляет сторы
- [ ] `restoreFromLocalStorage` создаёт сторы
- [ ] TypeScript компилируется
- [ ] Ручное тестирование: переключение вкладок мгновенное

---

## Фаза 3: Миграция EventsCache

**Цель:** EventsCache работает через `documentTabsStore.getActiveDocumentStores()`.

**Файлы:**
- `src/6-entities/EventsCache/EventsCache.ts`
- `src/6-entities/EventsCache/EventCacheStructure.ts`
- `src/1-app/root.ts`

---

### Задача 3.1: Обновить конструктор EventsCache

```typescript
import { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'

export class EventsCache {
  private documentTabsStore: DocumentTabsStore
  
  constructor(documentTabsStore: DocumentTabsStore) {
    this.documentTabsStore = documentTabsStore
  }

  init() {
    this.cachedEvents = []
    this.cachedActualBalance = []
    this.cachedPlannedBalance = []

    const stores = this.documentTabsStore.getActiveDocumentStores()
    if (!stores) {
      this.lastActualBalance = 0; this.lastActualBalanceDate = 0; this.firstActualBalanceDate = 0
      return
    }

    this.lastActualBalance = stores.eventsStore.completed.reduce((b, e) => b + e.credit - e.debit, 0)
    this.lastActualBalanceDate = stores.eventsStore.completed.length ? stores.eventsStore.completed[stores.eventsStore.completed.length - 1].start : 0
    this.firstActualBalanceDate = stores.eventsStore.completed.length ? stores.eventsStore.completed[0].start : 0
  }

  getEvents(date: timestamp): EventCacheStructure[] {
    if (this.cachedEvents[date] !== undefined) return this.cachedEvents[date]

    const stores = this.documentTabsStore.getActiveDocumentStores()
    if (!stores) return []

    // Используем stores.eventsStore и stores.projectsStore
    // ... (остальная логика аналогична)
  }
}
```

**Критерий:** EventsCache компилируется.

---

### Задача 3.2: Добавить методы агрегации

```typescript
getAggregatedEvents(date: timestamp): EventCacheStructure[] {
  const allEvents: EventCacheStructure[] = []
  
  for (const docStores of this.documentTabsStore.getAllDocumentStores()) {
    docStores.eventsStore.planned.forEach(e => {
      if (date < e.start || date >= e.end) return
      const color = docStores.projectsStore.getById(e.projectId)?.color ?? ProjectsStore.defaultProject.color
      const background = docStores.projectsStore.getById(e.projectId)?.background ?? ProjectsStore.defaultProject.background
      allEvents.push({ ...singleEventToEventCache(e, date, false, color, background), sourceDocumentId: docStores.documentId })
    })
    // ... completed, plannedRepeatable
  }
  
  allEvents.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || (a.time ?? 0) - (b.time ?? 0))
  return allEvents
}

getAggregatedBalance(): { lastActualBalance: number; lastActualBalanceDate: number; firstActualBalanceDate: number } {
  let totalActual = 0, maxDate = 0, minDate = Infinity
  for (const docStores of this.documentTabsStore.getAllDocumentStores()) {
    totalActual += docStores.eventsStore.completed.reduce((b, e) => b + e.credit - e.debit, 0)
    if (docStores.eventsStore.completed.length) {
      maxDate = Math.max(maxDate, docStores.eventsStore.completed[docStores.eventsStore.completed.length - 1].start)
      minDate = Math.min(minDate, docStores.eventsStore.completed[0].start)
    }
  }
  return { lastActualBalance: totalActual, lastActualBalanceDate: maxDate, firstActualBalanceDate: minDate === Infinity ? 0 : minDate }
}
```

**Критерий:** Методы агрегации добавлены.

---

### Задача 3.3: Обновить EventCacheStructure

```typescript
import { DocumentId } from 'src/6-entities/Document/model/DocumentTabsStore.types'

export type EventCacheStructure = {
  // ... существующие поля
  sourceDocumentId?: DocumentId  // для общего календаря
}
```

**Критерий:** Тип обновлён.

---

### Задача 3.4: Обновить root.ts

```typescript
export const eventsCache = new EventsCache(documentTabsStore)
```

**Критерий:** root.ts компилируется.

---

### ✅ Чек-лист Фазы 3

- [ ] EventsCache конструктор → `documentTabsStore`
- [ ] `init()` через `getActiveDocumentStores()`
- [ ] `getEvents()` через `getActiveDocumentStores()`
- [ ] `getAggregatedEvents()` добавлен
- [ ] `getAggregatedBalance()` добавлен
- [ ] `EventCacheStructure` с `sourceDocumentId`
- [ ] root.ts обновлён
- [ ] Ручное тестирование: календарь работает, баланс корректен

---

## Фаза 4: Миграция StorageService и MainStore

**Файлы:**
- `src/7-shared/services/StorageService.ts`
- `src/1-app/Stores/MainStore.ts`

---

### Задача 4.1: Обновить StorageService

```typescript
export class StorageService {
  private documentTabsStore: DocumentTabsStore
  private onContentApplied?: () => void

  constructor(documentTabsStore: DocumentTabsStore, onContentApplied?: () => void) {
    this.documentTabsStore = documentTabsStore
    this.onContentApplied = onContentApplied
    makeAutoObservable(this)
  }

  saveToLocalStorage = (documentId: DocumentId) => {
    const stores = this.documentTabsStore.getDocumentStores(documentId)
    if (!stores) return
    const data = { projectsList: stores.projectsStore.getList(), ...stores.eventsStore.prepareToSave() }
    localStorage.setItem('data', JSON.stringify(data))
    this.isSyncWithLocalstorage = true
  }

  getContentToSave = (documentId: DocumentId) => {
    const stores = this.documentTabsStore.getDocumentStores(documentId)
    if (!stores) return null
    return { projectsList: stores.projectsStore.getList(), ...stores.eventsStore.prepareToSave() }
  }

  // @deprecated
  applyContent = () => { console.warn('applyContent deprecated'); this.onContentApplied?.() }
  resetToEmptyContent = () => { console.warn('resetToEmptyContent deprecated'); this.onContentApplied?.() }
  init = () => { console.warn('init deprecated'); this.isSyncWithLocalstorage = false }
}
```

**Критерий:** StorageService компилируется.

---

### Задача 4.2: Обновить MainStore.init

```typescript
init() {
  MigrationService.migrateFromSingleDocument()

  // Колбэк при изменении сторов
  this.documentTabsStore.onStoresChange = (documentId, stores) => {
    stores.eventsStore.sort()
    this.eventsCache.init()
    this.storageService.desyncWithStorages()

    const activeDoc = this.documentTabsStore.activeDocument
    if (activeDoc && !activeDoc.state.isLoading && activeDoc.id === documentId) {
      this.documentTabsStore.updateActiveDocumentData({
        projectsList: stores.projectsStore.getList(),
        ...stores.eventsStore.prepareToSave()
      })
    }
  }

  this.googleApiService.initGapi()

  void this.googleApiService.waitForGapiReady()
    .then(() => this.documentTabsStore.restoreFromLocalStorage())
    .then(() => this.eventsCache.init())
    .catch(e => console.error('DocumentTabsStore restore failed:', e))
}
```

**Критерий:** MainStore.init обновлён.

---

### Задача 4.3: Обновить root.ts

```typescript
export const storageService = new StorageService(documentTabsStore, () => uiStore.forceUpdate())
```

**Критерий:** root.ts компилируется.

---

### ✅ Чек-лист Фазы 4

- [ ] StorageService → `documentTabsStore`
- [ ] MainStore `onStoresChange` установлен
- [ ] root.ts обновлён
- [ ] Ручное тестирование: изменения сохраняются

---

## Фаза 5: Миграция UI-компонентов

**Файлы:**
- `src/4-widgets/EventForm/EventForm.tsx`
- `src/3-pages/Calendar/Calendar.tsx`
- `src/5-features/EventSearch/EventSearchStore.ts`
- `src/5-features/ProjectManager/ProjectList/ProjectList.tsx`
- `src/5-features/ProjectManager/ProjectEditor/ProjectEditorStore.ts`

---

### Задача 5.1: Обновить компоненты

**EventForm.tsx, Calendar.tsx:**
```typescript
const { documentTabsStore } = useContext(StoreContext)
const stores = documentTabsStore.getActiveDocumentStores()
stores?.eventsStore.updateEvent(id, dto)
stores?.eventsStore.shiftToDate(id, timestamp, start)
```

**EventSearchStore:**
```typescript
constructor(private documentTabsStore: DocumentTabsStore) { makeAutoObservable(this) }

private get activeEventsStore() {
  return this.documentTabsStore.getActiveDocumentStores()?.eventsStore ?? null
}
```

**ProjectList.tsx:**
```typescript
const { documentTabsStore } = useContext(StoreContext)
const stores = documentTabsStore.getActiveDocumentStores()
stores?.projectsStore.list.map(...)
```

**ProjectEditorStore:**
```typescript
constructor(private documentTabsStore: DocumentTabsStore) { makeAutoObservable(this) }

private get activeProjectsStore() {
  return this.documentTabsStore.getActiveDocumentStores()?.projectsStore ?? null
}
```

**Критерий:** Все компоненты компилируются.

---

### Задача 5.2: Обновить root.ts

```typescript
export const eventSearchStore = new EventSearchStore(documentTabsStore)
export const projectEditorStore = new ProjectEditorStore(documentTabsStore)
```

**Критерий:** root.ts компилируется.

---

### ✅ Чек-лист Фазы 5

- [ ] EventForm.tsx обновлён
- [ ] Calendar.tsx обновлён
- [ ] EventSearchStore обновлён
- [ ] ProjectList.tsx обновлён
- [ ] ProjectEditorStore обновлён
- [ ] root.ts обновлён
- [ ] Ручное тестирование: все UI функции работают

---

## Фаза 6: Удаление глобальных сторов

**Файлы:**
- `src/1-app/root.ts`
- `src/1-app/Providers/StoreContext.ts`
- `src/1-app/index.tsx`

---

### Задачи:

1. Удалить `projectsStore` и `eventsStore` из root.ts
2. Удалить из StoreContext интерфейса
3. Удалить из index.tsx провайдера
4. Проверить grep что нигде не используются

```bash
grep -r "eventsStore" src/ --include="*.ts" --include="*.tsx" | grep -v "documentTabsStore"
grep -r "projectsStore" src/ --include="*.ts" --include="*.tsx" | grep -v "documentTabsStore"
```

### ✅ Чек-лист Фазы 6

- [ ] eventsStore/projectsStore удалены из root.ts, StoreContext, index.tsx
- [ ] `npm run build` успешен
- [ ] Все функции работают

---

## Фаза 7: Тестирование

### Задача 7.1: Unit-тесты DocumentStoreManager

```typescript
describe('DocumentStoreManager', () => {
  let manager: DocumentStoreManager
  let mockSession: DocumentSession

  beforeEach(() => {
    mockSession = { id: 'doc_1', data: createEmptyDocumentData(), /* ... */ } as any
    manager = new DocumentStoreManager((id) => id === 'doc_1' ? mockSession : null)
  })

  test('should create stores', () => {
    const stores = manager.getOrCreateStores('doc_1')
    expect(stores.projectsStore).toBeDefined()
    expect(stores.eventsStore).toBeDefined()
    expect(manager.storesCount).toBe(1)
  })

  test('should return existing stores', () => {
    const s1 = manager.getOrCreateStores('doc_1')
    const s2 = manager.getOrCreateStores('doc_1')
    expect(s1).toBe(s2)
  })

  test('should remove stores', () => {
    manager.getOrCreateStores('doc_1')
    manager.removeStores('doc_1')
    expect(manager.storesCount).toBe(0)
  })

  test('should get all stores', () => {
    // ... тест для нескольких документов
  })
})
```

### Задача 7.2: Интеграционные тесты

- Создание документа → сторы созданы
- Переключение → сторы не очищаются
- Закрытие → сторы удалены
- getAggregatedEvents возвращает события из всех документов

### Задача 7.3: Производительность

- Переключение вкладок <10ms (vs 50-100ms ранее)
- Память <3 МБ для 10 документов

### ✅ Чек-лист Фазы 7

- [ ] Unit-тесты проходят
- [ ] Интеграционные тесты проходят
- [ ] Производительность в норме
- [ ] Ручное тестирование: все функции

---

## Сводная таблица

| Фаза | Описание | Файлы | Время |
|------|----------|-------|-------|
| 1 | Создание DocumentStoreManager (композиция) | 4 | 1 день |
| 2 | Интеграция с DocumentTabsStore | 1 | 1.5 дня |
| 3 | Миграция EventsCache | 3 | 1 день |
| 4 | Миграция StorageService и MainStore | 2 | 1 день |
| 5 | Миграция UI-компонентов | 5-7 | 1.5 дня |
| 6 | Удаление глобальных сторов | 3 | 0.5 дня |
| 7 | Тестирование | - | 1 день |
| **ИТОГО** | | **~20-25 файлов** | **~7.5 дней** |

---

## Потенциальные проблемы

### Циклические зависимости
**Решение:** DocumentStoreManager создаётся внутри DocumentTabsStore → нет цикла.

### Реактивность
**Решение:** `onStoresChange` колбэк + `_lastChangeTimestamp` в DocumentStoreManager.

### SRP нарушение
**Решение:** DocumentStoreManager — отдельный класс, DocumentTabsStore только делегирует → следует FSD.

---

## Критерии успеха

- [ ] `npm run build` без ошибок
- [ ] `npm test` все тесты проходят
- [ ] `npm run lint-check` без ошибок
- [ ] Создание/закрытие/переключение документов работает
- [ ] События/проекты CRUD работают
- [ ] Календарь отображает события
- [ ] Баланс корректен
- [ ] Сохранение/синхронизация работают
- [ ] Поиск работает
- [ ] Память в норме

---

## Будущие оптимизации

### LRU-кэш
Исключён намеренно. Добавить при >20 документах и profiling >50 МБ.

---

**Дата:** 9 апреля 2026 г.
**Статус:** ✅ Готов к реализации
**Приоритет:** Высокий
