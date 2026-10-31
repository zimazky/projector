# План реализации гибридного подхода с MobX reaction

## Цель

Заменить колбэк `onActiveDocumentChanged` на реактивный `reaction` для автоматической инвалидации кэша при смене активного документа, сохраняя при этом существующие колбэки `onStoresChanged` для обработки изменений данных (events/projects).

---

## Архитектурное обоснование

### Почему гибридный подход?

| Аспект | Колбэки (`onStoresChanged`) | Reaction (`activeDocumentId`) |
|--------|---------------------------|------------------------------|
| **Что отслеживает** | Изменения данных внутри документа | Смена активного документа |
| **Частота изменений** | Часто (каждое редактирование) | Редко (переключение вкладок) |
| **Нужен ли контекст stores** | ✅ Да (нужны eventsStore, projectsStore) | ❌ Нет (только documentId) |
| **Подход** | Колбэк с параметрами | Реактивное программирование |

### Почему не полностью реактивный подход?

Колбэки `onStoresChanged` передают **контекст** (какие сторы изменились, в каком документе), что важно для:
- Проверки `activeDoc.id === stores.documentId` (сохраняем только активный документ)
- Автоматического сохранения при изменениях
- Логирования и отладки

Reaction для `activeDocumentId** не нужен контекст — только факт изменения.

---

## Пошаговый план

### Шаг 1: Добавить `reaction` в `MainStore.init()`

**Файл**: `src/1-app/Stores/MainStore.ts`

**Изменения**:

1. **Добавить импорты**:
```typescript
import { makeAutoObservable, reaction, IReactionDisposer } from 'mobx'
```

2. **Добавить поле для disposer**:
```typescript
export class MainStore {
    // ... существующие поля ...

    /** Disposer для реакции на смену активного документа */
    private disposeReactionActiveDoc: IReactionDisposer | null = null

    // ...
```

3. **Добавить `reaction` в `init()`**:

Найти блок:
```typescript
// Инвалидировать кэш при смене активного документа (переключение вкладки)
this.documentTabsStore.setOnActiveDocumentChanged(() => {
    this.eventsCache.init()
})
```

Заменить на:
```typescript
// РЕАКТИВНАЯ инвалидация кэша при смене активного документа
this.disposeReactionActiveDoc = reaction(
    () => this.documentTabsStore.activeDocumentId,
    (documentId) => {
        if (documentId) {
            this.eventsCache.init()
        }
    },
    {
        fireImmediately: false, // Не вызывать при инициализации (init() вызывается ниже)
        name: 'invalidateCacheOnActiveDocChange' // Для отладки в DevTools
    }
)
```

4. **Добавить метод `dispose()`**:
```typescript
/**
 * Очистка ресурсов (reaction disposer).
 * Вызывается при уничтожении приложения (logout, HMR, тесты).
 */
dispose() {
    this.disposeReactionActiveDoc?.()
    this.disposeReactionActiveDoc = null
}
```

**Итоговые изменения в MainStore.ts**:
- ✅ Добавлены импорты `reaction`, `IReactionDisposer`
- ✅ Добавлено поле `disposeReactionActiveDoc`
- ✅ Заменён `setOnActiveDocumentChanged` на `reaction`
- ✅ Добавлен метод `dispose()`

---

### Шаг 2: Удалить колбэк `onActiveDocumentChanged` из `DocumentTabsStore`

**Файл**: `src/6-entities/Document/model/DocumentTabsStore.ts`

**Изменения**:

1. **Удалить поле** (строка ~53):
```typescript
- /** Колбэк при смене активного документа (для инвалидации кэша и т.п.) */
- private onActiveDocumentChanged?: (documentId: DocumentId) => void
```

2. **Удалить метод** (строки ~56-59):
```typescript
- /** Установить колбэк при смене активного документа (вызывается из MainStore) */
- setOnActiveDocumentChanged(callback: (documentId: DocumentId) => void): void {
-     this.onActiveDocumentChanged = callback
- }
```

3. **Удалить все вызовы колбэка** из методов:

   - `activateDocument()` (строка ~223):
   ```typescript
   - // Уведомляем об изменении активного документа (инвалидация кэша и т.п.)
   - this.onActiveDocumentChanged?.(documentId)
   ```

   - Проверить остальные методы (`closeDocument`, `restoreFromLocalStorage` и т.д.) — удалить все вызовы

**Итоговые изменения в DocumentTabsStore.ts**:
- ✅ Удалено поле `onActiveDocumentChanged`
- ✅ Удалён метод `setOnActiveDocumentChanged`
- ✅ Удалены все вызовы колбэка

---

### Шаг 3: Обновить `MainStore.init()` — удалить вызов `setOnActiveDocumentChanged`

**Файл**: `src/1-app/Stores/MainStore.ts`

**Изменения**:

Удалить вызов:
```typescript
- // Инвалидировать кэш при смене активного документа (переключение вкладки)
- this.documentTabsStore.setOnActiveDocumentChanged(() => {
-     this.eventsCache.init()
- })
```

Этот код уже заменён на `reaction` (Шаг 1).

---

### Шаг 4: Добавить `dispose()` в `App.tsx` при unmount

**Файл**: `src/1-app/App/App.tsx`

**Изменения**:

Добавить cleanup при unmount компонента:
```typescript
const App: React.FC = observer(function () {
    const { uiStore, documentTabsStore, mainStore } = useContext(StoreContext)

    // ✅ Cleanup при unmount (HMR, тесты, future logout)
    React.useEffect(() => {
        return () => {
            mainStore.dispose()
        }
    }, [mainStore])

    // ... остальной код ...
```

**Зачем это нужно**:
- **HMR (hot reload)**: При горячей перезагрузке `App` unmount-ится, store может пересоздаваться
- **Тесты**: Jest тесты создают/уничтожают компоненты
- **Future-proof**: Если добавится logout, dispose уже работает

---

### Шаг 5: Добавить `dispose()` в `root.ts` (опционально)

**Файл**: `src/1-app/root.ts`

**Изменения**:

Если есть глобальная функция очистки приложения:
```typescript
// Добавить в exports
export function disposeApp() {
    mainStore.dispose()
    documentTabsStore.dispose() // Если у него тоже появятся reaction
    // ... другие store dispose
}
```

**Примечание**: Это нужно только если есть сценарий полного пересоздания приложения (logout, сброс сессии).

---

### Шаг 6: Обновить типизацию `IRootStore` (если нужно)

**Файл**: `src/1-app/Providers/StoreContext.ts`

**Изменения**:

Если `IRootStore` требует обновления — добавить `dispose()` в интерфейс:
```typescript
export interface IRootStore {
    // ... существующие поля ...
    mainStore: MainStore
    // ...
}
```

`MainStore` уже экспортируется, так что скорее всего **изменения не нужны**.

---

### Шаг 7: Протестировать все сценарии

#### Тест-кейсы

| # | Сценарий | Ожидаемый результат | Приоритет |
|---|----------|-------------------|-----------|
| 1 | **Открытие нового документа** (`+` кнопка) | Календарь показывает пустой документ | 🔴 Критический |
| 2 | **Переключение между вкладками** | Календарь обновляется под активный документ | 🔴 Критический |
| 3 | **Закрытие документа** | Календарь показывает следующий документ или EmptyState | 🔴 Критический |
| 4 | **Открытие документа из Google Drive** | Календарь показывает загруженный документ | 🟡 Важный |
| 5 | **Восстановление из localStorage** | Календарь показывает последний активный документ | 🟡 Важный |
| 6 | **Быстрое переключение вкладок** | Нет race condition, календарь корректен | 🟢 Желательный |
| 7 | **HMR (hot reload)** | Нет утечек memory, reaction пересоздаётся | 🟢 Желательный |
| 8 | **Jest тесты** | Нет утечек между тестами | 🟢 Желательный |

#### Как тестировать

1. **Ручное тестирование** (сценарии 1-5):
   ```bash
   npm start
   ```
   Пройти по всем сценариям, проверить что календарь обновляется.

2. **DevTools проверка** (сценарий 6):
   - Открыть MobX DevTools
   - Переключать вкладки быстро (5-10 раз подряд)
   - Проверить что reaction вызывается корректно
   - Проверить что нет лишних вызовов

3. **Memory leak проверка** (сценарии 7-8):
   ```bash
   npm test
   ```
   - Запустить тесты
   - Проверить что после каждого теста нет warning-ов
   - В Chrome DevTools: Memory → Heap snapshot → сравнить до/после

---

### Шаг 8: Обновить документацию

**Файлы для обновления**:

1. `docs/architecture/store-management.md` (если есть)
   - Добавить описание реактивного подхода
   - Обновить диаграмму зависимостей

2. `docs/architecture/decision-records.md` (если есть)
   - Записать ADR: "Использование reaction для activeDocumentId"

3. `README.md` или `CONTRIBUTING.md`
   - Добавить best practice: "Для reaction всегда используйте dispose"

---

## Потенциальные проблемы и решения

### Проблема 1: Reaction выполняется асинхронно

**Симптом**: Код после изменения `activeDocumentId` зависит от обновлённого кэша.

**Решение**:
```typescript
{
    fireImmediately: true  // Вызвать reaction сразу
}
```

**В нашем случае**: НЕ нужно `fireImmediately`, т.к.:
- `eventsCache.init()` вызывается ниже в `init()` вручную
- Reaction нужен только для **последующих** изменений
- Синхронность не критична (UI перерендерится через MobX)

### Проблема 2: Reaction срабатывает при intermediate значениях

**Симптом**: При закрытии документа `activeDocumentId` меняется: `doc1 → null → doc2`

**Решение**:
```typescript
(documentId) => {
    if (documentId) {  // ✅ Пропускаем null
        this.eventsCache.init()
    }
}
```

### Проблема 3: Утечка памяти при HMR

**Симптом**: При hot reload disposer не вызывается, reaction накапливаются.

**Решение**:
- ✅ Шаг 4: `useEffect(() => () => mainStore.dispose(), [])`
- ✅ Шаг 5: Глобальный `disposeApp()` при необходимости

### Проблема 4: Reaction не срабатывает при первом открытии

**Симптом**: При открытии первого документа календарь пустой.

**Решение**:
- ✅ `eventsCache.init()` вызывается вручную в конце `init()`
- ✅ Reaction сработает только при **изменении** (не при инициализации)
- ✅ `fireImmediately: false` (по умолчанию)

---

## Чек-лист готовности к реализации

- [ ] Изучены все файлы (MainStore, DocumentTabsStore, App, root)
- [ ] Понятен поток данных и зависимости
- [ ] Определены все места вызова `onActiveDocumentChanged`
- [ ] Спроектирован dispose механизм
- [ ] Составлены тест-кейсы
- [ ] Оценены риски и mitigation strategies

---

## Чек-лист после реализации

- [ ] Шаг 1 выполнен: `reaction` добавлен в MainStore
- [ ] Шаг 2 выполнен: `onActiveDocumentChanged` удалён из DocumentTabsStore
- [ ] Шаг 3 выполнен: `setOnActiveDocumentChanged` вызов удалён
- [ ] Шаг 4 выполнен: `dispose()` добавлен в App.tsx
- [ ] Шаг 5 выполнен: (опционально) глобальный dispose
- [ ] Шаг 6 выполнен: типизация обновлена (если нужно)
- [ ] Шаг 7 выполнен: все тест-кейсы пройдены
- [ ] Шаг 8 выполнен: документация обновлена
- [ ] Код отформатирован: `npm run format`
- [ ] Линтер пройден: `npm run lint`
- [ ] Тесты пройдены: `npm test`
- [ ] Собрание без ошибок: `npm run build`

---

## Временная оценка (для справки)

| Шаг | Сложность | Время |
|-----|-----------|-------|
| 1. Добавить reaction в MainStore | ⭐⭐ | 10 мин |
| 2. Удалить колбэк из DocumentTabsStore | ⭐ | 5 мин |
| 3. Обновить MainStore.init() | ⭐ | 3 мин |
| 4. Добавить dispose в App.tsx | ⭐⭐ | 8 мин |
| 5. Глобальный dispose (опционально) | ⭐ | 5 мин |
| 6. Обновить типизацию | ⭐ | 3 мин |
| 7. Тестирование | ⭐⭐⭐ | 30 мин |
| 8. Документация | ⭐⭐ | 15 мин |
| **Итого** | | **~79 мин** |

---

## Риски и mitigation

| Риск | Вероятность | Влияние | Mitigation |
|------|-------------|---------|------------|
| Reaction не срабатывает | Низкая | 🔴 Критическое | Тест-кейс #1 |
| Утечка памяти (забытый dispose) | Средняя | 🟡 Среднее | Шаг 4, 5 |
| Race condition при быстром переключении | Низкая | 🟡 Среднее | Тест-кейс #6 |
| HMR дублирует reaction | Средняя | 🟢 Низкое | Шаг 4 (useEffect cleanup) |
| Регрессия в существующих тестах | Средняя | 🟡 Среднее | Запустить `npm test` |

---

## Следующие шаги

После реализации:

1. **Мониторинг**: Проверить приложение в production (если возможно)
2. **Сбор фидбека**: Убедиться что пользователи не видят регрессий
3. **Документирование**: Обновить onboarding guide для новых разработчиков
4. **Рефакторинг (future)**: Рассмотреть переход на fully reactive подход (Вариант 3 из анализа)

---

## Ссылки

- [Анализ проблемы](./tab-switching-calendar-update-issue-analysis.md)
- [MobX reaction documentation](https://mobx.js.org/reactions.html#reaction)
- [MobX dispose patterns](https://mobx.js.org/reactions.html#disposers)
