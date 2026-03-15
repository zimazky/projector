# Флаг `hasUnsyncedChanges`: Документация

## Аннотация

Данный документ описывает новую логику отслеживания несохранённых изменений между сессиями приложения с помощью отдельного флага `hasUnsyncedChanges`. Эта функция решает проблему потери данных при работе в офлайн-режиме и обеспечивает явное информирование пользователя о необходимости синхронизации с Google Drive.

---

## 1. Проблема

### 1.1 Сценарий использования

Рассмотрим типичный сценарий работы в офлайн-режиме:

```
1. Пользователь открывает приложение (онлайн)
   └─> Документы загружаются из Drive
   └─> Синхронизация: ✓

2. Пользователь редактирует документ
   └─> isDirty = true
   └─> Индикатор: "Есть несохранённые изменения"

3. Пользователь закрывает браузер (без синхронизации)
   └─> Данные сохраняются в localStorage
   └─> isDirty = true (сохраняется в снимок)

4. Пользователь открывает приложение (офлайн/онлайн)
   └─> Документы восстанавливаются из localStorage
   └─> isDirty = false (сбрасывается при восстановлении)
   └─> ❌ ПРОБЛЕМА: Нет индикации о несохранённых изменениях!

5. Пользователь закрывает вкладку
   └─> Нет предупреждения
   └─> Данные не синхронизированы с Drive
   └─> ⚠️ Изменения могут быть потеряны
```

### 1.2 Корневая причина

**Проблема:** Поле `isDirty` имеет разную семантику в разных контекстах:

| Контекст | Значение `isDirty` |
|----------|-------------------|
| **В сессии** | Есть изменения, не сохранённые в текущей сессии |
| **После восстановления** | Были изменения на момент последнего закрытия |

**Текущее поведение:**
- При восстановлении из localStorage `isDirty` сбрасывается в `false`
- Пользователь не видит индикации о необходимости синхронизации
- При закрытии вкладки нет предупреждения

---

## 2. Решение: Флаг `hasUnsyncedChanges`

### 2.1 Концепция

Вводится отдельный флаг `hasUnsyncedChanges`, который:

- **Сохраняется** в localStorage при закрытии приложения
- **Восстанавливается** при следующем запуске
- **Индикарует** наличие изменений с предыдущей сессии
- **Сбрасывается** после успешной синхронизации с Drive

### 2.2 Семантика полей

| Поле | Значение | Когда устанавливается | Когда сбрасывается |
|------|----------|----------------------|-------------------|
| `isDirty` | Есть изменения в **текущей сессии** | При редактировании пользователем | После сохранения в Drive |
| `hasUnsyncedChanges` | Были изменения на момент **последнего закрытия** | При сохранении в localStorage, если `isDirty = true` | После синхронизации с Drive |
| `syncStatus: 'offline'` | Документ не синхронизирован с Drive | При восстановлении из localStorage | После синхронизации с Drive |

### 2.3 Матрица состояний

| Сценарий | `isDirty` | `hasUnsyncedChanges` | `syncStatus` | Индикация |
|----------|-----------|---------------------|--------------|-----------|
| Новый документ | `false` | `false` | `offline` | Нет |
| Редактирование в сессии | `true` | `false` | `needs-sync` | "Есть несохранённые изменения" |
| Восстановление (были изменения) | `false` | `true` | `offline` | "Требуется синхронизация" |
| Восстановление (без изменений) | `false` | `false` | `offline` | Нет |
| После синхронизации | `false` | `false` | `synced` | "Синхронизировано" |

---

## 3. Структуры данных

### 3.1 Обновлённый тип `DocumentState`

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.types.ts`

```typescript
export type DocumentState = {
    /** Есть изменения в текущей сессии */
    isDirty: boolean
    
    /** Идёт загрузка данных */
    isLoading: boolean
    
    /** Идёт сохранение в Drive */
    isSaving: boolean
    
    /** Время последней загрузки из Drive */
    lastLoadedAt: number | null
    
    /** Время последнего сохранения в Drive */
    lastSavedAt: number | null
    
    /** Сообщение об ошибке */
    error: string | null
    
    /** Статус синхронизации с Drive */
    syncStatus: SyncStatus
    
    /** Время последней синхронизации с Drive */
    lastSyncedAt: number | null
    
    /** 
     * Были изменения на момент последнего закрытия.
     * Сохраняется в localStorage, восстанавливается при запуске.
     * Сбрасывается после синхронизации с Drive.
     */
    hasUnsyncedChanges: boolean
}
```

### 3.2 Функция `createInitialDocumentState`

```typescript
export function createInitialDocumentState(): DocumentState {
    return {
        isDirty: false,
        isLoading: false,
        isSaving: false,
        lastLoadedAt: null,
        lastSavedAt: null,
        error: null,
        syncStatus: 'offline',
        lastSyncedAt: null,
        hasUnsyncedChanges: false  // ← НОВОЕ
    }
}
```

### 3.3 Тип `RestoredDocumentSnapshot`

```typescript
export type RestoredDocumentSnapshot = {
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
        hasUnsyncedChanges: boolean  // ← НОВОЕ
    }
    lastAccessedAt: number
}
```

---

## 4. Жизненный цикл флага

### 4.1 Сохранение в localStorage

**Метод:** `DocumentTabsStore.persistToLocalStorage()`

```typescript
private persistToLocalStorage() {
    const snapshot: DocumentTabsSnapshot = {
        activeDocumentId: this.state.activeDocumentId,
        documentOrder: this.state.documentOrder,
        documents: this.state.documentOrder.map(id => {
            const session = this.state.documents.get(id)!
            return {
                id: session.id,
                ref: session.ref!,
                state: {
                    // ... другие поля
                    hasUnsyncedChanges: session.state.isDirty  // ← Сохраняем isDirty
                },
                lastAccessedAt: session.lastAccessedAt
            }
        }),
        savedAt: Date.now()
    }
    localStorage.setItem(DOCUMENT_TABS_KEY, JSON.stringify(snapshot))
}
```

**Логика:**
- Если `isDirty = true` → `hasUnsyncedChanges = true` (были изменения)
- Если `isDirty = false` → `hasUnsyncedChanges = false` (изменений не было)

---

### 4.2 Восстановление из localStorage

**Метод:** `DocumentTabsStore.openFromLocalStorageSnapshot()`

```typescript
openFromLocalStorageSnapshot(docSnapshot: RestoredDocumentSnapshot) {
    const session: DocumentSession = {
        id: docSnapshot.id,
        ref: docSnapshot.ref,
        data: createEmptyDocumentData(),
        state: {
            isDirty: false,  // Сбрасываем — новая сессия
            hasUnsyncedChanges: docSnapshot.state.hasUnsyncedChanges,  // ← Восстанавливаем
            // ... другие поля
        }
    }
    this.state.documents.set(id, session)
}
```

**Логика:**
- `isDirty = false` — новая сессия, изменений ещё не было
- `hasUnsyncedChanges` — восстанавливается из снимка

---

### 4.3 Сброс после синхронизации

**Метод:** `DocumentTabsStore.saveActiveDocument()`

```typescript
if (result.status === 'success') {
    runInAction(() => {
        session.state.isDirty = false
        session.state.hasUnsyncedChanges = false  // ← Сбрасываем
        session.state.isSaving = false
        session.state.lastSavedAt = Date.now()
        session.state.syncStatus = 'synced'
        session.state.lastSyncedAt = Date.now()
    })
    this.persistToLocalStorage()
    return true
}
```

**Логика:**
- После успешной синхронизации оба флага сбрасываются
- Документ считается синхронизированным

---

### 4.4 Проверка при закрытии вкладки

**Метод:** `DocumentTabsStore.closeDocument()`

```typescript
closeDocument(documentId: DocumentId) {
    const session = this.state.documents.get(documentId)
    if (!session) return

    // Проверка несохранённых изменений
    if (session.state.isDirty || session.state.hasUnsyncedChanges) {
        // TODO: Показать диалог подтверждения
        console.warn('Closing document with unsaved changes')
    }

    // ... остальной код
}
```

**Логика:**
- Предупреждение показывается при любом из флагов
- Пользователь может решить, синхронизировать или закрыть

---

## 5. UI индикация

### 5.1 Отображение в табах

**Файл:** `src/7-shared/ui/DocumentTabs/DocumentTabs.tsx`

```typescript
const getSyncStatusTitle = (
    status: string,
    hasUnsyncedChanges: boolean,
    isDirty: boolean
): string => {
    if (hasUnsyncedChanges && !isDirty) {
        return 'Есть несохранённые изменения с предыдущей сессии'
    }
    if (isDirty) {
        return 'Есть несохранённые изменения'
    }
    switch (status) {
        case 'offline':
            return 'Документ работает в офлайн-режиме'
        case 'syncing':
            return 'Синхронизация...'
        case 'synced':
            return 'Синхронизировано'
        case 'needs-sync':
            return 'Есть несохранённые изменения в Google Drive'
        case 'update-available':
            return 'Доступна новая версия с Google Drive'
        case 'error':
            return 'Ошибка синхронизации'
        default:
            return ''
    }
}

const getSyncStatusIcon = (
    status: string,
    hasUnsyncedChanges: boolean,
    isDirty: boolean
): string => {
    if (hasUnsyncedChanges && !isDirty) {
        return '⚠️'  // Требуется синхронизация
    }
    if (isDirty) {
        return '*'  // Есть изменения
    }
    switch (status) {
        case 'offline':
            return '📴'
        case 'syncing':
            return '🔄'
        case 'synced':
            return '✓'
        case 'needs-sync':
            return '⚠'
        case 'update-available':
            return '☁️'
        case 'error':
            return '❌'
        default:
            return ''
    }
}
```

### 5.2 Диаграмма состояний в UI

```
┌──────────────────────────────────────────────────────────────┐
│  Вкладка документа                                           │
│                                                              │
│  [Название документа] [Индикатор] [×]                       │
│                                                              │
│  Индикаторы:                                                 │
│  - Нет индикатора     → Документ синхронизирован            │
│  - * (звёздочка)     → Есть изменения в сессии              │
│  - ⚠️ (предупреждение) → Есть изменения с прошлой сессии    │
│  - 📴 (офлайн)       → Документ без fileId                   │
│  - 🔄 (загрузка)     → Идёт синхронизация                    │
│  - ✓ (галочка)       → Синхронизировано                     │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Сценарии использования

### 6.1 Сценарий: Работа в офлайн-режиме

```
1. Пользователь открывает приложение (офлайн)
   └─> Документы восстанавливаются из localStorage
   └─> hasUnsyncedChanges = true (если были изменения)
   └─> Индикатор: ⚠️

2. Пользователь редактирует документ
   └─> isDirty = true
   └─> Индикатор: * (звёздочка)

3. Пользователь закрывает вкладку
   └─> Диалог: "Есть несохранённые изменения"
   └─> Опции: [Синхронизировать] [Закрыть без синхронизации] [Отмена]
```

### 6.2 Сценарий: Синхронизация после восстановления

```
1. Пользователь открывает приложение (онлайн)
   └─> Документы восстанавливаются из localStorage
   └─> hasUnsyncedChanges = true
   └─> Индикатор: ⚠️

2. Пользователь нажимает "Синхронизировать"
   └─> Загрузка данных из Drive
   └─> Сравнение версий
   └─> Если нет конфликтов → saveActiveDocument()
   └─> hasUnsyncedChanges = false
   └─> syncStatus = 'synced'
   └─> Индикатор: ✓
```

### 6.3 Сценарий: Конфликт версий

```
1. Пользователь открывает приложение
   └─> hasUnsyncedChanges = true
   └─> Индикатор: ⚠️

2. Пользователь нажимает "Синхронизировать"
   └─> Проверка версий: Drive версия новее
   └─> Диалог выбора версии:
       - Сохранить локальную версию в Drive
       - Загрузить версию с Drive
       - Отменить

3. Пользователь выбирает "Загрузить версию с Drive"
   └─> Данные обновляются из Drive
   └─> hasUnsyncedChanges = false
   └─> isDirty = false
   └─> syncStatus = 'synced'
```

---

## 7. План реализации

### Этап 1: Обновление типов

| Задача | Файл | Статус |
|--------|------|--------|
| Добавить `hasUnsyncedChanges` в `DocumentState` | `DocumentTabsStore.types.ts` | ⏳ |
| Обновить `createInitialDocumentState` | `DocumentTabsStore.types.ts` | ⏳ |
| Обновить `RestoredDocumentSnapshot` | `DocumentTabsStore.types.ts` | ⏳ |

### Этап 2: Логика сохранения/восстановления

| Задача | Файл | Статус |
|--------|------|--------|
| Сохранение флага в `persistToLocalStorage` | `DocumentTabsStore.ts` | ⏳ |
| Восстановление в `openFromLocalStorageSnapshot` | `DocumentTabsStore.ts` | ⏳ |
| Сброс в `saveActiveDocument` | `DocumentTabsStore.ts` | ⏳ |

### Этап 3: Обновление UI

| Задача | Файл | Статус |
|--------|------|--------|
| Обновить `getSyncStatusTitle` | `DocumentTabs.tsx` | ⏳ |
| Обновить `getSyncStatusIcon` | `DocumentTabs.tsx` | ⏳ |
| Обновить диалог закрытия вкладки | `closeDocument` | ⏳ |

### Этап 4: Тестирование

| Задача | Статус |
|--------|--------|
| Unit-тесты на сохранение/восстановление флага | ⏳ |
| Integration-тесты UI индикации | ⏳ |
| Ручное тестирование сценариев | ⏳ |

---

## 8. Риски и митигация

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Путаница между `isDirty` и `hasUnsyncedChanges` | Средняя | Низкое | Чёткая документация, комментарии в коде |
| Ложные срабатывания предупреждений | Низкая | Среднее | Разные тексты предупреждений для разных флагов |
| Проблемы с обратной совместимостью | Средняя | Высокое | Graceful degradation: если флаг отсутствует → `false` |

---

## 9. Критерии готовности

### Phase Gate 1 (после Этапа 1):
- [ ] Все типы обновлены
- [ ] TypeScript компилируется без ошибок
- [ ] Сборка проходит успешно

### Phase Gate 2 (после Этапа 2):
- [ ] Флаг сохраняется в localStorage
- [ ] Флаг восстанавливается из localStorage
- [ ] Флаг сбрасывается после синхронизации

### Phase Gate 3 (после Этапа 3):
- [ ] UI отображает правильный индикатор
- [ ] Tooltip показывает корректный текст
- [ ] Диалог закрытия показывает предупреждение

### Phase Gate 4 (после Этапа 4):
- [ ] Unit-тесты написаны и проходят
- [ ] Integration-тесты написаны и проходят
- [ ] Ручное тестирование всех сценариев завершено

---

## 10. Глоссарий

| Термин | Определение |
|--------|-------------|
| `isDirty` | Флаг наличия изменений в текущей сессии |
| `hasUnsyncedChanges` | Флаг наличия изменений с предыдущей сессии |
| `syncStatus` | Статус синхронизации с Google Drive |
| Сессия | Период работы приложения между открытием и закрытием |
| Снимок (snapshot) | Сериализованное состояние в localStorage |

---

## 11. История изменений

| Версия | Дата | Автор | Изменения |
|--------|------|-------|-----------|
| 1.0 | 15.03.2026 | AI Assistant | Первоначальная версия |

---

## 12. Связанные документы

- [multi_document_support_plan.md](./multi_document_support_plan.md) — Общая архитектура многодокументной поддержки
- [implementation_plan_phase1.md](./implementation_plan_phase1.md) — План реализации фазы 1
- [sync_logic_fix.md](./sync_logic_fix.md) — Исправление логики синхронизации
- [unsaved_changes_prompt_refactor_plan_ru.md](./unsaved_changes_prompt_refactor_plan_ru.md) — Рефакторинг предупреждений о несохранённых изменениях
