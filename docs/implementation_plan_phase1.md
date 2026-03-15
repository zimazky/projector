# План реализации многодокументной поддержки — Этап 1

## Дата: 14 марта 2026 г.

## Статус: В работе (30% завершено)

---

## 1. Резюме проекта

### 1.1 Цель

Переход от архитектуры с одним документом к многодокументной архитектуре с:
- Вкладками для переключения между документами
- Автосохранением в localStorage
- Синхронизацией с Google Drive по требованию
- Защитой от потери данных

### 1.2 Текущий прогресс

| Компонент | Статус | Примечание |
|-----------|--------|------------|
| DocumentTabsStore | ✅ Готово | Базовая реализация завершена |
| DocumentTabs UI | ✅ Готово | Компонент вкладок создан |
| Интеграция в App | ✅ Готово | Вкладки отображаются |
| MigrationService | ✅ Готово | Миграция данных реализована |
| CalendarIconBar | ⚠️ Требует обновления | Нужна адаптация под новую логику |
| Sync Logic | ⚠️ Требует обновления | Нужен диалог выбора версии |
| ConflictDialog | ❌ Не создан | Требуется реализация |

**Общий прогресс: ~30%**

---

## 2. Дорожная карта

### Фаза 1: Базовая инфраструктура (✅ Завершено)

| ID | Задача | Статус | Время | Файлы |
|----|--------|--------|-------|-------|
| 1.1 | Создать DocumentTabsStore.types.ts | ✅ Готово | 1ч | `src/6-entities/Document/model/DocumentTabsStore.types.ts` |
| 1.2 | Создать DocumentTabsStore.ts | ✅ Готово | 4ч | `src/6-entities/Document/model/DocumentTabsStore.ts` |
| 1.3 | Обновить root.ts | ✅ Готово | 0.5ч | `src/1-app/root.ts` |
| 1.4 | Обновить StoreContext.ts | ✅ Готово | 0.5ч | `src/1-app/Providers/StoreContext.ts` |
| 1.5 | Обновить index.tsx | ✅ Готово | 0.5ч | `src/1-app/index.tsx` |
| 1.6 | Создать MigrationService.ts | ✅ Готово | 1ч | `src/1-app/Stores/MigrationService.ts` |
| 1.7 | Обновить MainStore.ts | ✅ Готово | 1ч | `src/1-app/Stores/MainStore.ts` |

**Итого фаза 1: 8.5 часов** ✅

### Фаза 2: UI компонент вкладок (✅ Завершено)

| ID | Задача | Статус | Время | Файлы |
|----|--------|--------|-------|-------|
| 2.1 | Создать DocumentTabs.tsx | ✅ Готово | 2ч | `src/7-shared/ui/DocumentTabs/DocumentTabs.tsx` |
| 2.2 | Создать DocumentTabs.module.css | ✅ Готово | 1ч | `src/7-shared/ui/DocumentTabs/DocumentTabs.module.css` |
| 2.3 | Обновить App.tsx | ✅ Готово | 2ч | `src/1-app/App/App.tsx` |
| 2.4 | Обновить App.css | ✅ Готово | 0.5ч | `src/1-app/App/App.css` |

**Итого фаза 2: 5.5 часов** ✅

### Фаза 3: Обновление CalendarIconBar (⚠️ В работе)

| ID | Задача | Статус | Время | Файлы |
|----|--------|--------|-------|-------|
| 3.1 | Удалить избыточные функции | ❌ | 0.5ч | `src/4-widgets/CalendarIconBar/CalendarIconBar.tsx` |
| 3.2 | Обновить handleSaveCurrentDocument | ❌ | 0.5ч |同上 |
| 3.3 | Создать handleSyncActiveDocument | ❌ | 1ч |同上 |
| 3.4 | Создать handleSyncAllDocuments | ❌ | 0.5ч |同上 |
| 3.5 | Обновить icons array | ❌ | 1ч |同上 |
| 3.6 | Обновить menu array | ❌ | 0.5ч |同上 |
| 3.7 | Добавить badge индикаторы | ❌ | 1ч |同上 + CSS |
| 3.8 | Обновить tooltip | ❌ | 0.5ч |同上 |

**Итого фаза 3: 5.5 часов** ⏳

### Фаза 4: Механизм синхронизации (❌ Не начато)

| ID | Задача | Статус | Время | Файлы |
|----|--------|--------|-------|-------|
| 4.1 | Обновить SyncResult тип | ❌ | 0.5ч | `src/6-entities/Document/model/DocumentTabsStore.types.ts` |
| 4.2 | Обновить syncActiveDocumentWithDrive | ❌ | 2ч | `src/6-entities/Document/model/DocumentTabsStore.ts` |
| 4.3 | Создать ConflictDialog компонент | ❌ | 3ч | `src/7-shared/ui/ConflictDialog/` |
| 4.4 | Интегрировать ConflictDialog | ❌ | 1ч | `src/4-widgets/CalendarIconBar/CalendarIconBar.tsx` |
| 4.5 | Тестирование сценариев | ❌ | 2ч | Ручное тестирование |

**Итого фаза 4: 8.5 часов** ⏳

### Фаза 5: Тестирование и отладка (❌ Не начато)

| ID | Задача | Статус | Время | Файлы |
|----|--------|--------|-------|-------|
| 5.1 | Unit-тесты DocumentTabsStore | ❌ | 3ч | `src/6-entities/Document/model/DocumentTabsStore.test.ts` |
| 5.2 | Integration-тесты App | ❌ | 2ч | `src/1-app/App/App.test.tsx` |
| 5.3 | E2E тесты | ❌ | 4ч | `e2e/multi-document.spec.ts` |
| 5.4 | Тестирование миграции | ❌ | 1ч | Ручное тестирование |
| 5.5 | Исправление багов | ❌ | 4ч | По мере выявления |

**Итого фаза 5: 14 часов** ⏳

---

## 3. Детальный план работ

### Фаза 3: Обновление CalendarIconBar

#### 3.1 Удалить избыточные функции

**Файл:** `src/4-widgets/CalendarIconBar/CalendarIconBar.tsx`

```typescript
// ❌ УДАЛИТЬ:
const handleSaveAsToDrive = () => { ... }  // Строки ~45-54
const handleLoadLastOpenedDocument = async () => { ... }  // Строки ~118-128
```

**Обоснование:**
- `handleSaveAsToDrive` — избыточно, есть SaveToDrive диалог
- `handleLoadLastOpenedDocument` — автовосстановление при запуске

---

#### 3.2 Обновить handleSaveCurrentDocument

**Текущая версия:**
```typescript
const handleSaveCurrentDocument = async () => {
    if (!activeDoc?.ref?.fileId) {
        alert('Нет открытого документа для сохранения. Используйте "Сохранить как...".')
        return false
    }

    const isSaved = await documentTabsStore.saveActiveDocument()
    if (!isSaved && activeDoc.state.error) {
        alert(activeDoc.state.error)
    }
    return isSaved
}
```

**Изменения:** Не требуются, функция готова.

---

#### 3.3 Создать handleSyncActiveDocument

```typescript
const handleSyncActiveDocument = async () => {
    if (!activeDoc?.ref?.fileId) {
        alert('Документ не связан с Google Drive')
        return
    }
    
    const result = await documentTabsStore.syncActiveDocumentWithDrive()
    
    if (result.status === 'conflict') {
        // Показать диалог выбора версии
        setConflictDialogOpen(true)
        setConflictDialogData(result)
    } else if (result.status === 'error') {
        alert(result.message)
    }
    // success — данные уже обновлены
}
```

**State для диалога:**
```typescript
const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
const [conflictDialogData, setConflictDialogData] = useState<SyncResult | null>(null)
```

---

#### 3.4 Создать handleSyncAllDocuments

```typescript
const handleSyncAllDocuments = async () => {
    const results = await documentTabsStore.syncAllDocumentsWithDrive()
    
    let successCount = 0
    let errorCount = 0
    let conflictCount = 0
    
    results.forEach((result) => {
        if (result.status === 'success') successCount++
        else if (result.status === 'error') errorCount++
        else if (result.status === 'conflict') conflictCount++
    })
    
    if (errorCount > 0 || conflictCount > 0) {
        alert(`Синхронизация завершена:
✅ Успешно: ${successCount}
❌ Ошибок: ${errorCount}
⚠️ Конфликтов: ${conflictCount}`)
    }
}
```

---

#### 3.5 Обновить icons array

**Текущая структура:**
```typescript
let icons: IconItem[] = []

icons.push({
    name: '',
    jsx: (<SwgIcon><Menu /></SwgIcon>),
    fn: () => uiStore.toggleMenu(true)
})

icons.push({
    name: 'Сохранить локально',
    jsx: (
        <SwgIcon>
            <Diskette />
            {storageService.isSyncWithLocalstorage || <ModifiedAsterisk />}
        </SwgIcon>
    ),
    fn: storageService.saveToLocalStorage
})

// ... другие кнопки
```

**Новая структура:**
```typescript
let icons: IconItem[] = []

// 1. Меню
icons.push({
    name: '',
    jsx: (<SwgIcon><Menu /></SwgIcon>),
    fn: () => uiStore.toggleMenu(true)
})

// 2. Новый документ
icons.push({
    name: 'Новый документ',
    jsx: (<SwgIcon><DocumentPlus /></SwgIcon>),
    fn: handleCreateNewDocument
})

// 3. Открыть из Drive
icons.push({
    name: 'Открыть из Google Drive',
    jsx: (
        <SwgIcon>
            <Google />
            <DownloadSign />
        </SwgIcon>
    ),
    fn: handleOpenDriveFilePicker
})

// 4. Сохранить (только если авторизован и есть fileId)
if (googleApiService.isGoogleLoggedIn && activeDoc?.ref?.fileId) {
    icons.push({
        name: 'Сохранить',
        jsx: (
            <SwgIcon>
                <Google />
                <UploadSign />
                {activeDoc?.state.isDirty && <ModifiedAsterisk />}
            </SwgIcon>
        ),
        fn: handleSaveCurrentDocument
    })
}

// 5. Синхронизировать (только если авторизован и есть fileId)
if (googleApiService.isGoogleLoggedIn && activeDoc?.ref?.fileId) {
    icons.push({
        name: 'Синхронизировать',
        jsx: (
            <SwgIcon>
                <Sync />
                {(activeDoc?.state.isDirty || activeDoc?.state.syncStatus === 'offline') && (
                    <span className="badge">⚠</span>
                )}
            </SwgIcon>
        ),
        fn: handleSyncActiveDocument
    })
}

// 6. Погода
icons.push({
    name: 'Загрузить погоду',
    jsx: (
        <SwgIcon>
            <Weather />
            <DownloadSign />
        </SwgIcon>
    ),
    fn: weatherStore.loadForecast
})

// 7. Полный экран
icons.push({
    name: 'Полный экран',
    jsx: (<SwgIcon><Fullscreen /></SwgIcon>),
    fn: fullScreen
})
```

---

#### 3.6 Обновить menu array

**Новая структура:**
```typescript
let menu: MenuItem[] = []

// Google авторизация
if (googleApiService.isGoogleLoggedIn) {
    menu.push({ name: 'Выйти', fn: googleApiService.logOut })
} else {
    menu.push({ name: 'Войти', fn: googleApiService.logIn })
}

menu.push({ name: 'Новый документ', fn: handleCreateNewDocument })
menu.push({ name: 'Закрыть документ', fn: handleCloseDocument })

menu.push({ name: '———' }) // Разделитель

// Действия с документами (только если авторизован)
if (googleApiService.isGoogleLoggedIn) {
    menu.push({ 
        name: `Сохранить активный документ${activeDoc?.state.isDirty ? ' *' : ''}`, 
        fn: handleSaveCurrentDocument,
        disabled: !activeDoc?.ref?.fileId
    })
    
    menu.push({ 
        name: 'Синхронизировать активный', 
        fn: handleSyncActiveDocument,
        disabled: !activeDoc?.ref?.fileId
    })
    
    const offlineCount = documentTabsStore.offlineDocumentsCount
    menu.push({ 
        name: `Синхронизировать все${offlineCount > 0 ? ` (${offlineCount})` : ''}`, 
        fn: handleSyncAllDocuments,
        disabled: offlineCount === 0
    })
}

menu.push({ name: '———' }) // Разделитель

// Переключение режима
if (uiStore.viewMode !== 'Calendar') {
    menu.push({
        name: 'Calendar',
        fn: () => uiStore.changeViewMode({ mode: 'Calendar' })
    })
}

if (uiStore.viewMode !== 'Projects') {
    menu.push({
        name: 'Projects',
        fn: () => uiStore.changeViewMode({ mode: 'Projects' })
    })
}
```

---

#### 3.7 Добавить badge индикаторы

**CSS (CalendarIconBar.css):**
```css
.icon-bar-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
}

.badge {
    position: absolute;
    top: -6px;
    right: -6px;
    background: #ff9800;
    color: white;
    font-size: 10px;
    padding: 2px 5px;
    border-radius: 10px;
    min-width: 16px;
    text-align: center;
    font-weight: bold;
    border: 2px solid white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

.badge--error {
    background: #f44336;
}

.badge--success {
    background: #4caf50;
}
```

---

#### 3.8 Обновить tooltip

**Функция для tooltip:**
```typescript
const getSyncStatusTitle = (status: string, isDirty: boolean): string => {
    if (isDirty) {
        return 'Есть несохранённые изменения'
    }
    
    switch (status) {
        case 'offline':
            return 'Требуется синхронизация с Google Drive'
        case 'syncing':
            return 'Синхронизация...'
        case 'synced':
            return 'Синхронизировано'
        case 'needs-sync':
            return 'Есть изменения для синхронизации'
        case 'error':
            return 'Ошибка синхронизации'
        default:
            return ''
    }
}

// Использование:
title={getSyncStatusTitle(activeDoc?.state.syncStatus || 'offline', activeDoc?.state.isDirty)}
```

---

### Фаза 4: Механизм синхронизации

#### 4.1 Обновить SyncResult тип

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.types.ts`

```typescript
export type SyncResult =
    | { status: 'success' }
    | {
        status: 'conflict'
        message: string
        remoteMetadata: DriveFileMetadata
        localModifiedAt: number
        remoteModifiedAt: number
        hasLocalChanges: boolean      // ← НОВОЕ
        hasRemoteChanges: boolean     // ← НОВОЕ
      }
    | { status: 'error'; message: string }
```

---

#### 4.2 Обновить syncActiveDocumentWithDrive

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.ts`

**Ключевые изменения:**
```typescript
async syncActiveDocumentWithDrive(): Promise<SyncResult> {
    // ... проверка fileId, авторизация ...
    
    const remoteMetadata = await this.googleApiService.getFileMetadata(session.ref.fileId)
    const remoteModifiedAt = remoteMetadata.modifiedTime
        ? new Date(remoteMetadata.modifiedTime).getTime()
        : 0
    const localModifiedAt = session.state.lastSavedAt ?? 0
    
    // === КЛЮЧЕВОЕ ИЗМЕНЕНИЕ ===
    const hasLocalChanges = session.state.isDirty
    const hasRemoteChanges = remoteModifiedAt > localModifiedAt
    
    // Если есть изменения с любой стороны — показываем диалог
    if (hasLocalChanges || hasRemoteChanges) {
        session.state.syncStatus = 'needs-sync'
        this.persistToLocalStorage()

        return {
            status: 'conflict',
            message: hasRemoteChanges 
                ? 'Версия на Google Drive новее локальной'
                : 'Есть локальные изменения, не сохранённые в Drive',
            remoteMetadata,
            localModifiedAt,
            remoteModifiedAt,
            hasLocalChanges,      // ← НОВОЕ
            hasRemoteChanges      // ← НОВОЕ
        }
    }
    
    // Нет изменений — загружаем для проверки
    // ...
}
```

---

#### 4.3 Создать ConflictDialog компонент

**Структура папок:**
```
src/7-shared/ui/ConflictDialog/
├── ConflictDialog.tsx
├── ConflictDialog.module.css
├── index.ts
└── types.ts
```

**types.ts:**
```typescript
import type { DriveFileMetadata } from 'src/7-shared/services/gapi'

export interface ConflictDialogProps {
    open: boolean
    localModifiedAt: number
    remoteModifiedAt: number
    hasLocalChanges: boolean
    hasRemoteChanges: boolean
    remoteMetadata: DriveFileMetadata
    onChooseLocal: () => void
    onChooseRemote: () => void
    onCancel: () => void
}
```

**ConflictDialog.tsx:**
```typescript
import React from 'react'
import Dialog from 'src/7-shared/ui/Dialog/Dialog'
import Button from 'src/7-shared/ui/Button/Button'
import type { ConflictDialogProps } from './types'

import styles from './ConflictDialog.module.css'

const ConflictDialog: React.FC<ConflictDialogProps> = ({
    open,
    localModifiedAt,
    remoteModifiedAt,
    hasLocalChanges,
    hasRemoteChanges,
    remoteMetadata,
    onChooseLocal,
    onChooseRemote,
    onCancel
}) => {
    const formatDate = (ts: number) => new Date(ts).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
    
    const getTitle = () => {
        if (hasLocalChanges && hasRemoteChanges) {
            return '⚠️ Обнаружены изменения с обеих сторон'
        }
        if (hasRemoteChanges) {
            return '⚠️ Версия на Google Drive новее'
        }
        if (hasLocalChanges) {
            return '💾 Есть несохранённые изменения'
        }
        return '✓ Синхронизация не требуется'
    }
    
    const getMessage = () => {
        if (hasLocalChanges && hasRemoteChanges) {
            return (
                <>
                    <p>Обнаружены изменения и локально, и на Google Drive.</p>
                    <p className={styles.warning}>
                        <strong>Важно:</strong> Выбор версии приведёт к потере изменений в другой версии.
                    </p>
                </>
            )
        }
        if (hasRemoteChanges) {
            return (
                <>
                    <p>Версия на Google Drive была изменена после последней синхронизации.</p>
                    <p className={styles.warning}>
                        <strong>Внимание:</strong> Загрузка версии с Drive перезапишет локальные изменения.
                    </p>
                </>
            )
        }
        if (hasLocalChanges) {
            return (
                <>
                    <p>У вас есть изменения, которые не сохранены в Google Drive.</p>
                    <p>Выберите действие:</p>
                </>
            )
        }
        return <p>Данные синхронизированы.</p>
    }
    
    return (
        <Dialog 
            open={open} 
            onClose={onCancel}
            title={getTitle()}
        >
            <div className={styles.content}>
                {getMessage()}
                
                <table className={styles.versionComparison}>
                    <thead>
                        <tr>
                            <th>Версия</th>
                            <th>Дата изменения</th>
                            <th>Статус</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className={hasLocalChanges ? styles.highlight : ''}>
                            <td>📁 Локальная</td>
                            <td>{formatDate(localModifiedAt)}</td>
                            <td>
                                {hasLocalChanges && (
                                    <span className={`${styles.badge} ${styles.badgeWarning}`}>
                                        Изменена
                                    </span>
                                )}
                                {!hasLocalChanges && <span className={styles.ok}>Актуальна</span>}
                            </td>
                        </tr>
                        <tr className={hasRemoteChanges ? styles.highlight : ''}>
                            <td>☁️ Google Drive</td>
                            <td>{formatDate(remoteModifiedAt)}</td>
                            <td>
                                {hasRemoteChanges && (
                                    <span className={`${styles.badge} ${styles.badgeWarning}`}>
                                        Изменена
                                    </span>
                                )}
                                {!hasRemoteChanges && <span className={styles.ok}>Актуальна</span>}
                            </td>
                        </tr>
                    </tbody>
                </table>
                
                <div className={styles.actions}>
                    {hasLocalChanges && (
                        <Button 
                            onClick={onChooseLocal}
                            variant="primary"
                        >
                            💾 Сохранить локальную версию в Drive
                        </Button>
                    )}
                    
                    {hasRemoteChanges && (
                        <Button 
                            onClick={onChooseRemote}
                            variant="secondary"
                        >
                            ☁️ Загрузить версию с Drive
                        </Button>
                    )}
                    
                    <Button onClick={onCancel} variant="text">
                        Отменить
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}

export default ConflictDialog
```

**ConflictDialog.module.css:**
```css
.content {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.warning {
    background: #fff3cd;
    border-left: 4px solid #ffc107;
    padding: 8px 12px;
    margin: 0;
}

.versionComparison {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}

.versionComparison th,
.versionComparison td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid #e0e0e0;
}

.versionComparison th {
    background: #f5f5f5;
    font-weight: 600;
}

.versionComparison tr.highlight {
    background: #fff3cd;
}

.badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
}

.badgeWarning {
    background: #ff9800;
    color: white;
}

.ok {
    color: #4caf50;
}

.actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding-top: 16px;
}
```

**index.ts:**
```typescript
export { default } from './ConflictDialog'
export type * from './types'
```

---

#### 4.4 Интегрировать ConflictDialog

**Файл:** `src/4-widgets/CalendarIconBar/CalendarIconBar.tsx`

**Добавить state:**
```typescript
const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
const [conflictDialogData, setConflictDialogData] = useState<SyncResult | null>(null)
```

**Обновить handleSyncActiveDocument:**
```typescript
const handleSyncActiveDocument = async () => {
    if (!activeDoc?.ref?.fileId) {
        alert('Документ не связан с Google Drive')
        return
    }
    
    const result = await documentTabsStore.syncActiveDocumentWithDrive()
    
    if (result.status === 'conflict') {
        setConflictDialogData(result)
        setConflictDialogOpen(true)
    } else if (result.status === 'error') {
        alert(result.message)
    }
}
```

**Обработчики диалога:**
```typescript
const handleChooseLocalVersion = async () => {
    const saved = await documentTabsStore.saveActiveDocument()
    
    if (saved) {
        setConflictDialogOpen(false)
        setConflictDialogData(null)
    } else {
        alert(activeDoc?.state.error || 'Ошибка сохранения')
    }
}

const handleChooseRemoteVersion = async () => {
    if (!activeDoc?.ref?.fileId) return
    
    try {
        const content = await googleApiService.downloadFileContent(activeDoc.ref.fileId)
        
        // Применение данных
        const session = documentTabsStore.activeDocument
        if (session) {
            session.data = parseDocumentContent(content)
            session.state.syncStatus = 'synced'
            session.state.lastSyncedAt = Date.now()
            session.state.lastLoadedAt = Date.now()
            
            // Применение к сторам
            storageService.applyContent(session.data)
        }
        
        setConflictDialogOpen(false)
        setConflictDialogData(null)
    } catch (error: any) {
        alert(error.message)
    }
}
```

**Рендер диалога:**
```typescript
import ConflictDialog, { type ConflictDialogData } from 'src/7-shared/ui/ConflictDialog'

// ... в return компонента:

{conflictDialogOpen && conflictDialogData?.status === 'conflict' && (
    <ConflictDialog
        open={conflictDialogOpen}
        localModifiedAt={conflictDialogData.localModifiedAt}
        remoteModifiedAt={conflictDialogData.remoteModifiedAt}
        hasLocalChanges={conflictDialogData.hasLocalChanges}
        hasRemoteChanges={conflictDialogData.hasRemoteChanges}
        remoteMetadata={conflictDialogData.remoteMetadata}
        onChooseLocal={handleChooseLocalVersion}
        onChooseRemote={handleChooseRemoteVersion}
        onCancel={() => {
            setConflictDialogOpen(false)
            setConflictDialogData(null)
        }}
    />
)}
```

---

#### 4.5 Тестирование сценариев

**Чек-лист тестирования:**

- [ ] **Сценарий A:** Конфликт обеих версий
  - Изменить локально
  - Изменить в Drive (другой браузер)
  - Нажать "Синхронизировать"
  - Проверить диалог
  - Выбрать локальную версию → Сохранить в Drive
  - Выбрать Drive версию → Загрузить с Drive

- [ ] **Сценарий B:** Только локальные изменения
  - Изменить локально (не сохранять)
  - Нажать "Синхронизировать"
  - Проверить диалог "Есть несохранённые изменения"
  - Сохранить в Drive

- [ ] **Сценарий C:** Только изменения на Drive
  - Сохранить в Drive
  - Изменить в Drive (другой браузер)
  - Нажать "Синхронизировать"
  - Проверить диалог "Версия на Drive новее"
  - Загрузить с Drive

- [ ] **Сценарий D:** Нет изменений
  - Синхронизировать без изменений
  - Проверить автоматическую загрузку для проверки

- [ ] **Сценарий E:** Массовая синхронизация
  - Открыть 3 документа
  - Изменить все (не сохранять)
  - Меню → "Синхронизировать все (3)"
  - Проверить статистику

---

### Фаза 5: Тестирование и отладка

#### 5.1 Unit-тесты DocumentTabsStore

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.test.ts`

```typescript
import { DocumentTabsStore } from './DocumentTabsStore'
import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { StorageService } from 'src/7-shared/services/StorageService'

describe('DocumentTabsStore', () => {
    let store: DocumentTabsStore
    let mockGoogleApi: Partial<GoogleApiService>
    let mockStorage: Partial<StorageService>
    
    beforeEach(() => {
        mockGoogleApi = {
            isGoogleLoggedIn: true,
            getFileMetadata: jest.fn(),
            downloadFileContent: jest.fn(),
            saveFile: jest.fn(),
            logIn: jest.fn()
        }
        
        mockStorage = {
            applyContent: jest.fn(),
            getContentToSave: jest.fn(),
            desyncWithStorages: jest.fn()
        }
        
        store = new DocumentTabsStore(
            mockGoogleApi as GoogleApiService,
            mockStorage as StorageService
        )
    })
    
    describe('openNewDocument', () => {
        test('создаёт новую вкладку', () => {
            store.openNewDocument('Тест')
            
            expect(store.documents.length).toBe(1)
            expect(store.activeDocument?.ref?.name).toBe('Тест')
            expect(store.activeDocument?.ref?.fileId).toBeNull()
        })
    })
    
    describe('syncActiveDocumentWithDrive', () => {
        test('возвращает conflict при локальных изменениях', async () => {
            // Setup
            store.openNewDocument('Тест')
            store.updateActiveDocumentData({
                projectsList: [],
                completedList: [],
                plannedList: []
            })
            
            mockGoogleApi.getFileMetadata = jest.fn().mockResolvedValue({
                id: 'file123',
                name: 'Тест',
                mimeType: 'application/json',
                modifiedTime: new Date().toISOString()
            })
            
            // Execute
            const result = await store.syncActiveDocumentWithDrive()
            
            // Assert
            expect(result.status).toBe('conflict')
            expect(result.hasLocalChanges).toBe(true)
        })
        
        test('возвращает success при отсутствии изменений', async () => {
            // Setup
            store.openNewDocument('Тест')
            
            mockGoogleApi.getFileMetadata = jest.fn().mockResolvedValue({
                id: 'file123',
                name: 'Тест',
                mimeType: 'application/json',
                modifiedTime: new Date().toISOString()
            })
            
            mockGoogleApi.downloadFileContent = jest.fn().mockResolvedValue({
                projectsList: [],
                completedList: [],
                plannedList: []
            })
            
            // Execute
            const result = await store.syncActiveDocumentWithDrive()
            
            // Assert
            expect(result.status).toBe('success')
        })
    })
})
```

---

#### 5.2 Integration-тесты App

**Файл:** `src/1-app/App/App.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import { StoreProvider } from 'src/1-app/Providers/StoreProvider'
// ... импорты сторов

describe('App Integration Tests', () => {
    test('переключение между вкладками обновляет контент', async () => {
        render(
            <StoreProvider {...stores}>
                <App />
            </StoreProvider>
        )
        
        // Создать два документа
        fireEvent.click(screen.getByTitle('Новый документ'))
        fireEvent.click(screen.getByTitle('Новый документ'))
        
        // Переключиться на первую вкладку
        const tabs = screen.getAllByTestId('document-tab')
        fireEvent.click(tabs[0])
        
        // Проверить активную вкладку
        expect(tabs[0]).toHaveClass('active')
    })
})
```

---

#### 5.3 E2E тесты

**Файл:** `e2e/multi-document.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test('полный цикл работы с несколькими документами', async ({ page }) => {
    await page.goto('/')
    
    // Создать новый документ
    await page.click('[title="Новый документ"]')
    
    // Добавить проект
    await page.click('text=Проекты')
    await page.fill('[placeholder="Название проекта"]', 'Тестовый проект')
    await page.click('text=Добавить')
    
    // Проверить индикатор изменений
    const saveButton = page.locator('[title*="Сохранить"]')
    await expect(saveButton).toHaveText(/[*]/)
    
    // Сохранить в Google Drive (мокирование)
    // ...
    
    // Создать второй документ
    await page.click('[title="Новый документ"]')
    
    // Проверить переключение
    await page.click('[data-testid="document-tab"]:nth-child(1)')
    expect(await page.textContent('.project-name')).toBe('Тестовый проект')
})
```

---

#### 5.4 Тестирование миграции

**Сценарий:**
1. Очистить localStorage
2. Создать старые данные (`data` + `lastOpenedDocument`)
3. Перезагрузить приложение
4. Проверить создание вкладки из старых данных
5. Проверить восстановление данных

---

#### 5.5 Исправление багов

Ведётся по мере выявления в процессе тестирования.

---

## 4. Сводка по времени

| Фаза | Запланировано | Фактически | Прогресс |
|------|---------------|------------|----------|
| Фаза 1: Базовая инфраструктура | 8.5ч | 8.5ч | ✅ 100% |
| Фаза 2: UI компонент вкладок | 5.5ч | 5.5ч | ✅ 100% |
| Фаза 3: Обновление CalendarIconBar | 5.5ч | 0ч | ⏳ 0% |
| Фаза 4: Механизм синхронизации | 8.5ч | 0ч | ⏳ 0% |
| Фаза 5: Тестирование и отладка | 14ч | 0ч | ⏳ 0% |
| **ИТОГО** | **42ч** | **14ч** | **~30%** |

---

## 5. Риски и зависимости

### Риски:

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Потеря данных при миграции | Низкая | Высокое | Резервное копирование localStorage перед миграцией |
| Конфликты синхронизации | Средняя | Среднее | Диалог выбора версии |
| Проблемы с производительностью | Низкая | Среднее | Ленивая загрузка данных |
| Ошибки Google API | Средняя | Низкое | Обработка ошибок, retry logic |

### Зависимости:

- ✅ DocumentTabsStore — готов
- ✅ DocumentTabs UI — готов
- ⏳ ConflictDialog — требуется реализация
- ⏳ Обновлённые иконки (Sync, SyncAll) — требуется создание

---

## 6. Критерии готовности

### Phase Gate 3 (после Фазы 3):
- [ ] Все кнопки обновлены
- [ ] Badge индикаторы работают
- [ ] Tooltip отображают статус
- [ ] Сборка проходит без ошибок

### Phase Gate 4 (после Фазы 4):
- [ ] SyncResult тип обновлён
- [ ] syncActiveDocumentWithDrive возвращает hasLocalChanges/hasRemoteChanges
- [ ] ConflictDialog создан и интегрирован
- [ ] Все сценарии синхронизации протестированы

### Phase Gate 5 (после Фазы 5):
- [ ] Unit-тесты написаны и проходят
- [ ] Integration-тесты написаны и проходят
- [ ] E2E тесты написаны и проходят
- [ ] Миграция данных работает
- [ ] Критические баги исправлены

---

## 7. Следующие шаги

1. **Немедленно:** Начать Фазу 3 (Обновление CalendarIconBar)
2. **После Фазы 3:** Начать Фазу 4 (Механизм синхронизации)
3. **После Фазы 4:** Начать Фазу 5 (Тестирование)
4. **После Фазы 5:** Релиз multi-document поддержки

---

## 8. Приложения

### A. Глоссарий

| Термин | Определение |
|--------|-------------|
| DocumentTabsStore | Store для управления несколькими документами |
| SyncResult | Результат синхронизации с Google Drive |
| ConflictDialog | Диалог выбора версии при конфликте |
| hasLocalChanges | Флаг наличия локальных изменений (isDirty) |
| hasRemoteChanges | Флаг наличия изменений на Drive |

### B. Ссылки

- [Исходный план](./multi_document_support_plan.md)
- [Редизайн CalendarIconBar](./calendar_icon_bar_redesign.md)
- [Исправление логики синхронизации](./sync_logic_fix.md)

### C. История изменений документа

| Версия | Дата | Автор | Изменения |
|--------|------|-------|-----------|
| 1.0 | 14.03.2026 | AI Assistant | Первоначальная версия |
