# Предложение: Конечный автомат синхронизации документа и индикация состояний в табах

**Дата:** 14 апреля 2026 г.  
**Автор:** Анализ на основе изучения исходного кода проекта

---

## 1. Введение

В проекте существует хаотичное поведение при синхронизации локальных данных документа с Google Drive. Нет чёткого понимания, какие данные будут сохранены при синхронизации, а какие — перезаписаны. Настоящий документ содержит самостоятельный анализ кодовой базы, выявление корневых проблем и предложение архитектурного решения на основе конечного автомата (FSM), которое гарантированно исключает потерю изменений.

---

## 2. Анализ текущей реализации

### 2.1 Модель состояний документа

Текущая модель определена в [`DocumentState`](src/6-entities/Document/model/DocumentTabsStore.types.ts:32):

```typescript
export type DocumentState = {
    isDirty: boolean
    isLoading: boolean
    isSaving: boolean
    lastLoadedAt: number | null
    lastSavedAt: number | null
    error: string | null
    syncStatus: SyncStatus
    lastSyncedAt: number | null
    hasUnsyncedChanges: boolean
}
```

Где [`SyncStatus`](src/6-entities/Document/model/DocumentTabsStore.types.ts:8) — это строковый литерал:

```typescript
export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'needs-sync' | 'update-available' | 'error'
```

### 2.2 Индикация в табах

Компонент [`DocumentTabs`](src/7-shared/ui/DocumentTabs/DocumentTabs.tsx) отображает два независимых индикатора:

1. **Звёздочка `*`** — если `isDirty` или `hasUnsyncedChanges` (строка 72)
2. **Иконка синхронизации** — если у документа есть `fileId` (строка 84), с шестью вариантами: 📴🔄✓⚠☁️❌

В заголовке приложения ([`Header`](src/4-widgets/Header/Header.tsx:21)) отображается только `isDirty`:
```typescript
const documentTitle = activeDoc
    ? `${activeDoc.ref?.name || 'Без названия'}${activeDoc.state.isDirty ? ' *' : ''}`
    : 'Документ не открыт'
```

В [`CalendarIconBar`](src/4-widgets/CalendarIconBar/CalendarIconBar.tsx) индикация разбросана по нескольким иконкам с разными условиями.

### 2.3 Пути сохранения

В приложении существует **два независимых пути сохранения**, которые не согласованы друг с другом:

**Путь 1:** [`DocumentTabsStore.saveActiveDocument()`](src/6-entities/Document/model/DocumentTabsStore.ts:315) — сохраняет текущий документ по его `fileId`, обновляет `isDirty`, `hasUnsyncedChanges`, `syncStatus`.

**Путь 2:** [`SaveToDriveStore.saveFile()`](src/4-widgets/SaveToDrive/model/SaveToDriveStore.ts:57) — сохраняет файл через диалог «Сохранить как…», напрямую мутирует `activeDoc.ref` и `activeDoc.state` (строки 96–108), обходя методы `DocumentTabsStore`.

### 2.4 Логика синхронизации

Метод [`syncActiveDocumentWithDrive()`](src/6-entities/Document/model/DocumentTabsStore.ts:382) работает так:

1. Загружает метаданные с Drive
2. Сравнивает `remoteModifiedAt > localModifiedAt` (где `localModifiedAt = session.state.lastSavedAt`)
3. Если `isDirty` или `hasRemoteChanges` → возвращает `conflict`
4. Если нет изменений — **автоматически загружает контент с Drive и перезаписывает локальные данные** (строки 434–444)

---

## 3. Выявленные проблемы

### 3.1 🔴 КРИТИЧЕСКОЕ: Три флага описывают одно и то же свойство

`isDirty`, `hasUnsyncedChanges` и `syncStatus` частично перекрывают друг друга:

| Ситуация | `isDirty` | `hasUnsyncedChanges` | `syncStatus` | Избыточность |
|----------|-----------|---------------------|--------------|-------------|
| Редактирование в текущей сессии | `true` | `false` | `'needs-sync'` | `isDirty` и `syncStatus` говорят об одном |
| Восстановление с изменениями | `false` | `true` | `'offline'` | `hasUnsyncedChanges` и `'offline'` конфликтуют |
| Конфликт (обе стороны) | `true` | `?` | `'needs-sync'` | Нет способа отличить от простого редактирования |

**Последствие:** Невозможно однозначно определить состояние документа по текущим флагам. Логика разбросана по условным ветвлениям в разных местах кода.

### 3.2 🔴 КРИТИЧЕСКОЕ: `hasUnsyncedChanges` всегда равен `isDirty` при сохранении

В [`persistToLocalStorage()`](src/6-entities/Document/model/DocumentTabsStore.ts:563):

```typescript
hasUnsyncedChanges: session.state.isDirty  // ← Всегда копирует isDirty!
```

Это означает, что `hasUnsyncedChanges` **никогда не сохраняет независимое значение**. Флаг был задуман для отслеживания изменений между сессиями, но при каждой персистенции он просто копирует текущее значение `isDirty`. Если пользователь сохранил документ (`isDirty = false`), но после этого появились изменения на Drive — `hasUnsyncedChanges` будет `false`, и информация о рассинхронизации потеряна.

### 3.3 🔴 КРИТИЧЕСКОЕ: Автоматическая перезапись данных при синхронизации

В [`syncActiveDocumentWithDrive()`](src/6-entities/Document/model/DocumentTabsStore.ts:434) при отсутствии обнаруженных изменений:

```typescript
// Нет изменений — загружаем для проверки и синхронизируем
const content = await this.googleApiService.downloadFileContent(session.ref.fileId)
session.data = parseDocumentContent(content)  // ← Перезапись без подтверждения!
```

**Сценарий потери данных:**
1. Пользователь A открыл документ (v1.0), `lastSavedAt = 10:00`
2. Пользователь A редактировал, но потом отменил все изменения (Ctrl+Z), `isDirty = false`
3. Пользователь B изменил документ на Drive (v1.1, `modifiedTime = 10:05`)
4. Пользователь A нажимает «Синхронизировать»
5. `remoteModifiedAt (10:05) > localModifiedAt (10:00)` → `hasRemoteChanges = true` → показан диалог ✓
6. **НО:** если `lastSavedAt` был обновлён при каком-то промежуточном сохранении, сравнение может показать «нет изменений», и данные с Drive перезапишут локальные **автоматически**

### 3.4 🟡 ВАЖНОЕ: `syncAllDocumentsWithDrive` меняет `activeDocumentId`

В [`syncAllDocumentsWithDrive()`](src/6-entities/Document/model/DocumentTabsStore.ts:469):

```typescript
const previousActiveId = this.state.activeDocumentId
this.state.activeDocumentId = id  // ← Временная подмена!
const result = await this.syncActiveDocumentWithDrive()
this.state.activeDocumentId = previousActiveId
```

**Проблемы:**
- MobX-реактивность вызывает перерисовку UI при каждом изменении `activeDocumentId`
- Если синхронизация завершается ошибкой, `activeDocumentId` может остаться в неправильном состоянии
- Конфликт в одном документе блокирует синхронизацию остальных

### 3.5 🟡 ВАЖНОЕ: Потеря информации о `update-available` при редактировании

В [`updateActiveDocumentData()`](src/6-entities/Document/model/DocumentTabsStore.ts:306):

```typescript
else if (session.state.syncStatus === 'update-available') {
    session.state.syncStatus = 'needs-sync'  // ← Информация о новой версии на Drive потеряна!
}
```

Пользователь начинает редактировать документ, у которого есть более новая версия на Drive. Статус меняется на `'needs-sync'`, и информация о том, что на Drive есть конфликтующая версия, **исчезает**. При следующей синхронизации пользователь не будет предупреждён о конфликте.

### 3.6 🟡 ВАЖНОЕ: Два пути сохранения не согласованы

`SaveToDriveStore.saveFile()` напрямую мутирует состояние документа:
```typescript
activeDoc.ref = { ...activeDoc.ref!, fileId: result.file.id, ... }
activeDoc.state.isDirty = false
activeDoc.state.lastSavedAt = Date.now()
activeDoc.state.syncStatus = 'synced'
```

А `DocumentTabsStore.saveActiveDocument()` делает то же самое, но через собственную логику. Эти два пути могут устанавливать разные комбинации флагов, приводя к рассинхронизации состояния.

### 3.7 🟠 СРЕДНЕЕ: Нет защиты от race conditions

Все асинхронные операции (`saveActiveDocument`, `syncActiveDocumentWithDrive`) не защищены от параллельного выполнения. Если пользователь быстро нажмёт «Сохранить» дважды, обе операции выполнятся параллельно и могут перезаписать данные друг друга.

### 3.8 🟠 СРЕДНЕЕ: Сравнение только по временным меткам

Конфликт определяется как `remoteModifiedAt > localModifiedAt`. Это ненадёжно:
- Часовой сдвиг между клиентом и сервером
- Разрешение `modifiedTime` — секунды, что недостаточно при быстрых операциях
- Нет сравнения **содержимого** — данные могут быть идентичны при разных временных метках

---

## 4. Предложение: Конечный автомат синхронизации

### 4.1 Принцип проектирования

**Делаем некорректные состояния невыразимыми.** Вместо трёх перекрывающихся флагов (`isDirty`, `hasUnsyncedChanges`, `syncStatus`) вводим **одно дискриминированное объединение** (tagged union), которое описывает все допустимые состояния документа.

### 4.2 Новая модель состояний

```typescript
/**
 * Конечный автомат состояний документа.
 * Каждый статус однозначно определяет визуальную индикацию и доступные действия.
 * 
 * Переходы:
 * 
 *   new ──(edit)──► dirty
 *    │                 │
 *    │          ┌──────┤
 *    │          │      │
 *    │     (save)    (sync→conflict)
 *    │          │      │
 *    │          ▼      ▼
 *    │        synced  conflict
 *    │          │      │
 *    │     (edit)   (resolve→synced/dirty)
 *    │          │      │
 *    │          ▼      │
 *    │        dirty    │
 *    │                 │
 *    └──(open-from-drive)──► synced
 * 
 *   synced ──(remote-changed)──► update-available
 *   update-available ──(edit)──► conflict
 *   update-available ──(pull)──► synced
 *   
 *   * ──(error)──► error
 *   error ──(retry)──► предыдущее состояние
 */
export type DocSyncState =
    | { status: 'new' }
    | { status: 'dirty'; localFingerprint: string }
    | { status: 'synced'; lastSyncedAt: number; syncedFingerprint: string }
    | { status: 'syncing'; previousState: DocSyncState; operation: 'save' | 'pull' | 'check' }
    | { status: 'update-available'; lastSyncedAt: number; localFingerprint: string; remoteFingerprint: string }
    | { status: 'conflict'; localFingerprint: string; remoteFingerprint: string; conflictType: ConflictType }
    | { status: 'error'; message: string; previousState: DocSyncState }

export type ConflictType =
    | 'local-only'        // Локальные изменения не сохранены на Drive
    | 'remote-only'       // Drive новее, локальных изменений нет
    | 'both-modified'     // Изменены обе стороны
    | 'fingerprint-mismatch'  // Временные метки совпадают, но содержимое различается
```

### 4.3 Обоснование переходов

| Текущее состояние | Событие | Новое состояние | Условие |
|---|---|---|---|
| `new` | Пользователь редактирует | `dirty` | Всегда |
| `new` | «Сохранить как» на Drive | `synced` | Успешное сохранение |
| `dirty` | Пользователь сохраняет на Drive | `syncing` → `synced` | Успех |
| `dirty` | Пользователь синхронизирует | `syncing` → `conflict` | Обнаружены удалённые изменения |
| `dirty` | Ошибка при сохранении | `error` | Провал |
| `synced` | Пользователь редактирует | `dirty` | Всегда |
| `synced` | Обнаружены изменения на Drive | `update-available` | `remoteModifiedAt > lastSyncedAt` и `fingerprint` различается |
| `update-available` | Пользователь редактирует | `conflict(both-modified)` | Локальные + удалённые изменения |
| `update-available` | Пользователь загружает с Drive | `syncing` → `synced` | Успех |
| `conflict` | Пользователь выбирает локальную версию | `syncing` → `synced` | Сохранение локальной на Drive |
| `conflict` | Пользователь выбирает удалённую версию | `syncing` → `synced` | Загрузка с Drive |
| `error` | Повторная попытка | `previousState` | Восстановление |

### 4.4 Fingerprint (отпечаток содержимого)

Вместо сравнения по временным меткам используем отпечаток содержимого:

```typescript
/**
 * Вычислить отпечаток (fingerprint) данных документа.
 * Используется для точного определения, изменилось ли содержимое.
 */
export function computeFingerprint(data: DocumentData): string {
    // Сериализуем с детерминированным порядком ключей
    const json = JSON.stringify(data, Object.keys(data).sort())
    // Простой быстрый хеш (для продакшена можно заменить на SubtleCrypto.digest)
    let h = 0x811c9dc5 // FNV offset basis
    for (let i = 0; i < json.length; i++) {
        h ^= json.charCodeAt(i)
        h = Math.imul(h, 0x01000193) // FNV prime
    }
    return (h >>> 0).toString(36)
}
```

**Преимущества перед `lastSavedAt`:**
- Точное определение: данные действительно изменились или нет
- Не зависит от часов клиента/сервера
- Позволяет обнаружить «молчаливые» изменения (одинаковые метки, разное содержимое)

### 4.5 Обновлённый тип `DocumentSession`

```typescript
export type DocumentSession = {
    id: DocumentId
    ref: DocumentRef | null
    data: DocumentData
    syncState: DocSyncState        // ← Заменяет isDirty + hasUnsyncedChanges + syncStatus
    operationToken: number | null  // ← Защита от race conditions
    createdAt: number
    lastAccessedAt: number
}
```

**Удалены:**
- `isDirty` — выводится из `syncState.status === 'dirty' || syncState.status === 'conflict'`
- `hasUnsyncedChanges` — выводится из `syncState.status === 'dirty' || syncState.status === 'conflict' || syncState.status === 'update-available'`
- `syncStatus` — заменён на `syncState`
- `isLoading` — выводится из `syncState.status === 'syncing' && syncState.operation === 'pull' | 'check'`
- `isSaving` — выводится из `syncState.status === 'syncing' && syncState.operation === 'save'`
- `lastLoadedAt` — заменён на `lastSyncedAt` внутри `synced`
- `lastSavedAt` — заменён на `lastSyncedAt` внутри `synced`
- `error` — перенесён в `syncState` типа `error`

### 4.6 Геттеры-совместимости

Для плавной миграции можно добавить геттеры:

```typescript
export function isDirty(state: DocSyncState): boolean {
    return state.status === 'dirty' || 
           (state.status === 'conflict' && state.conflictType !== 'remote-only')
}

function hasUnsyncedChanges(state: DocSyncState): boolean {
    return state.status === 'dirty' || 
           state.status === 'conflict' || 
           state.status === 'update-available'
}

function syncStatus(state: DocSyncState): SyncStatus {
    switch (state.status) {
        case 'new': return 'offline'
        case 'dirty': return 'needs-sync'
        case 'synced': return 'synced'
        case 'syncing': return 'syncing'
        case 'update-available': return 'update-available'
        case 'conflict': return 'needs-sync'
        case 'error': return 'error'
    }
}
```

---

## 5. Новая визуальная индикация в табах

### 5.1 Принцип: одно состояние → один визуальный образ

Каждому значению `DocSyncState.status` соответствует **уникальный** визуальный индикатор. Пользователь не должен угадывать, что означает звёздочка.

### 5.2 Таблица индикации

| `syncState.status` | Визуальный элемент | Цвет | Tooltip | Есть `fileId` |
|---|---|---|---|---|
| `new` | (нет индикатора) | — | «Новый документ (не сохранён на Drive)» | Нет |
| `dirty` | `●` | Оранжевый `#FF9800` | «Есть несохранённые изменения» | Необязательно |
| `synced` | `✓` | Зелёный `#4CAF50` | «Синхронизировано с Google Drive» | Да |
| `syncing` | `↻` (анимация вращения) | Синий `#2196F3` | «Синхронизация…» | Да |
| `update-available` | `↓` | Голубой `#03A9F4` | «Доступна новая версия с Google Drive» | Да |
| `conflict` | `⚠` | Красный `#F44336`, пульсация | Зависит от `conflictType` (см. ниже) | Да |
| `error` | `✕` | Красный `#F44336` | Текст ошибки из `syncState.message` | Да |

### 5.3 Tooltip для `conflict` по типу

| `conflictType` | Tooltip |
|---|---|
| `local-only` | «Ваши изменения не сохранены на Drive. Нажмите для сохранения.» |
| `remote-only` | «На Drive есть более новая версия. Нажмите для загрузки.» |
| `both-modified` | «Конфликт: документ изменён и локально, и на Drive. Требуется выбор.» |
| `fingerprint-mismatch` | «Данные на Drive отличаются от локальных. Требуется выбор.» |

### 5.4 Обновлённый компонент `DocumentTabs`

```typescript
const getIndicator = (doc: DocumentSession): { symbol: string; className: string; title: string } => {
    const s = doc.syncState
    
    switch (s.status) {
        case 'new':
            return { symbol: '', className: '', title: 'Новый документ' }
        case 'dirty':
            return { symbol: '●', className: 'indicator--dirty', title: 'Есть несохранённые изменения' }
        case 'synced':
            return { symbol: '✓', className: 'indicator--synced', title: 'Синхронизировано' }
        case 'syncing':
            return { symbol: '↻', className: 'indicator--syncing', title: 'Синхронизация…' }
        case 'update-available':
            return { symbol: '↓', className: 'indicator--update', title: 'Доступна новая версия с Drive' }
        case 'conflict':
            return { symbol: '⚠', className: 'indicator--conflict', title: getConflictTitle(s.conflictType) }
        case 'error':
            return { symbol: '✕', className: 'indicator--error', title: s.message }
    }
}
```

**Ключевое отличие от текущей реализации:** один `switch` вместо трёх независимых условий (`isDirty`, `hasUnsyncedChanges`, `syncStatus`). Невозможно отобразить противоречивую комбинацию индикаторов.

---

## 6. Новая логика синхронизации

### 6.1 Защита от race conditions: OperationToken

Каждой асинхронной операции присваивается уникальный токен. Перед применением результата проверяется, что токен не устарел:

```typescript
async saveActiveDocument(): Promise<boolean> {
    const session = this.state.documents.get(this.state.activeDocumentId!)
    if (!session || !session.ref?.fileId) return false

    // Генерируем токен операции
    const token = ++session.operationToken
    
    // Переход в syncing
    session.syncState = { status: 'syncing', previousState: session.syncState, operation: 'save' }

    try {
        const content = JSON.stringify(session.data, null, 2)
        const result = await this.googleApiService.saveFile(...)

        // Проверяем, что операция не устарела
        if (session.operationToken !== token) {
            console.warn('Save operation outdated, ignoring result')
            return false
        }

        if (result.status === 'success') {
            const fingerprint = computeFingerprint(session.data)
            session.syncState = {
                status: 'synced',
                lastSyncedAt: Date.now(),
                syncedFingerprint: fingerprint
            }
            // Обновляем ref...
            return true
        } else {
            session.syncState = {
                status: 'error',
                message: result.message || 'Ошибка сохранения',
                previousState: session.syncState  // Для восстановления
            }
            return false
        }
    } catch (error: any) {
        if (session.operationToken === token) {
            session.syncState = {
                status: 'error',
                message: error.message,
                previousState: session.syncState
            }
        }
        return false
    }
}
```

### 6.2 Обновлённый метод синхронизации

```typescript
async syncActiveDocumentWithDrive(): Promise<SyncResult> {
    const session = this.state.documents.get(this.state.activeDocumentId!)
    if (!session || !session.ref?.fileId) {
        return { status: 'error', message: 'Нет документа для синхронизации' }
    }

    // Защита от повторного запуска
    if (session.syncState.status === 'syncing') {
        return { status: 'error', message: 'Синхронизация уже выполняется' }
    }

    const token = ++session.operationToken
    const previousState = session.syncState

    session.syncState = { status: 'syncing', previousState, operation: 'check' }

    try {
        // Авторизация
        if (!this.googleApiService.isGoogleLoggedIn) {
            await this.googleApiService.logIn()
        }

        // Загрузка метаданных
        const remoteMetadata = await this.googleApiService.getFileMetadata(session.ref.fileId)
        const remoteModifiedAt = remoteMetadata.modifiedTime
            ? new Date(remoteMetadata.modifiedTime).getTime()
            : 0

        // Проверка токена после асинхронной операции
        if (session.operationToken !== token) {
            return { status: 'error', message: 'Синхронизация отменена' }
        }

        // Вычисляем отпечаток локальных данных
        const localFingerprint = computeFingerprint(session.data)

        // Определяем состояние
        const currentSyncedAt = previousState.status === 'synced' ? previousState.lastSyncedAt : 0
        const hasRemoteChanges = remoteModifiedAt > currentSyncedAt
        const hasLocalChanges = previousState.status === 'dirty' || 
                                 previousState.status === 'conflict' ||
                                 previousState.status === 'update-available'

        // ─── Ситуация 1: Изменены обе стороны ───
        if (hasLocalChanges && hasRemoteChanges) {
            session.syncState = {
                status: 'conflict',
                localFingerprint,
                remoteFingerprint: remoteMetadata.md5Checksum ?? '',
                conflictType: 'both-modified'
            }
            return {
                status: 'conflict',
                conflictType: 'both-modified',
                remoteMetadata,
                localFingerprint,
                remoteFingerprint: remoteMetadata.md5Checksum ?? ''
            }
        }

        // ─── Ситуация 2: Только локальные изменения ───
        if (hasLocalChanges && !hasRemoteChanges) {
            session.syncState = {
                status: 'conflict',
                localFingerprint,
                remoteFingerprint: remoteMetadata.md5Checksum ?? '',
                conflictType: 'local-only'
            }
            return {
                status: 'conflict',
                conflictType: 'local-only',
                remoteMetadata,
                localFingerprint,
                remoteFingerprint: remoteMetadata.md5Checksum ?? ''
            }
        }

        // ─── Ситуация 3: Только удалённые изменения ───
        if (!hasLocalChanges && hasRemoteChanges) {
            session.syncState = {
                status: 'update-available',
                lastSyncedAt: currentSyncedAt,
                localFingerprint,
                remoteFingerprint: remoteMetadata.md5Checksum ?? ''
            }
            return {
                status: 'conflict',
                conflictType: 'remote-only',
                remoteMetadata,
                localFingerprint,
                remoteFingerprint: remoteMetadata.md5Checksum ?? ''
            }
        }

        // ─── Ситуация 4: Нет изменений по меткам — проверяем содержимое ───
        const content = await this.googleApiService.downloadFileContent(session.ref.fileId)
        
        if (session.operationToken !== token) {
            return { status: 'error', message: 'Синхронизация отменена' }
        }

        const remoteData = parseDocumentContent(content)
        const remoteFingerprint = computeFingerprint(remoteData)

        if (localFingerprint === remoteFingerprint) {
            // Данные идентичны — подтверждаем синхронизацию
            session.syncState = {
                status: 'synced',
                lastSyncedAt: Date.now(),
                syncedFingerprint: localFingerprint
            }
            return { status: 'success' }
        }

        // Данные различаются при одинаковых метках — конфликт
        session.syncState = {
            status: 'conflict',
            localFingerprint,
            remoteFingerprint,
            conflictType: 'fingerprint-mismatch'
        }
        return {
            status: 'conflict',
            conflictType: 'fingerprint-mismatch',
            remoteMetadata,
            localFingerprint,
            remoteFingerprint
        }

    } catch (error: any) {
        if (session.operationToken === token) {
            session.syncState = {
                status: 'error',
                message: error.message,
                previousState
            }
        }
        return { status: 'error', message: error.message }
    }
}
```

### 6.3 Обновлённый метод редактирования

```typescript
updateActiveDocumentData(data: DocumentData) {
    if (!this.state.activeDocumentId) return
    const session = this.state.documents.get(this.state.activeDocumentId)
    if (!session) return

    // Блокируем обновление во время операций
    if (session.syncState.status === 'syncing') return

    session.data = data
    session.lastAccessedAt = Date.now()

    const fingerprint = computeFingerprint(data)

    switch (session.syncState.status) {
        case 'new':
        case 'synced':
            // Было чистое состояние → теперь есть изменения
            session.syncState = { status: 'dirty', localFingerprint: fingerprint }
            break

        case 'dirty':
            // Продолжаем редактирование — обновляем fingerprint
            session.syncState = { ...session.syncState, localFingerprint: fingerprint }
            break

        case 'update-available':
            // ⚠️ КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: не теряем информацию о новой версии на Drive!
            // Редактирование при наличии новой версии на Drive = конфликт
            session.syncState = {
                status: 'conflict',
                localFingerprint: fingerprint,
                remoteFingerprint: session.syncState.remoteFingerprint,
                conflictType: 'both-modified'
            }
            break

        case 'conflict':
            // Уже в конфликте — обновляем fingerprint локальной версии
            session.syncState = { ...session.syncState, localFingerprint: fingerprint }
            break

        case 'error':
            // При ошибке тоже разрешаем редактирование
            session.syncState = { status: 'dirty', localFingerprint: fingerprint }
            break
    }

    this.persistDocumentDataToLocalStorage(this.state.activeDocumentId)
    this.persistToLocalStorage()
}
```

### 6.4 Исправление `syncAllDocumentsWithDrive`

Вместо подмены `activeDocumentId` — синхронизация по произвольному `documentId`:

```typescript
async syncAllDocumentsWithDrive(): Promise<Map<DocumentId, SyncResult>> {
    const results = new Map<DocumentId, SyncResult>()
    const conflictIds: DocumentId[] = []

    for (const [id, session] of this.state.documents.entries()) {
        if (!session.ref?.fileId) continue
        if (session.syncState.status === 'syncing') continue

        // Синхронизируем напрямую по ID, без смены activeDocumentId
        const result = await this.syncDocumentWithDrive(id)
        results.set(id, result)

        if (result.status === 'conflict') {
            conflictIds.push(id)
        }
    }

    // Активируем первый документ с конфликтом для показа диалога
    if (conflictIds.length > 0) {
        this.activateDocument(conflictIds[0])
    }

    return results
}

/** Синхронизация конкретного документа без зависимости от activeDocumentId */
private async syncDocumentWithDrive(documentId: DocumentId): Promise<SyncResult> {
    const session = this.state.documents.get(documentId)
    if (!session || !session.ref?.fileId) {
        return { status: 'error', message: 'Нет документа для синхронизации' }
    }
    // ... та же логика, что в syncActiveDocumentWithDrive, но с documentId вместо activeDocumentId
}
```

### 6.5 Унификация путей сохранения

`SaveToDriveStore` не должен напрямую мутировать состояние документа. Вместо этого он должен вызывать методы `DocumentTabsStore`:

```typescript
// В SaveToDriveStore.saveFile(), после успешного сохранения:
if (result.status === 'success') {
    // Вместо прямой мутации activeDoc:
    //   activeDoc.state.isDirty = false
    //   activeDoc.state.syncStatus = 'synced'
    // Вызываем метод стора:
    this.documentTabsStore.onDocumentSavedToDrive(activeDoc.id, {
        fileId: result.file.id,
        name: result.file.name,
        // ...
    })
    this.close()
}
```

---

## 7. Обновлённый ConflictDialog

### 7.1 Новый API

```typescript
export type ConflictDialogProps = {
    open: boolean
    conflictType: ConflictType
    localFingerprint: string
    remoteFingerprint: string
    remoteMetadata: DriveFileMetadata
    onChooseLocal: () => void   // Сохранить локальную версию на Drive
    onChooseRemote: () => void  // Загрузить версию с Drive
    onCancel: () => void
}
```

### 7.2 Текст диалога по типу конфликта

| `conflictType` | Заголовок | Описание | Кнопки |
|---|---|---|---|
| `local-only` | 💾 Несохранённые изменения | «У вас есть изменения, которые не сохранены на Google Drive. Сохраните их, чтобы не потерять.» | [Сохранить на Drive] [Отмена] |
| `remote-only` | ☁️ Доступна новая версия | «На Google Drive есть более новая версия документа. Загрузка заменит локальные данные.» | [Загрузить с Drive] [Оставить локальную] [Отмена] |
| `both-modified` | ⚠️ Конфликт версий | «Документ изменён и локально, и на Google Drive. Выберите, какую версию сохранить. **Изменения в другой версии будут потеряны.**» | [Сохранить локальную на Drive] [Загрузить с Drive] [Отмена] |
| `fingerprint-mismatch` | ⚠️ Данные расходятся | «Локальные данные отличаются от данных на Drive, хотя временные метки совпадают. Это может быть вызвано редактированием в другом приложении.» | [Сохранить локальную на Drive] [Загрузить с Drive] [Отмена] |

---

## 8. Персистентность в localStorage

### 8.1 Проблема текущей реализации

`persistToLocalStorage()` сохраняет `hasUnsyncedChanges: session.state.isDirty`, что делает флаг бесполезным.

### 8.2 Предложение

Сохранять `syncState` целиком (кроме `syncing` — он не имеет смысла после перезапуска):

```typescript
private serializeSyncState(state: DocSyncState): SerializedSyncState {
    switch (state.status) {
        case 'syncing':
            // После перезапуска syncing-состояние не имеет смысла
            // Восстанавливаем предыдущее состояние или dirty
            return this.serializeSyncState(state.previousState)
        case 'synced':
            return { status: 'synced', lastSyncedAt: state.lastSyncedAt, syncedFingerprint: state.syncedFingerprint }
        case 'dirty':
            return { status: 'dirty', localFingerprint: state.localFingerprint }
        case 'conflict':
            return { status: 'conflict', conflictType: state.conflictType, localFingerprint: state.localFingerprint, remoteFingerprint: state.remoteFingerprint }
        // ... и т.д.
    }
}
```

При восстановлении из localStorage:
- `synced` → восстанавливается как есть, но при первом доступе к Drive будет проверка
- `dirty` → восстанавливается как `dirty` (пользователь видит оранжевый `●`)
- `conflict` → восстанавливается как `conflict` (пользователь видит красный `⚠`)
- `update-available` → восстанавливается как `update-available`
- `new` → восстанавливается как `new`

---

## 9. Матрица состояний: до и после

### 9.1 До (текущая реализация)

| Ситуация | `isDirty` | `hasUnsyncedChanges` | `syncStatus` | Индикатор | Проблема |
|---|---|---|---|---|---|
| Новый документ | `false` | `false` | `'offline'` | 📴 | Непонятно, что документ не сохранён |
| Редактирование | `true` | `false` | `'needs-sync'` | `*` + ⚠ | Два индикатора для одной ситуации |
| Синхронизирован | `false` | `false` | `'synced'` | ✓ | OK |
| Восстановлен с изменениями | `false` | `true` | `'offline'` | `*` + 📴 | `*` и `hasUnsyncedChanges` — одно и то же? |
| Drive новее | `false` | `false` | `'update-available'` | ☁️ | OK, но при редактировании информация теряется |
| Конфликт | `true` | `?` | `'needs-sync'` | `*` + ⚠ | Неотличимо от простого редактирования |

### 9.2 После (предложение)

| Ситуация | `syncState.status` | Индикатор | Однозначность |
|---|---|---|---|
| Новый документ | `new` | (пусто) | ✅ Понятно, что документ нигде не сохранён |
| Редактирование | `dirty` | `●` (оранжевый) | ✅ Один индикатор, однозначный смысл |
| Синхронизирован | `synced` | `✓` (зелёный) | ✅ |
| Восстановлен с изменениями | `dirty` | `●` (оранжевый) | ✅ Тот же смысл: есть несохранённые данные |
| Drive новее | `update-available` | `↓` (голубой) | ✅ Понятно, что нужно действие |
| Конфликт | `conflict` | `⚠` (красный, пульсация) | ✅ Однозначно: критическое состояние |
| Идёт синхронизация | `syncing` | `↻` (анимация) | ✅ |
| Ошибка | `error` | `✕` (красный) | ✅ |

---

## 10. План реализации

### Фаза 1: Фундамент (2–3 дня)

1. Создать тип `DocSyncState` и функцию `computeFingerprint()`
2. Добавить `syncState` и `operationToken` в `DocumentSession`
3. Реализовать геттеры-совместимости (`isDirty()`, `hasUnsyncedChanges()`, `syncStatus()`)
4. Обновить `persistToLocalStorage()` и `restoreFromLocalStorage()`
5. Написать unit-тесты на все переходы FSM

### Фаза 2: Миграция логики (2–3 дня)

1. Переписать `updateActiveDocumentData()` на switch по `syncState.status`
2. Переписать `saveActiveDocument()` с `operationToken`
3. Переписать `syncActiveDocumentWithDrive()` с fingerprint и токенами
4. Добавить `syncDocumentWithDrive(id)` для работы без `activeDocumentId`
5. Обновить `syncAllDocumentsWithDrive()`

### Фаза 3: UI (1–2 дня)

1. Обновить `DocumentTabs.tsx` — единый `switch` вместо трёх условий
2. Обновить CSS с цветовыми классами для каждого состояния
3. Обновить `Header.tsx` — использовать геттер `isDirty()`
4. Обновить `CalendarIconBar.tsx` — использовать `syncState` вместо отдельных флагов
5. Обновить `ConflictDialog` с новыми типами конфликтов

### Фаза 4: Унификация сохранения (1–2 дня)

1. Убрать прямую мутацию состояния из `SaveToDriveStore`
2. Добавить метод `onDocumentSavedToDrive()` в `DocumentTabsStore`
3. Обновить `App.tsx` — использовать геттеры совместимости

### Фаза 5: Тестирование (2–3 дня)

1. Unit-тесты на все переходы FSM
2. Integration-тесты на сценарии синхронизации
3. Ручное тестирование критических сценариев
4. Проверка миграции данных из старого формата localStorage

---

## 11. Гарантии отсутствия потери данных

Предложенное решение гарантирует защиту от потери изменений за счёт следующих механизмов:

| Механизм | Что защищает |
|---|---|
| **FSM с запрещёнными переходами** | Невозможно перейти из `synced` в состояние, где данные перезаписываются без подтверждения |
| **Fingerprint вместо timestamp** | Точное определение: данные действительно изменились или нет |
| **OperationToken** | Результат устаревшей асинхронной операции не перезапишет текущие данные |
| **Конфликт при `update-available` + edit** | Редактирование документа с новой версией на Drive → `conflict(both-modified)`, а не тихая потеря информации |
| **Нет автоматической перезаписи** | `syncDocumentWithDrive` **никогда** не перезаписывает локальные данные без явного выбора пользователя |
| **Fingerprint-mismatch** | Даже если временные метки совпадают, но содержимое различается — показан диалог |
| **Сохранение `syncState` в localStorage** | При перезапуске приложения состояние конфликта не теряется |

---

## 12. Связанные документы

- [`sync_logic_fix.md`](./sync_logic_fix.md) — Предыдущий анализ проблемы автоматической перезаписи
- [`has_unsynced_changes_flag_plan.md`](./has_unsynced_changes_flag_plan.md) — План флага `hasUnsyncedChanges` (текущая реализация с багом в `persistToLocalStorage`)
- [`unsaved_changes_prompt_refactor_plan_ru.md`](./unsaved_changes_prompt_refactor_plan_ru.md) — План рефакторинга диалога подтверждения
- [`document_sync_and_state_indication_analysis.md`](./document_sync_and_state_indication_analysis.md) — Альтернативный анализ от другого ассистента

---

## 13. Заключение

Корневая проблема текущей реализации — **три перекрывающихся флага** (`isDirty`, `hasUnsyncedChanges`, `syncStatus`), которые могут находиться в противоречивых комбинациях, и **отсутствие формальной модели переходов** между состояниями. Это приводит к тому, что:

1. Один и тот же визуальный индикатор (`*`) означает разные вещи
2. Информация о конфликтах теряется при редактировании
3. Автоматическая перезапись данных возможна без ведома пользователя
4. Race conditions не защищены

Предложенное решение — **конечный автомат `DocSyncState`** — делает некорректные состояния невыразимыми на уровне типов. Каждый статус однозначно определяет визуальную индикацию и доступные действия. Fingerprint и OperationToken обеспечивают точность определения конфликтов и защиту от гонок.
