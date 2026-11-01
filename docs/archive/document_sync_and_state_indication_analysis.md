# Анализ и предложения по улучшению индикации состояний документов и синхронизации

## Дата: 14 апреля 2026 г.

---

## 1. Введение

Настоящий документ содержит анализ текущей реализации индикации состояний документов в заголовках табов и механизма синхронизации между локальными данными и Google Drive. Выявлены недостатки текущей реализации и предложен новый подход, гарантирующий защиту от потери изменений.

---

## 2. Анализ текущей реализации

### 2.1 Архитектура состояний документа

Текущая реализация использует следующие флаги в `DocumentState`:

| Флаг | Назначение | Когда устанавливается | Когда сбрасывается |
|------|------------|----------------------|-------------------|
| `isDirty` | Есть изменения в текущей сессии | При редактировании | После сохранения в Drive |
| `hasUnsyncedChanges` | Были изменения на момент закрытия | При сохранении в localStorage | После синхронизации |
| `syncStatus` | Статус синхронизации | При различных операциях | При изменении состояния |
| `isLoading` | Идёт загрузка | При открытии/синхронизации | После завершения загрузки |
| `isSaving` | Идёт сохранение | При сохранении в Drive | После завершения сохранения |

**Статусы синхронизации (`SyncStatus`):**
- `'offline'` — документ работает в офлайн-режиме
- `'syncing'` — идёт синхронизация
- `'synced'` — синхронизирован с Google Drive
- `'needs-sync'` — есть несохранённые изменения
- `'update-available'` — доступна новая версия с Google Drive
- `'error'` — ошибка синхронизации

### 2.2 UI индикация в табах

**Файл:** `src/7-shared/ui/DocumentTabs/DocumentTabs.tsx`

Текущая реализация отображает:

1. **Modified Asterisk (`*`)** — показывается при `isDirty` или `hasUnsyncedChanges`
2. **Sync Status Icon** — показывается только для документов с `fileId`:
   - 📴 — offline
   - 🔄 — syncing (с анимацией вращения)
   - ✓ — synced
   - ⚠ — needs-sync
   - ☁️ — update-available
   - ❌ — error

### 2.3 Процесс синхронизации

**Файл:** `src/6-entities/Document\model\DocumentTabsStore.ts`

Текущий метод `syncActiveDocumentWithDrive()`:

```typescript
async syncActiveDocumentWithDrive(): Promise<SyncResult> {
    // Загрузка метаданных
    const remoteMetadata = await this.googleApiService.getFileMetadata(session.ref.fileId)
    const remoteModifiedAt = remoteMetadata.modifiedTime ? new Date(remoteMetadata.modifiedTime).getTime() : 0
    const localModifiedAt = session.state.lastSavedAt ?? 0

    const hasLocalChanges = session.state.isDirty
    const hasRemoteChanges = remoteModifiedAt > localModifiedAt

    // Если есть изменения с любой стороны — показываем диалог
    if (hasLocalChanges || hasRemoteChanges) {
        return {
            status: 'conflict',
            message: hasRemoteChanges ? 'Версия на Google Drive новее локальной' : 'Есть локальные изменения...',
            remoteMetadata,
            localModifiedAt,
            remoteModifiedAt,
            hasLocalChanges,
            hasRemoteChanges
        }
    }

    // Нет изменений — загружаем для проверки
    const content = await this.googleApiService.downloadFileContent(session.ref.fileId)
    session.data = parseDocumentContent(content)
    // ... обновление сторов
    return { status: 'success' }
}
```

---

## 3. Выявленные недостатки

### 3.1 **КРИТИЧЕСКИЙ: Непоследовательная семантика `isDirty` и `hasUnsyncedChanges`**

**Проблема:**

В `persistToLocalStorage()`:
```typescript
hasUnsyncedChanges: session.state.isDirty  // Сохраняем isDirty в hasUnsyncedChanges
```

В `DocumentTabs.tsx`:
```typescript
{(doc.state.isDirty || doc.state.hasUnsyncedChanges) && (
    <span className={styles.modifiedIndicator}>*</span>
)}
```

**Последствия:**
- Оба флага отображаются одинаково (одна звёздочка `*`)
- Пользователь не может различить "изменения в текущей сессии" и "изменения с предыдущей сессии"
- Tooltips пытаются объяснить разницу, но визуальная индикация идентична

### 3.2 **КРИТИЧЕСКИЙ: Потеря данных при синхронизации с несколькими документами**

**Проблема:**

Метод `syncAllDocumentsWithDrive()` временно переключает `activeDocumentId`:
```typescript
async syncAllDocumentsWithDrive(): Promise<Map<DocumentId, SyncResult>> {
    for (const [id, session] of this.state.documents.entries()) {
        if (session.ref?.fileId && session.state.syncStatus === 'offline') {
            const previousActiveId = this.state.activeDocumentId
            this.state.activeDocumentId = id  // ❌ Временная смена активного документа
            const result = await this.syncActiveDocumentWithDrive()
            this.state.activeDocumentId = previousActiveId
        }
    }
}
```

**Последствия:**
- Это может вызвать непредсказуемое поведение в UI (observer перерисовки)
- При возникновении конфликта в одном документе, пользователь не может корректно разрешить его для других документов
- Массовая синхронизация не обрабатывает конфликты корректно

### 3.3 **ВАЖНЫЙ: Нечёткое определение "конфликта"**

**Проблема:**

Текущая логика определяет конфликт как:
```typescript
const hasRemoteChanges = remoteModifiedAt > localModifiedAt
```

Это сравнивает время последнего сохранения с Drive (`lastSavedAt`) с временем модификации на Drive.

**Проблемы:**
1. `lastSavedAt` может быть неактуальным (например, если документ был восстановлен из localStorage)
2. Если два пользователя редактируют документ одновременно, временные метки могут не отражать реального состояния
3. Нет проверки **содержимого** — только метаданные

### 3.4 **ВАЖНЫЙ: Отсутствие защиты от гонок (Race Conditions)**

**Проблема:**

При быстром переключении между документами или быстрой синхронизации:
```typescript
// Пользователь переключается на документ B во время синхронизации документа A
this.state.activeDocumentId = id  // В syncActiveDocumentWithDrive
// ... асинхронная операция ...
// Пользователь уже на документе C, но синхронизация завершается для A
```

**Последствия:**
- Результат синхронизации может быть применён к неправильному документу
- Состояние UI может быть несогласованным

### 3.5 **СРЕДНИЙ: Неоднозначные статусы синхронизации**

**Проблема:**

| Ситуация | Текущий `syncStatus` | Проблема |
|----------|---------------------|----------|
| Документ без `fileId`, редактируется | `'offline'` | Пользователь не понимает, что нужно сохранить |
| Документ с `fileId`, редактируется | `'needs-sync'` | Непонятно, нужно ли сохранять или синхронизировать |
| Документ восстановлен из localStorage | `'offline'` | Непонятно, есть ли несохранённые изменения |
| Drive версия новее | `'update-available'` | Непонятно, что произойдёт при синхронизации |

### 3.6 **СРЕДНИЙ: Непоследовательная обработка `updateAvailable`**

**Проблема:**

При редактировании документа со статусом `'update-available'`:
```typescript
else if (session.state.syncStatus === 'update-available') {
    session.state.syncStatus = 'needs-sync'  // ❌ Сбрасываем без проверки
}
```

**Последствия:**
- Информация о том, что на Drive есть более новая версия, теряется
- При следующей синхронизации пользователь не узнает о конфликте
- Возможна потеря изменений с Drive

### 3.7 **МИНИМАЛЬНЫЙ: Недостаточная визуальная дифференциация**

**Проблема:**

- Все несохранённые изменения отображаются одинаково (`*`)
- Нет индикации "критичности" состояния
- Цветовая схема не выделяет критические состояния (например, конфликт)

---

## 4. Предложения по улучшению

### 4.1 Новая система визуальной индикации

#### 4.1.1 Многоуровневая система индикаторов

Предлагается использовать **три уровня** индикации:

| Уровень | Визуальный элемент | Когда показывается |
|---------|-------------------|-------------------|
| **Критический** | 🔴 (красный круг) + пульсация | Конфликт, ошибка синхронизации |
| **Важный** | 🟡 (жёлтый круг) или `*` (цветная) | Есть несохранённые изменения, требуется действие |
| **Информационный** | 🟢 (зелёная галочка) или серый значок | Синхронизировано, офлайн |

#### 4.1.2 Обновлённые индикаторы в табах

```typescript
// Новый подход: контекстные индикаторы

// 1. КРИТИЧЕСКИЙ: Конфликт или ошибка
{doc.state.syncStatus === 'error' && (
    <span className={styles.criticalIndicator} title="Ошибка синхронизации">
        ❌
    </span>
)}

// 2. ВАЖНЫЙ: Есть изменения (текущая сессия)
{doc.state.isDirty && doc.state.syncStatus !== 'syncing' && (
    <span className={styles.dirtyIndicator} title="Есть несохранённые изменения (текущая сессия)">
        ●
    </span>
)}

// 3. ВАЖНЫЙ: Есть изменения (предыдущая сессия)
{doc.state.hasUnsyncedChanges && !doc.state.isDirty && (
    <span className={styles.unsyncedIndicator} title="Есть несохранённые изменения (предыдущая сессия)">
        ⚠
    </span>
)}

// 4. ИНФОРМАЦИОННЫЙ: Доступна новая версия с Drive
{doc.state.syncStatus === 'update-available' && (
    <span className={styles.updateAvailableIndicator} title="Доступна новая версия с Google Drive">
        ☁️
    </span>
)}

// 5. ИНФОРМАЦИОННЫЙ: Синхронизировано
{doc.state.syncStatus === 'synced' && !doc.state.isDirty && (
    <span className={styles.syncedIndicator} title="Синхронизировано">
        ✓
    </span>
)}

// 6. ИНФОРМАЦИОННЫЙ: Офлайн
{doc.state.syncStatus === 'offline' && !doc.state.isDirty && (
    <span className={styles.offlineIndicator} title="Офлайн-режим">
        📴
    </span>
)}
```

#### 4.1.3 CSS стили для новых индикаторов

```css
/* Критический индикатор (красный, пульсирует) */
.criticalIndicator {
    color: #f44336;
    animation: pulse 1.5s ease-in-out infinite;
}

/* Важный индикатор: изменения в текущей сессии (оранжевый) */
.dirtyIndicator {
    color: #ff9800;
    font-size: 1.2em;
}

/* Важный индикатор: изменения с предыдущей сессии (жёлтый) */
.unsyncedIndicator {
    color: #ffc107;
    font-size: 1.1em;
}

/* Информационный: доступна новая версия (голубой) */
.updateAvailableIndicator {
    color: #03a9f4;
}

/* Информационный: синхронизировано (зелёный) */
.syncedIndicator {
    color: #4caf50;
}

/* Информационный: офлайн (серый) */
.offlineIndicator {
    color: #9e9e9e;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}
```

### 4.2 Новая модель синхронизации

#### 4.2.1 Разделение синхронизации на два этапа

**Этап 1: Проверка (Check)**
- Загружает метаданные с Drive
- Сравнивает с локальными данными
- Определяет наличие конфликтов
- **Не изменяет данные**

**Этап 2: Действие (Action)**
- Сохраняет локальную версию в Drive
- ИЛИ загружает удалённую версию
- ИЛИ выполняет слияние (в будущем)

#### 4.2.2 Обновлённый тип `SyncResult`

```typescript
export type SyncResult =
    // Успешная проверка, нет конфликтов
    | {
        status: 'success'
        action: 'none'  // Никаких действий не требуется
        localVersion: { modifiedAt: number; checksum: string }
        remoteVersion: { modifiedAt: number; checksum: string }
      }

    // Требуется действие пользователя (конфликт)
    | {
        status: 'conflict'
        action: 'user-decision-required'
        conflictType: 'both-modified' | 'remote-newer' | 'local-unsaved'
        localVersion: { modifiedAt: number; checksum: string; hasChanges: boolean }
        remoteVersion: { modifiedAt: number; checksum: string; hasChanges: boolean }
        remoteMetadata: DriveFileMetadata
      }

    // Ошибка
    | {
        status: 'error'
        action: 'error'
        message: string
        error?: Error
      }
```

**Обоснование изменений:**
1. Добавлен `checksum` — позволяет сравнивать содержимое, а не только временные метки
2. Добавлен `conflictType` — позволяет точно определить тип конфликта
3. Добавлен `action` — явно указывает, что делать дальше

#### 4.2.3 Обновлённый метод `syncActiveDocumentWithDrive`

```typescript
async syncActiveDocumentWithDrive(): Promise<SyncResult> {
    const session = this.state.documents.get(this.state.activeDocumentId!)
    if (!session || !session.ref?.fileId) {
        return {
            status: 'error',
            action: 'error',
            message: 'Нет документа для синхронизации'
        }
    }

    // Проверяем, не идёт ли уже синхронизация
    if (session.state.syncStatus === 'syncing') {
        return {
            status: 'error',
            action: 'error',
            message: 'Синхронизация уже выполняется'
        }
    }

    session.state.syncStatus = 'syncing'
    this.persistToLocalStorage()

    try {
        // Проверка авторизации
        const isLoggedIn = this.googleApiService.isGoogleLoggedIn
        if (!isLoggedIn) {
            await this.googleApiService.logIn()
        }

        // === ЭТАП 1: Проверка метаданных ===
        const remoteMetadata = await this.googleApiService.getFileMetadata(session.ref.fileId)
        const remoteModifiedAt = remoteMetadata.modifiedTime
            ? new Date(remoteMetadata.modifiedTime).getTime()
            : 0
        const localModifiedAt = session.state.lastSavedAt ?? 0

        const hasLocalChanges = session.state.isDirty
        const hasRemoteChanges = remoteModifiedAt > localModifiedAt

        // Вычисляем checksum локальных данных (для точного сравнения)
        const localChecksum = this.computeChecksum(session.data)

        // === ЭТАП 2: Определение ситуации ===

        // Ситуация 1: Обе стороны изменены (КОНФЛИКТ)
        if (hasLocalChanges && hasRemoteChanges) {
            session.state.syncStatus = 'needs-sync'
            this.persistToLocalStorage()

            return {
                status: 'conflict',
                action: 'user-decision-required',
                conflictType: 'both-modified',
                localVersion: {
                    modifiedAt: localModifiedAt,
                    checksum: localChecksum,
                    hasChanges: true
                },
                remoteVersion: {
                    modifiedAt: remoteModifiedAt,
                    checksum: remoteMetadata.md5Checksum ?? '',
                    hasChanges: true
                },
                remoteMetadata
            }
        }

        // Ситуация 2: Только локальные изменения
        if (hasLocalChanges && !hasRemoteChanges) {
            session.state.syncStatus = 'needs-sync'
            this.persistToLocalStorage()

            return {
                status: 'conflict',
                action: 'user-decision-required',
                conflictType: 'local-unsaved',
                localVersion: {
                    modifiedAt: localModifiedAt,
                    checksum: localChecksum,
                    hasChanges: true
                },
                remoteVersion: {
                    modifiedAt: remoteModifiedAt,
                    checksum: remoteMetadata.md5Checksum ?? '',
                    hasChanges: false
                },
                remoteMetadata
            }
        }

        // Ситуация 3: Только изменения на Drive
        if (!hasLocalChanges && hasRemoteChanges) {
            session.state.syncStatus = 'update-available'
            this.persistToLocalStorage()

            return {
                status: 'conflict',
                action: 'user-decision-required',
                conflictType: 'remote-newer',
                localVersion: {
                    modifiedAt: localModifiedAt,
                    checksum: localChecksum,
                    hasChanges: false
                },
                remoteVersion: {
                    modifiedAt: remoteModifiedAt,
                    checksum: remoteMetadata.md5Checksum ?? '',
                    hasChanges: true
                },
                remoteMetadata
            }
        }

        // Ситуация 4: Нет изменений — загружаем для проверки целостности
        const content = await this.googleApiService.downloadFileContent(session.ref.fileId)
        const remoteData = parseDocumentContent(content)
        const remoteChecksum = this.computeChecksum(remoteData)

        // Проверяем, действительно ли данные идентичны
        if (localChecksum === remoteChecksum) {
            // Данные идентичны — просто обновляем статус
            session.state.syncStatus = 'synced'
            session.state.lastSyncedAt = Date.now()
            session.state.lastLoadedAt = Date.now()
        } else {
            // Данные различаются (например, форматирование) — предлагаем пользователю решить
            session.state.syncStatus = 'update-available'
            this.persistToLocalStorage()

            return {
                status: 'conflict',
                action: 'user-decision-required',
                conflictType: 'remote-newer',
                localVersion: {
                    modifiedAt: localModifiedAt,
                    checksum: localChecksum,
                    hasChanges: false
                },
                remoteVersion: {
                    modifiedAt: remoteModifiedAt,
                    checksum: remoteChecksum,
                    hasChanges: true
                },
                remoteMetadata
            }
        }

        this.persistDocumentDataToLocalStorage(session.id)
        this.persistToLocalStorage()

        return {
            status: 'success',
            action: 'none',
            localVersion: { modifiedAt: localModifiedAt, checksum: localChecksum },
            remoteVersion: { modifiedAt: remoteModifiedAt, checksum: remoteChecksum }
        }

    } catch (error: any) {
        runInAction(() => {
            session.state.error = error.message
            session.state.syncStatus = 'error'
        })
        this.persistToLocalStorage()

        return {
            status: 'error',
            action: 'error',
            message: error.message,
            error: error instanceof Error ? error : new Error(error.message)
        }
    }
}

/** Вычислить CRC32/MD5 checksum данных для сравнения */
private computeChecksum(data: DocumentData): string {
    const jsonString = JSON.stringify(data)
    // Простой hash — можно улучшить до MD5/SHA
    let hash = 0
    for (let i = 0; i < jsonString.length; i++) {
        const char = jsonString.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32bit integer
    }
    return hash.toString(36)
}
```

### 4.3 Защита от гонок (Race Condition Prevention)

#### 4.3.1 Использование `syncToken` для каждой операции

```typescript
export type DocumentSession = {
    // ... существующие поля ...
    syncToken: number | null  // Токен текущей операции синхронизации
}

// В syncActiveDocumentWithDrive:
const syncToken = Date.now()  // Уникальный токен для этой операции
session.syncToken = syncToken

// ... асинхронные операции ...

// Перед применением результата:
if (session.syncToken !== syncToken) {
    // Операция устарела — пользователь переключился на другой документ
    console.warn('Sync operation outdated, ignoring result')
    return { status: 'error', message: 'Синхронизация отменена' }
}
```

#### 4.3.2 Блокировка переключения во время синхронизации

```typescript
// В activateDocument:
activateDocument(documentId: DocumentId) {
    const session = this.state.documents.get(documentId)
    if (!session) return

    // Не разрешаем переключаться на документ, который синхронизируется
    if (session.state.syncStatus === 'syncing') {
        console.warn('Cannot activate document during sync')
        return
    }

    // ... остальной код ...
}
```

### 4.4 Улучшенный ConflictDialog

#### 4.4.1 Новый дизайн диалога

```typescript
interface ConflictDialogProps {
    open: boolean
    conflictType: 'both-modified' | 'remote-newer' | 'local-unsaved'
    localVersion: {
        modifiedAt: number
        checksum: string
        hasChanges: boolean
        data?: DocumentData  // Для предпросмотра
    }
    remoteVersion: {
        modifiedAt: number
        checksum: string
        hasChanges: boolean
        data?: DocumentData  // Для предпросмотра
    }
    remoteMetadata: DriveFileMetadata
    onChooseLocal: () => void     // Сохранить в Drive
    onChooseRemote: () => void    // Загрузить с Drive
    onMerge?: () => void          // Слияние (в будущем)
    onCancel: () => void
}
```

#### 4.4.2 Обновлённый текст диалога

| Тип конфликта | Заголовок | Сообщение | Доступные действия |
|---------------|-----------|-----------|-------------------|
| `both-modified` | ⚠️ Конфликт версий | "Документ был изменён и локально, и на Google Drive после последней синхронизации. **Выберите, какая версия будет сохранена. Изменения в другой версии будут потеряны.**" | [Сохранить локальную в Drive] [Загрузить с Drive] [Отмена] |
| `remote-newer` | ☁️ Доступна новая версия | "На Google Drive есть более новая версия документа. **Загрузка перезапишет локальные данные.**" | [Загрузить с Drive] [Отмена] |
| `local-unsaved` | 💾 Несохранённые изменения | "У вас есть несохранённые изменения локально. **Сохраните их в Google Drive.**" | [Сохранить в Drive] [Отмена] |

### 4.5 Новая матрица состояний документа

| Сценарий | `isDirty` | `hasUnsyncedChanges` | `syncStatus` | Визуальный индикатор | Tooltip |
|----------|-----------|---------------------|--------------|---------------------|---------|
| Новый документ без `fileId` | `false` | `false` | `offline` | 📴 (серый) | "Офлайн-документ" |
| Новый документ редактируется | `true` | `false` | `needs-sync` | ● (оранжевый) | "Есть несохранённые изменения" |
| Документ с `fileId` открыт | `false` | `false` | `synced` | ✓ (зелёный) | "Синхронизировано" |
| Документ с `fileId` редактируется | `true` | `false` | `needs-sync` | ● (оранжевый) | "Есть несохранённые изменения" |
| Восстановлен с изменениями | `false` | `true` | `offline` | ⚠ (жёлтый) | "Есть изменения с предыдущей сессии" |
| Drive версия новее | `false` | `false` | `update-available` | ☁️ (голубой) | "Доступна новая версия с Drive" |
| Конфликт (обе стороны) | `true` | `true/false` | `needs-sync` | 🔴 (красный, пульсирует) | "Конфликт версий — требуется действие" |
| Ошибка синхронизации | `true/false` | `true/false` | `error` | ❌ (красный) | "Ошибка синхронизации" |
| Идёт синхронизация | `true/false` | `true/false` | `syncing` | 🔄 (с анимацией) | "Синхронизация..." |

### 4.6 Улучшенный метод `syncAllDocumentsWithDrive`

**Проблема:** Текущая реализация переключает `activeDocumentId`, что может вызвать гонки.

**Решение:** Синхронизировать каждый документ независимо от активного:

```typescript
async syncAllDocumentsWithDrive(): Promise<Map<DocumentId, SyncResult>> {
    const results: Map<DocumentId, SyncResult> = new Map()
    const conflicts: Map<DocumentId, SyncResult> = new Map()

    for (const [id, session] of this.state.documents.entries()) {
        if (!session.ref?.fileId) continue

        // Пропускаем документы, которые уже синхронизируются
        if (session.state.syncStatus === 'syncing') continue

        const result = await this.syncDocumentWithDrive(id)

        results.set(id, result)

        // Если возник конфликт, сохраняем для последующей обработки
        if (result.status === 'conflict') {
            conflicts.set(id, result)
        }
    }

    // Если есть конфликты, активируем первый и показываем диалог
    if (conflicts.size > 0) {
        const firstConflictId = conflicts.keys().next().value
        if (firstConflictId) {
            this.activateDocument(firstConflictId)
            // Показываем диалог конфликта (через callback)
            this.onConflictDetected?.(firstConflictId, conflicts.get(firstConflictId)!)
        }
    }

    return results
}

/** Синхронизировать конкретный документ (без изменения activeDocumentId) */
private async syncDocumentWithDrive(documentId: DocumentId): Promise<SyncResult> {
    const session = this.state.documents.get(documentId)
    if (!session || !session.ref?.fileId) {
        return { status: 'error', message: 'Нет документа для синхронизации' }
    }

    // ... та же логика, что и в syncActiveDocumentWithDrive, но без ссылки на activeDocumentId ...
}
```

### 4.7 Улучшенная обработка `updateAvailable` при редактировании

**Проблема:** Текущая реализация теряет информацию о новой версии на Drive.

**Решение:** Сохранять информацию и предупреждать пользователя:

```typescript
updateActiveDocumentData(data: DocumentData) {
    if (!this.state.activeDocumentId) return

    const session = this.state.documents.get(this.state.activeDocumentId)
    if (!session) return

    if (session.state.isSaving || session.state.isLoading) return

    session.data = data
    session.state.isDirty = true
    session.lastAccessedAt = Date.now()

    // Если документ был синхронизирован — требует сохранения
    if (session.state.syncStatus === 'synced') {
        session.state.syncStatus = 'needs-sync'
    }
    // Если была доступна новая версия с Drive — это теперь КОНФЛИКТ
    else if (session.state.syncStatus === 'update-available') {
        // ❌ НОВОЕ: Не сбрасываем, а помечаем как конфликт
        session.state.syncStatus = 'needs-sync'
        session.state.hasUnsyncedChanges = true  // Сохраняем информацию о конфликте
    }
    // Если уже требует синхронизации — ничего не меняем
    else if (session.state.syncStatus === 'needs-sync') {
        // Уже требует синхронизации, просто продолжаем
    }

    this.persistDocumentDataToLocalStorage(this.state.activeDocumentId)
    this.persistToLocalStorage()
}
```

---

## 5. Архитектурные рекомендации

### 5.1 Разделение ответственности

| Компонент | Ответственность |
|-----------|----------------|
| `DocumentTabsStore` | Управление жизненным циклом вкладок, персистентность |
| `DocumentSyncService` | Логика синхронизации (новый сервис) |
| `DocumentStateIndicator` | Визуальная индикация (новый компонент) |
| `ConflictResolver` | Разрешение конфликтов (улучшенный диалог) |

### 5.2 Новый сервис `DocumentSyncService`

```typescript
class DocumentSyncService {
    /**
     * Проверить состояние синхронизации документа.
     * Не изменяет данные, только возвращает результат проверки.
     */
    async checkSyncStatus(documentId: DocumentId): Promise<SyncCheckResult>

    /**
     * Сохранить документ в Drive.
     * Не загружает данные, только сохраняет.
     */
    async saveToDrive(documentId: DocumentId): Promise<SaveResult>

    /**
     * Загрузить документ из Drive.
     * Не сохраняет локально, только возвращает данные.
     */
    async loadFromDrive(documentId: DocumentId): Promise<LoadResult>

    /**
     * Выполнить полную синхронизацию с разрешением конфликтов.
     * Высокоуровневый метод, использующий check/save/load.
     */
    async syncDocument(documentId: DocumentId, options: SyncOptions): Promise<SyncResult>
}
```

### 5.3 Паттерн "Единственный источник истины"

**Проблема:** Сейчас есть несколько источников истины:
1. `session.data` (локальные данные в памяти)
2. `localStorage` (персистентные данные)
3. Google Drive (удалённые данные)
4. `lastSavedAt`, `lastSyncedAt` (временные метки)

**Решение:** Определить чёткую иерархию:

```
Приоритет данных (от высшего к низшему):

1.session.data (в памяти)  ← Текущие данные, с которыми работает пользователь
    ↓ (персистятся в)
2.localStorage             ← Резервная копия, восстанавливается при перезапуске
    ↓ (синхронизируется с)
3.Google Drive             ← Облачное хранилище, источник истины для синхронизации
```

**Правила:**
- `session.data` всегда имеет наивысший приоритет
- `localStorage` — только для восстановления, не для синхронизации
- `Google Drive` — для синхронизации и совместной работы

---

## 6. План реализации

### Фаза 1: Критические исправления (1-2 дня)

| Задача | Файлы | Приоритет |
|--------|-------|-----------|
| Добавить `syncToken` для защиты от гонок | `DocumentTabsStore.types.ts`, `DocumentTabsStore.ts` | 🔴 Критический |
| Улучшить визуальную дифференциацию индикаторов | `DocumentTabs.tsx`, `DocumentTabs.module.css` | 🔴 Критический |
| Добавить `checksum` в `SyncResult` | `DocumentTabsStore.types.ts`, `DocumentTabsStore.ts` | 🔴 Критический |

### Фаза 2: Улучшение синхронизации (2-3 дня)

| Задача | Файлы | Приоритет |
|--------|-------|-----------|
| Разделить синхронизацию на check/action | `DocumentTabsStore.ts` | 🟡 Важный |
| Обновить `ConflictDialog` с новыми типами конфликтов | `ConflictDialog.tsx`, `types.ts` | 🟡 Важный |
| Улучшить обработку `updateAvailable` | `DocumentTabsStore.ts` | 🟡 Важный |
| Улучшить `syncAllDocumentsWithDrive` | `DocumentTabsStore.ts` | 🟡 Важный |

### Фаза 3: Рефакторинг (3-5 дней)

| Задача | Файлы | Приоритет |
|--------|-------|-----------|
| Вынести логику синхронизации в `DocumentSyncService` | Новый сервис | 🟢 Средний |
| Создать `DocumentStateIndicator` компонент | Новый компонент | 🟢 Средний |
| Обновить тесты для новых сценариев | Тестовые файлы | 🟢 Средний |

### Фаза 4: Тестирование и полировка (2-3 дня)

| Задача | Статус |
|--------|--------|
| Unit-тесты на все сценарии синхронизации | ⏳ |
| Integration-тесты на UI индикацию | ⏳ |
| Ручное тестирование всех сценариев | ⏳ |
| Документация пользователя | ⏳ |

---

## 7. Сценарии использования (после реализации)

### 7.1 Сценарий A: Обычное редактирование

```
1. Пользователь открывает документ с Drive
   └─> syncStatus: 'synced' ✓
   └─> isDirty: false

2. Пользователь редактирует
   └─> isDirty: true
   └─> syncStatus: 'needs-sync'
   └─> Индикатор: ● (оранжевый)

3. Пользователь сохраняет
   └─> saveActiveDocument()
   └─> isDirty: false
   └─> syncStatus: 'synced'
   └─> Индикатор: ✓ (зелёный)
```

### 7.2 Сценарий B: Конфликт изменений

```
1. Пользователь открывает документ
   └─> syncStatus: 'synced' ✓

2. Другой пользователь редактирует тот же документ в Drive

3. Первый пользователь нажимает "Синхронизировать"
   └─> syncActiveDocumentWithDrive()
   └─> Результат: conflictType: 'remote-newer'
   └─> syncStatus: 'update-available'
   └─> Показан ConflictDialog: "Доступна новая версия с Drive"

4. Пользователь выбирает "Загрузить с Drive"
   └─> Данные обновляются из Drive
   └─> syncStatus: 'synced'
   └─> Индикатор: ✓ (зелёный)
```

### 7.3 Сценарий C: Конфликт с обеих сторон

```
1. Пользователь A редактирует документ локально
   └─> isDirty: true

2. Пользователь B редактирует тот же документ в Drive

3. Пользователь A нажимает "Синхронизировать"
   └─> syncActiveDocumentWithDrive()
   └─> Результат: conflictType: 'both-modified'
   └─> Индикатор: 🔴 (красный, пульсирует)
   └─> Показан ConflictDialog: "Конфликт версий"

4. Пользователь A выбирает "Сохранить локальную в Drive"
   └─> saveActiveDocument()
   └─> Drive перезаписан локальной версией
   └─> syncStatus: 'synced'
   └─> Индикатор: ✓ (зелёный)
```

### 7.4 Сценарий D: Восстановление из localStorage

```
1. Пользователь редактирует документ, закрывает браузер
   └─> isDirty: true → hasUnsyncedChanges: true (в localStorage)

2. Пользователь открывает приложение
   └─> isDirty: false (новая сессия)
   └─> hasUnsyncedChanges: true
   └─> syncStatus: 'offline'
   └─> Индикатор: ⚠ (жёлтый)

3. Пользователь нажимает "Синхронизировать"
   └─> syncActiveDocumentWithDrive()
   └─> ... проверка ...
   └─> hasUnsyncedChanges: false
   └─> syncStatus: 'synced'
   └─> Индикатор: ✓ (зелёный)
```

---

## 8. Критерии приёмки

### 8.1 Функциональные критерии

- [ ] Локальные изменения не теряются при синхронизации
- [ ] Диалог конфликта показывается при любых расхождениях
- [ ] Индикаторы визуально различают разные состояния
- [ ] Пользователь всегда понимает, какое действие требуется
- [ ] Нет гонок при быстром переключении документов

### 8.2 Нефункциональные критерии

- [ ] Время отклика UI < 100ms при переключении табов
- [ ] Синхронизация документа (1 МБ) < 3 секунд
- [ ] Нет утечек памяти при длительной работе
- [ ] Код покрыт тестами > 80%

### 8.3 UX критерии

- [ ] Пользователь может объяснить, что означает каждый индикатор
- [ ] Пользователь не теряет данные при стандартных сценариях
- [ ] Пользователь контролирует, какая версия будет сохранена
- [ ] Диалог конфликта понятен без дополнительной документации

---

## 9. Риски и митигация

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Обратная несовместимость с old localStorage | Средняя | Высокое | Graceful degradation: проверка структуры снимка |
| Checksum может быть медленным на больших данных | Низкая | Среднее | Использовать быстрый hash (CRC32), кэшировать |
| Пользователи привыкли к старой индикации | Средняя | Низкое | Пошаговый rollout с документацией |
| Выделение `DocumentSyncService` потребует рефакторинга | Высокая | Среднее | Поэтапный рефакторинг, фаза 3 |

---

## 10. Глоссарий

| Термин | Определение |
|--------|-------------|
| **Сессия** | Период работы приложения между открытием и закрытием |
| **isDirty** | Флаг изменений в текущей сессии |
| **hasUnsyncedChanges** | Флаг изменений с предыдущей сессии |
| **syncStatus** | Текущий статус синхронизации |
| **conflictType** | Тип конфликта: `both-modified`, `remote-newer`, `local-unsaved` |
| **checksum** | Хэш данных для точного сравнения |
| **syncToken** | Токен операции для защиты от гонок |
| **Check** | Этап проверки состояния синхронизации |
| **Action** | Этап действия (сохранить/загрузить) |

---

## 11. Связанные документы

- [`sync_logic_fix.md`](./sync_logic_fix.md) — Предыдущее исправление логики синхронизации
- [`has_unsynced_changes_flag_plan.md`](./has_unsynced_changes_flag_plan.md) — План реализации флага hasUnsyncedChanges
- [`multi_document_support_plan.md`](./multi_document_support_plan.md) — Поддержка нескольких документов
- [`google_drive_document_lifecycle_plan.md`](./google_drive_document_lifecycle_plan.md) — Жизненный цикл документа в Google Drive

---

## 12. Заключение

**Ключевые проблемы текущей реализации:**

1. **Визуальная индикация не различает состояния** — все несохранённые изменения выглядят одинаково
2. **Потенциальная потеря данных** при синхронизации из-за автоматической загрузки
3. **Отсутствие защиты от гонок** при быстром переключении документов
4. **Нечёткое определение конфликтов** — сравнение только по временным меткам
5. **Потеря информации** о новой версии на Drive при начале редактирования

**Предложенные решения гарантируют:**

✅ **Защита данных** — локальные изменения никогда не перезаписываются автоматически  
✅ **Контроль пользователя** — выбор версии всегда за пользователем  
✅ **Прозрачность** — пользователь видит точное состояние всех версий  
✅ **Надёжность** — защита от гонок и корректная обработка конфликтов  
✅ **Ясность** — каждый индикатор имеет уникальную визуальную форму и смысл

---

## 13. История изменений

| Версия | Дата | Автор | Изменения |
|--------|------|-------|-----------|
| 1.0 | 14.04.2026 | AI Assistant | Первоначальная версия |
