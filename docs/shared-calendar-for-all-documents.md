# Анализ и предложение: Общий календарь как виртуальная вкладка документа

**Дата:** 7 апреля 2026 г.  
**Автор:** AI Assistant  
**Статус:** На рассмотрении

---

## 1. Текущее состояние системы

### 1.1 Архитектура работы с документами

Приложение поддерживает **множественные документы** через систему вкладок, управляемую `DocumentTabsStore`:

- Каждый документ — это `DocumentSession` с собственным `id`, `data` (проекты + события) и `state`
- Документы хранятся в `localStorage` и могут синхронизироваться с Google Drive
- **Только один документ активен** в любой момент времени (`activeDocumentId`)
- При активации документа его данные загружаются в глобальные сторы через `storageService.applyContent(session.data)`

**Ключевые файлы:**
- `src/6-entities/Document/model/DocumentTabsStore.ts` — управление вкладками
- `src/6-entities/Document/model/DocumentTabsStore.types.ts` — типы документов
- `src/7-shared/ui/DocumentTabs/DocumentTabs.tsx` — UI вкладок документов

### 1.2 Как работает календарь сейчас

Календарь **не привязан к конкретному документу напрямую**. Вместо этого:

1. При активации документа вызывается `documentTabsStore.activateDocument(id)`
2. Это вызывает `storageService.applyContent(session.data)`, который загружает данные в глобальные сторы:
   - `projectsStore.init(projectsList)`
   - `eventsStore.init({ completedList, plannedList })`
3. `eventsStore.onChangeList` триггерит `eventsCache.init()`, который перестраивает кэш событий
4. `CalendarStore` читает из `eventsCache` и генерирует данные для отображения

**Схема работы:**
```
DocumentTabsStore (активный документ)
    ↓ activateDocument()
StorageService.applyContent()
    ↓
projectsStore.init() + eventsStore.init()
    ↓ (trigger onChangeList)
eventsCache.init()
    ↓
CalendarStore читает eventsCache
    ↓
Calendar компонент отображает
```

**Ключевые файлы:**
- `src/3-pages/Calendar/Calendar.tsx` — компонент календаря
- `src/3-pages/Calendar/CalendarStore.ts` — логика календаря
- `src/6-entities/EventsCache/EventsCache.ts` — кэш событий для календаря
- `src/6-entities/Events/EventsStore.ts` — хранилище событий
- `src/7-shared/services/StorageService.ts` — мост между документами и сторами

### 1.3 Как работает баланс средств

Баланс вычисляется в `EventsCache`:

- **Фактический баланс** (`getActualBalance`): сумма `credit - debit` всех завершённых событий до указанной даты
- **Планируемый баланс** (`getPlannedBalance`): фактический баланс + сумма `credit - debit` всех запланированных событий от последнего завершённого до указанной даты
- **Изменение баланса** (`getPlannedBalanceChange`): сумма `credit - debit` событий за конкретный день

Баланс **автоматически вычисляется** на основе событий, загруженных в `EventsStore`.

---

## 2. Проблема и предлагаемое решение

### 2.1 Проблема

**Текущее ограничение:** При открытии нескольких документов пользователь видит календарь только **активного документа**. Для сравнения или планирования событий из разных документов необходимо переключаться между вкладками документов, что неудобно.

### 2.2 Предлагаемое решение

Создать **виртуальную вкладку «Общий календарь»**, которая:

1. **Отображается как обычная вкладка** в панели `DocumentTabs` (наряду с реальными документами)
2. **Автоматически появляется** при открытии более одного документа
3. **Агрегирует события из всех открытых документов** и отображает их в общем календаре
4. **Корректно вычисляет суммарный баланс** по всем документам
5. **Визуально区分ает события** из разных документов (цветовая маркировка)

**Ключевая идея:** Виртуальная вкладка ведёт себя как обычный документ с точки зрения UI, но её данные **динамически вычисляются** из всех реальных документов, а не хранятся отдельно.

---

## 3. Архитектурное решение

### 3.1 Концепция виртуального документа

Вместо создания отдельного режима просмотра, мы добавляем **специальный тип документа** — виртуальный:

```typescript
// В DocumentTabsStore.types.ts
export type DocumentType = 'real' | 'virtual-aggregated'

export type DocumentSession = {
  id: DocumentId
  type: DocumentType  // <-- новое поле
  ref: DocumentRef | null
  data: DocumentData
  state: DocumentState
  createdAt: number
  lastAccessedAt: number
}
```

**Свойства виртуального документа:**
- `type: 'virtual-aggregated'`
- `ref.name: 'Общий календарь'`
- `data` — **вычисляемое свойство** (не хранится, а генерируется из всех документов)
- `state.syncStatus: 'offline'` (не синхронизируется с Drive)
- `state.isDirty: false` (нельзя изменить напрямую)
- Невозможно закрыть (кнопка закрытия отсутствует или disabled)

### 3.2 Общая схема работы

```
┌─────────────────────────────────────────────────────────┐
│                   DocumentTabsStore                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ Doc 1    │  │ Doc 2    │  │ Virtual:             │  │
│  │ (real)   │  │ (real)   │  │ All Documents        │  │
│  │ events   │  │ events   │  │ (virtual-aggregated) │  │
│  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘  │
│       │              │                   │              │
│       └──────────────┼───────────────────┘              │
│          onChange    │                                   │
│       (notify all)   │                                   │
└──────────────────────┼───────────────────────────────────┘
                       │
                       │ activateDocument(virtualId)
                       ▼
        ┌──────────────────────────────────┐
        │  DocumentTabsStore               │
        │  activateDocument()              │
        │  → detect type === 'virtual'     │
        │  → buildAggregatedData()         │
        │  → storageService.applyContent() │
        └────────────────┬─────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │  eventsStore.init()              │
        │  projectsStore.init()            │
        │  (суммарные данные из всех доков)│
        └────────────────┬─────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │  eventsCache.init()              │
        │  calendarStore.render()          │
        └──────────────────────────────────┘
```

### 3.3 Управление жизненным циклом виртуальной вкладки

#### 3.3.1 Создание

Виртуальная вкладка создаётся автоматически при условии:

```typescript
// В DocumentTabsStore
private ensureVirtualAggregatedDocument() {
  const realDocuments = this.documents.filter(d => d.type !== 'virtual-aggregated')
  
  if (realDocuments.length > 1) {
    // Создаём виртуальный документ, если его ещё нет
    if (!this.getVirtualAggregatedDocument()) {
      this.createVirtualAggregatedDocument()
    }
  } else {
    // Удаляем виртуальный документ, если остался 0 или 1 реальный документ
    this.removeVirtualAggregatedDocument()
  }
}
```

**Когда вызывается:**
- После `openNewDocument()`
- После `openFromDrive()`
- После `closeDocument()`
- При восстановлении из `localStorage`

#### 3.3.2 Идентификатор виртуального документа

```typescript
const VIRTUAL_AGGREGATED_DOCUMENT_ID = '__virtual_aggregated__'

// Фиксированный ID для однозначной идентификации
```

#### 3.3.3 Создание виртуального документа

```typescript
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
    data: this.buildAggregatedDocumentData(),  // <-- вычисляемые данные
    state: {
      isDirty: false,
      isLoading: false,
      isSaving: false,
      lastLoadedAt: null,
      lastSavedAt: null,
      error: null,
      syncStatus: 'offline',
      lastSyncedAt: null,
      hasUnsyncedChanges: false
    },
    createdAt: Date.now(),
    lastAccessedAt: Date.now()
  }
  
  this.state.documents.set(session.id, session)
  this.state.documentOrder.push(session.id)
}
```

#### 3.3.4 Построение агрегированных данных

```typescript
/**
 * Построить агрегированные данные из всех реальных документов.
 * Собирает все события и проекты из всех документов.
 */
private buildAggregatedDocumentData(): DocumentData {
  const realDocuments = this.documents.filter(d => d.type !== 'virtual-aggregated')
  
  const aggregated: DocumentData = {
    projectsList: [],
    completedList: [],
    plannedList: []
  }
  
  for (const doc of realDocuments) {
    // Собираем все проекты (с проверкой на дубликаты)
    aggregated.projectsList.push(...doc.data.projectsList)
    
    // Собираем все завершённые события
    aggregated.completedList.push(...doc.data.completedList)
    
    // Собираем все запланированные события
    aggregated.plannedList.push(...doc.data.plannedList)
  }
  
  return aggregated
}
```

#### 3.3.5 Активация виртуального документа

```typescript
// Модификация activateDocument()
activateDocument(documentId: DocumentId) {
  const session = this.state.documents.get(documentId)
  if (!session) return

  // Для виртуального документа — перестраиваем данные перед активацией
  if (session.type === 'virtual-aggregated') {
    session.data = this.buildAggregatedDocumentData()
    session.lastAccessedAt = Date.now()
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

#### 3.3.6 Реактивное обновление

**Проблема:** При изменении любого реального документа виртуальный должен обновиться.

**Решение:** Подписаться на `updateActiveDocumentData`:

```typescript
// В DocumentTabsStore.init() или конструкторе
private setupVirtualDocumentReactivity() {
  const originalUpdate = this.updateActiveDocumentData.bind(this)
  
  this.updateActiveDocumentData = (data: DocumentData) => {
    originalUpdate(data)
    this.refreshVirtualAggregatedDocument()
  }
}

/** Обновить данные виртуального документа и перестроить кэш */
private refreshVirtualAggregatedDocument() {
  const virtual = this.getVirtualAggregatedDocument()
  if (!virtual) return
  
  // Перестраиваем данные
  virtual.data = this.buildAggregatedDocumentData()
  
  // Если виртуальный документ активен — применяем данные к сторам
  if (this.state.activeDocumentId === virtual.id) {
    const previousLoadingState = virtual.state.isLoading
    virtual.state.isLoading = true
    this.storageService.applyContent(virtual.data)
    virtual.state.isLoading = previousLoadingState
  }
}
```

#### 3.3.7 Удаление виртуального документа

```typescript
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
      this.activateDocument(this.state.activeDocumentId)
    }
  }
}
```

### 3.4 Модификация UI вкладок

#### 3.4.1 Компонент DocumentTabs

**Файл:** `src/7-shared/ui/DocumentTabs/DocumentTabs.tsx`

Изменения:

1. **Иконка для виртуального документа:** Отображать специальную иконку (например, 📊 или 🔗) вместо стандартной
2. **Кнопка закрытия:** Скрыта или disabled для виртуального документа
3. **Порядок:** Виртуальный документ всегда последний в списке (или первый — по усмотрению)

```typescript
const DocumentTab: React.FC<{ document: DocumentSession; ... }> = observer(
  function ({ document, onActivate, onClose, isActive }) {
    const isVirtual = document.type === 'virtual-aggregated'
    
    return (
      <div
        className={cn(styles.tab, isActive && styles.active)}
        onClick={() => onActivate(document.id)}
      >
        {isVirtual ? (
          <Icon icon="mdi:calendar-multiple" className={styles.virtualIcon} />
        ) : (
          <Icon icon="mdi:file-document" />
        )}
        <span>{document.ref?.name}</span>
        
        {/* Кнопка закрытия только для реальных документов */}
        {!isVirtual && (
          <button onClick={(e) => { e.stopPropagation(); onClose(document.id) }}>
            ×
          </button>
        )}
      </div>
    )
  }
)
```

#### 3.4.2 Логика показа/скрытия

В `App.tsx` условие показа виртуальной вкладки обрабатывается автоматически:

```typescript
// В DocumentTabsStore
get documents(): DocumentSession[] {
  return this.state.documentOrder
    .map(id => this.state.documents.get(id)!)
    .filter(Boolean)
}

// Виртуальный документ уже включён в documents,
// поэтому DocumentTabs отрендерит его автоматически
```

### 3.5 Обработка конфликтов идентификаторов

**Проблема:** События из разных документов могут иметь одинаковые `id`.

**Решение:** При агрегации событий модифицировать идентификаторы:

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
    
    // Модифицируем ID событий для избежания коллизий
    const prefix = doc.id.replace('doc_', '')
    
    aggregated.completedList.push(
      ...doc.data.completedList.map(e => ({
        ...e,
        id: `${prefix}_${e.id}`  // составной ID
      }))
    )
    
    aggregated.plannedList.push(
      ...doc.data.plannedList.map(e => ({
        ...e,
        id: `${prefix}_${e.id}`  // составной ID
      }))
    )
  }
  
  return aggregated
}
```

**Важно:** При редактировании событий в виртуальном документе необходимо **обратно преобразовать** составной ID в оригинальный и определить документ-источник.

### 3.6 Редактирование событий в общем календаре

**Проблема:** При клике на событие в общем календаре — какой документ изменять?

**Решение:** Извлекать оригинальный `documentId` из составного `eventId`:

```typescript
// В EventsStore или специальном сервисе
class AggregatedEventResolver {
  /**
   * Извлечь ID документа и оригинальный ID события из составного ID
   */
  static parseAggregatedId(aggregatedId: string): {
    documentId: DocumentId
    originalEventId: number
  } | null {
    const match = aggregatedId.match(/^([^_]+)_(\d+)$/)
    if (!match) return null
    
    return {
      documentId: `doc_${match[1]}`,
      originalEventId: parseInt(match[2], 10)
    }
  }
  
  /**
   * Получить документ по ID события из агрегированных данных
   */
  static findSourceDocument(
    aggregatedId: string,
    documentTabsStore: DocumentTabsStore
  ): DocumentSession | null {
    const parsed = this.parseAggregatedId(aggregatedId)
    if (!parsed) return null
    
    return documentTabsStore.documents.find(d => d.id === parsed.documentId) ?? null
  }
}
```

При сохранении изменений:

```typescript
// В EventFormStore или MainStore
const handleSaveEvent = (eventDto: EventDto) => {
  const parsed = AggregatedEventResolver.parseAggregatedId(eventDto.id)
  
  if (parsed) {
    // Это событие из агрегированного документа
    const sourceDoc = documentTabsStore.documents.find(d => d.id === parsed.documentId)
    
    if (sourceDoc) {
      // Активируем исходный документ
      documentTabsStore.activateDocument(parsed.documentId)
      
      // Обновляем событие в оригинальном документе
      const originalEventId = parsed.originalEventId
      eventsStore.updateEvent(originalEventId, {
        ...eventDto,
        id: originalEventId  // восстанавливаем оригинальный ID
      })
    }
  } else {
    // Обычное событие — сохраняем как обычно
    eventsStore.updateEvent(eventDto.id, eventDto)
  }
}
```

### 3.7 Визуальное различение документов

Чтобы пользователь мог отличить события из разных документов в общем календаре:

#### 3.7.1 Цветовая маркировка документа

Добавить цвет-идентификатор к каждому документу:

```typescript
// В DocumentTabsStore.types.ts
export type DocumentSession = {
  id: DocumentId
  type: DocumentType
  ref: DocumentRef | null
  data: DocumentData
  state: DocumentState
  createdAt: number
  lastAccessedAt: number
  /** Цвет документа (для визуального区分ения в общем календаре) */
  color: string  // <-- новое поле
}

// При создании документа
private generateDocumentColor(): string {
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'
  ]
  const existingColors = this.documents.map(d => d.color)
  return colors.find(c => !existingColors.includes(c)) ?? colors[Math.floor(Math.random() * colors.length)]
}
```

#### 3.7.2 Модификация EventCacheStructure

Добавить информацию о документе-источнике:

```typescript
// В EventsCache/EventCacheStructure.ts
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

#### 3.7.3 Передача информации в EventsCache

При построении агрегированных данных передать информацию о документе:

```typescript
// В buildAggregatedDocumentData() или специальном методе EventsCache
private buildAggregatedEventsCache(): void {
  const realDocuments = this.documents.filter(d => d.type !== 'virtual-aggregated')
  
  for (const doc of realDocuments) {
    const prefix = doc.id.replace('doc_', '')
    
    // При добавлении событий в кэш указываем документ-источник
    doc.data.completedList.forEach(e => {
      const modifiedEvent = {
        ...e,
        id: `${prefix}_${e.id}`,
        documentId: doc.id,
        documentColor: doc.color
      }
      // ... добавление в кэш
    })
  }
}
```

#### 3.7.4 Визуализация в CalendarEventItem

```typescript
// В CalendarEventItem.tsx
const CalendarEventItem: React.FC<{ event: EventCacheStructure }> = observer(
  function ({ event }) {
    const isFromAggregated = event.documentId !== undefined
    
    return (
      <div
        className={styles.eventItem}
        style={{
          borderLeft: isFromAggregated 
            ? `3px solid ${event.documentColor}` 
            : 'none'
        }}
        title={isFromAggregated 
          ? `Из документа: ${getDocumentName(event.documentId)}` 
          : undefined
        }
      >
        {event.name}
      </div>
    )
  }
)
```

#### 3.7.5 Легенда в календаре

При активации виртуального документа показывать легенду:

```typescript
// В CalendarIconBar или новом компоненте CalendarLegend
const CalendarLegend: React.FC = observer(function () {
  const { documentTabsStore } = useContext(StoreContext)
  
  const isVirtualActive = documentTabsStore.activeDocument?.type === 'virtual-aggregated'
  if (!isVirtualActive) return null
  
  const realDocuments = documentTabsStore.documents.filter(
    d => d.type !== 'virtual-aggregated'
  )
  
  return (
    <div className={styles.legend}>
      {realDocuments.map(doc => (
        <div key={doc.id} className={styles.legendItem}>
          <span 
            className={styles.legendColor} 
            style={{ backgroundColor: doc.color }} 
          />
          <span>{doc.ref?.name}</span>
        </div>
      ))}
    </div>
  )
})
```

### 3.8 Обработка баланса средств

Баланс в общем календаре вычисляется **автоматически** через стандартный механизм `EventsCache`, так как виртуальный документ содержит суммарные события из всех документов.

**Пример:**

| Документ | Фактический баланс | Планируемые события | Планируемый баланс |
|----------|-------------------|---------------------|-------------------|
| Документ 1 | 1000 ₽ | +500 ₽ | 1500 ₽ |
| Документ 2 | 2000 ₽ | +300 ₽ | 2300 ₽ |
| **Общий календарь** | **3000 ₽** | **+800 ₽** | **3800 ₽** |

**Корректность:** События из разных документов **независимы**, поэтому суммирование `credit - debit` даёт точную картину.

**Важно:** При агрегации необходимо корректно определить `lastActualBalanceDate` как **максимальную дату** среди всех завершённых событий всех документов.

### 3.9 Запрет на сохранение виртуального документа

Виртуальный документ **нельзя сохранить** в Drive:

```typescript
// В DocumentTabsStore.saveActiveDocument()
async saveActiveDocument(): Promise<boolean> {
  if (!this.state.activeDocumentId) return false
  
  const session = this.state.documents.get(this.state.activeDocumentId)
  if (!session || !session.ref?.fileId) return false
  
  // Запрет на сохранение виртуального документа
  if (session.type === 'virtual-aggregated') {
    console.warn('Cannot save virtual aggregated document')
    return false
  }
  
  // ... обычная логика сохранения
}
```

### 3.10 Персистентность

Виртуальный документ **не сохраняется** в `localStorage`:

```typescript
// В persistToLocalStorage()
private persistToLocalStorage() {
  const realDocuments = this.documents.filter(d => d.type !== 'virtual-aggregated')
  
  const snapshot: DocumentTabsSnapshot = {
    activeDocumentId: this.state.activeDocumentId,
    documentOrder: this.state.documentOrder.filter(
      id => id !== VIRTUAL_AGGREGATED_DOCUMENT_ID
    ),
    documents: realDocuments.map(id => {
      // ... сериализация только реальных документов
    }),
    savedAt: Date.now()
  }
  
  localStorage.setItem(DOCUMENT_TABS_KEY, JSON.stringify(snapshot))
}
```

При восстановлении из `localStorage` виртуальный документ создаётся заново через `ensureVirtualAggregatedDocument()`.

---

## 4. Структура файлов

### 4.1 Новые файлы

```
src/
├── 6-entities/
│   └── Document/
│       └── model/
│           ├── AggregatedEventResolver.ts      # Резолвер составных ID событий
│           └── VirtualDocumentManager.ts       # Управление жизненным циклом виртуальных документов (опционально, можно интегрировать в DocumentTabsStore)
└── 4-widgets/
    └── CalendarLegend/                         # Легенда документов (опционально)
        ├── CalendarLegend.tsx
        └── CalendarLegend.module.css
```

### 4.2 Модифицируемые файлы

```
src/
├── 6-entities/
│   └── Document/
│       └── model/
│           ├── DocumentTabsStore.ts            # Добавить поддержку виртуальных документов
│           └── DocumentTabsStore.types.ts      # Добавить DocumentType, color поле
├── 7-shared/
│   └── ui/
│       └── DocumentTabs/
│           └── DocumentTabs.tsx                # Визуальное区分ение виртуального документа
├── 6-entities/
│   └── EventsCache/
│       └── EventCacheStructure.ts              # Добавить documentId, documentColor
└── 4-widgets/
    └── CalendarIconBar/
        └── CalendarIconBar.tsx                 # Добавить CalendarLegend (опционально)
```

---

## 5. Оценка сложности

| Компонент | Сложность | Примечание |
|-----------|-----------|------------|
| Тип `DocumentType` и поле `color` | **Очень низкая** | Добавление enum и поля |
| Создание/удаление виртуального документа | **Низкая** | Логика в `DocumentTabsStore` |
| Построение агрегированных данных | **Низкая** | Объединение массивов с префиксами ID |
| Активация виртуального документа | **Низкая** | Модификация `activateDocument()` |
| Реактивное обновление | **Низкая** | Подписка на изменения документов |
| Резолвер составных ID | **Средняя** | Обработка редактирования событий |
| Визуальная маркировка в UI | **Низкая** | Изменения в `DocumentTabs.tsx` и `CalendarEventItem` |
| Легенда календаря | **Низкая** | Новый UI-компонент |
| Запрет сохранения/персистентности | **Очень низкая** | Проверки в `saveActiveDocument()` и `persistToLocalStorage()` |
| **ИТОГО** | **Низкая-Средняя** | **~1-2 дня работы** |

---

## 6. Потенциальные проблемы и решения

### 6.1 Проблема: Производительность при большом количестве документов

**Описание:** При 10+ документах с тысячами событий перестройка агрегированных данных может быть медленной.

**Решение:**
- Использовать **ленивые вычисления** — перестраивать только при активации виртуального документа
- Добавить **debounce** на реактивное обновление (например, 300мс после последнего изменения)
- Кэшировать агрегированные данные и обновлять инкрементально

### 6.2 Проблема: Конфликт идентификаторов событий

**Описание:** События из разных документов могут иметь одинаковые `id`.

**Решение:**
- ✅ **Составной ключ**: `${documentIdWithoutPrefix}_${eventId}` (реализовано в разделе 3.5)
- ⚠️ **Важно:** При редактировании события необходимо обратно преобразовать ID и определить документ-источник

### 6.3 Проблема: Редактирование событий в общем календаре

**Описание:** При изменении события в общем календаре — в какой документ сохранять?

**Решение:**
- ✅ **Извлекать документ-источник** из составного ID через `AggregatedEventResolver`
- ✅ **Активировать исходный документ** и применять изменения в нём
- ✅ **Автоматически обновлять** виртуальный документ через реактивность

### 6.4 Проблема: Drag & Drop событий

**Описание:** При перемещении события в общем календаре — в какой документ сохранять изменения?

**Решение:**
- ✅ **Изменять событие только в исходном документе** (через `AggregatedEventResolver`)
- ❌ **Не разрешать** перемещение событий между документами через общий календарь
- Опционально: добавить возможность "копировать в другой документ" через контекстное меню

### 6.5 Проблема: Повторяющиеся проекты

**Описание:** Разные документы могут содержать проекты с одинаковыми `id` или названиями.

**Решение:**
- **Вариант A:** Объединять проекты с одинаковым `id` (если это один и тот же проект)
- **Вариант B:** Добавлять префикс к `id` проектов аналогично событиям
- **Рекомендация:** Использовать **Вариант A** — если `id` совпадает, это один проект; если нет — добавлять префикс

### 6.6 Проблема: Виртуальный документ активен при закрытии последнего реального

**Описание:** Если закрыть все реальные документы, виртуальный останется без данных.

**Решение:**
- ✅ **Автоматически удалять** виртуальный документ при ≤1 реальных документах (раздел 3.3.1)
- ✅ **Активировать первый реальный документ** при удалении виртуального (раздел 3.3.7)

---

## 7. Альтернативные подходы

### 7.1 Альтернатива: Отдельный режим просмотра (предыдущий вариант)

Создать новый `ViewMode = 'AllDocuments'` и отдельную страницу `AllDocumentsCalendar`.

**Плюсы:**
- Изолированная логика, не влияет на систему документов
- Проще отлаживать

**Минусы:**
- Дублирование кода календаря
- Пользователю менее интуитивно (нужно переключать режимы просмотра)

### 7.2 Альтернатива: Модальное окно общего календаря

Показывать общий календарь в модальном окне поверх основного интерфейса.

**Плюсы:**
- Минимальные изменения в архитектуре
- Быстрая реализация

**Минусы:**
- Ограниченное пространство
- Нельзя использовать совместно с редактированием событий

### 7.3 Почему выбран подход «виртуальной вкладки»

✅ **Естественный UX:** Пользователь видит общий календарь как ещё одну вкладку, что интуитивно понятно  
✅ **Минимальное дублирование:** Переиспользуется существующий компонент `Calendar`  
✅ **Единая система навигации:** Не нужно переключать режимы просмотра  
✅ **Консистентность:** Общий календарь ведёт себя как обычный документ с точки зрения интерфейса  

---

## 8. Рекомендуемый порядок реализации

### Фаза 1: Подготовка (0.5 дня)

1. Добавить `DocumentType` enum в `DocumentTabsStore.types.ts`
2. Добавить `type` поле в `DocumentSession`
3. Добавить `color` поле в `DocumentSession`
4. Создать константу `VIRTUAL_AGGREGATED_DOCUMENT_ID`

### Фаза 2: Ядро виртуального документа (0.5 дня)

5. Реализовать `createVirtualAggregatedDocument()` в `DocumentTabsStore`
6. Реализовать `buildAggregatedDocumentData()` с префиксами ID
7. Реализовать `removeVirtualAggregatedDocument()`
8. Реализовать `ensureVirtualAggregatedDocument()` и вызовы при изменении документов

### Фаза 3: Активация и реактивность (0.5 дня)

9. Модифицировать `activateDocument()` для поддержки виртуального документа
10. Настроить реактивное обновление через `refreshVirtualAggregatedDocument()`
11. Добавить запреты на сохранение и персистентность

### Фаза 4: Визуальные изменения (0.5 дня)

12. Модифицировать `DocumentTabs.tsx` для отображения виртуального документа
13. Добавить цветовую маркировку в `EventCacheStructure`
14. Модифицировать `CalendarEventItem` для отображения маркировки документа
15. Создать `CalendarLegend` компонент

### Фаза 5: Редактирование событий (0.5 дня)

16. Создать `AggregatedEventResolver`
17. Модифицировать обработку сохранения событий для составных ID
18. Протестировать CRUD операции в общем календаре

### Фаза 6: Тестирование и полировка (0.5 дня)

19. Unit-тесты агрегации данных
20. Интеграционные тесты виртуального документа
21. Тесты производительности с 10+ документами
22. Финальная полировка UI/UX

**ИТОГО: ~3 дня работы**

---

## 9. Диаagramы

### 9.1 Жизненный цикл виртуальной вкладки

```
┌─────────────────┐
│ Открыт 1 документ│
└────────┬────────┘
         │
         │ openNewDocument() / openFromDrive()
         ▼
┌──────────────────────┐
│ Открыто 2+ документа │──Нет──► [Виртуальный документ не создаётся]
└──────────┬───────────┘
           │ Да
           ▼
┌──────────────────────────┐
│ ensureVirtualAggregated  │
│ → createVirtualDocument  │
│ → buildAggregatedData    │
└──────────┬───────────────┘
           │
           │ activateDocument(virtualId)
           ▼
┌────────────────────────────┐
│ storageService.applyContent│
│ → eventsStore.init()       │
│ → eventsCache.init()       │
│ → calendarStore.render()   │
└──────────┬─────────────────┘
           │
           │ Изменён любой реальный документ
           ▼
┌──────────────────────────────┐
│ refreshVirtualAggregated     │
│ → buildAggregatedData        │
│ → applyContent (если активен)│
└──────────┬───────────────────┘
           │
           │ Закрыт последний документ (остался 1)
           ▼
┌───────────────────────────────┐
│ removeVirtualAggregated       │
│ → delete from documents       │
│ → activate first real doc     │
└───────────────────────────────┘
```

### 9.2 Поток данных при редактировании события

```
Пользователь кликает на событие в общем календаре
         │
         ▼
EventForm открывается с event.id = "abc123_456"
         │
         ▼
AggregatedEventResolver.parseAggregatedId("abc123_456")
         │
         ├─ documentId: "doc_abc123"
         └─ originalEventId: 456
         │
         ▼
findSourceDocument("doc_abc123") → Document 2
         │
         ▼
activateDocument("doc_abc123")
         │
         ▼
eventsStore.updateEvent(456, modifiedEvent)
         │
         ▼
onChangeList → updateActiveDocumentData → refreshVirtualAggregatedDocument
         │
         ▼
Общий календарь автоматически обновляется
```

---

## 10. Заключение

Предложенное решение **виртуальной вкладки** органично вписывается в существующую архитектуру системы документов:

### Ключевые преимущества:

✅ **Минимально инвазивно** — не изменяет существующую архитектуру, а расширяет её  
✅ **Единый UX** — общий календарь behaves like обычный документ  
✅ **Автоматическая реактивность** — изменения в любом документе сразу отражаются в общем календаре  
✅ **Корректный баланс** — суммирование событий даёт точную финансовую картину  
✅ **Визуальная ясность** — цветовая маркировка и легенда позволяют различать документы  

### Риски:

⚠️ **Производительность** при большом количестве документов (решается ленивыми вычислениями)  
⚠️ **Конфликты ID** событий (решается составными ключами)  
⚠️ **Редактирование событий** требует резолвера документ-источника (решается `AggregatedEventResolver`)  

### Рекомендация:

Начать с **Фаз 1-3** (ядро виртуального документа), затем добавить визуальные улучшения (**Фаза 4**) и обработку редактирования (**Фаза 5**). Это позволит быстро получить работающий прототип и итеративно улучшать его.

---

## 11. Приложения

### 11.1 Ключевые файлы для ознакомления

| Файл | Описание |
|------|----------|
| `src/6-entities/Document/model/DocumentTabsStore.ts` | Управление вкладками документов |
| `src/6-entities/Document/model/DocumentTabsStore.types.ts` | Типы документов |
| `src/6-entities/EventsCache/EventsCache.ts` | Кэш событий для календаря |
| `src/6-entities/EventsCache/EventCacheStructure.ts` | Структура кэша событий |
| `src/3-pages/Calendar/CalendarStore.ts` | Стор календаря |
| `src/3-pages/Calendar/Calendar.tsx` | Компонент календаря |
| `src/7-shared/ui/DocumentTabs/DocumentTabs.tsx` | UI вкладок документов |
| `src/1-app/Stores/MainStore.ts` | Оркестрация реактивности |
| `src/1-app/root.ts` | Регистрация сторов |

### 11.2 Пример состава agregированных данных

```json
{
  "projectsList": [
    { "id": 1, "name": "Проект A", "color": "#3B82F6" },
    { "id": 2, "name": "Проект B", "color": "#10B981" }
  ],
  "completedList": [
    { "id": "abc123_1", "name": "Событие 1", "credit": 100, "debit": 0, "documentId": "doc_abc123" },
    { "id": "def456_1", "name": "Событие 2", "credit": 200, "debit": 50, "documentId": "doc_def456" }
  ],
  "plannedList": [
    { "id": "abc123_2", "name": "Событие 3", "credit": 150, "debit": 0, "documentId": "doc_abc123" },
    { "id": "def456_2", "name": "Событие 4", "credit": 300, "debit": 100, "documentId": "doc_def456" }
  ]
}
```

Фактический баланс: `(100 - 0) + (200 - 50) = 250`  
Планируемый баланс: `250 + (150 - 0) + (300 - 100) = 600`
