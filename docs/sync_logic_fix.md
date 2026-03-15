# Исправление логики синхронизации — предотвращение потери данных

## Дата: 14 марта 2026 г.

---

## 1. Проблема текущей реализации

### 1.1 Текущая логика (ошибочная)

```typescript
// DocumentTabsStore.ts:329-348

// Сравнение версий
if (remoteModifiedAt > localModifiedAt) {
    // Удалённая версия новее — предложить выбор пользователю
    return { status: 'conflict', ... }
}

// Загрузка контента — АВТОМАТИЧЕСКИ перезаписывает локальные данные!
const content = await this.googleApiService.downloadFileContent(fileId)
session.data = parseDocumentContent(content)  // ❌ ПОТЕРЯ ДАННЫХ!
```

### 1.2 Сценарий потери данных

```
Время    Пользователь A (локально)          Google Drive
─────────────────────────────────────────────────────────────────
10:00    Открыл документ                     v1.0
         
10:05    Редактировал                        v1.0
         lastSavedAt: 10:05
         
10:10    Нажал "Сохранить" ────────────────> v1.1 (10:10)
         lastSavedAt: 10:10
         
10:15    Пользователь B открыл в другом      
         браузере и редактирует              v1.1
         
10:20    Пользователь B сохранил ──────────> v1.2 (10:20)
         
10:25    Пользователь A редактирует          
         (не зная об изменениях B)           v1.1
         lastSavedAt: 10:25
         
10:30    Пользователь A нажал               
         "Синхронизировать"                  
         
         Drive (10:20) < Local (10:25)       
         → АВТОМАТИЧЕСКАЯ загрузка с Drive   
         → ❌ Изменения A за 10:25 ПОТЕРЯНЫ!
```

### 1.3 Почему это происходит

**Текущее предположение (ошибочное):**
> "Если локальная версия новее, значит мы просто сохранили в Drive и данные идентичны"

**Реальность:**
- Локальная версия может быть новее, потому что:
  1. Пользователь редактировал после последнего сохранения в Drive
  2. **Кто-то другой изменил документ в Drive** (конфликт!)
  3. Drive был обновлён из другого источника

**Результат:** Автоматическая загрузка с Drive при `localModifiedAt >= remoteModifiedAt` может привести к потере локальных изменений.

---

## 2. Правильная логика синхронизации

### 2.1 Принцип "Безопасной синхронизации"

> **Никогда не перезаписывать данные автоматически.** Всегда показывать пользователю состояние и предлагать выбор.

### 2.2 Новая логика сравнения

```typescript
async syncActiveDocumentWithDrive(): Promise<SyncResult> {
    // ... проверка fileId, авторизация ...
    
    // Загрузка метаданных
    const remoteMetadata = await this.googleApiService.getFileMetadata(session.ref.fileId)
    const remoteModifiedAt = remoteMetadata.modifiedTime
        ? new Date(remoteMetadata.modifiedTime).getTime()
        : 0
    const localModifiedAt = session.state.lastSavedAt ?? 0
    
    // === НОВОЕ: Всегда показываем диалог при наличии локальных изменений ===
    const hasLocalChanges = session.state.isDirty
    const remoteIsNewer = remoteModifiedAt > localModifiedAt
    
    if (remoteIsNewer || hasLocalChanges) {
        // Показываем диалог выбора версии
        session.state.syncStatus = 'needs-sync'
        this.persistToLocalStorage()
        
        return {
            status: 'conflict',
            message: remoteIsNewer 
                ? 'Версия на Google Drive новее локальной'
                : 'Есть локальные изменения, не сохранённые в Drive',
            remoteMetadata,
            localModifiedAt,
            remoteModifiedAt,
            hasLocalChanges,
            hasRemoteChanges: remoteIsNewer
        }
    }
    
    // === Только если нет изменений с обеих сторон — загружаем для проверки ===
    const content = await this.googleApiService.downloadFileContent(session.ref.fileId)
    session.data = parseDocumentContent(content)
    session.state.syncStatus = 'synced'
    // ...
    
    return { status: 'success' }
}
```

### 2.3 Матрица решений

| Local vs Remote | Remote новее | Remote старше | Remote = Local |
|-----------------|--------------|---------------|----------------|
| **Local Dirty** | ⚠️ Диалог (конфликт) | ⚠️ Диалог (локальные изменения) | ✅ Загрузить (проверка) |
| **Local Clean** | ⚠️ Диалог (Drive новее) | ✅ Загрузить (проверка) | ✅ Загрузить (проверка) |

**Обозначения:**
- `Dirty` — есть несохранённые локальные изменения (`isDirty === true`)
- `Clean` — нет несохранённых изменений (`isDirty === false`)

---

## 3. Расширенный SyncResult

### 3.1 Новый тип результата

```typescript
// DocumentTabsStore.types.ts

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

### 3.2 Обновлённый диалог конфликта

```typescript
interface ConflictDialogProps {
    localModifiedAt: number
    remoteModifiedAt: number
    hasLocalChanges: boolean      // ← НОВОЕ
    hasRemoteChanges: boolean     // ← НОВОЕ
    onChooseRemote: () => void    // Загрузить с Drive
    onChooseLocal: () => void     // Сохранить в Drive
    onCancel: () => void
}

const ConflictDialog: React.FC<ConflictDialogProps> = ({
    localModifiedAt,
    remoteModifiedAt,
    hasLocalChanges,
    hasRemoteChanges,
    onChooseRemote,
    onChooseLocal,
    onCancel
}) => {
    const formatDate = (ts: number) => new Date(ts).toLocaleString('ru-RU')
    
    // Определение ситуации
    const situation = hasLocalChanges && hasRemoteChanges
        ? 'conflict-both'           // Конфликт: обе версии изменены
        : hasRemoteChanges
        ? 'conflict-remote'         // Drive новее
        : hasLocalChanges
        ? 'conflict-local'          // Локальные изменения не сохранены
        : 'no-changes'              // Нет изменений
    
    const getTitle = () => {
        switch (situation) {
            case 'conflict-both':
                return '⚠️ Обнаружены изменения с обеих сторон'
            case 'conflict-remote':
                return '⚠️ Версия на Google Drive новее'
            case 'conflict-local':
                return '💾 Есть несохранённые изменения'
            default:
                return '✓ Синхронизация не требуется'
        }
    }
    
    const getMessage = () => {
        switch (situation) {
            case 'conflict-both':
                return (
                    <>
                        <p>Обнаружены изменения и локально, и на Google Drive.</p>
                        <p><strong>Важно:</strong> Выбор версии приведёт к потере изменений в другой версии.</p>
                    </>
                )
            case 'conflict-remote':
                return (
                    <>
                        <p>Версия на Google Drive была изменена после последней синхронизации.</p>
                        <p><strong>Внимание:</strong> Загрузка версии с Drive перезапишет локальные изменения.</p>
                    </>
                )
            case 'conflict-local':
                return (
                    <>
                        <p>У вас есть несохранённые изменения локально.</p>
                        <p>Выберите действие:</p>
                    </>
                )
            default:
                return <p>Данные синхронизированы.</p>
        }
    }
    
    return (
        <Dialog title={getTitle()}>
            {getMessage()}
            
            <table className="version-comparison">
                <thead>
                    <tr>
                        <th>Версия</th>
                        <th>Дата изменения</th>
                        <th>Статус</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className={hasLocalChanges ? 'highlight' : ''}>
                        <td>📁 Локальная</td>
                        <td>{formatDate(localModifiedAt)}</td>
                        <td>
                            {hasLocalChanges && <span className="badge">Изменена</span>}
                            {!hasLocalChanges && <span>Актуальна</span>}
                        </td>
                    </tr>
                    <tr className={hasRemoteChanges ? 'highlight' : ''}>
                        <td>☁️ Google Drive</td>
                        <td>{formatDate(remoteModifiedAt)}</td>
                        <td>
                            {hasRemoteChanges && <span className="badge">Изменена</span>}
                            {!hasRemoteChanges && <span>Актуальна</span>}
                        </td>
                    </tr>
                </tbody>
            </table>
            
            <div className="dialog-actions">
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
                
                <Button onClick={onCancel}>
                    Отменить
                </Button>
            </div>
        </Dialog>
    )
}
```

---

## 4. Обработчики действий пользователя

### 4.1 Выбор локальной версии (сохранение в Drive)

```typescript
const handleChooseLocalVersion = async () => {
    // Пользователь выбрал сохранить локальную версию в Drive
    const saved = await documentTabsStore.saveActiveDocument()
    
    if (saved) {
        // Успешно сохранено в Drive
        closeDialog()
    } else {
        // Ошибка сохранения
        showError(documentTabsStore.activeDocument.state.error)
    }
}
```

### 4.2 Выбор удалённой версии (загрузка с Drive)

```typescript
const handleChooseRemoteVersion = async () => {
    // Пользователь выбрал загрузить версию с Drive
    const session = documentTabsStore.activeDocument
    
    // Загрузка контента
    const content = await googleApiService.downloadFileContent(session.ref.fileId)
    
    // Применение данных
    session.data = parseDocumentContent(content)
    session.state.syncStatus = 'synced'
    session.state.lastSyncedAt = Date.now()
    session.state.lastLoadedAt = Date.now()
    
    // Применение к сторам
    storageService.applyContent(session.data)
    
    closeDialog()
}
```

---

## 5. Изменения в DocumentTabsStore

### 5.1 Обновлённая сигнатура SyncResult

```typescript
// src/6-entities/Document/model/DocumentTabsStore.types.ts

export type SyncResult =
    | { status: 'success' }
    | {
        status: 'conflict'
        message: string
        remoteMetadata: DriveFileMetadata
        localModifiedAt: number
        remoteModifiedAt: number
        hasLocalChanges: boolean
        hasRemoteChanges: boolean
      }
    | { status: 'error'; message: string }
```

### 5.2 Обновлённый метод syncActiveDocumentWithDrive

```typescript
// src/6-entities/Document/model/DocumentTabsStore.ts

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
        const remoteModifiedAt = remoteMetadata.modifiedTime
            ? new Date(remoteMetadata.modifiedTime).getTime()
            : 0
        const localModifiedAt = session.state.lastSavedAt ?? 0
        
        // === КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: проверяем оба направления ===
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
                hasLocalChanges,
                hasRemoteChanges
            }
        }

        // === Нет изменений — загружаем для проверки целостности ===
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
    } catch (error: any) {
        runInAction(() => {
            session.state.error = error.message
            session.state.syncStatus = 'error'
        })
        this.persistToLocalStorage()

        return { status: 'error', message: error.message }
    }
}
```

---

## 6. Сценарии использования

### 6.1 Сценарий A: Конфликт изменений (обе стороны)

```
Ситуация:
- Локально: изменения после последнего сохранения (isDirty: true)
- Drive: изменён другим пользователем (remoteModifiedAt > localModifiedAt)

Действия:
1. Пользователь нажимает "Синхронизировать"
2. Показан диалог: "Обнаружены изменения с обеих сторон"
3. Пользователь выбирает:
   - "Сохранить локальную версию" → перезапись Drive
   - "Загрузить версию с Drive" → перезапись локально
   - "Отменить" → отмена синхронизации

Результат: Пользователь контролирует, какая версия будет окончательной
```

### 6.2 Сценарий B: Только локальные изменения

```
Ситуация:
- Локально: изменения (isDirty: true)
- Drive: не изменён (remoteModifiedAt <= localModifiedAt)

Действия:
1. Пользователь нажимает "Синхронизировать"
2. Показан диалог: "Есть несохранённые изменения"
3. Пользователь выбирает:
   - "Сохранить локальную версию" → сохранение в Drive ✓
   - "Отменить" → отмена

Результат: Локальные изменения не теряются
```

### 6.3 Сценарий C: Только изменения на Drive

```
Ситуация:
- Локально: без изменений (isDirty: false)
- Drive: изменён (remoteModifiedAt > localModifiedAt)

Действия:
1. Пользователь нажимает "Синхронизировать"
2. Показан диалог: "Версия на Google Drive новее"
3. Пользователь выбирает:
   - "Загрузить версию с Drive" → загрузка изменений ✓
   - "Отменить" → отмена

Результат: Пользователь видит изменения и подтверждает загрузку
```

### 6.4 Сценарий D: Нет изменений

```
Ситуация:
- Локально: без изменений (isDirty: false)
- Drive: не изменён (remoteModifiedAt <= localModifiedAt)

Действия:
1. Пользователь нажимает "Синхронизировать"
2. Автоматическая загрузка для проверки целостности
3. Статус: "Синхронизировано" ✓

Результат: Быстрая проверка без диалога
```

---

## 7. Roadmap исправления

| Этап | Задача | Оценка |
|------|--------|--------|
| 1 | Обновить SyncResult тип | 0.5 часа |
| 2 | Изменить syncActiveDocumentWithDrive | 1 час |
| 3 | Создать ConflictDialog компонент | 2 часа |
| 4 | Добавить обработчики handleChooseLocalVersion | 0.5 часа |
| 5 | Добавить обработчики handleChooseRemoteVersion | 0.5 часа |
| 6 | Интегрировать диалог в CalendarIconBar | 1 час |
| 7 | Тестирование сценариев | 1.5 часа |

**Итого: ~7 часов**

---

## 8. Проверка исправления

### Чек-лист тестирования:

- [ ] Локальные изменения не теряются при синхронизации
- [ ] Диалог показывается при наличии локальных изменений
- [ ] Диалог показывается при изменениях на Drive
- [ ] Можно сохранить локальную версию в Drive
- [ ] Можно загрузить версию с Drive
- [ ] Статусы синхронизации обновляются корректно
- [ ] Массовая синхронизация обрабатывает конфликты

### Критерии приёмки:

1. **Безопасность данных:** Локальные изменения никогда не перезаписываются автоматически
2. **Прозрачность:** Пользователь всегда видит состояние обеих версий
3. **Контроль:** Пользователь выбирает, какая версия будет окончательной
4. **Ясность:** Диалог понятно объясняет ситуацию и варианты действий

---

## 9. Заключение

**Ключевое изменение:**
> Переход от автоматической загрузки с Drive к **диалогу выбора версии** при любых расхождениях между локальной и удалённой версиями.

Это гарантирует:
- ✅ **Сохранность данных** — локальные изменения не теряются
- ✅ **Контроль пользователя** — выбор версии всегда за пользователем
- ✅ **Прозрачность** — пользователь видит состояние всех версий
- ✅ **Гибкость** — можно выбрать любую версию в зависимости от ситуации
