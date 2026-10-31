# План реализации многодокументной поддержки

## Аннотация

Данный документ описывает текущую архитектуру работы с документами в приложении Projector и предлагает план перехода от одиночного документа к многодокументной архитектуре с поддержкой вкладок, офлайн-работы и синхронизации с Google Drive.

---

## 1. Текущее состояние архитектуры

### 1.1 Одиночный документ

На текущий момент приложение поддерживает работу только с **одним документом одновременно**. Основные компоненты:

| Компонент | Описание |
|-----------|----------|
| `DocumentSessionStore` | Управляет состоянием единственного открытого документа |
| `projectsStore` | Глобальное хранилище проектов (единое для всех данных) |
| `eventsStore` | Глобальное хранилище событий (единое для всех данных) |
| `StorageService` | Сериализует/десериализует данные в localStorage и Google Drive |

### 1.2 Жизненный цикл документа

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Создание   │ ──> │  Открытие    │ ──> │  Редактиро- │ ──> │  Сохранение  │
│  (new doc)  │     │  (из Drive)  │     │  вание      │     │  (Drive/Local)│
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
       │                    │                    │                    │
       v                    v                    v                    v
  fileId: null         fileId: string       isDirty: true      isDirty: false
  localStorage         Google Drive         localStorage       Google Drive
```

### 1.3 Хранение состояния

**LocalStorage ключи:**
- `'data'` — данные приложения (проекты, события)
- `'lastOpenedDocument'` — метаданные последнего открытого документа

**Структура `'data'`:**
```typescript
{
    projectsList: ProjectData[],
    completedList: EventDto[],
    plannedList: EventDto[]
}
```

**Структура `'lastOpenedDocument'`:**
```typescript
{
    fileId: string | null,
    name: string,
    mimeType: string,
    space: 'drive' | 'appDataFolder' | null,
    parentFolderId: string | null,
    updatedAt: number
}
```

---

## 2. Требования к многодокументной поддержке

### 2.1 Функциональные требования

1. **Одновременная работа с несколькими документами**
   - Открытие 2+ документов одновременно
   - Переключение между документами через вкладки (табы)
   - Каждое окно имеет независимое состояние

2. **Независимое редактирование**
   - Изменения в одном документе не влияют на другие
   - Каждый документ имеет собственный флаг `isDirty`
   - Проекты и события изолированы между документами

3. **Сохранение и синхронизация**
   - Индивидуальное сохранение каждого документа
   - Массовое сохранение всех изменённых документов
   - Автосохранение при переключении между вкладками (опционально)

4. **Персистентность между сессиями**
   - При перезапуске приложения восстанавливаются все открытые документы
   - Сохраняется активная вкладка
   - Сохраняется порядок вкладок

5. **Офлайн-работа**
   - Все открытые документы кэшируются в localStorage
   - Работа возможна без подключения к интернету
   - При появлении сети — синхронизация с Google Drive

### 2.2 Нефункциональные требования

1. **Производительность**
   - Быстрое переключение между вкладками (<100ms)
   - Ленивая загрузка содержимого неактивных документов

2. **Надёжность**
   - Защита от потери данных при закрытии вкладки
   - Корректная обработка ошибок сети

3. **Масштабируемость**
   - Поддержка до 10-15 одновременно открытых документов
   - Разумное потребление памяти

---

## 3. Предлагаемая архитектура

### 3.1 Общая схема

```
┌─────────────────────────────────────────────────────────────────┐
│                     DocumentTabsStore                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  documents: Map<DocumentId, DocumentSession>            │    │
│  │  activeDocumentId: DocumentId | null                    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ содержит
                              v
┌─────────────────────────────────────────────────────────────────┐
│                   DocumentSession                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ DocumentRef  │  │ DocumentData │  │ DocumentState│          │
│  │ (метаданные) │  │ (проекты,    │  │ (isDirty,    │          │
│  │              │  │  события)    │  │  isLoading)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Структура данных

#### 3.2.1 DocumentId

Уникальный идентификатор документа в сессии:

```typescript
type DocumentId = string  // UUID или fileId
```

#### 3.2.2 SyncResult

Результат синхронизации с Google Drive:

```typescript
type SyncResult =
    | { status: 'success' }
    | { 
        status: 'conflict'
        message: string
        remoteMetadata: DriveFileMetadata
        localModifiedAt: number
        remoteModifiedAt: number
      }
    | { status: 'error', message: string }
```

#### 3.2.2 DocumentSession

Полная сессия документа:

```typescript
type DocumentSession = {
    id: DocumentId                    // Уникальный ID сессии
    ref: DocumentRef | null           // Метаданные (fileId, name, etc.)
    data: DocumentData                // Данные документа (проекты, события)
    state: DocumentState              // Состояние (isDirty, isLoading, etc.)
    createdAt: number                 // Время открытия в приложении
    lastAccessedAt: number            // Время последнего доступа
}
```

#### 3.2.3 DocumentData

Данные одного документа (аналогично текущему `MainStoreData`):

```typescript
type DocumentData = {
    projectsList: ProjectData[]
    completedList: EventDto[]
    plannedList: EventDto[]
}
```

#### 3.2.4 DocumentState

Состояние документа:

```typescript
type DocumentState = {
    isDirty: boolean              // Есть несохранённые изменения
    isLoading: boolean            // Идёт загрузка
    isSaving: boolean             // Идёт сохранение
    lastLoadedAt: number | null   // Время последней загрузки
    lastSavedAt: number | null    // Время последнего сохранения
    error: string | null          // Ошибка операции
    syncStatus: SyncStatus        // Статус синхронизации с Google Drive
    lastSyncedAt: number | null   // Время последней успешной синхронизации
}
```

#### 3.2.6 DocumentTabsState

Состояние менеджера вкладок:

```typescript
type DocumentTabsState = {
    documents: Map<DocumentId, DocumentSession>
    activeDocumentId: DocumentId | null
    documentOrder: DocumentId[]   // Порядок вкладок
}
```

#### 3.2.7 RestoredDocumentSnapshot

Снимок документа для восстановления из localStorage:

```typescript
type RestoredDocumentSnapshot = {
    id: DocumentId
    ref: DocumentRef
    state: {
        isDirty: boolean
        isLoading: boolean
        isSaving: boolean
        lastLoadedAt: number | null
        lastSavedAt: number | null
        error: string | null
        syncStatus: SyncStatus
        lastSyncedAt: number | null
    }
    lastAccessedAt: number
}
```

### 3.3 Хранение в LocalStorage

#### 3.3.1 Ключи localStorage

| Ключ | Описание |
|------|----------|
| `'documentTabs'` | Метаданные всех открытых документов |
| `'document_${documentId}'` | Данные конкретного документа |

#### 3.3.2 Структура `'documentTabs'`

```typescript
type DocumentTabsSnapshot = {
    activeDocumentId: DocumentId | null
    documentOrder: DocumentId[]
    documents: Array<{
        id: DocumentId
        ref: DocumentRef
        state: {
            isDirty: boolean
            isLoading: boolean
            isSaving: boolean
            lastLoadedAt: number | null
            lastSavedAt: number | null
            error: string | null
            syncStatus: SyncStatus
            lastSyncedAt: number | null
        }
        lastAccessedAt: number
    }>
    savedAt: number  // Время снимка
}
```

**Важно:** Данные документов (`DocumentData`) хранятся отдельно в ключах `'document_${documentId}'` для:
- Уменьшения размера основного снимка
- Ленивой загрузки при переключении вкладок
- Индивидуальной инвалидации кэша

#### 3.3.3 Структура `'document_${documentId}'`

```typescript
type DocumentDataSnapshot = {
    data: DocumentData
    savedAt: number
}
```

### 3.4 Восстановление сессии

**Важное изменение:** Восстановление происходит **полностью офлайн** из localStorage. Синхронизация с Google Drive выполняется только по явному запросу пользователя.

```
┌──────────────────────────────────────────────────────────────┐
│                    Приложение запущено                       │
└──────────────────────────────────────────────────────────────┘
                            │
                            v
┌──────────────────────────────────────────────────────────────┐
│  DocumentTabsStore.restoreFromLocalStorage()                 │
│  1. Чтение 'documentTabs'                                    │
│  2. Валидация снимка                                         │
│  3. Восстановление метаданных документов                     │
│  4. Установка активной вкладки                               │
│  5. Загрузка данных из 'document_${documentId}'              │
└──────────────────────────────────────────────────────────────┘
                            │
                            v
┌──────────────────────────────────────────────────────────────┐
│  Готово: все вкладки восстановлены                           │
│  - Активная вкладка выбрана                                  │
│  - Данные загружены из localStorage                          │
│  - UI обновлён                                               │
│                                                              │
│  Документы с fileId помечены индикатором:                    │
│  "Требуется синхронизация с Google Drive"                    │
└──────────────────────────────────────────────────────────────┘
                            │
                            v
┌──────────────────────────────────────────────────────────────┐
│  Пользователь явно нажимает "Синхронизировать" ────────────  │
│  - Проверка авторизации Google                               │
│  - Загрузка актуальной версии из Drive                       │
│  - Обновление данных или разрешение конфликтов               │
└──────────────────────────────────────────────────────────────┘
```

### 3.5 Индикаторы состояния синхронизации

Каждый документ с `fileId` имеет статус синхронизации:

```typescript
type SyncStatus = 
    | 'offline'           // Документ открыт из localStorage, синхронизация не выполнена
    | 'syncing'          // Идёт процесс синхронизации
    | 'synced'           // Данные актуальны (локальная версия совпадает с Drive)
    | 'needs-sync'       // Drive версия новее локальной
    | 'error'            // Ошибка при синхронизации
```

**Отображение в UI вкладки:**

```typescript
interface DocumentTabProps {
    document: DocumentSession
}

const DocumentTab: React.FC<DocumentTabProps> = ({ document }) => {
    const { ref, state, syncStatus } = document
    
    return (
        <div className="document-tab">
            <span className="document-tab-name">
                {ref?.name}
                {state.isDirty && <span className="modified">*</span>}
            </span>
            
            {/* Индикатор статуса синхронизации */}
            {ref?.fileId && (
                <span 
                    className={`sync-status sync-status--${syncStatus}`}
                    title={getSyncStatusTitle(syncStatus)}
                >
                    {syncStatus === 'offline' && '📴'}
                    {syncStatus === 'syncing' && '🔄'}
                    {syncStatus === 'synced' && '✓'}
                    {syncStatus === 'needs-sync' && '⚠'}
                    {syncStatus === 'error' && '❌'}
                </span>
            )}
        </div>
    )
}
```

---

## 4. План реализации

### Этап 1: Создание DocumentTabsStore

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

```typescript
export class DocumentTabsStore {
    private state: DocumentTabsState
    private googleApiService: GoogleApiService
    private storageService: StorageService
    
    constructor(googleApiService: GoogleApiService, storageService: StorageService) {
        this.googleApiService = googleApiService
        this.storageService = storageService
        this.state = {
            documents: new Map(),
            activeDocumentId: null,
            documentOrder: []
        }
        makeAutoObservable(this)
    }
    
    // === Управление вкладками ===
    
    openNewDocument(name: string = 'Новый документ') {
        const id = generateDocumentId()
        const session: DocumentSession = {
            id,
            ref: { fileId: null, name, mimeType: 'application/json', space: null, parentFolderId: null },
            data: createEmptyDocumentData(),
            state: { 
                isDirty: false, 
                isLoading: false, 
                isSaving: false, 
                lastLoadedAt: null, 
                lastSavedAt: null, 
                error: null,
                syncStatus: 'offline',  // Локальный документ
                lastSyncedAt: null
            },
            createdAt: Date.now(),
            lastAccessedAt: Date.now()
        }
        this.state.documents.set(id, session)
        this.state.documentOrder.push(id)
        this.state.activeDocumentId = id
        this.persistToLocalStorage()
    }
    
    async openFromDrive(fileId: string, space?: DriveSpace) {
        // Проверка: уже открыт такой документ?
        const existing = this.findDocumentByFileId(fileId)
        if (existing) {
            this.activateDocument(existing.id)
            return
        }
        
        const id = generateDocumentId()
        const session: DocumentSession = {
            id,
            ref: { fileId, name: 'Загрузка...', mimeType: 'application/json', space: space ?? null, parentFolderId: null },
            data: createEmptyDocumentData(),
            state: { 
                isDirty: false, 
                isLoading: true, 
                isSaving: false, 
                lastLoadedAt: null, 
                lastSavedAt: null, 
                error: null,
                syncStatus: 'syncing',
                lastSyncedAt: null
            },
            createdAt: Date.now(),
            lastAccessedAt: Date.now()
        }
        this.state.documents.set(id, session)
        this.state.documentOrder.push(id)
        this.state.activeDocumentId = id
        
        // Загрузка данных
        try {
            const metadata = await this.googleApiService.getFileMetadata(fileId)
            const content = await this.googleApiService.downloadFileContent(fileId)
            
            const session = this.state.documents.get(id)!
            session.ref = {
                fileId: metadata.id,
                name: metadata.name,
                mimeType: metadata.mimeType || 'application/json',
                space: space ?? null,
                parentFolderId: metadata.parents?.[0] ?? null
            }
            session.data = parseDocumentContent(content)
            session.state.isLoading = false
            session.state.syncStatus = 'synced'
            session.state.lastLoadedAt = Date.now()
            session.state.lastSyncedAt = Date.now()
            
            this.persistDocumentDataToLocalStorage(id)
            this.persistToLocalStorage()
        } catch (error) {
            const session = this.state.documents.get(id)!
            session.state.error = error.message
            session.state.isLoading = false
            session.state.syncStatus = 'error'
        }
    }
    
    /**
     * Открывает документ из localStorage без синхронизации с Google Drive.
     * Документ помечается как 'offline' и требует явной синхронизации пользователем.
     */
    openFromLocalStorageSnapshot(docSnapshot: RestoredDocumentSnapshot) {
        const id = docSnapshot.id
        const session: DocumentSession = {
            id,
            ref: docSnapshot.ref,
            data: createEmptyDocumentData(),  // Данные загрузятся отдельно
            state: {
                isDirty: false,
                isLoading: false,
                isSaving: false,
                lastLoadedAt: docSnapshot.lastAccessedAt,
                lastSavedAt: null,
                error: null,
                syncStatus: docSnapshot.ref?.fileId ? 'offline' : 'offline',  // Требует синхронизации
                lastSyncedAt: null
            },
            createdAt: docSnapshot.lastAccessedAt,
            lastAccessedAt: docSnapshot.lastAccessedAt
        }
        this.state.documents.set(id, session)
        this.state.documentOrder.push(id)
    }
    
    closeDocument(documentId: DocumentId) {
        const session = this.state.documents.get(documentId)
        if (!session) return
        
        // Проверка несохранённых изменений
        if (session.state.isDirty) {
            // Показать диалог подтверждения
            // TODO: реализовать
        }
        
        this.state.documents.delete(documentId)
        this.state.documentOrder = this.state.documentOrder.filter(id => id !== documentId)
        
        if (this.state.activeDocumentId === documentId) {
            this.state.activeDocumentId = this.state.documentOrder[0] ?? null
        }
        
        this.removeDocumentDataFromLocalStorage(documentId)
        this.persistToLocalStorage()
    }
    
    activateDocument(documentId: DocumentId) {
        const session = this.state.documents.get(documentId)
        if (!session) return
        
        this.state.activeDocumentId = documentId
        session.lastAccessedAt = Date.now()
        
        // Применить данные активного документа к основным сторам
        this.storageService.applyContent(session.data)
        
        this.persistToLocalStorage()
    }
    
    // === Операции с данными ===
    
    updateActiveDocumentData(data: DocumentData) {
        if (!this.state.activeDocumentId) return
        
        const session = this.state.documents.get(this.state.activeDocumentId)
        if (!session) return
        
        session.data = data
        session.state.isDirty = true
        session.lastAccessedAt = Date.now()
        
        // Если документ был синхронизирован, теперь он требует повторной синхронизации
        if (session.state.syncStatus === 'synced') {
            session.state.syncStatus = 'needs-sync'
        }
        
        this.persistDocumentDataToLocalStorage(this.state.activeDocumentId)
        this.persistToLocalStorage()
    }
    
    async saveActiveDocument() {
        if (!this.state.activeDocumentId) return false
        
        const session = this.state.documents.get(this.state.activeDocumentId)
        if (!session || !session.ref?.fileId) return false
        
        session.state.isSaving = true
        this.persistToLocalStorage()
        
        try {
            const content = JSON.stringify(session.data, null, 2)
            const result = await this.googleApiService.saveFile(
                session.ref.name,
                content,
                session.ref.mimeType,
                session.ref.parentFolderId || 'root',
                session.ref.space || 'drive',
                session.ref.fileId
            )
            
            if (result.status === 'success') {
                session.state.isDirty = false
                session.state.isSaving = false
                session.state.lastSavedAt = Date.now()
                session.state.syncStatus = 'synced'
                session.state.lastSyncedAt = Date.now()
                this.persistToLocalStorage()
                return true
            } else {
                session.state.error = result.message
                session.state.isSaving = false
                session.state.syncStatus = 'error'
                this.persistToLocalStorage()
                return false
            }
        } catch (error) {
            session.state.error = error.message
            session.state.isSaving = false
            session.state.syncStatus = 'error'
            this.persistToLocalStorage()
            return false
        }
    }
    
    /**
     * Явная синхронизация активного документа с Google Drive по запросу пользователя.
     * Загружает актуальную версию из Drive и сравнивает с локальной.
     */
    async syncActiveDocumentWithDrive(): Promise<SyncResult> {
        const session = this.state.documents.get(this.state.activeDocumentId!)
        if (!session || !session.ref?.fileId) {
            return { status: 'error', message: 'Нет документа для синхронизации' }
        }
        
        session.state.syncStatus = 'syncing'
        this.persistToLocalStorage()
        
        try {
            // Проверка авторизации
            const isLoggedIn = this.googleApiService.isGoogleLoggedIn
            if (!isLoggedIn) {
                await this.googleApiService.logIn()
            }
            
            // Загрузка метаданных для проверки версии
            const remoteMetadata = await this.googleApiService.getFileMetadata(session.ref.fileId)
            const remoteModifiedAt = new Date(remoteMetadata.modifiedTime).getTime()
            const localModifiedAt = session.state.lastSavedAt ?? 0
            
            // Сравнение версий
            if (remoteModifiedAt > localModifiedAt) {
                // Удалённая версия новее — предложить выбор пользователю
                session.state.syncStatus = 'needs-sync'
                this.persistToLocalStorage()
                
                return {
                    status: 'conflict',
                    message: 'Версия на Google Drive новее локальной',
                    remoteMetadata,
                    localModifiedAt,
                    remoteModifiedAt
                }
            }
            
            // Загрузка контента (если локальная версия актуальна или пользователь выбрал Drive)
            const content = await this.googleApiService.downloadFileContent(session.ref.fileId)
            session.data = parseDocumentContent(content)
            session.state.syncStatus = 'synced'
            session.state.lastSyncedAt = Date.now()
            session.state.lastLoadedAt = Date.now()
            
            // Применить обновлённые данные к сторам
            this.storageService.applyContent(session.data)
            
            this.persistDocumentDataToLocalStorage(session.id)
            this.persistToLocalStorage()
            
            return { status: 'success' }
        } catch (error) {
            session.state.error = error.message
            session.state.syncStatus = 'error'
            this.persistToLocalStorage()
            
            return { status: 'error', message: error.message }
        }
    }
    
    /**
     * Синхронизация всех документов с fileId по запросу пользователя.
     */
    async syncAllDocumentsWithDrive(): Promise<Map<DocumentId, SyncResult>> {
        const results: Map<DocumentId, SyncResult> = new Map()
        
        for (const [id, session] of this.state.documents.entries()) {
            if (session.ref?.fileId && session.state.syncStatus === 'offline') {
                this.state.activeDocumentId = id
                const result = await this.syncActiveDocumentWithDrive()
                results.set(id, result)
            }
        }
        
        return results
    }
    
    async saveAllDirtyDocuments() {
        const results: Map<DocumentId, boolean> = new Map()
        
        for (const [id, session] of this.state.documents.entries()) {
            if (session.state.isDirty && session.ref?.fileId) {
                this.state.activeDocumentId = id
                const saved = await this.saveActiveDocument()
                results.set(id, saved)
            }
        }
        
        return results
    }
    
    // === Персистентность ===
    
    private persistToLocalStorage() {
        const snapshot: DocumentTabsSnapshot = {
            activeDocumentId: this.state.activeDocumentId,
            documentOrder: this.state.documentOrder,
            documents: this.state.documentOrder.map(id => {
                const session = this.state.documents.get(id)!
                return {
                    id: session.id,
                    ref: session.ref,
                    state: {
                        isDirty: session.state.isDirty,
                        isLoading: session.state.isLoading,
                        isSaving: session.state.isSaving,
                        lastLoadedAt: session.state.lastLoadedAt,
                        lastSavedAt: session.state.lastSavedAt,
                        error: session.state.error,
                        syncStatus: session.state.syncStatus,
                        lastSyncedAt: session.state.lastSyncedAt
                    },
                    lastAccessedAt: session.lastAccessedAt
                }
            }),
            savedAt: Date.now()
        }
        localStorage.setItem('documentTabs', JSON.stringify(snapshot))
    }
    
    private persistDocumentDataToLocalStorage(documentId: DocumentId) {
        const session = this.state.documents.get(documentId)
        if (!session) return
        
        const dataSnapshot: DocumentDataSnapshot = {
            data: session.data,
            savedAt: Date.now()
        }
        localStorage.setItem(`document_${documentId}`, JSON.stringify(dataSnapshot))
    }
    
    private removeDocumentDataFromLocalStorage(documentId: DocumentId) {
        localStorage.removeItem(`document_${documentId}`)
    }
    
    /**
     * Восстановление сессии из localStorage БЕЗ автоматической синхронизации с Google Drive.
     * Все документы восстанавливаются из локального кэша.
     */
    async restoreFromLocalStorage() {
        const tabsJson = localStorage.getItem('documentTabs')
        if (!tabsJson) return false
        
        const snapshot = parseDocumentTabsSnapshot(tabsJson)
        if (!snapshot) return false
        
        // Восстановление метаданных
        for (const docSnapshot of snapshot.documents) {
            this.openFromLocalStorageSnapshot(docSnapshot)
        }
        this.state.documentOrder = snapshot.documentOrder
        this.state.activeDocumentId = snapshot.activeDocumentId
        
        // Загрузка данных каждого документа из localStorage
        for (const docSnapshot of snapshot.documents) {
            const dataJson = localStorage.getItem(`document_${docSnapshot.id}`)
            if (dataJson) {
                const dataSnapshot = JSON.parse(dataJson) as DocumentDataSnapshot
                const session = this.state.documents.get(docSnapshot.id)!
                session.data = dataSnapshot.data
            }
        }
        
        // Применить данные активного документа
        if (this.state.activeDocumentId) {
            const activeSession = this.state.documents.get(this.state.activeDocumentId)
            if (activeSession) {
                this.storageService.applyContent(activeSession.data)
            }
        }
        
        return true
    }
    
    // === Геттеры ===
    
    get activeDocument(): DocumentSession | null {
        if (!this.state.activeDocumentId) return null
        return this.state.documents.get(this.state.activeDocumentId) ?? null
    }
    
    get documents(): DocumentSession[] {
        return this.state.documentOrder.map(id => this.state.documents.get(id)!).filter(Boolean)
    }
    
    get dirtyDocumentsCount(): number {
        return this.documents.filter(d => d.state.isDirty).length
    }
    
    get offlineDocumentsCount(): number {
        return this.documents.filter(d => d.ref?.fileId && d.state.syncStatus === 'offline').length
    }
}
```

### Этап 2: Изменение MainStore

**Файл:** `src/1-app/Stores/MainStore.ts`

**Изменения:**

1. Добавить `DocumentTabsStore` вместо `DocumentSessionStore`
2. Изменить `onChangeList` для работы с активным документом
3. Обновить методы сохранения

```typescript
export class MainStore {
    // ... существующие поля ...
    private documentTabsStore: DocumentTabsStore  // вместо documentSessionStore
    
    init() {
        // ...
        this.eventsStore.onChangeList = () => {
            this.eventsStore.sort()
            this.eventsCache.init()
            this.storageService.desyncWithStorages()
            
            // Обновление активного документа
            const activeDoc = this.documentTabsStore.activeDocument
            if (activeDoc && !activeDoc.state.isLoading) {
                // Помечаем документ как изменённый
                this.documentTabsStore.updateActiveDocumentData({
                    projectsList: this.projectsStore.getList(),
                    ...this.eventsStore.prepareToSave()
                })
            }
        }
        // ...
    }
    
    async saveCurrentDocument() {
        return this.documentTabsStore.saveActiveDocument()
    }
    
    async saveAllDocuments() {
        return this.documentTabsStore.saveAllDirtyDocuments()
    }
}
```

### Этап 3: UI компонент вкладок

**Файл:** `src/7-shared/ui/DocumentTabs/DocumentTabs.tsx` (новый)

```typescript
interface DocumentTabsProps {
    documents: DocumentSession[]
    activeDocumentId: DocumentId | null
    onActivate: (id: DocumentId) => void
    onClose: (id: DocumentId) => void
    onNew: () => void
}

export const DocumentTabs: React.FC<DocumentTabsProps> = ({
    documents,
    activeDocumentId,
    onActivate,
    onClose,
    onNew
}) => {
    return (
        <div className="document-tabs">
            {documents.map(doc => (
                <div
                    key={doc.id}
                    className={`document-tab ${doc.id === activeDocumentId ? 'active' : ''}`}
                    onClick={() => onActivate(doc.id)}
                >
                    <span className="document-tab-name">
                        {doc.ref?.name || 'Без названия'}
                        {doc.state.isDirty && <span className="modified-indicator">*</span>}
                    </span>
                    <button
                        className="document-tab-close"
                        onClick={(e) => {
                            e.stopPropagation()
                            onClose(doc.id)
                        }}
                    >
                        ×
                    </button>
                </div>
            ))}
            <button className="document-tab-new" onClick={onNew}>
                +
            </button>
        </div>
    )
}
```

**CSS:** `src/7-shared/ui/DocumentTabs/DocumentTabs.css` (новый)

```css
.document-tabs {
    display: flex;
    align-items: center;
    background: #f5f5f5;
    border-bottom: 1px solid #ddd;
    overflow-x: auto;
}

.document-tab {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    cursor: pointer;
    border-right: 1px solid #ddd;
    user-select: none;
}

.document-tab.active {
    background: white;
    border-bottom: 2px solid #1976d2;
}

.document-tab-name {
    margin-right: 8px;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.modified-indicator {
    color: #f44336;
    font-weight: bold;
}

.document-tab-close {
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 16px;
    opacity: 0.5;
}

.document-tab-close:hover {
    opacity: 1;
}

.document-tab-new {
    padding: 8px 12px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 18px;
}
```

### Этап 4: Интеграция в App

**Файл:** `src/1-app/App/App.tsx`

**Новая структура компоновки:**

```
┌─────────────────────────────────────────────────────────────┐
│  Header: логотип + CalendarIconBar (кнопки для активного    │
│  документа)                                                 │
├─────────────────────────────────────────────────────────────┤
│  DocumentTabs  ← вкладки под заголовком                     │
├─────────────────────────────────────────────────────────────┤
│  Основной контент (Calendar / DayList / Projects)           │
│                                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Код компонента App:**

```typescript
import { observer } from 'mobx-react-lite'
import { useStores } from 'src/1-app/Providers/StoreProvider'
import { DocumentTabs } from 'src/7-shared/ui/DocumentTabs/DocumentTabs'
import { CalendarIconBar } from 'src/4-widgets/CalendarIconBar/CalendarIconBar'
import { Calendar } from 'src/3-pages/Calendar'
import { DayList } from 'src/3-pages/DayList'
import { Projects } from 'src/3-pages/Projects'

export const App: React.FC = observer(() => {
    const { documentTabsStore, uiStore } = useStores()
    
    const handleActivate = (id: DocumentId) => {
        documentTabsStore.activateDocument(id)
    }
    
    const handleClose = async (id: DocumentId) => {
        const doc = documentTabsStore.documents.find(d => d.id === id)
        if (doc?.state.isDirty) {
            // Показать диалог подтверждения
            const confirmed = await showUnsavedChangesDialog()
            if (!confirmed) return
        }
        documentTabsStore.closeDocument(id)
    }
    
    const handleNew = async () => {
        // Проверка несохранённых изменений в активном документе
        const activeDoc = documentTabsStore.activeDocument
        if (activeDoc?.state.isDirty) {
            const confirmed = await showUnsavedChangesDialog()
            if (!confirmed) return
        }
        documentTabsStore.openNewDocument()
    }
    
    // Рендерим страницу в зависимости от режима просмотра
    const renderPage = () => {
        switch (uiStore.viewMode) {
            case 'Calendar':
                return <Calendar />
            case 'Day':
                return <DayList />
            case 'Projects':
                return <Projects />
            default:
                return <Calendar />
        }
    }
    
    return (
        <div className="app">
            {/* Заголовок приложения с CalendarIconBar */}
            <header className="app-header">
                <div className="app-header__top">
                    <div className="app-header__logo">
                        <img src="/logo.png" alt="Projector" />
                    </div>
                    <h1 className="app-header__title">Resources and Tasks Planner</h1>
                </div>
                
                {/* CalendarIconBar встроен в заголовок */}
                <CalendarIconBar />
            </header>
            
            {/* Вкладки документов - под заголовком */}
            {documentTabsStore.documents.length > 0 && (
                <DocumentTabs
                    documents={documentTabsStore.documents}
                    activeDocumentId={documentTabsStore.activeDocument?.id ?? null}
                    onActivate={handleActivate}
                    onClose={handleClose}
                    onNew={handleNew}
                />
            )}
            
            {/* Основной контент */}
            <main className="app-content">
                {renderPage()}
            </main>
        </div>
    )
})
```

**CSS стили для новой компоновки:**

**Файл:** `src/1-app/App/App.css`

```css
.app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
}

/* Заголовок приложения */
.app-header {
    display: flex;
    flex-direction: column;
    background: #1976d2;
    color: white;
    flex-shrink: 0;
}

.app-header__top {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 20px;
}

.app-header__logo {
    width: 40px;
    height: 40px;
}

.app-header__logo img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.app-header__title {
    font-size: 1.25rem;
    font-weight: 500;
    margin: 0;
}

/* CalendarIconBar внутри заголовка */
.app-header > .calendar-icon-bar {
    border-top: 1px solid rgba(255, 255, 255, 0.2);
}

/* Вкладки документов */
.app > .document-tabs {
    flex-shrink: 0;
    border-bottom: 1px solid #e0e0e0;
}

/* Основной контент */
.app-content {
    flex: 1;
    overflow: auto;
    position: relative;
}
```

**Адаптация CalendarIconBar для работы с активным документом:**

**Файл:** `src/4-widgets/CalendarIconBar/CalendarIconBar.tsx`

```typescript
import { observer } from 'mobx-react-lite'
import { useStores } from 'src/1-app/Providers/StoreProvider'

export const CalendarIconBar: React.FC = observer(() => {
    const { 
        documentTabsStore, 
        uiStore, 
        mainStore,
        storageService 
    } = useStores()
    
    const activeDoc = documentTabsStore.activeDocument
    
    // Обработчики теперь работают с активным документом
    const handleSave = async () => {
        if (!activeDoc) return
        await documentTabsStore.saveActiveDocument()
    }
    
    const handleSaveAll = async () => {
        await documentTabsStore.saveAllDirtyDocuments()
    }
    
    const handleSyncWithDrive = async () => {
        if (!activeDoc?.ref?.fileId) {
            // Если документ не связан с Drive, предложить Save As
            // TODO: открыть диалог SaveToDrive
            return
        }
        await documentTabsStore.syncActiveDocumentWithDrive()
    }
    
    const handleSyncAll = async () => {
        await documentTabsStore.syncAllDocumentsWithDrive()
    }
    
    const handleCreateNew = async () => {
        if (activeDoc?.state.isDirty) {
            const confirmed = await showUnsavedChangesDialog()
            if (!confirmed) return
        }
        documentTabsStore.openNewDocument()
    }
    
    const handleOpenFromDrive = async () => {
        // TODO: открыть диалог выбора файла из Drive
        const fileId = await showDriveFilePicker()
        if (fileId) {
            await documentTabsStore.openFromDrive(fileId)
        }
    }
    
    const handleSaveLocally = () => {
        storageService.saveToLocalStorage()
    }
    
    // Формирование кнопок панели
    const iconBarItems = [
        {
            name: 'Новый документ',
            jsx: <SwgIcon><DocumentPlus /></SwgIcon>,
            fn: handleCreateNew
        },
        {
            name: 'Открыть из Google Drive',
            jsx: <SwgIcon><GoogleDrive /></SwgIcon>,
            fn: handleOpenFromDrive
        },
        {
            name: 'Сохранить в текущий файл',
            jsx: (
                <SwgIcon>
                    <Diskette />
                    {activeDoc?.state.isDirty && <ModifiedAsterisk />}
                </SwgIcon>
            ),
            fn: handleSave,
            disabled: !activeDoc?.ref?.fileId
        },
        {
            name: 'Сохранить все изменённые',
            jsx: (
                <SwgIcon>
                    <Diskettes />
                    {documentTabsStore.dirtyDocumentsCount > 0 && (
                        <span className="badge">
                            {documentTabsStore.dirtyDocumentsCount}
                        </span>
                    )}
                </SwgIcon>
            ),
            fn: handleSaveAll,
            disabled: documentTabsStore.dirtyDocumentsCount === 0
        },
        {
            name: 'Синхронизировать с Google Drive',
            jsx: (
                <SwgIcon>
                    <Sync />
                    {activeDoc?.state.syncStatus === 'offline' && <OfflineIndicator />}
                </SwgIcon>
            ),
            fn: handleSyncWithDrive,
            disabled: !activeDoc?.ref?.fileId
        },
        {
            name: 'Синхронизировать все документы',
            jsx: (
                <SwgIcon>
                    <SyncAll />
                    {documentTabsStore.offlineDocumentsCount > 0 && (
                        <span className="badge">
                            {documentTabsStore.offlineDocumentsCount}
                        </span>
                    )}
                </SwgIcon>
            ),
            fn: handleSyncAll,
            disabled: documentTabsStore.offlineDocumentsCount === 0
        },
        {
            name: 'Сохранить локально',
            jsx: (
                <SwgIcon>
                    <Diskette />
                    {!storageService.isSyncWithLocalstorage && <ModifiedAsterisk />}
                </SwgIcon>
            ),
            fn: handleSaveLocally
        }
    ]
    
    return (
        <div className="calendar-icon-bar">
            {iconBarItems.map((item, index) => (
                <div
                    key={index}
                    className={`icon-bar-item ${item.disabled ? 'disabled' : ''}`}
                    title={item.name}
                    onClick={item.disabled ? undefined : item.fn}
                >
                    {item.jsx}
                    <span className="icon-bar-item__name">{item.name}</span>
                </div>
            ))}
        </div>
    )
})
```

**Дополнительные стили для CalendarIconBar:**

**Файл:** `src/4-widgets/CalendarIconBar/CalendarIconBar.css`

```css
.calendar-icon-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.1);
}

.icon-bar-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.2s;
}

.icon-bar-item:hover:not(.disabled) {
    background: rgba(255, 255, 255, 0.2);
}

.icon-bar-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.icon-bar-item__name {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
}

.badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #f44336;
    color: white;
    font-size: 0.65rem;
    padding: 2px 5px;
    border-radius: 10px;
    min-width: 16px;
    text-align: center;
}
```

### Этап 5: Обновление root.ts и index.tsx

**Файл:** `src/1-app/root.ts`

Создать синглтон `DocumentTabsStore`:

```typescript
const googleApiService = new GoogleApiService()
const storageService = new StorageService(projectsStore, eventsStore)
const documentTabsStore = new DocumentTabsStore(googleApiService, storageService)

// ... экспорт всех сторов включая documentTabsStore
```

**Файл:** `src/1-app/index.tsx`

Добавить `documentTabsStore` в `StoreProvider`:

```typescript
root.render(
    <StoreProvider
        // ... остальные сторы
        documentTabsStore={documentTabsStore}
    >
        <App />
    </StoreProvider>
)
```

### Этап 6: Миграция данных

**Файл:** `src/1-app/Stores/MigrationService.ts` (новый)

Сервис для миграции данных из старой структуры в новую:

```typescript
export class MigrationService {
    static migrateFromSingleDocument() {
        const oldData = localStorage.getItem('data')
        const oldDoc = localStorage.getItem('lastOpenedDocument')
        
        if (!oldData || !oldDoc) return
        
        // Проверка: уже есть новая структура?
        const newTabs = localStorage.getItem('documentTabs')
        if (newTabs) return  // Миграция уже выполнена
        
        // Создание первой вкладки из старых данных
        const documentId = generateDocumentId()
        const oldDocParsed = JSON.parse(oldDoc)
        
        const snapshot: DocumentTabsSnapshot = {
            activeDocumentId: documentId,
            documentOrder: [documentId],
            documents: [{
                id: documentId,
                ref: {
                    fileId: oldDocParsed.fileId,
                    name: oldDocParsed.name,
                    mimeType: oldDocParsed.mimeType,
                    space: oldDocParsed.space,
                    parentFolderId: oldDocParsed.parentFolderId
                },
                state: {
                    isDirty: false,
                    isLoading: false,
                    isSaving: false,
                    lastLoadedAt: Date.now(),
                    lastSavedAt: null,
                    error: null
                },
                lastAccessedAt: Date.now()
            }],
            savedAt: Date.now()
        }
        
        localStorage.setItem('documentTabs', JSON.stringify(snapshot))
        localStorage.setItem(`document_${documentId}`, JSON.stringify({
            data: JSON.parse(oldData),
            savedAt: Date.now()
        }))
        
        console.log('Миграция данных выполнена успешно')
    }
}
```

Вызов миграции при инициализации приложения:

```typescript
// В MainStore.init()
MigrationService.migrateFromSingleDocument()
```

---

## 5. Диаграммы последовательности

### 5.1 Открытие нового документа

```
Пользователь          DocumentTabsStore         LocalStorage         Google Drive
    │                        │                       │                    │
    │── Нажать "+" ─────────>│                       │                    │
    │                        │                       │                    │
    │                        │── Создать сессию ────>│                    │
    │                        │── Сохранить метаданные>│                    │
    │                        │                       │                    │
    │                        │── Применить пустые    │                    │
    │                        │    данные к сторам ──>│                    │
    │                        │                       │                    │
    │<─ Отобразить вкладку ──│                       │                    │
    │                        │                       │                    │
```

### 5.2 Переключение между вкладками

```
Пользователь          DocumentTabsStore         MainStore            LocalStorage
    │                        │                       │                    │
    │── Клик по вкладке ────>│                       │                    │
    │                        │                       │                    │
    │                        │── Сохранить текущие   │                    │
    │                        │    данные в кэш ─────>│                    │
    │                        │                       │                    │
    │                        │── Загрузить данные    │                    │
    │                        │    выбранного док-та ─>│                    │
    │                        │                       │                    │
    │                        │── Применить данные ──>│                    │
    │                        │                       │── Обновить UI ────>│
    │                        │                       │                    │
    │<─ Вкладка активна ─────│                       │                    │
    │                        │                       │                    │
```

### 5.3 Сохранение всех документов

```
Пользователь          DocumentTabsStore         Google Drive         LocalStorage
    │                        │                       │                    │
    │── "Сохранить всё" ────>│                       │                    │
    │                        │                       │                    │
    │                        │── Для каждого dirty ──>│                    │
    │                        │    документа:         │                    │
    │                        │    1. Serialize       │                    │
    │                        │    2. Upload ────────>│                    │
    │                        │    3. Получить ID     │                    │
    │                        │<──────────────────────│                    │
    │                        │    4. Обновить state  │                    │
    │                        │                       │                    │
    │                        │── Сохранить обновл. ──>│                    │
    │                        │    метаданные         │                    │
    │                        │                       │                    │
    │<─ Готово (N сохранено)─│                       │                    │
    │                        │                       │                    │
```

### 5.4 Восстановление сессии (офлайн)

```
Приложение          DocumentTabsStore         LocalStorage         Google Drive
    │                        │                       │                    │
    │── Запуск ─────────────>│                       │                    │
    │                        │                       │                    │
    │                        │── Чтение 'documentTabs'>                   │
    │                        │<──────────────────────│                    │
    │                        │                       │                    │
    │                        │── Для каждого док-та: │                    │
    │                        │    Чтение данных ─────>│                    │
    │                        │<──────────────────────│                    │
    │                        │                       │                    │
    │                        │── Применить данные ───>│                    │
    │                        │    активного док-та   │                    │
    │                        │                       │                    │
    │<─ Готово к работе ─────│                       │                    │
    │    (все документы в    │                       │                    │
    │     офлайн режиме)     │                       │                    │
    │                        │                       │                    │
```

### 5.5 Явная синхронизация с Google Drive

```
Пользователь          DocumentTabsStore         Google Drive         LocalStorage
    │                        │                       │                    │
    │── "Синхронизировать" ─>│                       │                    │
    │                        │                       │                    │
    │                        │── Проверка авторизации│                    │
    │                        │   (если нужно ───────>│                    │
    │                        │    login popup)       │                    │
    │                        │                       │                    │
    │                        │── Загрузка метаданных>│                    │
    │                        │<──────────────────────│                    │
    │                        │                       │                    │
    │                        │── Сравнение версий:   │                    │
    │                        │    Remote > Local?    │                    │
    │                        │                       │                    │
    │<─ Конфликт версий ─────│                       │                    │
    │    (выбор действия)    │                       │                    │
    │                        │                       │                    │
    │── "Загрузить Drive" ──>│                       │                    │
    │                        │── Download content ──>│                    │
    │                        │<──────────────────────│                    │
    │                        │                       │                    │
    │                        │── Обновить данные ───>│                    │
    │                        │── syncStatus: synced ─>│                    │
    │                        │                       │                    │
    │<─ Синхронизировано ───│                       │                    │
    │                        │                       │                    │
```

---

## 6. Обработка краевых случаев

### 6.1 Конфликт версий

**Проблема:** Документ изменён в другом месте (другой браузер, устройство)

**Решение:**

```typescript
async checkForUpdates(documentId: DocumentId) {
    const session = this.state.documents.get(documentId)
    if (!session?.ref?.fileId) return
    
    const remoteMetadata = await this.googleApiService.getFileMetadata(session.ref.fileId)
    const remoteModifiedAt = new Date(remoteMetadata.modifiedTime).getTime()
    
    if (remoteModifiedAt > session.state.lastSavedAt) {
        // Предложить пользователю выбор:
        // 1. Загрузить удалённую версию
        // 2. Сохранить локальную версию
        // 3. Сравнить версии
        return { hasConflict: true, remoteMetadata }
    }
    
    return { hasConflict: false }
}
```

### 6.2 Закрытие вкладки браузера

**Проблема:** Пользователь закрывает вкладку с несохранёнными изменениями

**Решение:**

```typescript
// В App.tsx
useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        const dirtyCount = documentTabsStore.dirtyDocumentsCount
        if (dirtyCount > 0) {
            e.preventDefault()
            e.returnValue = ''  // Стандартный браузерный диалог
        }
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
}, [documentTabsStore.dirtyDocumentsCount])
```

### 6.3 Переполнение localStorage

**Проблема:** localStorage ограничен ~5-10MB

**Решение:**

1. **Сжатие данных:**
   ```typescript
   import { deflate, inflate } from 'pako'
   
   const compressed = deflate(JSON.stringify(data), { level: 9 })
   const compressedBase64 = btoa(String.fromCharCode(...compressed))
   localStorage.setItem(key, compressedBase64)
   ```

2. **Очистка старых документов:**
   ```typescript
   cleanupOldDocuments(maxDocuments: number = 10) {
       const sorted = this.documents.sort((a, b) => 
           b.lastAccessedAt - a.lastAccessedAt
       )
       
       if (sorted.length > maxDocuments) {
           const toRemove = sorted.slice(maxDocuments)
           toRemove.forEach(doc => this.closeDocument(doc.id))
       }
   }
   ```

3. **Индикация заполнения:**
   ```typescript
   getStorageUsage() {
       let total = 0
       for (let i = 0; i < localStorage.length; i++) {
           const key = localStorage.key(i)
           if (key) {
               total += localStorage[key].length * 2  // UTF-16
           }
       }
       return { used: total, limit: 5 * 1024 * 1024 }
   }
   ```

### 6.4 Ошибка сети при сохранении

**Проблема:** Сохранение не удалось из-за проблем с сетью

**Решение:**

```typescript
async saveWithRetry(documentId: DocumentId, maxRetries: number = 3) {
    let lastError: Error
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const success = await this.saveActiveDocument()
            if (success) return true
        } catch (error) {
            lastError = error
            console.warn(`Save attempt ${attempt} failed:`, error)
            
            if (attempt < maxRetries) {
                await delay(1000 * attempt)  // Exponential backoff
            }
        }
    }
    
    // Все попытки исчерпаны
    this.state.error = `Не удалось сохранить после ${maxRetries} попыток: ${lastError.message}`
    return false
}
```

---

## 7. Тестирование

### 7.1 Unit-тесты

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.test.ts`

```typescript
describe('DocumentTabsStore', () => {
    let store: DocumentTabsStore
    let mockGoogleApiService: Partial<GoogleApiService>
    let mockStorageService: Partial<StorageService>
    
    beforeEach(() => {
        mockGoogleApiService = { /* моки */ }
        mockStorageService = { /* моки */ }
        store = new DocumentTabsStore(
            mockGoogleApiService as GoogleApiService,
            mockStorageService as StorageService
        )
    })
    
    test('openNewDocument создаёт новую вкладку', () => {
        store.openNewDocument('Тест')
        expect(store.documents.length).toBe(1)
        expect(store.activeDocument?.ref?.name).toBe('Тест')
        expect(store.activeDocument?.ref?.fileId).toBeNull()
    })
    
    test('activateDocument переключает активный документ', () => {
        store.openNewDocument('Doc 1')
        store.openNewDocument('Doc 2')
        
        const firstDocId = store.documents[0].id
        store.activateDocument(firstDocId)
        
        expect(store.activeDocument?.id).toBe(firstDocId)
    })
    
    test('closeDocument удаляет вкладку', () => {
        store.openNewDocument('Тест')
        const docId = store.activeDocument!.id
        
        store.closeDocument(docId)
        
        expect(store.documents.length).toBe(0)
        expect(store.activeDocumentId).toBeNull()
    })
    
    test('restoreFromLocalStorage восстанавливает сессию', async () => {
        // Подготовка данных в localStorage
        localStorage.setItem('documentTabs', JSON.stringify({ /* ... */ }))
        
        await store.restoreFromLocalStorage()
        
        expect(store.documents.length).toBeGreaterThan(0)
    })
})
```

### 7.2 Интеграционные тесты

**Файл:** `src/1-app/App/App.test.tsx`

```typescript
describe('App с многодокументной поддержкой', () => {
    test('переключение между вкладками обновляет контент', async () => {
        render(<App />)
        
        // Создать два документа
        fireEvent.click(screen.getByTestId('new-document'))
        fireEvent.click(screen.getByTestId('new-document'))
        
        // Добавить проект в первый документ
        fireEvent.click(screen.getByText('Проекты'))
        fireEvent.change(screen.getByPlaceholderText('Название проекта'), {
            target: { value: 'Проект 1' }
        })
        
        // Переключиться на второй документ
        const tabs = screen.getAllByTestId('document-tab')
        fireEvent.click(tabs[0])
        
        // Проверить, что проект не отображается
        expect(screen.queryByText('Проект 1')).not.toBeInTheDocument()
    })
})
```

### 7.3 E2E тесты

**Файл:** `e2e/multi-document.spec.ts`

```typescript
test('полный цикл работы с несколькими документами', async ({ page }) => {
    await page.goto('/')
    
    // Создать новый документ
    await page.click('[data-testid="new-document"]')
    
    // Добавить проект
    await page.click('text=Проекты')
    await page.fill('[placeholder="Название проекта"]', 'Тестовый проект')
    await page.click('text=Добавить')
    
    // Сохранить в Google Drive
    await page.click('[data-testid="save-to-drive"]')
    await page.click('text=Сохранить')
    
    // Создать второй документ
    await page.click('[data-testid="new-document"]')
    
    // Проверить переключение
    await page.click('[data-testid="document-tab"]:nth-child(1)')
    expect(await page.textContent('.project-name')).toBe('Тестовый проект')
    
    // Закрыть первый документ
    await page.click('[data-testid="document-tab-close"]:nth-child(1)')
    
    // Проверить, что осталась одна вкладка
    expect(await page.locator('[data-testid="document-tab"]').count()).toBe(1)
})
```

---

## 8. Метрики и мониторинг

### 8.1 Метрики производительности

| Метрика | Целевое значение | Способ измерения |
|---------|------------------|------------------|
| Время переключения вкладки | < 100ms | Performance API |
| Время открытия из Drive | < 2000ms | Performance API |
| Время восстановления сессии | < 3000ms | Performance API |
| Размер localStorage | < 4MB | Custom metric |

### 8.2 Метрики надёжности

| Метрика | Целевое значение |
|---------|------------------|
| Успешность сохранения в Drive | > 99% |
| Успешность восстановления сессии | > 95% |
| Частота потери данных | < 0.1% |

### 8.3 Логирование

```typescript
// В DocumentTabsStore
private log(action: string, data?: any) {
    console.log(`[DocumentTabsStore] ${action}`, {
        timestamp: Date.now(),
        documentsCount: this.state.documents.size,
        activeDocumentId: this.state.activeDocumentId,
        ...data
    })
}

// Пример использования
this.log('openNewDocument', { id, name })
this.log('saveCompleted', { documentId, success })
this.log('restoreFromLocalStorage', { documentsCount: snapshot.documents.length })
```

---

## 9. Обратная совместимость

### 9.1 Миграция данных

Автоматическая миграция при первом запуске:

```typescript
// В MainStore.init()
MigrationService.migrateFromSingleDocument()
```

### 9.2 Откат к старой версии

При необходимости отката:

```typescript
// Экспорт старых данных перед обновлением
const exportOldData = () => {
    const data = localStorage.getItem('data')
    const lastDoc = localStorage.getItem('lastOpenedDocument')
    return { data, lastOpenedDocument: lastDoc }
}

// Импорт после отката
const importOldData = (oldData: { data: string, lastOpenedDocument: string }) => {
    localStorage.setItem('data', oldData.data)
    localStorage.setItem('lastOpenedDocument', oldData.lastOpenedDocument)
    localStorage.removeItem('documentTabs')
}
```

---

## 10. Дорожная карта

| Этап | Задача | Оценка времени | Приоритет |
|------|--------|----------------|-----------|
| 1 | DocumentTabsStore (базовая реализация) | 8 часов | Высокий |
| 2 | Интеграция с MainStore | 4 часа | Высокий |
| 3 | UI компонент вкладок | 6 часов | Высокий |
| 4 | Интеграция в App + CalendarIconBar | 6 часов | Высокий |
| 5 | Обновление root.ts и index.tsx | 2 часа | Высокий |
| 6 | Миграция данных | 4 часа | Средний |
| 7 | Unit-тесты | 6 часов | Средний |
| 8 | Обработка краевых случаев | 8 часов | Низкий |
| 9 | Оптимизация производительности | 4 часа | Низкий |
| 10 | Документация | 2 часа | Низкий |

**Итого:** ~50 часов (6-7 рабочих дней)

---

## 11. Заключение

Предложенная архитектура обеспечивает:

1. **Полную поддержку нескольких документов** с независимым состоянием
2. **Бесшовное переключение** между документами через вкладки
3. **Надёжное хранение** в localStorage с восстановлением из локального кэша
4. **Синхронизацию с Google Drive по требованию** — пользователь полностью контролирует, когда происходит синхронизация
5. **Защиту от потери данных** через диалоги подтверждения и флаги `isDirty`
6. **Обратную совместимость** через автоматическую миграцию
7. **Единую панель инструментов** (CalendarIconBar) для управления активным документом
8. **Визуальные индикаторы** статуса синхронизации для каждого документа

**Ключевые принципы:**

- **Офлайн-первый подход** — приложение запускается и работает полностью офлайн, синхронизация только по явному запросу
- **Пользовательский контроль** — никакие действия с Google Drive не выполняются автоматически
- **Прозрачность состояния** — каждый документ показывает свой статус через иконки (📴/🔄/✓/⚠/❌)

Реализация разбита на независимые этапы, что позволяет постепенно внедрять функциональность и тестировать каждый компонент отдельно.

---

## Приложения

### A. Глоссарий

| Термин | Определение |
|--------|-------------|
| DocumentSession | Полная сессия открытого документа (метаданные + данные + состояние) |
| DocumentId | Уникальный идентификатор документа в сессии приложения |
| Dirty документ | Документ с несохранёнными изменениями |
| Вкладка (Tab) | UI элемент для переключения между документами |

### B. Ссылки на связанные документы

- [Архитектурный анализ](./architectural_review.md)
- [Google Drive интеграция](./google_drive_file_picker_analysis.md)
- [MobX store импорт стратегия](./mobx_store_import_strategy_analysis.md)

### C. История изменений документа

| Версия | Дата | Автор | Изменения |
|--------|------|-------|-----------|
| 1.0 | 14.03.2026 | AI Assistant | Первоначальная версия |
| 1.1 | 14.03.2026 | AI Assistant | Изменена логика восстановления сессии: офлайн-первый подход, явная синхронизация по запросу пользователя |
| 1.2 | 14.03.2026 | AI Assistant | Обновлена визуальная интеграция: вкладки под заголовком, CalendarIconBar в заголовке для активного документа |
