# План миграции: DocumentStoreManager v2

**Дата:** 11 апреля 2026 г.  
**Автор:** AI Assistant  
**Статус:** Готов к реализации  
**Связанные документы:**
- [document-store-manager-migration-plan.md](./document-store-manager-migration-plan.md) — оригинальный план
- [document-store-manager-migration-plan-review.md](./document-store-manager-migration-plan-review.md) — обзор с замечаниями
- [per-document-eventstore-analysis.md](./per-document-eventstore-analysis.md) — анализ пер-документного EventStore

---

## Обзор

Миграция с **глобальных EventsStore и ProjectsStore** на **DocumentStoreManager**, который создаётся внутри DocumentTabsStore (композиция) и управляет парами `{ProjectsStore, EventsStore}` для каждого документа.

### Отличия от оригинального плана (v1)

| Аспект | v1 | v2 (данный план) |
|--------|----|----|
| Легаси-код | Не удалён | Фазы 0a/0b: удаление `DocumentSessionStore` и очистка `StorageService` |
| FSD-нарушение | `ProjectsStore` в `3-pages` | Фаза 0c: перенос `ProjectsStore` в `6-entities` |
| Реактивность MobX | `_lastChangeTimestamp` + `onStoresChange` | `makeAutoObservable` + `reaction()` |
| Декораторы | `@observable`, `@computed`, `@action` | `makeAutoObservable` (без декораторов) |
| Очистка ресурсов | Нет `dispose()` | `dispose()` в `DocumentStoreManager` |
| Типизация | `any[]` в `updateStoresData` | `DocumentData` |
| EventsCache | Прямая зависимость от `DocumentTabsStore` | Через интерфейс `IEventsStoreProvider` |
| Feature toggle | Нет | Есть |
| CalendarIconBar | Не учтён | Миграция в Фазе 5b |

### Целевая архитектура

```
DocumentTabsStore (содержит DocumentStoreManager приватно)
  ├── Document A → { ProjectsStore A, EventsStore A }
  ├── Document B → { ProjectsStore B, EventsStore B }
  └── Document C → { ProjectsStore C, EventsStore C }
         ↓
Компоненты: documentTabsStore.activeEventsStore / activeProjectsStore
```

### Затрагиваемые компоненты

| Компонент | Использование сейчас | Изменение |
|-----------|---------------------|-----------|
| DocumentSessionStore | Глобальный синглтон | **УДАЛИТЬ** (мёртвый код) |
| StorageService | `saveToLocalStorage()`, `init()`, `resetToEmptyContent()` | Удалить легаси-методы |
| ProjectsStore | В `src/3-pages/Projects/` | Перенести в `src/6-entities/Projects/` |
| EventsCache | `eventsStore.*`, `projectsStore.*` | Через `IEventsStoreProvider` |
| EventSearchStore | `eventsStore.*` | Через `documentTabsStore` |
| EventForm.tsx | `eventsStore.*` из контекста | `documentTabsStore.activeEventsStore` |
| Calendar.tsx | `eventsStore.*` | `documentTabsStore.activeEventsStore` |
| CalendarIconBar | `storageService.applyContent()`, `getContentToSave()` | Через `documentTabsStore` |
| ProjectList.tsx | `projectsStore.*` | `documentTabsStore.activeProjectsStore` |
| ProjectEditorStore | `projectsStore.*` | Через `documentTabsStore` |
| MainStore | `onChangeList` handlers | `reaction()` на `activeStores` |
| StorageService | `projectsStore.*, eventsStore.*` | Через `documentTabsStore` |

### Ожидаемый срок: ~9.5 дней (10 фаз)

---

## Фаза 0a: Удаление DocumentSessionStore (мёртвый код)

**Цель:** Удалить неиспользуемый `DocumentSessionStore`, который полностью дублируется `DocumentTabsStore`.

**Обоснование:** `DocumentSessionStore` — мёртвый код. Он инстанцируется, прокидывается через DI, но ни один его метод не вызывается из активного кода. Удаление до миграции снижает объём кода и устраняет источник путаницы.

**Затрагиваемые файлы:**
- `src/6-entities/Document/model/DocumentSessionStore.ts` — **УДАЛИТЬ**
- `src/6-entities/Document/model/DocumentSessionStore.spec.ts` — **УДАЛИТЬ**
- `src/6-entities/Document/model/index.ts` — убрать экспорт
- `src/1-app/root.ts` — убрать инстанцирование
- `src/1-app/Providers/StoreContext.ts` — убрать из интерфейса
- `src/1-app/index.tsx` — убрать проп
- `src/1-app/Stores/MainStore.ts` — убрать поле и параметр

---

### Задача 0a.1: Удалить файлы DocumentSessionStore

Удалить:
- `src/6-entities/Document/model/DocumentSessionStore.ts`
- `src/6-entities/Document/model/DocumentSessionStore.spec.ts`

**Критерий:** Файлы удалены.

---

### Задача 0a.2: Обновить index.ts

**Файл:** `src/6-entities/Document/model/index.ts`

```typescript
/** Публичный API model-слоя сущности Document */
export * from './types'
// УДАЛИТЬ: export * from './DocumentSessionStore'
export * from './DocumentTabsStore'
export * from './DocumentTabsStore.types'
```

**Критерий:** Экспорт убран.

---

### Задача 0a.3: Обновить root.ts

**Файл:** `src/1-app/root.ts`

Убрать:
```typescript
// УДАЛИТЬ: import { DocumentSessionStore, DocumentTabsStore } from 'src/6-entities/Document/model'
// ЗАМЕНИТЬ НА:
import { DocumentTabsStore } from 'src/6-entities/Document/model'

// УДАЛИТЬ: export const documentSessionStore = new DocumentSessionStore(googleApiService, storageService)

// УДАЛИТЬ из конструктора MainStore: documentSessionStore,
```

**Критерий:** `root.ts` компилируется без `DocumentSessionStore`.

---

### Задача 0a.4: Обновить StoreContext.ts

**Файл:** `src/1-app/Providers/StoreContext.ts`

Убрать из `IRootStore`:
```typescript
// УДАЛИТЬ: documentSessionStore: DocumentSessionStore
// УДАЛИТЬ: import { DocumentSessionStore, DocumentTabsStore } from 'src/6-entities/Document/model'
// ЗАМЕНИТЬ НА: import { DocumentTabsStore } from 'src/6-entities/Document/model'
```

**Критерий:** `StoreContext.ts` компилируется.

---

### Задача 0a.5: Обновить index.tsx

**Файл:** `src/1-app/index.tsx`

Убрать:
```typescript
// УДАЛИТЬ из импорта: documentSessionStore,
// УДАЛИТЬ из пропов: documentSessionStore={documentSessionStore}
```

**Критерий:** `index.tsx` компилируется.

---

### Задача 0a.6: Обновить MainStore.ts

**Файл:** `src/1-app/Stores/MainStore.ts`

Убрать:
```typescript
// УДАЛИТЬ: import { DocumentSessionStore, DocumentTabsStore } from 'src/6-entities/Document/model'
// ЗАМЕНИТЬ НА: import { DocumentTabsStore } from 'src/6-entities/Document/model'

// УДАЛИТЬ: private documentSessionStore: DocumentSessionStore

// УДАЛИТЬ из параметров конструктора: documentSessionStore: DocumentSessionStore,
// УДАЛИТЬ из тела конструктора: this.documentSessionStore = documentSessionStore
```

**Критерий:** `MainStore.ts` компилируется.

---

### ✅ Чек-лист Фазы 0a

- [ ] `DocumentSessionStore.ts` и `.spec.ts` удалены
- [ ] `index.ts` обновлён
- [ ] `root.ts` обновлён
- [ ] `StoreContext.ts` обновлён
- [ ] `index.tsx` обновлён
- [ ] `MainStore.ts` обновлён
- [ ] `npm run build` без ошибок
- [ ] Все существующие тесты проходят

---

## Фаза 0b: Очистка легаси-методов StorageService

**Цель:** Удалить мёртвые и дублирующие методы из `StorageService` до миграции.

**Обоснование:** `saveToLocalStorage()` не вызывается (0 ссылок), `init()` — холостая операция после миграции, `resetToEmptyContent()` не нужен с пер-документными сторами.

**Затрагиваемые файлы:**
- `src/7-shared/services/StorageService.ts`
- `src/1-app/Stores/MainStore.ts`
- `src/6-entities/Document/model/DocumentTabsStore.ts`

---

### Задача 0b.1: Удалить `saveToLocalStorage()` из StorageService

**Файл:** `src/7-shared/services/StorageService.ts`

Удалить метод `saveToLocalStorage`. Он не вызывается нигде в кодовой базе.

**Критерий:** Метод удалён, `npm run build` без ошибок.

---

### Задача 0b.2: Удалить `init()` из StorageService и MainStore

**Файл:** `src/7-shared/services/StorageService.ts`

Удалить метод `init()`. Данные загружаются через `MigrationService.migrateFromSingleDocument()` + `DocumentTabsStore.restoreFromLocalStorage()`.

**Файл:** `src/1-app/Stores/MainStore.ts`

Заменить:
```typescript
// Было:
this.storageService.init()
this.eventsCache.init()

// Стало:
this.eventsCache.init()
```

**Критерий:** `init()` удалён, `MainStore.init()` обновлён.

---

### Задача 0b.3: Удалить `resetToEmptyContent()` из StorageService и DocumentTabsStore

**Файл:** `src/7-shared/services/StorageService.ts`

Удалить метод `resetToEmptyContent()`.

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

Заменить в `closeDocument()`:
```typescript
// Было:
if (this.state.documentOrder.length === 0) {
    this.storageService.resetToEmptyContent()
} else if (this.state.activeDocumentId) {

// Стало:
if (this.state.activeDocumentId) {
```

После миграции на пер-документные сторы, при отсутствии документов `getActiveDocumentStores()` вернёт `null`, и UI отобразит пустое состояние. Сбрасывать глобальные сторы не нужно.

**Критерий:** Метод удалён, `closeDocument()` обновлён.

---

### ✅ Чек-лист Фазы 0b

- [ ] `saveToLocalStorage()` удалён
- [ ] `init()` удалён, `MainStore.init()` обновлён
- [ ] `resetToEmptyContent()` удалён, `closeDocument()` обновлён
- [ ] `npm run build` без ошибок
- [ ] Все существующие тесты проходят
- [ ] Ручное тестирование: создание/закрытие документов работает

---

## Фаза 0c: Перенос ProjectsStore в 6-entities

**Цель:** Устранить нарушение FSD — `ProjectsStore` находится в `3-pages`, но является сущностью предметной области.

**Обоснование:** `ProjectsStore` не содержит UI-логики и логически принадлежит слою `entities`. Без этого переноса `DocumentStoreManager` (в `6-entities`) не сможет импортировать `ProjectsStore` (в `3-pages`) без нарушения правил FSD.

**Затрагиваемые файлы:**
- `src/3-pages/Projects/ProjectsStore.ts` → `src/6-entities/Projects/ProjectsStore.ts` (переместить)
- Все файлы, импортирующие `ProjectsStore`

---

### Задача 0c.1: Создать директорию и переместить файл

```
src/6-entities/Projects/ProjectsStore.ts  (из src/3-pages/Projects/ProjectsStore.ts)
```

Обновить все импорты. Поиск:
```bash
grep -r "from 'src/3-pages/Projects/ProjectsStore'" src/ --include="*.ts" --include="*.tsx"
```

Ожидаемые файлы для обновления импортов:
- `src/6-entities/Events/EventsStore.ts`
- `src/6-entities/Events/SingleEventManager.ts`
- `src/6-entities/Events/RepeatableEventManager.ts`
- `src/6-entities/EventsCache/EventsCache.ts`
- `src/1-app/root.ts`
- `src/1-app/Providers/StoreContext.ts`
- `src/1-app/Stores/MainStore.ts`
- `src/7-shared/services/StorageService.ts`
- `src/5-features/EventSearch/EventSearchStore.ts`
- `src/5-features/ProjectManager/ProjectEditor/ProjectEditorStore.ts`
- `src/3-pages/Projects/ProjectsForm.tsx`

**Критерий:** Файл перемещён, все импорты обновлены.

---

### Задача 0c.2: Обновить реэкспорт из root.ts

**Файл:** `src/1-app/root.ts`

```typescript
// Было:
import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'

// Стало:
import { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'
```

**Критерий:** Импорт обновлён.

---

### ✅ Чек-лист Фазы 0c

- [ ] `ProjectsStore.ts` перемещён в `src/6-entities/Projects/`
- [ ] Все импорты обновлены
- [ ] `npm run build` без ошибок
- [ ] Все существующие тесты проходят

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
import type { DocumentId, DocumentData } from './DocumentTabsStore.types'
import type { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'
import type { EventsStore } from 'src/6-entities/Events/EventsStore'

/** Пара сторов для конкретного документа */
export interface DocumentStores {
    projectsStore: ProjectsStore
    eventsStore: EventsStore
    documentId: DocumentId
    isInitialized: boolean
}

/** Интерфейс провайдера данных документа (для DI и тестирования) */
export interface IDocumentDataProvider {
    getDocumentData(documentId: DocumentId): DocumentData | null
    readonly activeDocumentId: DocumentId | null
}

/** Интерфейс провайдера сторов для EventsCache (для развязки) */
export interface IEventsStoreProvider {
    readonly activeEventsStore: EventsStore | null
    readonly activeProjectsStore: ProjectsStore | null
    getAllDocumentStores(): DocumentStores[]
}
```

**Критерий:** Файл создан, типы экспортируются.

---

### Задача 1.2: Создать DocumentStoreManager

**Файл:** `src/6-entities/Document/model/DocumentStoreManager.ts`

```typescript
import { makeAutoObservable } from 'mobx'

import { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'
import { EventsStore } from 'src/6-entities/Events/EventsStore'

import type { DocumentId, DocumentData } from './DocumentTabsStore.types'
import type { DocumentStores, IDocumentDataProvider } from './DocumentStoreManager.types'

/**
 * Менеджер сторов документов (приватный для DocumentTabsStore).
 * НЕ экспортируется в StoreContext.
 *
 * Управляет жизненным циклом пар {ProjectsStore, EventsStore}
 * для каждого открытого документа.
 */
export class DocumentStoreManager {
    private stores: Map<DocumentId, DocumentStores> = new Map()
    private dataProvider: IDocumentDataProvider

    constructor(dataProvider: IDocumentDataProvider) {
        this.dataProvider = dataProvider
        makeAutoObservable(this, {}, { autoBind: true })
    }

    // === Создание и доступ ===

    /** Получить или создать сторы для документа */
    getOrCreateStores(documentId: DocumentId): DocumentStores {
        const existing = this.stores.get(documentId)
        if (existing) return existing

        const data = this.dataProvider.getDocumentData(documentId)
        if (!data) throw new Error(`Document data not found: ${documentId}`)

        const projectsStore = new ProjectsStore()
        projectsStore.init(data.projectsList)

        const eventsStore = new EventsStore(projectsStore)
        eventsStore.init({
            completedList: data.completedList,
            plannedList: data.plannedList
        })

        const stores: DocumentStores = {
            projectsStore,
            eventsStore,
            documentId,
            isInitialized: true
        }

        this.stores.set(documentId, stores)
        return stores
    }

    /** Проверить наличие сторов для документа */
    hasStores(documentId: DocumentId): boolean {
        return this.stores.has(documentId)
    }

    /** Получить сторы документа (без создания) */
    getStores(documentId: DocumentId): DocumentStores | null {
        return this.stores.get(documentId) ?? null
    }

    /** Получить сторы активного документа */
    get activeStores(): DocumentStores | null {
        const activeId = this.dataProvider.activeDocumentId
        return activeId ? this.getOrCreateStores(activeId) : null
    }

    /** Получить активный EventsStore (удобный геттер) */
    get activeEventsStore(): EventsStore | null {
        return this.activeStores?.eventsStore ?? null
    }

    /** Получить активный ProjectsStore (удобный геттер) */
    get activeProjectsStore(): ProjectsStore | null {
        return this.activeStores?.projectsStore ?? null
    }

    // === Модификация ===

    /** Обновить данные сторов документа (при загрузке из Drive) */
    updateStoresData(documentId: DocumentId, data: DocumentData): void {
        const stores = this.getOrCreateStores(documentId)
        stores.projectsStore.init(data.projectsList)
        stores.eventsStore.init({
            completedList: data.completedList,
            plannedList: data.plannedList
        })
    }

    /** Удалить сторы документа (при закрытии) */
    removeStores(documentId: DocumentId): void {
        this.stores.delete(documentId)
    }

    /** Получить данные документа для сохранения (Unit of Work) */
    getDocumentDataForSave(documentId: DocumentId): DocumentData | null {
        const stores = this.stores.get(documentId)
        if (!stores) return null

        const { completedList, plannedList } = stores.eventsStore.prepareToSave()
        return {
            projectsList: stores.projectsStore.getList(),
            completedList,
            plannedList
        }
    }

    // === Агрегация ===

    /** Получить все сторы документов (для общего календаря) */
    getAllDocumentStores(): DocumentStores[] {
        return Array.from(this.stores.values())
    }

    /** Количество управляемых сторов */
    get storesCount(): number {
        return this.stores.size
    }

    // === Жизненный цикл ===

    /** Очистить все сторы */
    clear(): void {
        this.stores.clear()
    }

    /** Освободить ресурсы (вызывается при уничтожении DocumentTabsStore) */
    dispose(): void {
        this.stores.clear()
    }
}
```

**Критерий:** Класс создан, компилируется.

---

### Задача 1.3: Обновить DocumentTabsStore (композиция)

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

Добавить приватное поле, реализовать `IDocumentDataProvider` и `IEventsStoreProvider`:

```typescript
import { DocumentStoreManager } from './DocumentStoreManager'
import type { DocumentStores, IEventsStoreProvider } from './DocumentStoreManager.types'

export class DocumentTabsStore implements IEventsStoreProvider {
    private state: DocumentTabsState
    private documentStoreManager: DocumentStoreManager  // <-- КОМПОЗИЦИЯ

    constructor(
        private readonly googleApiService: GoogleApiService,
        private readonly storageService: StorageService
    ) {
        this.state = {
            documents: new Map(),
            activeDocumentId: null,
            documentOrder: []
        }

        // Создаём менеджер внутри конструктора, передаём себя как провайдер данных
        this.documentStoreManager = new DocumentStoreManager({
            getDocumentData: (id) => this.state.documents.get(id)?.data ?? null,
            get activeDocumentId() { return this.state.activeDocumentId }
        })

        makeAutoObservable(this)
    }

    // === Методы доступа к сторам (делегирование к DocumentStoreManager) ===

    /** Получить сторы активного документа */
    getActiveDocumentStores(): DocumentStores | null {
        return this.documentStoreManager.activeStores
    }

    /** Получить все сторы (для общего календаря) */
    getAllDocumentStores(): DocumentStores[] {
        return this.documentStoreManager.getAllDocumentStores()
    }

    /** Получить сторы конкретного документа */
    getDocumentStores(documentId: DocumentId): DocumentStores | null {
        return this.documentStoreManager.getStores(documentId)
    }

    // === IEventsStoreProvider ===

    get activeEventsStore() { return this.documentStoreManager.activeEventsStore }
    get activeProjectsStore() { return this.documentStoreManager.activeProjectsStore }

    // === IDocumentDataProvider ===

    get activeDocumentId(): DocumentId | null {
        return this.state.activeDocumentId
    }
}
```

**Критерий:** DocumentTabsStore компилируется с композицией.

---

### Задача 1.4: Обновить index.ts

**Файл:** `src/6-entities/Document/model/index.ts`

```typescript
/** Публичный API model-слоя сущности Document */
export * from './types'
export * from './DocumentTabsStore'
export * from './DocumentTabsStore.types'
export { DocumentStoreManager } from './DocumentStoreManager'  // для тестов
export type { DocumentStores, IDocumentDataProvider, IEventsStoreProvider } from './DocumentStoreManager.types'
```

**Критерий:** Экспорты обновлены.

---

### Задача 1.5: Написать unit-тесты DocumentStoreManager

**Файл:** `src/6-entities/Document/model/DocumentStoreManager.spec.ts` — **НОВЫЙ**

```typescript
import { DocumentStoreManager } from './DocumentStoreManager'
import type { IDocumentDataProvider } from './DocumentStoreManager.types'
import type { DocumentId, DocumentData } from './DocumentTabsStore.types'
import { createEmptyDocumentData } from './DocumentTabsStore.types'

describe('DocumentStoreManager', () => {
    let manager: DocumentStoreManager
    let mockData: Map<DocumentId, DocumentData>
    let mockActiveId: DocumentId | null

    beforeEach(() => {
        mockData = new Map()
        mockActiveId = null

        const dataProvider: IDocumentDataProvider = {
            getDocumentData: (id) => mockData.get(id) ?? null,
            get activeDocumentId() { return mockActiveId }
        }

        manager = new DocumentStoreManager(dataProvider)
    })

    test('should create stores for a document', () => {
        mockData.set('doc_1', createEmptyDocumentData())
        const stores = manager.getOrCreateStores('doc_1')

        expect(stores.projectsStore).toBeDefined()
        expect(stores.eventsStore).toBeDefined()
        expect(stores.documentId).toBe('doc_1')
        expect(stores.isInitialized).toBe(true)
        expect(manager.storesCount).toBe(1)
    })

    test('should return existing stores on second call', () => {
        mockData.set('doc_1', createEmptyDocumentData())
        const s1 = manager.getOrCreateStores('doc_1')
        const s2 = manager.getOrCreateStores('doc_1')
        expect(s1).toBe(s2)
    })

    test('should throw if document data not found', () => {
        expect(() => manager.getOrCreateStores('missing')).toThrow('Document data not found')
    })

    test('should remove stores', () => {
        mockData.set('doc_1', createEmptyDocumentData())
        manager.getOrCreateStores('doc_1')
        manager.removeStores('doc_1')
        expect(manager.storesCount).toBe(0)
        expect(manager.getStores('doc_1')).toBeNull()
    })

    test('should return active stores', () => {
        mockData.set('doc_1', createEmptyDocumentData())
        mockActiveId = 'doc_1'
        const stores = manager.activeStores
        expect(stores).toBeDefined()
        expect(stores!.documentId).toBe('doc_1')
    })

    test('should return null active stores when no active document', () => {
        mockActiveId = null
        expect(manager.activeStores).toBeNull()
    })

    test('should return activeEventsStore and activeProjectsStore', () => {
        mockData.set('doc_1', createEmptyDocumentData())
        mockActiveId = 'doc_1'
        expect(manager.activeEventsStore).toBeDefined()
        expect(manager.activeProjectsStore).toBeDefined()
    })

    test('should update stores data', () => {
        mockData.set('doc_1', createEmptyDocumentData())
        const stores = manager.getOrCreateStores('doc_1')

        const newData: DocumentData = {
            projectsList: [{ name: 'Test', color: 'red', background: 'blue' }],
            completedList: [],
            plannedList: []
        }
        manager.updateStoresData('doc_1', newData)

        expect(stores.projectsStore.list.length).toBe(2) // default + Test
    })

    test('should get document data for save', () => {
        mockData.set('doc_1', createEmptyDocumentData())
        manager.getOrCreateStores('doc_1')

        const data = manager.getDocumentDataForSave('doc_1')
        expect(data).toBeDefined()
        expect(data!.projectsList).toBeDefined()
        expect(data!.completedList).toBeDefined()
        expect(data!.plannedList).toBeDefined()
    })

    test('should return null for save if stores not found', () => {
        expect(manager.getDocumentDataForSave('missing')).toBeNull()
    })

    test('should get all document stores', () => {
        mockData.set('doc_1', createEmptyDocumentData())
        mockData.set('doc_2', createEmptyDocumentData())
        manager.getOrCreateStores('doc_1')
        manager.getOrCreateStores('doc_2')

        const all = manager.getAllDocumentStores()
        expect(all.length).toBe(2)
    })

    test('should clear all stores', () => {
        mockData.set('doc_1', createEmptyDocumentData())
        manager.getOrCreateStores('doc_1')
        manager.clear()
        expect(manager.storesCount).toBe(0)
    })
})
```

**Критерий:** Тесты проходят.

---

### ✅ Чек-лист Фазы 1

- [ ] `DocumentStoreManager.types.ts` создан с `DocumentStores`, `IDocumentDataProvider`, `IEventsStoreProvider`
- [ ] `DocumentStoreManager.ts` создан с `makeAutoObservable` (без декораторов)
- [ ] `DocumentStoreManager` реализует `dispose()`
- [ ] `DocumentStoreManager` использует `DocumentData` вместо `any[]`
- [ ] `DocumentStoreManager` реализует `getDocumentDataForSave()` (Unit of Work)
- [ ] `DocumentTabsStore` содержит `documentStoreManager` как приватное поле
- [ ] `DocumentTabsStore` реализует `IEventsStoreProvider`
- [ ] Добавлены `getActiveDocumentStores()`, `getAllDocumentStores()`, `activeEventsStore`, `activeProjectsStore`
- [ ] `index.ts` обновлён
- [ ] Unit-тесты `DocumentStoreManager` проходят
- [ ] TypeScript компилируется

---

## Фаза 2: Интеграция с DocumentTabsStore

**Цель:** Научить DocumentTabsStore использовать DocumentStoreManager при открытии/закрытии/переключении документов. Добавить feature toggle.

**Файлы:**
- `src/6-entities/Document/model/DocumentTabsStore.ts`
- `src/1-app/Stores/UIStore.ts`

---

### Задача 2.1: Добавить feature toggle в UIStore

**Файл:** `src/1-app/Stores/UIStore.ts`

```typescript
export class UIStore {
    forceUpdateFlag = false
    /** Feature toggle: использовать пер-документные сторы */
    usePerDocumentStores = false

    constructor() {
        makeAutoObservable(this)
    }

    forceUpdate = () => { this.forceUpdateFlag = !this.forceUpdateFlag }
}
```

**Критерий:** Флаг добавлен.

---

### Задача 2.2: Обновить openNewDocument

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

```typescript
openNewDocument(name: string = 'Новый документ') {
    const id = generateDocumentId()
    const session: DocumentSession = {
        id,
        ref: { fileId: null, name, mimeType: 'application/json', space: null, parentFolderId: null },
        data: createEmptyDocumentData(),
        state: { ...createInitialDocumentState(), syncStatus: 'offline' },
        createdAt: Date.now(),
        lastAccessedAt: Date.now()
    }
    this.state.documents.set(id, session)
    this.state.documentOrder.push(id)
    this.state.activeDocumentId = id

    if (this.uiStore.usePerDocumentStores) {
        // НОВОЕ: Сторы создаются через DocumentStoreManager
        this.documentStoreManager.getOrCreateStores(id)
    } else {
        // СТАРОЕ: Применить пустые данные к глобальным сторам
        this.storageService.applyContent(session.data)
    }

    this.persistToLocalStorage()
    this.persistDocumentDataToLocalStorage(id)
}
```

**Примечание:** `uiStore` нужно передать в конструктор `DocumentTabsStore` или получить через параметр. Простейший вариант — добавить параметр в конструктор:

```typescript
constructor(
    private readonly googleApiService: GoogleApiService,
    private readonly storageService: StorageService,
    private readonly uiStore: UIStore
) {
```

Это потребует обновления `root.ts`:

```typescript
export const documentTabsStore = new DocumentTabsStore(googleApiService, storageService, uiStore)
```

**Критерий:** Новый документ создаётся со сторами при включённом toggle.

---

### Задача 2.3: Обновить openFromDrive

```typescript
async openFromDrive(fileId: string, space?: 'drive' | 'appDataFolder') {
    const existing = this.findDocumentByFileId(fileId)
    if (existing) { this.activateDocument(existing.id); return }

    const id = generateDocumentId()
    const session: DocumentSession = {
        id,
        ref: { fileId, name: 'Загрузка...', mimeType: 'application/json', space: space ?? null, parentFolderId: null },
        data: createEmptyDocumentData(),
        state: { ...createInitialDocumentState(), isLoading: true, syncStatus: 'syncing' },
        createdAt: Date.now(),
        lastAccessedAt: Date.now()
    }
    this.state.documents.set(id, session)
    this.state.documentOrder.push(id)
    this.state.activeDocumentId = id

    try {
        const metadata = await this.googleApiService.getFileMetadata(fileId)
        const content = await this.googleApiService.downloadFileContent(fileId)

        const loadedSession = this.state.documents.get(id)!
        loadedSession.ref = { /* ... без изменений ... */ }
        loadedSession.data = parseDocumentContent(content)
        loadedSession.state.syncStatus = 'synced'
        loadedSession.state.lastLoadedAt = Date.now()
        loadedSession.state.lastSyncedAt = Date.now()

        if (this.uiStore.usePerDocumentStores) {
            // НОВОЕ: Обновляем сторы через менеджер
            this.documentStoreManager.updateStoresData(id, {
                projectsList: loadedSession.data.projectsList,
                completedList: loadedSession.data.completedList,
                plannedList: loadedSession.data.plannedList
            })
        } else {
            // СТАРОЕ: Применить данные к глобальным сторам
            this.storageService.applyContent(loadedSession.data)
        }

        loadedSession.state.isLoading = false
        loadedSession.state.isDirty = false
        this.persistDocumentDataToLocalStorage(id)
        this.persistToLocalStorage()
    } catch (error: any) {
        // ... без изменений ...
    }
}
```

**Критерий:** Документ из Drive загружается со сторами.

---

### Задача 2.4: Обновить activateDocument

```typescript
activateDocument(documentId: DocumentId) {
    const session = this.state.documents.get(documentId)
    if (!session) return

    this.state.activeDocumentId = documentId
    session.lastAccessedAt = Date.now()

    if (this.uiStore.usePerDocumentStores) {
        // НОВОЕ: Убеждаемся что сторы существуют (данные уже в памяти!)
        this.documentStoreManager.getOrCreateStores(documentId)
    } else {
        // СТАРОЕ: Применить данные активного документа к глобальным сторам
        const previousLoadingState = session.state.isLoading
        session.state.isLoading = true
        this.storageService.applyContent(session.data)
        session.state.isLoading = previousLoadingState
    }

    this.persistToLocalStorage()
}
```

**Критерий:** Активация не вызывает очистку сторов при включённом toggle.

---

### Задача 2.5: Обновить closeDocument

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

    if (this.uiStore.usePerDocumentStores) {
        // НОВОЕ: Удаляем сторы
        this.documentStoreManager.removeStores(documentId)
    }
    // СТАРОЕ: resetToEmptyContent уже удалён в Фазе 0b

    if (this.state.activeDocumentId) {
        this.activateDocument(this.state.activeDocumentId)
    }

    this.removeDocumentDataFromLocalStorage(documentId)
    this.persistToLocalStorage()
}
```

**Критерий:** Закрытие удаляет сторы.

---

### Задача 2.6: Обновить restoreFromLocalStorage

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

    // Загрузка данных каждого документа из localStorage
    for (const docSnapshot of snapshot.documents) {
        const dataJson = localStorage.getItem(`${DOCUMENT_DATA_PREFIX}${docSnapshot.id}`)
        if (dataJson) {
            try {
                const dataSnapshot = JSON.parse(dataJson) as DocumentDataSnapshot
                const session = this.state.documents.get(docSnapshot.id)!
                session.data = dataSnapshot.data

                if (this.uiStore.usePerDocumentStores) {
                    // НОВОЕ: Создаём сторы
                    this.documentStoreManager.updateStoresData(docSnapshot.id, {
                        projectsList: session.data.projectsList,
                        completedList: session.data.completedList,
                        plannedList: session.data.plannedList
                    })
                }
            } catch (e) {
                console.error(`Failed to load data for document ${docSnapshot.id}:`, e)
            }
        }
    }

    // СТАРОЕ: Применить данные активного документа к глобальным сторам
    if (!this.uiStore.usePerDocumentStores) {
        if (this.state.activeDocumentId) {
            const activeSession = this.state.documents.get(this.state.activeDocumentId)
            if (activeSession) {
                activeSession.state.isLoading = true
                this.storageService.applyContent(activeSession.data)
                activeSession.state.isLoading = false
            }
        }
    }

    return true
}
```

**Критерий:** Восстановление создаёт сторы.

---

### Задача 2.7: Обновить syncActiveDocumentWithDrive

В методе `syncActiveDocumentWithDrive()` заменить вызов `this.storageService.applyContent(session.data)` на:

```typescript
if (this.uiStore.usePerDocumentStores) {
    this.documentStoreManager.updateStoresData(session.id, {
        projectsList: session.data.projectsList,
        completedList: session.data.completedList,
        plannedList: session.data.plannedList
    })
} else {
    this.storageService.applyContent(session.data)
}
```

**Критерий:** Синхронизация обновляет сторы через менеджер.

---

### Задача 2.8: Обновить root.ts

```typescript
// Порядок создания: uiStore должен быть создан до documentTabsStore
export const uiStore = new UIStore()

// ...

export const documentTabsStore = new DocumentTabsStore(googleApiService, storageService, uiStore)
```

**Критерий:** `root.ts` компилируется.

---

### ✅ Чек-лист Фазы 2

- [ ] Feature toggle `usePerDocumentStores` добавлен в `UIStore`
- [ ] `DocumentTabsStore` получает `uiStore` в конструкторе
- [ ] `openNewDocument` создаёт сторы при включённом toggle
- [ ] `openFromDrive` обновляет сторы при включённом toggle
- [ ] `activateDocument` не вызывает `storageService.applyContent` при включённом toggle
- [ ] `closeDocument` удаляет сторы при включённом toggle
- [ ] `restoreFromLocalStorage` создаёт сторы при включённом toggle
- [ ] `syncActiveDocumentWithDrive` обновляет сторы при включённом toggle
- [ ] `root.ts` обновлён
- [ ] TypeScript компилируется
- [ ] Ручное тестирование: переключение вкладок мгновенное при `usePerDocumentStores = true`
- [ ] Ручное тестирование: старое поведение работает при `usePerDocumentStores = false`

---

## Фаза 3: Миграция EventsCache

**Цель:** EventsCache работает через интерфейс `IEventsStoreProvider` вместо прямых ссылок на глобальные сторы.

**Файлы:**
- `src/6-entities/EventsCache/EventsCache.ts`
- `src/6-entities/EventsCache/EventCacheStructure.ts`
- `src/1-app/root.ts`

---

### Задача 3.1: Обновить конструктор EventsCache

**Файл:** `src/6-entities/EventsCache/EventsCache.ts`

```typescript
import type { IEventsStoreProvider } from 'src/6-entities/Document/model/DocumentStoreManager.types'
import type { DocumentId } from 'src/6-entities/Document/model/DocumentTabsStore.types'

export class EventsCache {
    private provider: IEventsStoreProvider

    constructor(provider: IEventsStoreProvider) {
        this.provider = provider
    }

    /** Инициализация кэша событий (очищение кэша) */
    init() {
        this.cachedEvents = []
        this.cachedActualBalance = []
        this.cachedPlannedBalance = []

        const eventsStore = this.provider.activeEventsStore
        if (!eventsStore) {
            this.lastActualBalance = 0
            this.lastActualBalanceDate = 0
            this.firstActualBalanceDate = 0
            return
        }

        this.lastActualBalance = eventsStore.completed.reduce(
            (b, e) => b + e.credit - e.debit, 0
        )
        this.lastActualBalanceDate = eventsStore.completed.length
            ? eventsStore.completed[eventsStore.completed.length - 1].start
            : 0
        this.firstActualBalanceDate = eventsStore.completed.length
            ? eventsStore.completed[0].start
            : 0
    }

    getEvents(date: timestamp): EventCacheStructure[] {
        if (this.cachedEvents[date] !== undefined) return this.cachedEvents[date]

        const eventsStore = this.provider.activeEventsStore
        const projectsStore = this.provider.activeProjectsStore
        if (!eventsStore || !projectsStore) return []

        // Используем eventsStore и projectsStore вместо this.eventsStore и this.projectsStore
        const events: EventCacheStructure[] = eventsStore.planned.reduce((a, e) => {
            if (date < e.start || date >= e.end) return a
            const color = projectsStore.getById(e.projectId)?.color ?? ProjectsStore.defaultProject.color
            const background = projectsStore.getById(e.projectId)?.background ?? ProjectsStore.defaultProject.background
            a.push(singleEventToEventCache(e, date, false, color, background))
            return a
        }, [] as EventCacheStructure[])

        // ... аналогично для plannedRepeatable и completed
        // (логика идентична текущей, заменяем this.eventsStore → eventsStore, this.projectsStore → projectsStore)

        events.sort((a, b) => {
            var d = a.start - b.start
            if (d) return d
            d = b.end - b.start - (a.end - a.start)
            if (d) return d
            return (a.time === null ? 0 : a.time) - (b.time === null ? 0 : b.time)
        })
        this.cachedEvents[date] = events
        return events
    }

    // ... остальные методы аналогично
}
```

**Критерий:** EventsCache компилируется.

---

### Задача 3.2: Добавить методы агрегации

```typescript
/** Получить агрегированные события за день из всех документов (для общего календаря) */
getAggregatedEvents(date: timestamp): EventCacheStructure[] {
    const allEvents: EventCacheStructure[] = []

    for (const docStores of this.provider.getAllDocumentStores()) {
        const { eventsStore, projectsStore } = docStores

        eventsStore.planned.forEach(e => {
            if (date < e.start || date >= e.end) return
            const color = projectsStore.getById(e.projectId)?.color ?? ProjectsStore.defaultProject.color
            const background = projectsStore.getById(e.projectId)?.background ?? ProjectsStore.defaultProject.background
            allEvents.push({
                ...singleEventToEventCache(e, date, false, color, background),
                sourceDocumentId: docStores.documentId
            })
        })

        // ... аналогично для plannedRepeatable и completed
    }

    allEvents.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || (a.time ?? 0) - (b.time ?? 0))
    return allEvents
}

/** Получить агрегированный баланс из всех документов */
getAggregatedBalance(): { lastActualBalance: number; lastActualBalanceDate: number; firstActualBalanceDate: number } {
    let totalActual = 0
    let maxDate = 0
    let minDate = Infinity

    for (const docStores of this.provider.getAllDocumentStores()) {
        totalActual += docStores.eventsStore.completed.reduce((b, e) => b + e.credit - e.debit, 0)
        if (docStores.eventsStore.completed.length) {
            maxDate = Math.max(maxDate, docStores.eventsStore.completed[docStores.eventsStore.completed.length - 1].start)
            minDate = Math.min(minDate, docStores.eventsStore.completed[0].start)
        }
    }

    return {
        lastActualBalance: totalActual,
        lastActualBalanceDate: maxDate,
        firstActualBalanceDate: minDate === Infinity ? 0 : minDate
    }
}
```

**Критерий:** Методы агрегации добавлены.

---

### Задача 3.3: Обновить EventCacheStructure

**Файл:** `src/6-entities/EventsCache/EventCacheStructure.ts`

```typescript
import type { DocumentId } from 'src/6-entities/Document/model/DocumentTabsStore.types'

export type EventCacheStructure = {
    // ... существующие поля
    /** ID документа-источника (для общего календаря) */
    sourceDocumentId?: DocumentId
}
```

**Критерий:** Тип обновлён.

---

### Задача 3.4: Обновить root.ts

```typescript
// Было:
export const eventsCache = new EventsCache(projectsStore, eventsStore)

// Стало:
export const eventsCache = new EventsCache(documentTabsStore)
```

**Критерий:** `root.ts` компилируется.

---

### ✅ Чек-лист Фазы 3

- [ ] EventsCache конструктор → `IEventsStoreProvider`
- [ ] `init()` через `provider.activeEventsStore`
- [ ] `getEvents()` через `provider.activeEventsStore` / `provider.activeProjectsStore`
- [ ] `getAggregatedEvents()` добавлен
- [ ] `getAggregatedBalance()` добавлен
- [ ] `EventCacheStructure` с `sourceDocumentId`
- [ ] `root.ts` обновлён
- [ ] Ручное тестирование: календарь работает, баланс корректен

---

## Фаза 4: Миграция StorageService и MainStore

**Цель:** Перевести StorageService и MainStore на работу через DocumentTabsStore. Заменить императивные колбэки на `reaction()`.

**Файлы:**
- `src/7-shared/services/StorageService.ts`
- `src/1-app/Stores/MainStore.ts`
- `src/1-app/root.ts`

---

### Задача 4.1: Обновить StorageService

**Файл:** `src/7-shared/services/StorageService.ts`

```typescript
import { makeAutoObservable, runInAction } from 'mobx'

import { ProjectData } from 'src/6-entities/Projects/ProjectsStore'
import type { EventsStoreData } from 'src/6-entities/Events/EventsStore'
import type { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'
import type { DocumentId } from 'src/6-entities/Document/model/DocumentTabsStore.types'

/** Сериализуемая структура данных приложения */
export type MainStoreData = {
    projectsList: ProjectData[]
} & EventsStoreData

// ... normalizeMainStoreData без изменений ...

export class StorageService {
    isSyncWithLocalstorage: boolean = false
    isSyncWithGoogleDrive: boolean = false

    private documentTabsStore: DocumentTabsStore
    private onContentApplied?: () => void

    constructor(documentTabsStore: DocumentTabsStore, onContentApplied?: () => void) {
        this.documentTabsStore = documentTabsStore
        this.onContentApplied = onContentApplied
        makeAutoObservable(this)
    }

    desyncWithStorages = () => {
        this.isSyncWithGoogleDrive = false
        this.isSyncWithLocalstorage = false
    }

    markGoogleDriveSynced = () => {
        this.isSyncWithGoogleDrive = true
    }

    /** Сохранить данные документа в localStorage */
    saveToLocalStorage = (documentId: DocumentId) => {
        const stores = this.documentTabsStore.getDocumentStores(documentId)
        if (!stores) return

        const data: MainStoreData = {
            projectsList: stores.projectsStore.getList(),
            ...stores.eventsStore.prepareToSave()
        }
        localStorage.setItem(`document_${documentId}`, JSON.stringify(data))
        this.isSyncWithLocalstorage = true
    }

    /** Получить данные для сохранения (Unit of Work через DocumentStoreManager) */
    getContentToSave = (documentId?: DocumentId) => {
        const docId = documentId ?? this.documentTabsStore.activeDocumentId
        if (!docId) return null

        const stores = this.documentTabsStore.getDocumentStores(docId)
        if (!stores) return null

        const data: MainStoreData = {
            projectsList: stores.projectsStore.getList(),
            ...stores.eventsStore.prepareToSave()
        }
        return data
    }

    /**
     * Применить контент документа к сторам.
     * @deprecated Используется только для обратной совместимости при выключенном feature toggle.
     * После удаления toggle этот метод можно будет удалить.
     */
    applyContent = (content: unknown) => {
        const normalized = normalizeMainStoreData(content)
        // Применяем к глобальным сторам (старый путь)
        const activeStores = this.documentTabsStore.getActiveDocumentStores()
        if (activeStores) {
            activeStores.projectsStore.init(normalized.projectsList)
            activeStores.eventsStore.init(normalized)
        }
        runInAction(() => {
            this.isSyncWithLocalstorage = false
            this.isSyncWithGoogleDrive = true
            this.onContentApplied?.()
        })
    }
}
```

**Критерий:** StorageService компилируется.

---

### Задача 4.2: Обновить MainStore.init — заменить колбэки на reaction()

**Файл:** `src/1-app/Stores/MainStore.ts`

```typescript
import { makeAutoObservable, reaction } from 'mobx'

import { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'
import { EventsCache } from 'src/6-entities/EventsCache/EventsCache'
import { EventsStore } from 'src/6-entities/Events/EventsStore'

import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { StorageService } from 'src/7-shared/services/StorageService'
import { PathSegment } from 'src/5-features/DriveFileList/model/DriveFileListStore'
import { Observable } from 'src/7-shared/libs/Observable/Observable'
import { DocumentTabsStore } from 'src/6-entities/Document/model'
import { MigrationService } from 'src/1-app/Stores/MigrationService'

export class MainStore {
    projectsStore: ProjectsStore
    eventsStore: EventsStore
    eventsCache: EventsCache

    private googleApiService: GoogleApiService
    private storageService: StorageService
    private documentTabsStore: DocumentTabsStore
    private _disposers: (() => void)[] = []

    driveExplorerPersistentState = new Map<string, { folderId: string; path: PathSegment[] }>()
    fileSavedNotifier = new Observable<void>()

    constructor(
        projectsStore: ProjectsStore,
        eventsStore: EventsStore,
        eventsCache: EventsCache,
        googleApiService: GoogleApiService,
        storageService: StorageService,
        documentTabsStore: DocumentTabsStore
    ) {
        this.projectsStore = projectsStore
        this.eventsStore = eventsStore
        this.eventsCache = eventsCache
        this.googleApiService = googleApiService
        this.storageService = storageService
        this.documentTabsStore = documentTabsStore

        this.driveExplorerPersistentState.set('drive', {
            folderId: 'root',
            path: [{ id: 'root', name: 'Мой диск' }]
        })
        this.driveExplorerPersistentState.set('appDataFolder', {
            folderId: 'appDataFolder',
            path: [{ id: 'appDataFolder', name: 'Раздел приложения' }]
        })

        makeAutoObservable(this)
    }

    init() {
        MigrationService.migrateFromSingleDocument()

        // === Реактивные обработчики через reaction() ===

        // 1. Реакция на изменения в активном EventsStore
        this._disposers.push(
            reaction(
                () => {
                    const stores = this.documentTabsStore.getActiveDocumentStores()
                    // Возвращаем «сигнал» для отслеживания — длину списков + timestamp
                    // Это заставляет MobX отслеживать изменения
                    if (!stores) return null
                    return {
                        planned: stores.eventsStore.planned.length,
                        completed: stores.eventsStore.completed.length,
                        repeatable: stores.eventsStore.plannedRepeatable.length,
                        id: stores.documentId
                    }
                },
                (_value, previousValue) => {
                    // Пропускаем первый запуск (reaction вызывается сразу)
                    if (!previousValue && !_value) return

                    const stores = this.documentTabsStore.getActiveDocumentStores()
                    if (!stores) return

                    stores.eventsStore.sort()
                    this.eventsCache.init()
                    this.storageService.desyncWithStorages()

                    // Обновляем данные документа в DocumentTabsStore
                    const activeDoc = this.documentTabsStore.activeDocument
                    if (activeDoc && !activeDoc.state.isLoading) {
                        this.documentTabsStore.updateActiveDocumentData({
                            projectsList: stores.projectsStore.getList(),
                            ...stores.eventsStore.prepareToSave()
                        })
                    }
                }
            )
        )

        // 2. Реакция на изменения в активном ProjectsStore
        this._disposers.push(
            reaction(
                () => {
                    const stores = this.documentTabsStore.getActiveDocumentStores()
                    if (!stores) return null
                    return {
                        projects: stores.projectsStore.list.length,
                        id: stores.documentId
                    }
                },
                () => {
                    const stores = this.documentTabsStore.getActiveDocumentStores()
                    if (!stores) return

                    this.eventsCache.init()
                    this.storageService.desyncWithStorages()

                    const activeDoc = this.documentTabsStore.activeDocument
                    if (activeDoc && !activeDoc.state.isLoading) {
                        this.documentTabsStore.updateActiveDocumentData({
                            projectsList: stores.projectsStore.getList(),
                            ...stores.eventsStore.prepareToSave()
                        })
                    }
                }
            )
        )

        // === Инициализация ===

        this.eventsCache.init()
        this.googleApiService.initGapi()

        void this.googleApiService
            .waitForGapiReady()
            .then(() => {
                return this.documentTabsStore.restoreFromLocalStorage()
            })
            .catch(e => {
                console.error('DocumentTabsStore restore failed:', e)
            })
    }

    /** Освободить ресурсы */
    dispose() {
        this._disposers.forEach(d => d())
        this._disposers = []
    }

    updateDriveExplorerPersistentState(space: string, folderId: string, path: PathSegment[]) {
        this.driveExplorerPersistentState.set(space, { folderId, path })
    }

    getDriveExplorerPersistentState(space: string): { folderId: string; path: PathSegment[] } {
        return this.driveExplorerPersistentState.get(space)!
    }
}
```

**Критерий:** MainStore.init обновлён, `reaction()` используется вместо колбэков.

---

### Задача 4.3: Обновить root.ts

```typescript
// Было:
export const storageService = new StorageService(projectsStore, eventsStore, () => uiStore.forceUpdate())

// Стало:
export const storageService = new StorageService(documentTabsStore, () => uiStore.forceUpdate())
```

**Критерий:** `root.ts` компилируется.

---

### ✅ Чек-лист Фазы 4

- [ ] StorageService → `documentTabsStore`
- [ ] StorageService использует пер-документные ключи для `saveToLocalStorage`
- [ ] StorageService `getContentToSave()` принимает `documentId`
- [ ] MainStore использует `reaction()` вместо `onChangeList`
- [ ] MainStore имеет `dispose()` для очистки реакций
- [ ] `root.ts` обновлён
- [ ] Ручное тестирование: изменения сохраняются

---

## Фаза 5a: Миграция сторов (EventSearchStore, ProjectEditorStore)

**Цель:** Перевести сторы поиска и редактирования проектов на работу через `documentTabsStore`.

**Файлы:**
- `src/5-features/EventSearch/EventSearchStore.ts`
- `src/5-features/ProjectManager/ProjectEditor/ProjectEditorStore.ts`
- `src/1-app/root.ts`

---

### Задача 5a.1: Обновить EventSearchStore

**Файл:** `src/5-features/EventSearch/EventSearchStore.ts`

```typescript
import { makeAutoObservable } from 'mobx'
import type { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'
import type { EventsStore } from 'src/6-entities/Events/EventsStore'

// ... остальные импорты без изменений ...

export class EventSearchStore {
    query: string = ''
    results: SearchResult[] = []
    currentIndex: number = -1
    isActive: boolean = false

    // ... остальные поля без изменений ...

    private documentTabsStore: DocumentTabsStore

    constructor(documentTabsStore: DocumentTabsStore) {
        this.documentTabsStore = documentTabsStore
        makeAutoObservable(this)
    }

    /** Получить активный EventsStore */
    private get activeEventsStore(): EventsStore | null {
        return this.documentTabsStore.activeEventsStore
    }

    // ... все методы, использующие this.eventsStore, заменить на this.activeEventsStore
    // Пример:
    // Было: this.eventsStore.planned.reduce(...)
    // Стало: this.activeEventsStore?.planned.reduce(...) или const es = this.activeEventsStore; if (!es) return; es.planned.reduce(...)
}
```

**Критерий:** EventSearchStore компилируется.

---

### Задача 5a.2: Обновить ProjectEditorStore

**Файл:** `src/5-features/ProjectManager/ProjectEditor/ProjectEditorStore.ts`

```typescript
import { makeAutoObservable } from 'mobx'
import type { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'
import type { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'

export default class ProjectEditorStore {
    private documentTabsStore: DocumentTabsStore

    constructor(documentTabsStore: DocumentTabsStore) {
        this.documentTabsStore = documentTabsStore
        makeAutoObservable(this)
    }

    private get activeProjectsStore(): ProjectsStore | null {
        return this.documentTabsStore.activeProjectsStore
    }

    // ... все методы, использующие this.projectsStore, заменить на this.activeProjectsStore
}
```

**Критерий:** ProjectEditorStore компилируется.

---

### Задача 5a.3: Обновить root.ts

```typescript
// Было:
export const eventSearchStore = new EventSearchStore(eventsStore)
export const projectEditorStore = new ProjectEditorStore(projectsStore)

// Стало:
export const eventSearchStore = new EventSearchStore(documentTabsStore)
export const projectEditorStore = new ProjectEditorStore(documentTabsStore)
```

**Критерий:** `root.ts` компилируется.

---

### ✅ Чек-лист Фазы 5a

- [ ] EventSearchStore обновлён
- [ ] ProjectEditorStore обновлён
- [ ] `root.ts` обновлён
- [ ] TypeScript компилируется
- [ ] Ручное тестирование: поиск работает, редактирование проектов работает

---

## Фаза 5b: Миграция UI-компонентов

**Цель:** Перевести все UI-компоненты на работу через `documentTabsStore.activeEventsStore` / `activeProjectsStore`.

**Файлы:**
- `src/4-widgets/EventForm/EventForm.tsx`
- `src/3-pages/Calendar/Calendar.tsx`
- `src/3-pages/Calendar/CalendarStore.ts`
- `src/3-pages/DayList/DayListStore.ts`
- `src/5-features/ProjectManager/ProjectList/ProjectList.tsx`
- `src/4-widgets/CalendarIconBar/CalendarIconBar.tsx`

---

### Задача 5b.1: Обновить EventForm.tsx

**Файл:** `src/4-widgets/EventForm/EventForm.tsx`

Заменить все обращения к `eventsStore` из контекста на `documentTabsStore.activeEventsStore`:

```typescript
const { documentTabsStore, eventFormStore } = useContext(StoreContext)

// Было:
// const { eventsStore, eventFormStore } = useContext(StoreContext)
// eventsStore.updateEvent(id, dto)

// Стало:
const eventsStore = documentTabsStore.activeEventsStore
if (!eventsStore) return
eventsStore.updateEvent(id, dto)
```

**Критерий:** EventForm компилируется.

---

### Задача 5b.2: Обновить Calendar.tsx и CalendarStore

**Файл:** `src/3-pages/Calendar/Calendar.tsx`

Заменить обращения к `eventsStore` на `documentTabsStore.activeEventsStore`.

**Файл:** `src/3-pages/Calendar/CalendarStore.ts`

Если `CalendarStore` использует `eventsCache` напрямую — без изменений (eventsCache уже мигрирован в Фазе 3).

**Критерий:** Calendar компилируется.

---

### Задача 5b.3: Обновить DayListStore

**Файл:** `src/3-pages/DayList/DayListStore.ts`

Если использует `eventsCache` напрямую — без изменений. Если использует `eventsStore` — заменить на `documentTabsStore.activeEventsStore`.

**Критерий:** DayList компилируется.

---

### Задача 5b.4: Обновить ProjectList.tsx

**Файл:** `src/5-features/ProjectManager/ProjectList/ProjectList.tsx`

```typescript
const { documentTabsStore } = useContext(StoreContext)

// Было:
// const { projectsStore } = useContext(StoreContext)
// projectsStore.list.map(...)

// Стало:
const projectsStore = documentTabsStore.activeProjectsStore
if (!projectsStore) return null
projectsStore.list.map(...)
```

**Критерий:** ProjectList компилируется.

---

### Задача 5b.5: Обновить CalendarIconBar.tsx

**Файл:** `src/4-widgets/CalendarIconBar/CalendarIconBar.tsx`

Это ключевой компонент с прямым использованием `storageService`:

```typescript
const { uiStore, googleApiService, storageService, weatherStore, saveToDriveStore, documentTabsStore } =
    useContext(StoreContext)

// 1. handleSaveAsToDrive — заменить storageService.getContentToSave()
const handleSaveAsToDrive = () => {
    if (!activeDoc) {
        alert('Нет активного документа для сохранения')
        return
    }
    // Было: const dataToSave = storageService.getContentToSave()
    // Стало:
    const dataToSave = documentTabsStore.getDocumentStores(activeDoc.id)
        ? storageService.getContentToSave(activeDoc.id)
        : null
    if (!dataToSave) return
    const fileName = activeDoc.ref?.name || `calendar_data_${new Date().toISOString().slice(0, 10)}.json`
    const mimeType = activeDoc.ref?.mimeType || 'application/json'
    saveToDriveStore.open(fileName, JSON.stringify(dataToSave, null, 2), mimeType)
}

// 2. handleChooseRemoteVersion — заменить storageService.applyContent()
const handleChooseRemoteVersion = async () => {
    if (!activeDoc?.ref?.fileId) return

    try {
        const content = await googleApiService.downloadFileContent(activeDoc.ref.fileId)
        const session = documentTabsStore.activeDocument
        if (session) {
            session.data = content as any
            session.state.syncStatus = 'synced'
            session.state.lastSyncedAt = Date.now()
            session.state.lastLoadedAt = Date.now()

            // Было: storageService.applyContent(session.data)
            // Стало: обновляем сторы через DocumentStoreManager
            documentTabsStore.getActiveDocumentStores() // триггерит создание если нужно
            if (documentTabsStore.getActiveDocumentStores()) {
                // Данные обновятся через reaction в MainStore
            }
        }
        handleCloseConflictDialog()
    } catch (error: any) {
        alert(error.message)
    }
}
```

**Критерий:** CalendarIconBar компилируется.

---

### ✅ Чек-лист Фазы 5b

- [ ] EventForm.tsx обновлён
- [ ] Calendar.tsx обновлён
- [ ] DayListStore обновлён (если нужно)
- [ ] ProjectList.tsx обновлён
- [ ] CalendarIconBar.tsx обновлён (включая `getContentToSave` и `applyContent`)
- [ ] TypeScript компилируется
- [ ] Ручное тестирование: все UI функции работают

---

## Фаза 6: Удаление глобальных сторов

**Цель:** Удалить глобальные `projectsStore` и `eventsStore` из root.ts, StoreContext и index.tsx.

**Файлы:**
- `src/1-app/root.ts`
- `src/1-app/Providers/StoreContext.ts`
- `src/1-app/index.tsx`
- `src/1-app/Stores/MainStore.ts`

---

### Задача 6.1: Удалить глобальные сторы из root.ts

```typescript
// УДАЛИТЬ:
// export const projectsStore = new ProjectsStore()
// export const eventsStore = new EventsStore(projectsStore)

// УДАЛИТЬ из конструктора MainStore: projectsStore, eventsStore
```

**Критерий:** Глобальные сторы удалены.

---

### Задача 6.2: Обновить StoreContext.ts

Убрать из `IRootStore`:
```typescript
// УДАЛИТЬ: projectsStore: ProjectsStore
// УДАЛИТЬ: eventsStore: EventsStore
```

**Критерий:** StoreContext обновлён.

---

### Задача 6.3: Обновить index.tsx

Убрать пропы:
```typescript
// УДАЛИТЬ: projectsStore={projectsStore}
// УДАЛИТЬ: eventsStore={eventsStore}
```

**Критерий:** index.tsx обновлён.

---

### Задача 6.4: Обновить MainStore.ts

Убрать поля и параметры:
```typescript
// УДАЛИТЬ: projectsStore: ProjectsStore
// УДАЛИТЬ: eventsStore: EventsStore
// УДАЛИТЬ из конструктора: projectsStore, eventsStore
```

**Критерий:** MainStore обновлён.

---

### Задача 6.5: Проверить отсутствие ссылок

```bash
grep -r "eventsStore" src/ --include="*.ts" --include="*.tsx" | grep -v "documentTabsStore" | grep -v "activeEventsStore" | grep -v "DocumentStoreManager"
grep -r "projectsStore" src/ --include="*.ts" --include="*.tsx" | grep -v "documentTabsStore" | grep -v "activeProjectsStore" | grep -v "DocumentStoreManager"
```

**Критерий:** Нет ссылок на глобальные сторы.

---

### Задача 6.6: Удалить feature toggle

Удалить `usePerDocumentStores` из `UIStore` и все условные ветки `if (this.uiStore.usePerDocumentStores)` из `DocumentTabsStore`. Оставить только новый код.

**Критерий:** Feature toggle удалён, старый код удалён.

---

### ✅ Чек-лист Фазы 6

- [ ] `eventsStore`/`projectsStore` удалены из root.ts, StoreContext, MainStore
- [ ] `npm run build` без ошибок
- [ ] Feature toggle удалён
- [ ] Старый код (ветки `else`) удалён
- [ ] Все функции работают

---

## Фаза 7: Тестирование и метрики

### Задача 7.1: Unit-тесты DocumentStoreManager

(Уже созданы в Фазе 1 — убедиться что проходят)

### Задача 7.2: Интеграционные тесты

- Создание документа → сторы созданы
- Переключение → сторы не очищаются
- Закрытие → сторы удалены
- `getAggregatedEvents` возвращает события из всех документов
- `getAggregatedBalance` корректно суммирует

### Задача 7.3: Производительность

Добавить метрики в `DocumentTabsStore.activateDocument()`:

```typescript
activateDocument(documentId: DocumentId) {
    const startTime = performance.now()

    // ... логика активации

    const duration = performance.now() - startTime
    if (duration > 10) {
        console.warn(`Document activation took ${duration.toFixed(1)}ms`)
    }
}
```

Целевые показатели:
- Переключение вкладок <10ms (vs 50-100ms ранее)
- Память <3 МБ для 10 документов

### Задача 7.4: Обновить тесты DocumentTabsStore

Обновить существующие тесты `DocumentTabsStore.spec.ts` для работы с `DocumentStoreManager`:

- Мокировать `uiStore.usePerDocumentStores = true`
- Проверить что `storageService.applyContent` не вызывается при новом toggle
- Проверить что `documentStoreManager.getOrCreateStores` вызывается

### ✅ Чек-лист Фазы 7

- [ ] Unit-тесты DocumentStoreManager проходят
- [ ] Интеграционные тесты проходят
- [ ] Метрики производительности в норме
- [ ] Тесты DocumentTabsStore обновлены
- [ ] Ручное тестирование: все функции

---

## Сводная таблица

| Фаза | Описание | Файлы | Время |
|------|----------|-------|-------|
| 0a | Удаление `DocumentSessionStore` (мёртвый код) | 7 | 0.5 дня |
| 0b | Очистка легаси-методов `StorageService` | 3 | 0.5 дня |
| 0c | Перенос `ProjectsStore` в `6-entities` | ~12 | 0.5 дня |
| 1 | Создание `DocumentStoreManager` (с `dispose()`, типизацией, тестами) | 5 | 1.5 дня |
| 2 | Интеграция с `DocumentTabsStore` (с feature toggle) | 3 | 1.5 дня |
| 3 | Миграция `EventsCache` (через `IEventsStoreProvider`) | 3 | 1 день |
| 4 | Миграция `StorageService` и `MainStore` (с `reaction()`) | 3 | 1 день |
| 5a | Миграция сторов (`EventSearchStore`, `ProjectEditorStore`) | 3 | 1 день |
| 5b | Миграция UI-компонентов | 6 | 1.5 дня |
| 6 | Удаление глобальных сторов и feature toggle | 4 | 0.5 дня |
| 7 | Тестирование и метрики | - | 1 день |
| **ИТОГО** | | **~30 файлов** | **~9.5 дней** |

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
- [ ] Память в норме (<3 МБ для 10 документов)
- [ ] Переключение вкладок <10ms
- [ ] `DocumentSessionStore` удалён
- [ ] Легаси-методы `StorageService` удалены
- [ ] `ProjectsStore` перенесён в `6-entities`

---

**Дата:** 11 апреля 2026 г.  
**Статус:** ✅ Готов к реализации  
**Приоритет:** Высокий
