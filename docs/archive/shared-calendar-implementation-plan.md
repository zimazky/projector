# План реализации: Общий календарь как виртуальная вкладка

**Дата:** 7 апреля 2026 г.  
**Автор:** AI Assistant  
**Статус:** Готов к реализации  
**Связанный документ:** [общий-календарь-для-всех-документов.md](./общий-календарь-для-всех-документов.md)

---

## Обзор

Реализация виртуальной вкладки «Общий календарь», которая автоматически появляется при открытии 2+ документов и агрегирует все события с корректным отображением баланса.

**Ожидаемый срок:** ~3 дня (6 фаз по ~0.5 дня)

---

## Фаза 1: Подготовка типов и констант

**Цель:** Добавить необходимые типы и константы для поддержки виртуальных документов.

### Задача 1.1: Добавить тип DocumentType

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.types.ts`

**Что сделать:**

Добавить новый тип перед определением `DocumentSession`:

```typescript
/** Тип документа: реальный или виртуальный агрегированный */
export type DocumentType = 'real' | 'virtual-aggregated'
```

**Критерий готовности:** Тип экспортируется и доступен для импорта.

---

### Задача 1.2: Добавить поле type в DocumentSession

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.types.ts`

**Что сделать:**

В тип `DocumentSession` добавить поле:

```typescript
export type DocumentSession = {
  id: DocumentId
  type: DocumentType  // <-- добавить это поле
  ref: DocumentRef | null
  data: DocumentData
  state: DocumentState
  createdAt: number
  lastAccessedAt: number
}
```

**Критерий готовности:** Тип обновлён, существующий код компилируется (с ошибками типов, которые будут исправлены в следующих задачах).

---

### Задача 1.3: Добавить поле color в DocumentSession

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.types.ts`

**Что сделать:**

В тип `DocumentSession` добавить опциональное поле:

```typescript
export type DocumentSession = {
  // ... существующие поля
  /** Цвет документа для визуального区分ения в общем календаре */
  color?: string
}
```

**Критерий готовности:** Тип обновлён.

---

### Задача 1.4: Создать константу VIRTUAL_AGGREGATED_DOCUMENT_ID

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.types.ts`

**Что сделать:**

Добавить константу в начало файла:

```typescript
/** Фиксированный ID виртуального агрегированного документа */
export const VIRTUAL_AGGREGATED_DOCUMENT_ID = '__virtual_aggregated__'
```

Экспортировать константу.

**Критерий готовности:** Константа доступна для импорта.

---

### Задача 1.5: Обновить createEmptyDocumentData для виртуального документа

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.types.ts`

**Что сделать:**

Создать новую функцию для виртуального документа:

```typescript
/** Создать пустые данные для виртуального агрегированного документа */
export function createVirtualDocumentData(): DocumentData {
  return {
    projectsList: [],
    completedList: [],
    plannedList: []
  }
}
```

**Критерий готовности:** Функция создана и экспортируется.

---

### Задача 1.6: Обновить createInitialDocumentState для виртуального документа

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.types.ts`

**Что сделать:**

Создать новую функцию:

```typescript
/** Создать начальное состояние виртуального документа */
export function createVirtualDocumentState(): DocumentState {
  return {
    isDirty: false,
    isLoading: false,
    isSaving: false,
    lastLoadedAt: null,
    lastSavedAt: null,
    error: null,
    syncStatus: 'offline' as const,
    lastSyncedAt: null,
    hasUnsyncedChanges: false
  }
}
```

**Критерий готовности:** Функция создана и экспортируется.

---

### Задача 1.7: Исправить все места создания DocumentSession

**Файлы:**
- `src/6-entities/Document/model/DocumentTabsStore.ts`
- `src/6-entities/Document/model/DocumentTabsStore.spec.ts` (если есть тесты)

**Что сделать:**

Во всех местах создания `DocumentSession` добавить поле `type: 'real'`:

```typescript
const session: DocumentSession = {
  id,
  type: 'real',  // <-- добавить
  ref: { ... },
  data: { ... },
  state: { ... },
  createdAt: Date.now(),
  lastAccessedAt: Date.now()
}
```

**Критерий готовности:** TypeScript компилируется без ошибок.

---

### ✅ Чек-лист Фазы 1

- [ ] Тип `DocumentType` добавлен
- [ ] Поле `type` добавлено в `DocumentSession`
- [ ] Поле `color` добавлено в `DocumentSession`
- [ ] Константа `VIRTUAL_AGGREGATED_DOCUMENT_ID` создана
- [ ] Функция `createVirtualDocumentData()` создана
- [ ] Функция `createVirtualDocumentState()` создана
- [ ] Все создания `DocumentSession` обновлены с `type: 'real'`
- [ ] TypeScript компилируется без ошибок

---

## Фаза 2: Ядро виртуального документа в DocumentTabsStore

**Цель:** Реализовать создание, удаление и агрегацию данных виртуального документа.

### Задача 2.1: Добавить метод создания виртуального документа

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Добавить приватный метод:

```typescript
/** Создать виртуальный агрегированный документ */
private createVirtualAggregatedDocument() {
  const session: DocumentSession = {
    id: VIRTUAL_AGGREGATED_DOCUMENT_ID,
    type: 'virtual-aggregated',
    ref: {
      fileId: null,
      name: 'Общий календарь',
      mimeType: 'application/json',
      space: null,
      parentFolderId: null
    },
    data: createVirtualDocumentData(),
    state: createVirtualDocumentState(),
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    color: this.generateDocumentColor()
  }

  this.state.documents.set(session.id, session)
  this.state.documentOrder.push(session.id)
}
```

**Критерий готовности:** Метод компилируется.

---

### Задача 2.2: Добавить метод генерации цвета документа

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Добавить приватный метод:

```typescript
/** Сгенерировать уникальный цвет для документа */
private generateDocumentColor(): string {
  const colors = [
    '#3B82F6', // синий
    '#10B981', // зелёный
    '#F59E0B', // жёлтый
    '#EF4444', // красный
    '#8B5CF6', // фиолетовый
    '#EC4899', // розовый
    '#06B6D4', // голубой
    '#F97316'  // оранжевый
  ]
  
  const existingColors = this.documents.map(d => d.color).filter(Boolean) as string[]
  const availableColor = colors.find(c => !existingColors.includes(c))
  
  return availableColor ?? colors[Math.floor(Math.random() * colors.length)]
}
```

**Критерий готовности:** Метод компилируется.

---

### Задача 2.3: Добавить метод построения агрегированных данных

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Добавить приватный метод:

```typescript
/**
 * Построить агрегированные данные из всех реальных документов.
 * Собирает все события и проекты из всех документов.
 * Модифицирует ID событий для избежания коллизий (формат: docPrefix_eventId).
 */
private buildAggregatedDocumentData(): DocumentData {
  const realDocuments = this.documents.filter(d => d.type !== 'virtual-aggregated')
  
  const aggregated: DocumentData = {
    projectsList: [],
    completedList: [],
    plannedList: []
  }
  
  for (const doc of realDocuments) {
    // Собираем проекты (без модификации ID — предполагаем уникальные)
    aggregated.projectsList.push(...doc.data.projectsList)
    
    // Извлекаем префикс документа
    const docPrefix = doc.id.replace('doc_', '').replace('__virtual_aggregated__', 'virt')
    
    // Собираем завершённые события с модифицированными ID
    aggregated.completedList.push(
      ...doc.data.completedList.map(e => ({
        ...e,
        id: `${docPrefix}_${e.id}`
      }))
    )
    
    // Собираем запланированные события с модифицированными ID
    aggregated.plannedList.push(
      ...doc.data.plannedList.map(e => ({
        ...e,
        id: `${docPrefix}_${e.id}`
      }))
    )
  }
  
  return aggregated
}
```

**Критерий готовности:** Метод компилируется.

---

### Задача 2.4: Добавить метод получения виртуального документа

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Добавить приватный метод:

```typescript
/** Получить виртуальный агрегированный документ, если существует */
private getVirtualAggregatedDocument(): DocumentSession | null {
  return this.state.documents.get(VIRTUAL_AGGREGATED_DOCUMENT_ID) ?? null
}
```

**Критерий готовности:** Метод компилируется.

---

### Задача 2.5: Добавить метод удаления виртуального документа

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Добавить приватный метод:

```typescript
/** Удалить виртуальный агрегированный документ */
private removeVirtualAggregatedDocument() {
  const virtual = this.getVirtualAggregatedDocument()
  if (!virtual) return
  
  this.state.documents.delete(virtual.id)
  this.state.documentOrder = this.state.documentOrder.filter(
    id => id !== virtual.id
  )
  
  // Если виртуальный документ был активен — активируем первый реальный
  if (this.state.activeDocumentId === virtual.id) {
    this.state.activeDocumentId = this.state.documentOrder[0] ?? null
    if (this.state.activeDocumentId) {
      // Блокируем onChangeList при активации
      const session = this.state.documents.get(this.state.activeDocumentId)!
      session.state.isLoading = true
      this.storageService.applyContent(session.data)
      session.state.isLoading = false
    }
  }
}
```

**Критерий готовности:** Метод компилируется.

---

### Задача 2.6: Добавить метод обеспечения существования виртуального документа

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Добавить приватный метод:

```typescript
/**
 * Обеспечить существование виртуального агрегированного документа.
 * Создаёт его при 2+ реальных документах, удаляет при 0-1.
 */
private ensureVirtualAggregatedDocument() {
  const realDocuments = this.documents.filter(d => d.type !== 'virtual-aggregated')
  const virtualExists = this.getVirtualAggregatedDocument() !== null
  
  if (realDocuments.length > 1 && !virtualExists) {
    // Создаём виртуальный документ
    this.createVirtualAggregatedDocument()
  } else if (realDocuments.length <= 1 && virtualExists) {
    // Удаляем виртуальный документ
    this.removeVirtualAggregatedDocument()
  }
}
```

**Критерий готовности:** Метод компилируется.

---

### Задача 2.7: Вызывать ensureVirtualAggregatedDocument при изменении документов

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Добавить вызов в следующие методы **после** основной логики:

1. `openNewDocument()`:
```typescript
openNewDocument(name: string = 'Новый документ') {
  // ... существующая логика
  
  this.ensureVirtualAggregatedDocument()  // <-- добавить
}
```

2. `openFromDrive()`:
```typescript
async openFromDrive(fileId: string, space?: 'drive' | 'appDataFolder') {
  // ... существующая логика (в конце try/catch)
  
  this.ensureVirtualAggregatedDocument()  // <-- добавить
}
```

3. `closeDocument()`:
```typescript
closeDocument(documentId: DocumentId) {
  // ... существующая логика
  
  this.ensureVirtualAggregatedDocument()  // <-- добавить
}
```

4. `restoreFromLocalStorage()`:
```typescript
async restoreFromLocalStorage(): Promise<boolean> {
  // ... существующая логика (в конце)
  
  this.ensureVirtualAggregatedDocument()  // <-- добавить
}
```

**Критерий готовности:** Все вызовы добавлены, компиляция успешна.

---

### Задача 2.8: Добавить геттер для проверки типа документа

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Добавить публичный метод:

```typescript
/** Проверить, является ли документ виртуальным */
isVirtualDocument(documentId: DocumentId): boolean {
  const session = this.state.documents.get(documentId)
  return session?.type === 'virtual-aggregated' ?? false
}
```

**Критерий готовности:** Метод компилируется.

---

### Задача 2.9: Добавить геттер для получения реальных документов

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Добавить публичный метод:

```typescript
/** Получить только реальные документы (исключая виртуальные) */
get realDocuments(): DocumentSession[] {
  return this.documents.filter(d => d.type !== 'virtual-aggregated')
}
```

**Критерий готовности:** Метод компилируется.

---

### ✅ Чек-лист Фазы 2

- [ ] Метод `createVirtualAggregatedDocument()` создан
- [ ] Метод `generateDocumentColor()` создан
- [ ] Метод `buildAggregatedDocumentData()` создан
- [ ] Метод `getVirtualAggregatedDocument()` создан
- [ ] Метод `removeVirtualAggregatedDocument()` создан
- [ ] Метод `ensureVirtualAggregatedDocument()` создан
- [ ] `ensureVirtualAggregatedDocument()` вызывается в `openNewDocument()`
- [ ] `ensureVirtualAggregatedDocument()` вызывается в `openFromDrive()`
- [ ] `ensureVirtualAggregatedDocument()` вызывается в `closeDocument()`
- [ ] `ensureVirtualAggregatedDocument()` вызывается в `restoreFromLocalStorage()`
- [ ] Метод `isVirtualDocument()` создан
- [ ] Метод `realDocuments` создан
- [ ] TypeScript компилируется без ошибок
- [ ] Ручное тестирование: при открытии 2 документов виртуальный создаётся
- [ ] Ручное тестирование: при закрытии до 1 документа виртуальный удаляется

---

## Фаза 3: Активация и реактивность

**Цель:** Обеспечить корректную активацию виртуального документа и автоматическое обновление при изменении реальных документов.

### Задача 3.1: Модифицировать activateDocument для виртуального документа

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Обновить метод `activateDocument`:

```typescript
/** Активировать документ */
activateDocument(documentId: DocumentId) {
  const session = this.state.documents.get(documentId)
  if (!session) return

  // Для виртуального документа — перестраиваем данные перед активацией
  if (session.type === 'virtual-aggregated') {
    session.data = this.buildAggregatedDocumentData()
  }

  this.state.activeDocumentId = documentId
  session.lastAccessedAt = Date.now()

  // Временно устанавливаем isLoading для блокировки onChangeList
  const previousLoadingState = session.state.isLoading
  session.state.isLoading = true

  // Применить данные к основным сторам
  this.storageService.applyContent(session.data)

  // Восстанавливаем состояние isLoading
  session.state.isLoading = previousLoadingState

  this.persistToLocalStorage()
}
```

**Критерий готовности:** Метод компилируется, виртуальный документ активируется корректно.

---

### Задача 3.2: Добавить метод обновления виртуального документа

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Добавить приватный метод:

```typescript
/**
 * Обновить данные виртуального документа и перестроить кэш.
 * Вызывается при изменении любого реального документа.
 */
private refreshVirtualAggregatedDocument() {
  const virtual = this.getVirtualAggregatedDocument()
  if (!virtual) return
  
  // Перестраиваем данные
  virtual.data = this.buildAggregatedDocumentData()
  virtual.lastAccessedAt = Date.now()
  
  // Если виртуальный документ активен — применяем данные к сторам
  if (this.state.activeDocumentId === virtual.id) {
    const previousLoadingState = virtual.state.isLoading
    virtual.state.isLoading = true
    this.storageService.applyContent(virtual.data)
    virtual.state.isLoading = previousLoadingState
  }
}
```

**Критерий готовности:** Метод компилируется.

---

### Задача 3.3: Вызывать refreshVirtualAggregatedDocument при обновлении данных

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Обновить метод `updateActiveDocumentData`:

```typescript
/** Обновить данные активного документа */
updateActiveDocumentData(data: DocumentData) {
  if (!this.state.activeDocumentId) return

  const session = this.state.documents.get(this.state.activeDocumentId)
  if (!session) return

  // Не обновляем виртуальный документ напрямую — он обновляется через refresh
  if (session.type === 'virtual-aggregated') return

  // ... существующая логика обновления isDirty и syncStatus

  session.data = data
  session.state.isDirty = true
  session.lastAccessedAt = Date.now()

  // Если документ был синхронизирован, теперь он требует сохранения
  if (session.state.syncStatus === 'synced') {
    session.state.syncStatus = 'needs-sync'
  }
  // Если была доступна новая версия с Drive, а пользователь начал редактировать — сбрасываем
  else if (session.state.syncStatus === 'update-available') {
    session.state.syncStatus = 'needs-sync'
  }

  this.persistDocumentDataToLocalStorage(this.state.activeDocumentId)
  this.persistToLocalStorage()
  
  // Обновляем виртуальный документ, если существует
  this.refreshVirtualAggregatedDocument()  // <-- добавить
}
```

**Критерий готовности:** Метод компилируется, виртуальный документ обновляется при изменении реального.

---

### Задача 3.4: Запретить сохранение виртуального документа

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Обновить метод `saveActiveDocument`:

```typescript
/** Сохранить активный документ в Google Drive */
async saveActiveDocument(): Promise<boolean> {
  if (!this.state.activeDocumentId) return false

  const session = this.state.documents.get(this.state.activeDocumentId)
  if (!session || !session.ref?.fileId) return false

  // Запрет на сохранение виртуального документа
  if (session.type === 'virtual-aggregated') {
    console.warn('Cannot save virtual aggregated document')
    return false
  }

  // ... остальная существующая логика
}
```

**Критерий готовности:** Метод компилируется, виртуальный документ не сохраняется.

---

### Задача 3.5: Исключить виртуальный документ из персистентности

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Обновить метод `persistToLocalStorage`:

```typescript
/** Сохранить метаданные вкладок в localStorage */
private persistToLocalStorage() {
  // Исключаем виртуальный документ из сохраняемых данных
  const documentsToPersist = this.documents.filter(
    d => d.type !== 'virtual-aggregated'
  )
  
  const snapshot: DocumentTabsSnapshot = {
    activeDocumentId: this.state.activeDocumentId === VIRTUAL_AGGREGATED_DOCUMENT_ID 
      ? null 
      : this.state.activeDocumentId,
    documentOrder: this.state.documentOrder.filter(
      id => id !== VIRTUAL_AGGREGATED_DOCUMENT_ID
    ),
    documents: documentsToPersist.map(doc => {
      return {
        id: doc.id,
        ref: doc.ref!,
        state: {
          isDirty: doc.state.isDirty,
          isLoading: doc.state.isLoading,
          isSaving: doc.state.isSaving,
          lastLoadedAt: doc.state.lastLoadedAt,
          lastSavedAt: doc.state.lastSavedAt,
          error: doc.state.error,
          syncStatus: doc.state.syncStatus,
          lastSyncedAt: doc.state.lastSyncedAt,
          hasUnsyncedChanges: doc.state.isDirty
        },
        lastAccessedAt: doc.lastAccessedAt
      }
    }),
    savedAt: Date.now()
  }
  
  localStorage.setItem(DOCUMENT_TABS_KEY, JSON.stringify(snapshot))
}
```

**Критерий готовности:** Метод компилируется, виртуальный документ не сохраняется в localStorage.

---

### Задача 3.6: Исключить виртуальный документ из сохранения данных

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Обновить метод `persistDocumentDataToLocalStorage`:

```typescript
/** Сохранить данные документа в localStorage */
private persistDocumentDataToLocalStorage(documentId: DocumentId) {
  // Не сохраняем данные виртуального документа
  if (documentId === VIRTUAL_AGGREGATED_DOCUMENT_ID) return
  
  const session = this.state.documents.get(documentId)
  if (!session) return

  const dataSnapshot: DocumentDataSnapshot = {
    data: session.data,
    savedAt: Date.now()
  }
  localStorage.setItem(`${DOCUMENT_DATA_PREFIX}${documentId}`, JSON.stringify(dataSnapshot))
}
```

**Критерий готовности:** Метод компилируется.

---

### Задача 3.7: Обработать виртуальный документ при закрытии

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Обновить метод `closeDocument`:

```typescript
/** Закрыть документ */
closeDocument(documentId: DocumentId) {
  const session = this.state.documents.get(documentId)
  if (!session) return

  // Запрет на закрытие виртуального документа
  if (session.type === 'virtual-aggregated') {
    console.warn('Cannot close virtual aggregated document')
    return
  }

  // ... остальная существующая логика
}
```

**Критерий готовности:** Метод компилируется, виртуальный документ нельзя закрыть.

---

### Задача 3.8: Обработать syncActiveDocumentWithDrive для виртуального документа

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Обновить метод `syncActiveDocumentWithDrive`:

```typescript
/** Явная синхронизация активного документа с Google Drive */
async syncActiveDocumentWithDrive(): Promise<SyncResult> {
  const session = this.state.documents.get(this.state.activeDocumentId!)
  if (!session || !session.ref?.fileId) {
    return { status: 'error', message: 'Нет документа для синхронизации' }
  }

  // Запрет на синхронизацию виртуального документа
  if (session.type === 'virtual-aggregated') {
    return { status: 'error', message: 'Нельзя синхронизировать общий календарь' }
  }

  // ... остальная существующая логика
}
```

**Критерий готовности:** Метод компилируется.

---

### Задача 3.9: Обновить clear() для тестов

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Убедиться, что метод `clear()` корректно очищает все данные (виртуальный документ удаляется автоматически).

**Критерий готовности:** Метод компилируется.

---

### ✅ Чек-лист Фазы 3

- [ ] `activateDocument()` обновлён для виртуального документа
- [ ] Метод `refreshVirtualAggregatedDocument()` создан
- [ ] `updateActiveDocumentData()` обновлён с вызовом `refreshVirtualAggregatedDocument()`
- [ ] `saveActiveDocument()` запрещает сохранение виртуального документа
- [ ] `persistToLocalStorage()` исключает виртуальный документ
- [ ] `persistDocumentDataToLocalStorage()` исключает виртуальный документ
- [ ] `closeDocument()` запрещает закрытие виртуального документа
- [ ] `syncActiveDocumentWithDrive()` запрещает синхронизацию виртуального документа
- [ ] TypeScript компилируется без ошибок
- [ ] Ручное тестирование: активация виртуального документа отображает общие события
- [ ] Ручное тестирование: изменение реального документа обновляет виртуальный
- [ ] Ручное тестирование: нельзя закрыть/сохранить/синхронизировать виртуальный документ

---

## Фаза 4: Визуальные изменения в UI

**Цель:** Визуально выделить виртуальный документ в интерфейсе и добавить цветовую маркировку событий.

### Задача 4.1: Обновить DocumentTabs для отображения виртуального документа

**Файл:** `src/7-shared/ui/DocumentTabs/DocumentTabs.tsx`

**Что сделать:**

Прочитать текущую реализацию и обновить рендеринг вкладки:

1. Добавить импорт иконки `mdi:calendar-multiple` (или аналогичной)
2. Обновить компонент вкладки:

```typescript
const DocumentTabs: React.FC<DocumentTabsProps> = observer(function ({
  documents,
  activeDocumentId,
  onActivate,
  onClose,
  onNew
}) {
  return (
    <div className={styles.tabs}>
      {documents.map(doc => {
        const isVirtual = doc.type === 'virtual-aggregated'
        const isActive = doc.id === activeDocumentId
        
        return (
          <div
            key={doc.id}
            className={cn(styles.tab, isActive && styles.active)}
            onClick={() => onActivate(doc.id)}
          >
            {/* Иконка документа */}
            {isVirtual ? (
              <Icon icon="mdi:calendar-multiple" className={styles.virtualIcon} />
            ) : (
              <Icon icon="mdi:file-document" />
            )}
            
            {/* Название */}
            <span className={styles.tabName}>{doc.ref?.name}</span>
            
            {/* Индикатор статуса (только для реальных документов) */}
            {!isVirtual && doc.state.isDirty && <span className={styles.dirty}>*</span>}
            
            {/* Кнопка закрытия (только для реальных документов) */}
            {!isVirtual && (
              <button
                className={styles.closeButton}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(doc.id)
                }}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      
      {/* Кнопка нового документа */}
      <button className={styles.newButton} onClick={onNew}>
        +
      </button>
    </div>
  )
})
```

**Критерий готовности:** Компонент компилируется.

---

### Задача 4.2: Добавить стили для виртуальной вкладки

**Файл:** `src/7-shared/ui/DocumentTabs/DocumentTabs.module.css`

**Что сделать:**

Добавить стили:

```css
.virtualIcon {
  color: var(--color-primary);
  font-size: 1.2em;
}

.tab {
  /* ... существующие стили */
}

.tab.active {
  /* ... существующие стили */
}

/* Добавить визуальное区分ение для виртуальной вкладки */
.tab:has(.virtualIcon) {
  background: linear-gradient(to right, var(--color-primary-light), transparent);
}
```

**Критерий готовности:** Стили применены, виртуальная вкладка визуально отличается.

---

### Задача 4.3: Добавить поля documentId и documentColor в EventCacheStructure

**Файл:** `src/6-entities/EventsCache/EventCacheStructure.ts`

**Что сделать:**

Прочитать текущую реализацию и добавить поля:

```typescript
export type EventCacheStructure = {
  id: number
  name: string
  background: string
  color: string
  start: timestamp
  time: number | null
  end: timestamp
  days: number
  credit: number
  debit: number
  completed: boolean
  repeatable: boolean
  /** ID документа-источника (для общего календаря) */
  documentId?: DocumentId
  /** Цвет документа-источника (для визуальной маркировки) */
  documentColor?: string
}
```

Импортировать тип `DocumentId`:

```typescript
import type { DocumentId } from 'src/6-entities/Document/model/DocumentTabsStore.types'
```

**Критерий готовности:** Тип обновлён, компиляция успешна.

---

### Задача 4.4: Обновить агрегацию данных с передачей documentId и documentColor

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Что сделать:**

Обновить метод `buildAggregatedDocumentData`:

```typescript
private buildAggregatedDocumentData(): DocumentData {
  const realDocuments = this.documents.filter(d => d.type !== 'virtual-aggregated')
  
  const aggregated: DocumentData = {
    projectsList: [],
    completedList: [],
    plannedList: []
  }
  
  for (const doc of realDocuments) {
    aggregated.projectsList.push(...doc.data.projectsList)
    
    const docPrefix = doc.id.replace('doc_', '').replace('__virtual_aggregated__', 'virt')
    const docColor = doc.color ?? '#888888'
    
    // Собираем завершённые события с метаданными документа
    aggregated.completedList.push(
      ...doc.data.completedList.map(e => ({
        ...e,
        id: `${docPrefix}_${e.id}`,
        documentId: doc.id,
        documentColor: docColor
      }))
    )
    
    // Собираем запланированные события с метаданными документа
    aggregated.plannedList.push(
      ...doc.data.plannedList.map(e => ({
        ...e,
        id: `${docPrefix}_${e.id}`,
        documentId: doc.id,
        documentColor: docColor
      }))
    )
  }
  
  return aggregated
}
```

**Критерий готовности:** Метод компилируется.

---

### Задача 4.5: Обновить EventsCache для передачи documentId и documentColor

**Файл:** `src/6-entities/EventsCache/EventsCache.ts`

**Что сделать:**

Обновить методы преобразования событий:

1. В `singleEventToEventCache` добавить передачу полей:

```typescript
export function singleEventToEventCache(
  e: SingleEventModel,
  date: timestamp,
  completed: boolean,
  color: string,
  background: string
): EventCacheStructure {
  return {
    id: e.id,
    name: e.name,
    background,
    color,
    start: e.start,
    time: e.time,
    end: e.end,
    days: Math.ceil((e.end - e.start) / 86400),
    credit: e.credit,
    debit: e.debit,
    completed: e.completed,
    repeatable: false,
    documentId: (e as any).documentId,  // <-- добавить
    documentColor: (e as any).documentColor  // <-- добавить
  }
}
```

2. Аналогично для `repeatableEventToEventCache`.

**Примечание:** Поля `documentId` и `documentColor` хранятся в `EventDto` после агрегации, поэтому используем приведение типа.

**Критерий готовности:** Методы компилируются.

---

### Задача 4.6: Обновить EventDto для хранения documentId и documentColor

**Файл:** `src/6-entities/Events/EventDto.ts`

**Что сделать:**

Прочитать текущую реализацию и добавить опциональные поля:

```typescript
export type EventDto = {
  // ... существующие поля
  /** ID документа-источника (для общего календаря) */
  documentId?: DocumentId
  /** Цвет документа-источника (для общего календаря) */
  documentColor?: string
}
```

Импортировать `DocumentId`:

```typescript
import type { DocumentId } from 'src/6-entities/Document/model/DocumentTabsStore.types'
```

**Критерий готовности:** Тип обновлён, компиляция успешна.

---

### Задача 4.7: Обновить CalendarEventItem для отображения маркировки документа

**Файл:** `src/3-pages/Calendar/CalendarEventItem.tsx`

**Что сделать:**

Прочитать текущую реализацию и обновить рендеринг:

```typescript
const CalendarEventItem: React.FC<CalendarEventItemProps> = observer(function ({
  event,
  daysInCurrentWeek,
  timestamp
}) {
  const isFromAggregated = event.documentId !== undefined
  
  return (
    <div
      className={styles.eventItem}
      style={{
        borderLeft: isFromAggregated ? `3px solid ${event.documentColor}` : 'none',
        // ... остальные стили
      }}
      title={isFromAggregated ? `Из документа: ${getDocumentName(event.documentId)}` : undefined}
    >
      {/* ... существующий контент */}
    </div>
  )
})
```

**Примечание:** Функцию `getDocumentName` нужно реализовать через `StoreContext` или передать как проп.

**Критерий готовности:** Компонент компилируется, цветовая маркировка отображается.

---

### Задача 4.8: Создать компонент CalendarLegend

**Файл:** `src/4-widgets/CalendarLegend/CalendarLegend.tsx`

**Что сделать:**

Создать новый компонент:

```typescript
import React, { useContext } from 'react'
import { observer } from 'mobx-react-lite'
import { StoreContext } from 'src/1-app/Providers/StoreContext'
import styles from './CalendarLegend.module.css'

const CalendarLegend: React.FC = observer(function () {
  const { documentTabsStore } = useContext(StoreContext)
  
  const isVirtualActive = documentTabsStore.activeDocument?.type === 'virtual-aggregated'
  if (!isVirtualActive) return null
  
  const realDocuments = documentTabsStore.realDocuments
  
  return (
    <div className={styles.legend}>
      <span className={styles.legendTitle}>Документы:</span>
      {realDocuments.map(doc => (
        <div key={doc.id} className={styles.legendItem}>
          <span 
            className={styles.legendColor} 
            style={{ backgroundColor: doc.color ?? '#888888' }} 
          />
          <span>{doc.ref?.name || 'Без имени'}</span>
        </div>
      ))}
    </div>
  )
})

export default CalendarLegend
```

**Критерий готовности:** Компонент компилируется.

---

### Задача 4.9: Создать стили для CalendarLegend

**Файл:** `src/4-widgets/CalendarLegend/CalendarLegend.module.css`

**Что сделать:**

```css
.legend {
  display: flex;
  align-items: center;
  gap: 1em;
  padding: 0.5em 1em;
  background: var(--color-background-light);
  border-bottom: 1px solid var(--color-border);
}

.legendTitle {
  font-weight: 600;
  margin-right: 0.5em;
}

.legendItem {
  display: flex;
  align-items: center;
  gap: 0.3em;
  font-size: 0.9em;
}

.legendColor {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  display: inline-block;
}
```

**Критерий готовности:** Стили применены.

---

### Задача 4.10: Интегрировать CalendarLegend в CalendarIconBar

**Файл:** `src/4-widgets/CalendarIconBar/CalendarIconBar.tsx`

**Что сделать:**

Добавить импорт и рендеринг `CalendarLegend`:

```typescript
import CalendarLegend from 'src/4-widgets/CalendarLegend/CalendarLegend'

// В компоненте CalendarIconBar:
return (
  <div className={styles.iconBar}>
    {/* ... существующие кнопки */}
    
    {/* Легенда документов (отображается только при активном виртуальном документе) */}
    <CalendarLegend />
  </div>
)
```

**Критерий готовности:** Компонент компилируется, легенда отображается.

---

### ✅ Чек-лист Фазы 4

- [ ] `DocumentTabs.tsx` обновлён с иконкой и кнопкой закрытия для виртуального документа
- [ ] Стили для виртуальной вкладки добавлены
- [ ] `EventCacheStructure` обновлён с `documentId` и `documentColor`
- [ ] `EventDto` обновлён с `documentId` и `documentColor`
- [ ] `buildAggregatedDocumentData()` передаёт метаданные документа
- [ ] `EventsCache` обновлён для передачи метаданных
- [ ] `CalendarEventItem` отображает цветовую маркировку
- [ ] `CalendarLegend` компонент создан
- [ ] Стили для `CalendarLegend` созданы
- [ ] `CalendarLegend` интегрирован в `CalendarIconBar`
- [ ] TypeScript компилируется без ошибок
- [ ] Ручное тестирование: виртуальная вкладка визуально отличается
- [ ] Ручное тестирование: события имеют цветовую маркировку документа
- [ ] Ручное тестирование: легенда отображается при активном виртуальном документе

---

## Фаза 5: Резолвер составных ID и редактирование событий

**Цель:** Обеспечить корректное редактирование событий из общего календаря с определением документа-источника.

### Задача 5.1: Создать AggregatedEventResolver

**Файл:** `src/6-entities/Document/model/AggregatedEventResolver.ts`

**Что сделать:**

Создать новый файл:

```typescript
import type { DocumentId } from './DocumentTabsStore.types'
import type { DocumentSession } from './DocumentTabsStore.types'
import type { DocumentTabsStore } from './DocumentTabsStore'

/**
 * Резолвер для работы с событиями из агрегированного (виртуального) документа.
 * Извлекает информацию о документе-источнике из составного ID события.
 */
export class AggregatedEventResolver {
  /**
   * Извлечь ID документа и оригинальный ID события из составного ID.
   * @param aggregatedId - составной ID в формате "docPrefix_eventId"
   * @returns объект с documentId и originalEventId, или null если ID не составной
   */
  static parseAggregatedId(aggregatedId: string | number): {
    documentId: DocumentId
    originalEventId: number
  } | null {
    const idStr = String(aggregatedId)
    const match = idStr.match(/^(.+)_(\d+)$/)
    
    if (!match) return null
    
    const docPrefix = match[1]
    const eventId = parseInt(match[2], 10)
    
    // Восстанавливаем ID документа
    let documentId: DocumentId
    if (docPrefix === 'virt') {
      // Это событие из виртуального документа (не должно происходить)
      return null
    } else {
      documentId = `doc_${docPrefix}`
    }
    
    return {
      documentId,
      originalEventId: eventId
    }
  }
  
  /**
   * Получить документ-источник по ID события из агрегированных данных.
   * @param aggregatedId - составной ID события
   * @param documentTabsStore - стор вкладок документов
   * @returns документ-источник или null
   */
  static findSourceDocument(
    aggregatedId: string | number,
    documentTabsStore: DocumentTabsStore
  ): DocumentSession | null {
    const parsed = this.parseAggregatedId(aggregatedId)
    if (!parsed) return null
    
    return documentTabsStore.documents.find(d => d.id === parsed.documentId) ?? null
  }
  
  /**
   * Проверить, является ли ID события составным (из агрегированного документа).
   * @param eventId - ID события
   * @returns true если ID составной
   */
  static isAggregatedId(eventId: string | number): boolean {
    return this.parseAggregatedId(eventId) !== null
  }
}
```

Экспортировать из `index.ts` или напрямую.

**Критерий готовности:** Файл создан, компилируется.

---

### Задача 5.2: Экспортировать AggregatedEventResolver

**Файл:** `src/6-entities/Document/model/index.ts` (или аналогичный)

**Что сделать:**

Добавить экспорт:

```typescript
export { AggregatedEventResolver } from './AggregatedEventResolver'
```

**Критерий готовности:** Экспорт доступен.

---

### Задача 5.3: Обновить обработку событий в EventFormStore

**Файл:** `src/4-widgets/EventForm/EventFormStore.ts`

**Что сделать:**

Прочитать текущую реализацию и определить, как происходит сохранение событий.

**Примечание:** Необходимо понять, какие методы EventsStore вызываются при сохранении формы.

**Критерий готовности:** Понимание потока данных при сохранении.

---

### Задача 5.4: Создать обёртку для EventsStore для обработки составных ID

**Файл:** `src/6-entities/Events/EventsStoreWithAggregation.ts` (или модифицировать существующий)

**Что сделать:**

**Вариант A:** Создать новый класс-обёртку:

```typescript
import { EventsStore } from './EventsStore'
import { AggregatedEventResolver } from 'src/6-entities/Document/model/AggregatedEventResolver'
import { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'
import type { EventDto } from './EventDto'
import type { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

/**
 * Обёртка над EventsStore для обработки событий из агрегированного документа.
 * Перехватывает операции с составными ID и направляет их в правильный документ.
 */
export class EventsStoreWithAggregation {
  constructor(
    private eventsStore: EventsStore,
    private documentTabsStore: DocumentTabsStore
  ) {}
  
  /**
   * Обновить событие с обработкой составных ID.
   * Если событие из агрегированного документа — активирует исходный документ.
   */
  updateEvent(id: number, e: EventDto) {
    const parsed = AggregatedEventResolver.parseAggregatedId(id)
    
    if (parsed) {
      // Это событие из агрегированного документа
      const sourceDoc = this.documentTabsStore.documents.find(
        d => d.id === parsed.documentId
      )
      
      if (sourceDoc) {
        // Активируем исходный документ
        this.documentTabsStore.activateDocument(parsed.documentId)
        
        // Обновляем событие в оригинальном документе
        this.eventsStore.updateEvent(parsed.originalEventId, {
          ...e,
          id: parsed.originalEventId
        })
        
        return
      }
    }
    
    // Обычное событие — обновляем как обычно
    this.eventsStore.updateEvent(id, e)
  }
  
  /**
   * Удалить событие с обработкой составных ID.
   */
  deleteEvent(id: number | null, isFinal: boolean = true) {
    if (id === null) {
      this.eventsStore.deleteEvent(id, isFinal)
      return
    }
    
    const parsed = AggregatedEventResolver.parseAggregatedId(id)
    
    if (parsed) {
      const sourceDoc = this.documentTabsStore.documents.find(
        d => d.id === parsed.documentId
      )
      
      if (sourceDoc) {
        this.documentTabsStore.activateDocument(parsed.documentId)
        this.eventsStore.deleteEvent(parsed.originalEventId, isFinal)
        return
      }
    }
    
    this.eventsStore.deleteEvent(id, isFinal)
  }
  
  /**
   * Завершить событие с обработкой составных ID.
   */
  completeEvent(id: number | null, currentdate: timestamp, e: EventDto) {
    if (id === null) {
      this.eventsStore.completeEvent(id, currentdate, e)
      return
    }
    
    const parsed = AggregatedEventResolver.parseAggregatedId(id)
    
    if (parsed) {
      const sourceDoc = this.documentTabsStore.documents.find(
        d => d.id === parsed.documentId
      )
      
      if (sourceDoc) {
        this.documentTabsStore.activateDocument(parsed.documentId)
        this.eventsStore.completeEvent(parsed.originalEventId, currentdate, {
          ...e,
          id: parsed.originalEventId
        })
        return
      }
    }
    
    this.eventsStore.completeEvent(id, currentdate, e)
  }
  
  /**
   * Прокси для остальных методов.
   */
  get completed() {
    return this.eventsStore.completed
  }
  
  get planned() {
    return this.eventsStore.planned
  }
  
  get plannedRepeatable() {
    return this.eventsStore.plannedRepeatable
  }
  
  // ... другие методы по необходимости
}
```

**Вариант B:** Модифицировать существщий `EventsStore` (более инвазивно).

**Рекомендация:** Использовать **Вариант A** — обёртку проще тестировать и удалять.

**Критерий готовности:** Класс компилируется.

---

### Задача 5.5: Интегрировать EventsStoreWithAggregation в приложение

**Файл:** `src/1-app/root.ts`

**Что сделать:**

Создать экземпляр обёртки:

```typescript
import { EventsStoreWithAggregation } from 'src/6-entities/Events/EventsStoreWithAggregation'

// ... существующий код

// Обёртка для обработки событий из агрегированного документа
export const eventsStoreWithAggregation = new EventsStoreWithAggregation(
  eventsStore,
  documentTabsStore
)
```

Экспортировать.

**Критерий готовности:** Экспорт доступен.

---

### Задача 5.6: Обновить StoreContext для предоставления обёртки

**Файл:** `src/1-app/Providers/StoreProvider.tsx` (или аналогичный)

**Что сделать:**

Добавить `eventsStoreWithAggregation` в контекст:

```typescript
<StoreContext.Provider value={{
  // ... существующие сторы
  eventsStoreWithAggregation: eventsStoreWithAggregation
}}>
```

**Критерий готовности:** Контекст обновлён.

---

### Задача 5.7: Обновить типы StoreContext

**Файл:** `src/1-app/Providers/StoreContext.ts`

**Что сделать:**

Добавить тип для `eventsStoreWithAggregation`:

```typescript
import type { EventsStoreWithAggregation } from 'src/6-entities/Events/EventsStoreWithAggregation'

export interface StoreContextType {
  // ... существующие типы
  eventsStoreWithAggregation: EventsStoreWithAggregation
}
```

**Критерий готовности:** Типы обновлены.

---

### Задача 5.8: Обновить CalendarEventItem для использования обёртки

**Файл:** `src/3-pages/Calendar/CalendarEventItem.tsx`

**Что сделать:**

При обработке клика/редактирования использовать `eventsStoreWithAggregation`:

```typescript
const { eventsStoreWithAggregation } = useContext(StoreContext)

const handleEdit = () => {
  // Открываем форму редактирования
  eventFormStore.showForm(event.id)
}

const handleComplete = () => {
  eventsStoreWithAggregation.completeEvent(event.id, event.start, event)
}

const handleDelete = () => {
  eventsStoreWithAggregation.deleteEvent(event.id)
}
```

**Критерий годности:** Компонент компилируется.

---

### Задача 5.9: Обновить CalendarDay для Drag & Drop с составными ID

**Файл:** `src/3-pages/Calendar/CalendarDay.tsx`

**Что сделать:**

При обработке drag & drop использовать обёртку:

```typescript
const { eventsStoreWithAggregation } = useContext(StoreContext)

const dragDrop = (e: React.DragEvent<HTMLElement>, timestamp: timestamp) => {
  e.preventDefault()
  const c = JSON.parse(e.dataTransfer.getData('event_item'))
  
  if (e.ctrlKey) {
    // Копирование — используем обёртку
    eventsStoreWithAggregation.copyToDate(c.id, timestamp)
  } else {
    // Перемещение — используем обёртку
    eventsStoreWithAggregation.shiftToDate(c.id, timestamp, c.start)
  }
}
```

**Критерий готовности:** Компонент компилируется.

---

### Задача 5.10: Добавить методы copyToDate и shiftToDate в обёртку

**Файл:** `src/6-entities/Events/EventsStoreWithAggregation.ts`

**Что сделать:**

Добавить методы:

```typescript
/**
 * Сдвинуть событие с обработкой составных ID.
 */
shiftToDate(id: number, todate: timestamp, currentdate: timestamp) {
  const parsed = AggregatedEventResolver.parseAggregatedId(id)
  
  if (parsed) {
    const sourceDoc = this.documentTabsStore.documents.find(
      d => d.id === parsed.documentId
    )
    
    if (sourceDoc) {
      this.documentTabsStore.activateDocument(parsed.documentId)
      this.eventsStore.shiftToDate(parsed.originalEventId, todate, currentdate)
      return
    }
  }
  
  this.eventsStore.shiftToDate(id, todate, currentdate)
}

/**
 * Копировать событие с обработкой составных ID.
 */
copyToDate(id: number, todate: timestamp) {
  const parsed = AggregatedEventResolver.parseAggregatedId(id)
  
  if (parsed) {
    const sourceDoc = this.documentTabsStore.documents.find(
      d => d.id === parsed.documentId
    )
    
    if (sourceDoc) {
      this.documentTabsStore.activateDocument(parsed.documentId)
      this.eventsStore.copyToDate(parsed.originalEventId, todate)
      return
    }
  }
  
  this.eventsStore.copyToDate(id, todate)
}
```

**Критерий готовности:** Методы компилируются.

---

### ✅ Чек-лист Фазы 5

- [ ] `AggregatedEventResolver` создан
- [ ] `EventsStoreWithAggregation` создан
- [ ] Обёртка экспортирована из `root.ts`
- [ ] `StoreContext` обновлён с `eventsStoreWithAggregation`
- [ ] Типы `StoreContext` обновлены
- [ ] `CalendarEventItem` использует обёртку
- [ ] `CalendarDay` использует обёртку для Drag & Drop
- [ ] Методы `copyToDate` и `shiftToDate` добавлены в обёртку
- [ ] TypeScript компилируется без ошибок
- [ ] Ручное тестирование: редактирование события в общем календаре работает
- [ ] Ручное тестирование: Drag & Drop событий в общем календаре работает
- [ ] Ручное тестирование: изменения сохраняются в правильном документе

---

## Фаза 6: Тестирование и полировка

**Цель:** Протестировать функционал, исправить баги, улучшить UX.

### Задача 6.1: Написать unit-тесты для AggregatedEventResolver

**Файл:** `src/6-entities/Document/model/AggregatedEventResolver.spec.ts`

**Что сделать:**

Создать тесты:

```typescript
import { AggregatedEventResolver } from './AggregatedEventResolver'

describe('AggregatedEventResolver', () => {
  describe('parseAggregatedId', () => {
    it('должен корректно парсить составной ID', () => {
      const result = AggregatedEventResolver.parseAggregatedId('abc123_456')
      expect(result).toEqual({
        documentId: 'doc_abc123',
        originalEventId: 456
      })
    })
    
    it('должен возвращать null для обычного ID', () => {
      const result = AggregatedEventResolver.parseAggregatedId(123)
      expect(result).toBeNull()
    })
    
    it('должен обрабатывать ID с несколькими подчёркиваниями', () => {
      const result = AggregatedEventResolver.parseAggregatedId('abc_def_789')
      expect(result).toEqual({
        documentId: 'doc_abc_def',
        originalEventId: 789
      })
    })
  })
  
  describe('isAggregatedId', () => {
    it('должен возвращать true для составного ID', () => {
      expect(AggregatedEventResolver.isAggregatedId('abc_123')).toBe(true)
    })
    
    it('должен возвращать false для обычного ID', () => {
      expect(AggregatedEventResolver.isAggregatedId(123)).toBe(false)
    })
  })
})
```

**Критерий готовности:** Тесты проходят.

---

### Задача 6.2: Написать unit-тесты для DocumentTabsStore с виртуальными документами

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.spec.ts`

**Что сделать:**

Добавить тесты:

```typescript
describe('Виртуальные документы', () => {
  it('должен создавать виртуальный документ при открытии 2 документов', () => {
    store.openNewDocument('Док 1')
    store.openNewDocument('Док 2')
    
    expect(store.isVirtualDocument(VIRTUAL_AGGREGATED_DOCUMENT_ID)).toBe(true)
    expect(store.realDocuments.length).toBe(2)
  })
  
  it('должен удалять виртуальный документ при закрытии до 1', () => {
    store.openNewDocument('Док 1')
    store.openNewDocument('Док 2')
    store.closeDocument(store.documents[0].id)
    
    expect(store.getVirtualAggregatedDocument()).toBeNull()
  })
  
  it('должен агрегировать события из всех документов', () => {
    // ... тест агрегации
  })
  
  it('должен запрещать закрытие виртуального документа', () => {
    store.openNewDocument('Док 1')
    store.openNewDocument('Док 2')
    store.closeDocument(VIRTUAL_AGGREGATED_DOCUMENT_ID)
    
    expect(store.getVirtualAggregatedDocument()).not.toBeNull()
  })
})
```

**Критерий готовности:** Тесты проходят.

---

### Задача 6.3: Написать интеграционные тесты общего календаря

**Файл:** `src/3-pages/Calendar/Calendar.spec.tsx` (или отдельный файл)

**Что сделать:**

Создать тесты:

```typescript
describe('Общий календарь', () => {
  it('должен отображать события из всех документов', () => {
    // Открыть 2 документа с событиями
    // Активировать виртуальный документ
    // Проверить, что календарь отображает все события
  })
  
  it('должен отображать легенду документов', () => {
    // Активировать виртуальный документ
    // Проверить, что легенда отображается
  })
  
  it('должен обновляться при изменении реального документа', () => {
    // Активировать виртуальный документ
    // Изменить реальный документ
    // Проверить, что календарь обновился
  })
})
```

**Критерий готовности:** Тесты проходят.

---

### Задача 6.4: Протестировать производительность с 10+ документами

**Что сделать:**

1. Открыть 10 документов с событиями
2. Измерить время перестройки агрегированных данных
3. Если >100мс — добавить debounce или оптимизировать

**Критерий готовности:** Время перестройки <100мс.

---

### Задача 6.5: Проверить баланс средств

**Что сделать:**

1. Создать 2 документа с событиями:
   - Документ 1: завершённое событие с credit=100, debit=0
   - Документ 2: завершённое событие с credit=200, debit=50
2. Активировать виртуальный документ
3. Проверить фактический баланс: должен быть 250 (100 + 150)
4. Добавить запланированные события и проверить планируемый баланс

**Критерий готовности:** Баланс вычисляется корректно.

---

### Задача 6.6: Проверить edge cases

**Что сделать:**

1. **Пустые документы:** Создать 2 пустых документа — виртуальный должен создаваться
2. **Один документ с событиями, один пустой:** Виртуальный должен отображать события одного документа
3. **Закрытие всех документов:** Виртуальный должен удаляться
4. **Восстановление из localStorage:** Виртуальный должен создаваться заново
5. **Синхронизация с Drive:** Виртуальный не должен синхронизироваться

**Критерий готовности:** Все edge cases обработаны корректно.

---

### Задача 6.7: Финальная полировка UI/UX

**Что сделать:**

1. Проверить анимации переключения вкладок
2. Проверить адаптивность дизайна
3. Добавить подсказки (tooltips) для виртуальной вкладки
4. Проверить доступность ( accessibility)
5. Убедиться, что все сообщения об ошибках понятны пользователю

**Критерий готовности:** UI/UX соответствует стандартам приложения.

---

### Задача 6.8: Обновить документацию

**Файл:** `docs/` (при необходимости)

**Что сделать:**

Обновить README или другую документацию с описанием нового функционала.

**Критерий готовности:** Документация обновлена.

---

### ✅ Чек-лист Фазы 6

- [ ] Unit-тесты для `AggregatedEventResolver` написаны и проходят
- [ ] Unit-тесты для `DocumentTabsStore` написаны и проходят
- [ ] Интеграционные тесты общего календаря написаны и проходят
- [ ] Производительность с 10+ документами проверена
- [ ] Баланс средств проверен и корректен
- [ ] Edge cases проверены
- [ ] UI/UX полировка завершена
- [ ] Документация обновлена
- [ ] Все тесты CI проходят
- [ ] Финальное ручное тестирование завершено

---

## Сводный чек-лист всех фаз

### Фаза 1: Подготовка типов и констант

- [ ] Тип `DocumentType` добавлен
- [ ] Поле `type` добавлено в `DocumentSession`
- [ ] Поле `color` добавлено в `DocumentSession`
- [ ] Константа `VIRTUAL_AGGREGATED_DOCUMENT_ID` создана
- [ ] Функция `createVirtualDocumentData()` создана
- [ ] Функция `createVirtualDocumentState()` создана
- [ ] Все создания `DocumentSession` обновлены с `type: 'real'`
- [ ] TypeScript компилируется без ошибок

### Фаза 2: Ядро виртуального документа

- [ ] Метод `createVirtualAggregatedDocument()` создан
- [ ] Метод `generateDocumentColor()` создан
- [ ] Метод `buildAggregatedDocumentData()` создан
- [ ] Метод `getVirtualAggregatedDocument()` создан
- [ ] Метод `removeVirtualAggregatedDocument()` создан
- [ ] Метод `ensureVirtualAggregatedDocument()` создан
- [ ] Вызовы в `openNewDocument()`, `openFromDrive()`, `closeDocument()`, `restoreFromLocalStorage()`
- [ ] Методы `isVirtualDocument()` и `realDocuments` созданы
- [ ] Ручное тестирование создания/удаления виртуального документа

### Фаза 3: Активация и реактивность

- [ ] `activateDocument()` обновлён
- [ ] `refreshVirtualAggregatedDocument()` создан
- [ ] `updateActiveDocumentData()` обновлён
- [ ] Запреты на сохранение/закрытие/синхронизацию виртуального
- [ ] Исключение из персистентности
- [ ] Ручное тестирование активации и реактивности

### Фаза 4: Визуальные изменения

- [ ] `DocumentTabs.tsx` обновлён
- [ ] Стили для виртуальной вкладки добавлены
- [ ] `EventCacheStructure` и `EventDto` обновлены
- [ ] Цветовая маркировка событий работает
- [ ] `CalendarLegend` создан и интегрирован
- [ ] Ручное тестирование визуальных изменений

### Фаза 5: Резолвер и редактирование

- [ ] `AggregatedEventResolver` создан
- [ ] `EventsStoreWithAggregation` создан
- [ ] Обёртка интегрирована в приложение
- [ ] Drag & Drop работает корректно
- [ ] Ручное тестирование редактирования

### Фаза 6: Тестирование и полировка

- [ ] Unit-тесты написаны
- [ ] Интеграционные тесты написаны
- [ ] Производительность проверена
- [ ] Баланс проверен
- [ ] Edge cases проверены
- [ ] UI/UX полировка завершена
- [ ] CI тесты проходят

---

## Файлы для создания/модификации

### Новые файлы

```
src/6-entities/Document/model/AggregatedEventResolver.ts
src/6-entities/Events/EventsStoreWithAggregation.ts
src/4-widgets/CalendarLegend/CalendarLegend.tsx
src/4-widgets/CalendarLegend/CalendarLegend.module.css
src/6-entities/Document/model/AggregatedEventResolver.spec.ts
```

### Модифицируемые файлы

```
src/6-entities/Document/model/DocumentTabsStore.types.ts
src/6-entities/Document/model/DocumentTabsStore.ts
src/7-shared/ui/DocumentTabs/DocumentTabs.tsx
src/7-shared/ui/DocumentTabs/DocumentTabs.module.css
src/6-entities/EventsCache/EventCacheStructure.ts
src/6-entities/Events/EventDto.ts
src/3-pages/Calendar/CalendarEventItem.tsx
src/3-pages/Calendar/CalendarDay.tsx
src/4-widgets/CalendarIconBar/CalendarIconBar.tsx
src/1-app/root.ts
src/1-app/Providers/StoreContext.ts
src/1-app/Providers/StoreProvider.tsx
```

---

## Риски и зависимости

### Риски

1. **Производительность:** При большом количестве документов агрегация может быть медленной
   - **Митигация:** Ленивые вычисления, debounce, инкрементальное обновление

2. **Конфликты ID:** События из разных документов могут иметь одинаковые ID
   - **Митигация:** Составные ключи `docPrefix_eventId`

3. **Редактирование событий:** Сложность определения документа-источника
   - **Митигация:** `AggregatedEventResolver` с парсингом составных ID

### Зависимости

- Фазы 1-2 должны быть завершены до начала Фазы 3
- Фаза 3 должна быть завершена до начала Фазы 4
- Фазы 4-5 могут выполняться параллельно
- Фаза 6 зависит от всех предыдущих фаз

---

## Глоссарий

| Термин | Описание |
|--------|----------|
| **Виртуальный документ** | Специальный тип документа с `type: 'virtual-aggregated'`, данные которого вычисляются из всех реальных документов |
| **Агрегация** | Процесс сбора событий из всех реальных документов в единую структуру данных |
| **Составной ID** | ID события в формате `docPrefix_eventId` для избежания коллизий |
| **Резолвер** | Компонент для извлечения информации о документе-источнике из составного ID |
| **Реальный документ** | Обычный документ с `type: 'real'`, созданный пользователем |

---

## Приложения

### A. Пример последовательности действий пользователя

1. Пользователь открывает **Документ 1** (с событиями)
2. Пользователь открывает **Документ 2** (с событиями)
3. Автоматически создаётся вкладка **«Общий календарь»**
4. Пользователь кликает на **«Общий календарь»**
5. Календарь отображает события из обоих документов с цветовой маркировкой
6. Легенда внизу показывает, какой цвет какому документу соответствует
7. Пользователь перетаскивает событие из Документа 1 на другую дату
8. Событие обновляется в Документе 1, общий календарь автоматически обновляется
9. Пользователь закрывает Документ 2
10. Вкладка **«Общий календарь»** автоматически удаляется (остался 1 документ)

### B. Пример состава агрегированных данных

```json
{
  "projectsList": [
    { "id": 1, "name": "Проект A", "color": "#3B82F6" },
    { "id": 2, "name": "Проект B", "color": "#10B981" }
  ],
  "completedList": [
    { 
      "id": "abc123_1", 
      "name": "Событие 1", 
      "credit": 100, 
      "debit": 0,
      "documentId": "doc_abc123",
      "documentColor": "#3B82F6"
    },
    { 
      "id": "def456_1", 
      "name": "Событие 2", 
      "credit": 200, 
      "debit": 50,
      "documentId": "doc_def456",
      "documentColor": "#10B981"
    }
  ],
  "plannedList": [
    { 
      "id": "abc123_2", 
      "name": "Событие 3", 
      "credit": 150, 
      "debit": 0,
      "documentId": "doc_abc123",
      "documentColor": "#3B82F6"
    }
  ]
}
```

Фактический баланс: `(100 - 0) + (200 - 50) = 250`  
Планируемый баланс: `250 + (150 - 0) = 400`
