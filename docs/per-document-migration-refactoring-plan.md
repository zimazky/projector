# План рефакторинга: Устранение дефектов миграции на DocumentStoreManager

**Дата:** 10 апреля 2026 г.  
**Автор:** AI Assistant  
**Статус:** Готов к реализации  
**Основан на аудитах:**
- `per-document-core-migration-audit.txt`
- `per-document-tests-audit-report.txt`
- `per-document-ui-usage-audit.txt`

---

## Обзор

Миграция на per-document stores архитектурно завершена функционально, но остаются дефекты в persistence, реактивности, null-safety, UX и тестировании. Этот план систематизирует все выявленные проблемы и предлагает конкретные шаги по их устранению.

### Общая статистика дефектов

| Приоритет | Количество | Описание |
|-----------|------------|----------|
| **Критичный** | 3 | Неполная агрегация, legacy persistence, кросс-документный риск |
| **Высокий** | 4 | Null-safety, гибридный StorageService, отсутствие reaction на ProjectsStore |
| **Средний** | 6 | Глобальный lock, отсутствие aggregated cache, mixed lifecycle |
| **Низкий** | 4 | Literals, недоинтегрированный timestamp, дублирование валидации |

---

## Фаза 1: Критичные дефекты ядра (Core Critical Fixes)

**Цель:** Устранить дефекты, которые делают агрегацию и persistence ненадёжными.

---

### Задача 1.1: getAllStores() должен возвращать сторы для ВСЕХ документов

**Приоритет:** Критичный  
**Аудит:** #1, #2  
**Файлы:**
- `src/6-entities/Document/model/DocumentStoreManager.ts`
- `src/6-entities/Document/model/DocumentTabsStore.ts`
- `src/6-entities/EventsCache/EventsCache.ts`

**Проблема:**
`DocumentStoreManager.getAllStores()` возвращает `Array.from(this.stores.values())` — только уже созданные (materialized) сторы. Если документ открыт в `DocumentTabsStore.state.documents`, но его сторы ещё не были затребованы через `getOrCreateStores()`, он не попадёт в агрегацию для общего календаря.

**Решение:**
Создать два метода с чёткими семантическими контрактами:

```typescript
// В DocumentStoreManager.ts

/**
 * Получить все ИНИЦИАЛИЗИРОВАННЫЕ сторы.
 * Для внутреннего использования (reactivity, callbacks).
 */
getInitializedStores(): DocumentStores[] {
	return Array.from(this.stores.values())
}

/**
 * Получить сторы для ВСЕХ документов из tabs store.
 * Лениво создаёт сторы для документов, у которых их ещё нет.
 * Используется для агрегации (общий календарь).
 */
getAllStoresInitialized(getAllDocumentIds: () => DocumentId[]): DocumentStores[] {
	const allIds = getAllDocumentIds()
	const result: DocumentStores[] = []
	for (const id of allIds) {
		result.push(this.getOrCreateStores(id))
	}
	return result
}
```

В `DocumentTabsStore.ts` добавить обёртку:

```typescript
/**
 * Получить все сторы документов (для общего календаря).
 * Гарантирует что все сторы инициализированы.
 */
getAllDocumentStores(): DocumentStores[] {
	const allIds = this.state.documentOrder.slice()
	return this.documentStoreManager.getAllStoresInitialized(() => allIds)
}
```

**Критерий приёмки:**
- `getAllDocumentStores()` возвращает сторы для ВСЕХ документов из `documentOrder`
- Unit-тест: создать 3 документа, вызвать `getAllDocumentStores()`, убедиться что все 3 имеют сторы

---

### Задача 1.2: StorageService — перенести persistence на per-document API

**Приоритет:** Критичный  
**Аудит:** #3, #4  
**Файлы:**
- `src/7-shared/services/StorageService.ts`
- `src/1-app/Stores/MainStore.ts`

**Проблема:**
`saveToLocalStorage()` и `getContentToSave()` работают только с активным документом и пишут в legacy key `'data'` вместо per-document key `document_${documentId}`. Это ломает персистентность в multi-document архитектуре.

**Решение:**

1. **Переписать `saveToLocalStorage` на per-document API:**

```typescript
/**
 * Сохранить данные конкретного документа в localStorage.
 * @param documentId - ID документа для сохранения
 */
saveToLocalStorage = (documentId: DocumentId) => {
	const stores = this.documentTabsStore.getDocumentStores(documentId)
	if (!stores) return

	const data: MainStoreData = {
		projectsList: stores.projectsStore.getList(),
		...stores.eventsStore.prepareToSave()
	}
	// НОВОЕ: используем per-document key
	localStorage.setItem(`document_${documentId}`, JSON.stringify(data))
	this.isSyncWithLocalstorage = true
}
```

2. **Переписать `getContentToSave` на per-document API:**

```typescript
/**
 * Получить снапшот данных конкретного документа.
 * @param documentId - ID документа
 */
getContentToSave = (documentId: DocumentId) => {
	const stores = this.documentTabsStore.getDocumentStores(documentId)
	if (!stores) return null

	const data: MainStoreData = {
		projectsList: stores.projectsStore.getList(),
		...stores.eventsStore.prepareToSave()
	}
	return data
}
```

3. **Добавить метод `saveAllDocumentsToLocalStorage`:**

```typescript
/** Сохранить ВСЕ документы в localStorage (для backup/sync) */
saveAllDocumentsToLocalStorage = () => {
	const allStores = this.documentTabsStore.getAllDocumentStores()
	for (const stores of allStores) {
		this.saveToLocalStorage(stores.documentId)
	}
}
```

4. **Удалить legacy `localStorage.setItem('data', ...)`** — больше не используется.

5. **В MainStore.onStoresChange** вызывать `saveToLocalStorage(documentId)` вместо reliance на `updateActiveDocumentData`:

```typescript
this.documentTabsStore.onStoresChange = (documentId, stores) => {
	stores.eventsStore.sort()
	this.eventsCache.init()
	this.storageService.desyncWithStorages()

	// НОВОЕ: Сохраняем конкретный документ, а не только активный
	this.storageService.saveToLocalStorage(documentId)

	// Обновляем session.data документа (не только активного)
	this.documentTabsStore.updateDocumentData(documentId, {
		projectsList: stores.projectsStore.getList(),
		...stores.eventsStore.prepareToSave()
	})
}
```

**Критерий приёмки:**
- `saveToLocalStorage(docId)` пишет в `document_${docId}`, а не в `'data'`
- Ручной тест: создать 2 документа, изменить оба, проверить localStorage — оба ключа `document_*` обновлены
- Legacy key `'data'` больше не записывается

---

### Задача 1.3: EventsCache агрегация должна использовать getAllDocumentStores()

**Приоритет:** Критичный  
**Аудит:** #2  
**Файл:** `src/6-entities/EventsCache/EventsCache.ts`

**Проблема:**
`getAggregatedEvents()` и `getAggregatedBalance()` вызывают `getAllDocumentStores()`, который (до задачи 1.1) не гарантировал все документы. После выполнения задачи 1.1 нужно убедиться что агрегация использует гарантированно полный список.

**Решение:**
После выполнения задачи 1.1 — убедиться что `getAggregatedEvents` и `getAggregatedBalance` используют `this.documentTabsStore.getAllDocumentStores()` (который теперь гарантирует все документы).

Добавить комментарий-предупреждение:

```typescript
/**
 * Получить агрегированные события из ВСЕХ открытых документов.
 * ВАЖНО: getAllDocumentStores() гарантирует что все документы имеют сторы.
 */
getAggregatedEvents(date: timestamp): EventCacheStructure[] {
	// ... существующий код без изменений
}
```

**Критерий приёмки:**
- Unit-тест: создать 3 документа с разными событиями, вызвать `getAggregatedEvents()`, убедиться что события всех 3 документов присутствуют

---

### ✅ Чек-лист Фазы 1

- [ ] `DocumentStoreManager.getAllStoresInitialized()` добавлен
- [ ] `DocumentTabsStore.getAllDocumentStores()` обновлён для гарантии всех документов
- [ ] `StorageService.saveToLocalStorage(documentId)` — per-document API
- [ ] `StorageService.getContentToSave(documentId)` — per-document API
- [ ] Legacy key `'data'` удалён
- [ ] `MainStore.onStoresChange` вызывает per-document save
- [ ] `EventsCache` агрегация подтверждена с полным списком
- [ ] Unit-тесты для getAllStores guarantee
- [ ] Ручной тест: общий календарь показывает события всех документов

---

## Фаза 2: Null-safety и кросс-документный риск (UI Critical Fixes)

**Цель:** Устранить runtime crash-риски и кросс-документные race conditions.

---

### Задача 2.1: EventSearchStore — null-safety и reset при смене документа

**Приоритет:** Высокий  
**Аудит:** UI #3  
**Файл:** `src/5-features/EventSearch/EventSearchStore.ts`

**Проблема:**
1. Массовое использование `this.activeEventsStore!` (non-null assertion) — при отсутствии активного документа возможен runtime crash.
2. Состояние поиска (`results`, `currentIndex`, `earliestFound`, `latestFound`) не привязано к `documentId` — при переключении вкладки результаты поиска становятся невалидными.
3. `toggleActive/search` допускают сценарий без активного документа.

**Решение:**

1. **Заменить `!` на guards:**

```typescript
private findNearestAfter(fromTimestamp: timestamp, limit: number): SearchResult[] {
	const store = this.activeEventsStore
	if (!store) return []  // вместо store!

	const candidates: SearchResult[] = []
	for (const event of store.planned) {
		// ...
	}
	// ...
}
```

Применить ко всем методам: `findNearestAfter`, `findNearestBefore`, `loadMoreAfter`, `loadMoreBefore`.

2. **Добавить reset при смене документа:**

```typescript
/** Текущий documentId, к которому привязан поиск */
private _currentDocumentId: DocumentId | null = null

constructor(documentTabsStore: DocumentTabsStore) {
	this.documentTabsStore = documentTabsStore
	makeAutoObservable(this)

	// Подписаться на смену документа и сбросить поиск
	// Используем autorun из MobX для реактивности
	makeObservable(this, {
		// ...
	})
}

/**
 * Привязать поиск к текущему активному документу.
 * Вызывать при каждом поисковом запросе.
 */
private ensureDocumentBinding() {
	const currentId = this.documentTabsStore.activeDocumentId
	if (currentId !== this._currentDocumentId) {
		// Документ сменился — сбросить результаты
		this.performClear()
		this._currentDocumentId = currentId
	}
}
```

Вызывать `ensureDocumentBinding()` в начале `search()`:

```typescript
search(query: string) {
	this.ensureDocumentBinding()  // <-- ДОБАВИТЬ
	this.query = query.trim().toLowerCase()
	// ...
}
```

3. **Guard для методов без активного документа:**

```typescript
toggleActive() {
	this.isActive = !this.isActive
	if (!this.isActive) {
		this.clear()
	}
	// Если нет активного документа — не активировать поиск
	if (!this.documentTabsStore.activeDocumentId) {
		this.isActive = false
	}
}
```

**Критерий приёмки:**
- Нет `!` assertions в коде
- Unit-тест: поиск без активного документа → пустые результаты, без crash
- Unit-тест: переключение документа во время поиска → результаты сбрасываются

---

### Задача 2.2: ProjectEditorStore — null-safety и documentId binding

**Приоритет:** Высокий  
**Аудит:** UI #5  
**Файл:** `src/5-features/ProjectManager/ProjectEditor/ProjectEditorStore.ts`

**Проблема:**
1. `this.activeProjectsStore!` используется в `openEdit`, `validate`, `save` — при отсутствии активного документа runtime crash.
2. Редактор не закреплён за `documentId` — если открыть редактирование в документе A, переключиться на B и сохранить, операция пойдёт в B.
3. `openAdd()` позволяет открыть форму без активного документа.

**Решение:**

1. **Зафиксировать documentId при открытии формы:**

```typescript
/** DocumentId, к которому привязана текущая операция */
private _boundDocumentId: DocumentId | null = null

openAdd() {
	const activeId = this.documentTabsStore.activeDocumentId
	if (!activeId) return  // Не открывать без активного документа

	this._boundDocumentId = activeId
	this.mode = 'add'
	this.formData = { name: '', color: '#000000', background: '#ffffff' }
	this.errors = {}
	this.originalName = ''
	this.isOpen = true
}

openEdit(projectName: string) {
	const activeId = this.documentTabsStore.activeDocumentId
	if (!activeId) return  // Не открывать без активного документа

	const stores = this.documentTabsStore.getDocumentStores(activeId)
	if (!stores) return

	const project = stores.projectsStore.getByName(projectName)
	if (!project) return

	this._boundDocumentId = activeId
	// ... остальная логика
}
```

2. **Использовать зафиксированный documentId в save/validate:**

```typescript
private get boundProjectsStore(): ProjectsStore | null {
	if (!this._boundDocumentId) return null
	return this.documentTabsStore.getDocumentStores(this._boundDocumentId)?.projectsStore ?? null
}

validate(): boolean {
	const store = this.boundProjectsStore
	if (!store) {
		this.errors.name = 'No document bound'
		return false
	}

	const errors: ProjectFormErrors = {}
	if (this.formData.name.trim() === '') {
		errors.name = 'Project name is required'
	} else if (this.mode === 'add' && store.exists(this.formData.name.trim())) {
		errors.name = 'Project with this name already exists'
	}
	// ... остальная валидация
}

save(): boolean {
	if (!this.validate()) return false

	const store = this.boundProjectsStore
	if (!store) return false

	// ... используем store вместо this.activeProjectsStore!
}
```

3. **Сбросить boundDocumentId при закрытии:**

```typescript
close() {
	this.isOpen = false
	this.errors = {}
	this._boundDocumentId = null  // <-- ДОБАВИТЬ
}
```

**Критерий приёмки:**
- Нет `!` assertions в коде
- Unit-тест: открыть редактирование в документе A, переключиться на B, сохранить → изменения в A
- Unit-тест: `openAdd()` без активного документа → форма не открывается

---

### Задача 2.3: EventForm — кросс-документный риск и stale form data

**Приоритет:** Высокий  
**Аудит:** UI #1  
**Файл:** `src/4-widgets\EventForm\EventForm.tsx`

**Проблема:**
1. Форма редактирует событие из `eventFormStore`, но сохраняет/удаляет в store **текущего активного** документа. Если переключиться на другой документ пока форма открыта, операция пойдёт в другой документ.
2. `react-hook-form` использует `defaultValues` только при инициализации — нет `reset` при смене `eventFormStore.eventData`.
3. При отсутствии `eventsStore` кнопки молча не делают ничего (`if (!eventsStore) return`).

**Решение:**

1. **Зафиксировать documentId при открытии формы (в EventFormStore):**

```typescript
// В EventFormStore.ts (если существует, или добавить поле)
private _boundDocumentId: DocumentId | null = null

openForEdit(eventData: EventFormData, documentId: DocumentId) {
	this._boundDocumentId = documentId
	this.eventData = eventData
	// ...
}

get boundDocumentId() {
	return this._boundDocumentId
}
```

2. **В EventForm.tsx — использовать зафиксированный documentId:**

```typescript
const EventForm: React.FC = () => {
	const { eventFormStore, eventsCache, documentTabsStore } = useContext(StoreContext)

	// НОВОЕ: получить сторы по зафиксированному documentId, а не активному
	const boundDocId = eventFormStore.boundDocumentId
	const stores = boundDocId
		? documentTabsStore.getDocumentStores(boundDocId)
		: documentTabsStore.getActiveDocumentStores()

	const eventsStore = stores?.eventsStore
	const projectsStore = stores?.projectsStore

	// ...
}
```

3. **Добавить `reset` при смене eventData:**

```typescript
const { register, watch, handleSubmit, formState, reset } = useForm<Fields>({
	// ...
})

// Reset при смене eventData
React.useEffect(() => {
	reset({
		name: eventFormStore.eventData.name,
		comment: eventFormStore.eventData.comment,
		// ... все поля
	})
}, [eventFormStore.eventData.id, eventFormStore.eventData.timestamp])
```

4. **Добавить empty state / disabled при отсутствии eventsStore:**

```typescript
if (!eventsStore) {
	return <div className={styles.noDocument}>Нет активного документа</div>
}
```

**Критерий приёмки:**
- Форма привязана к documentId, а не к активному документу
- Unit-тест: открыть форму в документе A, переключиться на B, сохранить → изменения в A
- `reset` вызывается при смене eventData

---

### Задача 2.4: Calendar.tsx — empty state и forceUpdate smell

**Приоритет:** Средний  
**Аудит:** UI #2  
**Файл:** `src/3-pages/Calendar/Calendar.tsx`

**Проблема:**
1. При `!eventsStore` drag/drop silently no-op — плохой UX.
2. `forceUpdate()` после drag/drop — symptom of incomplete reactivity.
3. Модалка EventForm рендерится глобально — риск кросс-документного редактирования.

**Решение:**

1. **Добавить empty state:**

```typescript
if (!eventsStore) {
	return (
		<div className={styles.emptyState}>
			<p>Нет открытого документа</p>
			<Button onClick={() => documentTabsStore.openNewDocument()}>
				Создать документ
			</Button>
		</div>
	)
}
```

2. **Удалить `forceUpdate()`** — после корректной реактивности через `onStoresChange` / `onActiveDocumentChange` он не нужен. Вместо этого убедиться что `eventsCache.init()` вызывается реактивно.

3. **Drag/drop guard:**

```typescript
const handleDrop = (eventId, newDate) => {
	if (!eventsStore) {
		console.warn('Cannot drop event: no active document')
		return
	}
	// ... логика
}
```

**Критерий приёмки:**
- Календарь показывает empty state без активного документа
- `forceUpdate()` удалён
- Drag/drop без активного документа → warning, не silent no-op

---

### Задача 2.5: ProjectList.tsx — empty state и Add Project guard

**Приоритет:** Средний  
**Аудит:** UI #4  
**Файл:** `src/5-features/ProjectManager/ProjectList/ProjectList.tsx`

**Проблема:**
1. Без активного документа — пустой список без объяснения.
2. Кнопка `Add Project` доступна без активного документа.
3. Удаление через confirm может молча не выполниться.

**Решение:**

1. **Empty state:**

```typescript
if (!projectsStore) {
	return <div className={styles.emptyState}>Нет открытого документа</div>
}
```

2. **Disable Add Project button:**

```typescript
<Button onClick={handleAdd} disabled={!projectsStore}>
	Add Project
</Button>
```

3. **Guard для удаления:**

```typescript
const handleDelete = (projectName: string) => {
	if (!projectsStore) {
		console.warn('Cannot delete: no active document')
		return
	}
	projectsStore.remove(projectName)
}
```

**Критерий приёмки:**
- Empty state отображается без активного документа
- Кнопка Add Project disabled без активного документа

---

### ✅ Чек-лист Фазы 2

- [ ] EventSearchStore: все `!` заменены на guards
- [ ] EventSearchStore: `ensureDocumentBinding()` добавлен
- [ ] EventSearchStore: reset при смене документа
- [ ] ProjectEditorStore: `_boundDocumentId` добавлен
- [ ] ProjectEditorStore: `openAdd/openEdit` проверяют активный документ
- [ ] ProjectEditorStore: `save/validate` используют boundDocumentId
- [ ] EventForm: reset при смене eventData
- [ ] EventForm: empty state без eventsStore
- [ ] Calendar.tsx: empty state, удалён forceUpdate
- [ ] ProjectList.tsx: empty state, disabled button
- [ ] Unit-тесты для всех null-safety сценариев

---

## Фаза 3: Реактивность и lifecycle (Reactivity Fixes)

**Цель:** Унифицировать реакцию на изменения сторов и устранить гибридный lifecycle.

---

### Задача 3.1: Реакция на изменения ProjectsStore

**Приоритет:** Высокий  
**Аудит:** #5  
**Файлы:**
- `src/6-entities/Document/model/DocumentStoreManager.ts`
- `src/1-app/Stores/MainStore.ts`

**Проблема:**
`onStoresChange` реагирует только на `eventsStore.onChangeList`, но не на изменения `projectsStore`. Изменение цвета/фона проекта не триггерит обновление EventsCache (который использует `projectsStore.getById()` для цветов).

**Решение:**

1. **Добавить callback для ProjectsStore в DocumentStoreManager:**

```typescript
// В DocumentStoreManager.ts
getOrCreateStores(documentId: DocumentId): DocumentStores {
	// ... создание projectsStore

	// Установить callback на изменения проектов
	projectsStore.onChangeList = () => {
		if (this.isInitializing) return
		this._lastChangeTimestamp = Date.now()
		this.onStoresChange?.(documentId, {
			projectsStore,
			eventsStore,
			documentId,
			isInitialized: true
		})
	}

	// ... остальная логика
}
```

2. **В ProjectsStore добавить callback:**

```typescript
// В ProjectsStore.ts
onChangeList?: () => void

add(name: string, color: string, background: string): boolean {
	// ... логика
	this.onChangeList?.()  // <-- ДОБАВИТЬ
	return success
}

update(oldName: string, data: { name: string; color: string; background: string }): boolean {
	// ... логика
	this.onChangeList?.()  // <-- ДОБАВИТЬ
}

remove(name: string): boolean {
	// ... логика
	this.onChangeList?.()  // <-- ДОБАВИТЬ
}
```

**Критерий приёмки:**
- Unit-тест: изменить цвет проекта → onStoresChange вызывается
- Ручной тест: изменить цвет проекта → календарь обновляется

---

### Задача 3.2: Устранить глобальный isInitializing lock

**Приоритет:** Средний  
**Аудит:** #6  
**Файл:** `src/6-entities/Document/model/DocumentStoreManager.ts`

**Проблема:**
`isInitializing` — общий на весь manager, а не per-document. Подавление `onChangeList` получается глобальным, что хрупко при параллельной загрузке нескольких документов.

**Решение:**

Заменить глобальный флаг на per-document Set:

```typescript
/** Set документов, которые находятся в процессе инициализации */
private initializingDocs: Set<DocumentId> = new Set()

/** Проверить, инициализируется ли документ */
private isDocumentInitializing(documentId: DocumentId): boolean {
	return this.initializingDocs.has(documentId)
}

/** Начать инициализацию документа */
private beginInitialization(documentId: DocumentId) {
	this.initializingDocs.add(documentId)
}

/** Завершить инициализацию документа */
private endInitialization(documentId: DocumentId) {
	this.initializingDocs.delete(documentId)
}
```

Применить в `getOrCreateStores` и `updateStoresData`:

```typescript
getOrCreateStores(documentId: DocumentId): DocumentStores {
	// ... создание stores

	this.beginInitialization(documentId)
	eventsStore.init({ ... })
	this.endInitialization(documentId)

	eventsStore.onChangeList = () => {
		if (this.isDocumentInitializing(documentId)) return
		// ...
	}
}
```

**Критерий приёмки:**
- Unit-тест: инициализация 2 документов параллельно → onChangeList не подавляется глобально

---

### Задача 3.3: updateStoresData() должен триггерить store-change lifecycle

**Приоритет:** Средний  
**Аудит:** #7, #12  
**Файл:** `src/6-entities/Document/model/DocumentStoreManager.ts`

**Проблема:**
`updateStoresData()` обновляет stores, но не обновляет `_lastChangeTimestamp` и не вызывает `onStoresChange`. Поведение при внешней замене данных отличается от user edits.

**Решение:**

Унифицировать контракт — `updateStoresData()` тоже триггерит изменение:

```typescript
updateStoresData(
	documentId: DocumentId,
	data: { projectsList: any[]; completedList: any[]; plannedList: any[] }
): void {
	const stores = this.getOrCreateStores(documentId)

	this.beginInitialization(documentId)
	stores.projectsStore.init(data.projectsList)
	stores.eventsStore.init({ completedList: data.completedList, plannedList: data.plannedList })
	this.endInitialization(documentId)

	// НОВОЕ: Триггерить изменение (как при user edit)
	this._lastChangeTimestamp = Date.now()
	this.onStoresChange?.(documentId, {
		projectsStore: stores.projectsStore,
		eventsStore: stores.eventsStore,
		documentId,
		isInitialized: true
	})
}
```

**Критерий приёмки:**
- Unit-тест: `updateStoresData()` → `onStoresChange` вызывается

---

### Задача 3.4: MainStore — updateDocumentData вместо updateActiveDocumentData

**Приоритет:** Средний  
**Аудит:** #8  
**Файлы:**
- `src/1-app/Stores/MainStore.ts`
- `src/6-entities/Document/model/DocumentTabsStore.ts`

**Проблема:**
`onStoresChange` обновляет snapshot только активного документа через `updateActiveDocumentData`. При фоновых изменениях неактивных документов session.data разойдётся со сторами.

**Решение:**

1. **Добавить `updateDocumentData` в DocumentTabsStore:**

```typescript
/** Обновить данные любого документа (не только активного) */
updateDocumentData(documentId: DocumentId, data: DocumentData) {
	const session = this.state.documents.get(documentId)
	if (!session) return

	// Не обновляем isDirty, если документ сохраняется/загружается
	if (session.state.isSaving || session.state.isLoading) return

	session.data = data
	session.state.isDirty = true
	session.lastAccessedAt = Date.now()

	if (session.state.syncStatus === 'synced') {
		session.state.syncStatus = 'needs-sync'
	} else if (session.state.syncStatus === 'update-available') {
		session.state.syncStatus = 'needs-sync'
	}

	this.persistDocumentDataToLocalStorage(documentId)
	this.persistToLocalStorage()
}
```

2. **В MainStore.onStoresChange использовать `updateDocumentData`:**

```typescript
this.documentTabsStore.onStoresChange = (documentId, stores) => {
	stores.eventsStore.sort()
	this.eventsCache.init()
	this.storageService.desyncWithStorages()

	// НОВОЕ: Обновляем данные КОНКРЕТНОГО документа, не только активного
	this.documentTabsStore.updateDocumentData(documentId, {
		projectsList: stores.projectsStore.getList(),
		...stores.eventsStore.prepareToSave()
	})
}
```

**Критерий приёмки:**
- Unit-тест: изменение в неактивном документе → session.data обновляется
- `updateActiveDocumentData` можно оставить как обёртку над `updateDocumentData`

---

### ✅ Чек-лист Фазы 3

- [ ] ProjectsStore.onChangeList callback добавлен
- [ ] DocumentStoreManager реагирует на ProjectsStore изменения
- [ ] Глобальный `isInitializing` заменён на per-document Set
- [ ] `updateStoresData()` триггерит onStoresChange
- [ ] `DocumentTabsStore.updateDocumentData()` добавлен
- [ ] MainStore использует `updateDocumentData` вместо `updateActiveDocumentData`
- [ ] Unit-тесты для всех lifecycle сценариев

---

## Фаза 4: Агрегация и кэширование (Aggregation & Caching)

**Цель:** Добавить aggregated cache для общего календаря и разделить active/aggregated query.

---

### Задача 4.1: Добавить aggregated cache в EventsCache

**Приоритет:** Средний  
**Аудит:** #10  
**Файл:** `src/6-entities/EventsCache\EventsCache.ts`

**Проблема:**
`getEvents()` кэшируется, `getAggregatedEvents()` — нет. При общем календаре каждый вызов повторно проходит по всем документам.

**Решение:**

```typescript
/** Кэш агрегированных событий (по date) */
private cachedAggregatedEvents: EventCacheStructure[][] = []
/** Кэш агрегированного баланса */
private cachedAggregatedActualBalance: number[] = []
/** Флаг инвалидации aggregated cache */
private _aggregatedCacheInvalidated: boolean = true

/**
 * Получить агрегированные события из ВСЕХ документов.
 * Кэширует результаты.
 */
getAggregatedEvents(date: timestamp): EventCacheStructure[] {
	if (this.cachedAggregatedEvents[date] !== undefined && !this._aggregatedCacheInvalidated) {
		return this.cachedAggregatedEvents[date]
	}

	// ... существующая логика сбора ...

	this.cachedAggregatedEvents[date] = allEvents
	return allEvents
}

/** Инвалидировать aggregated cache */
invalidateAggregatedCache() {
	this._aggregatedCacheInvalidated = true
	this.cachedAggregatedEvents = []
}
```

Вызывать `invalidateAggregatedCache()` в `init()`:

```typescript
init() {
	// ... existing
	this.invalidateAggregatedCache()
}
```

**Критерий приёмки:**
- Unit-тест: первый вызов `getAggregatedEvents()` — собирает, второй — из кэша
- Unit-тест: `init()` → aggregated cache инвалидируется

---

### Задача 4.2: Разделить active-document cache и aggregated query service

**Приоритет:** Средний  
**Аудит:** #11  
**Файл:** `src/6-entities\EventsCache\EventsCache.ts`

**Проблема:**
EventsCache — гибрид: `init()`, balances, planned placeholders работают только для активного документа, а `getAggregatedEvents()` добавлен поверх. Это создаёт концептуальную путаницу.

**Решение (рекомендация, не обязательная для текущей итерации):**

На данном этапе **не требуется** разделение. Текущая архитектура EventsCache как document-aware abstraction достаточна для текущих требований. Разделение стоит выполнить при появлении:
- Необходимости показывать active и aggregated календари одновременно (side-by-side)
- Производительностных проблем с aggregated cache при >20 документах

**Вместо разделения — документация и чёткие контракты:**

```typescript
/**
 * EventsCache — кэш событий для текущего активного документа.
 *
 * Методы для активного документа:
 * - init() — инициализация кэша активного документа
 * - getEvents(date) — события активного документа
 * - getActualBalance(date) — баланс активного документа
 *
 * Методы агрегации (все документы):
 * - getAggregatedEvents(date) — события ВСЕХ документов
 * - getAggregatedBalance() — суммарный баланс ВСЕХ документов
 *
 * ВАЖНО: aggregated методы НЕ кэшируют balances — только events.
 */
export class EventsCache {
	// ...
}
```

**Критерий приёмки:**
- JSDoc-комментарий добавлен
- Разделение отложено как "future work"

---

### ✅ Чек-лист Фазы 4

- [ ] `cachedAggregatedEvents` массив добавлен
- [ ] `invalidateAggregatedCache()` метод добавлен
- [ ] `getAggregatedEvents()` использует cache
- [ ] `init()` инвалидирует aggregated cache
- [ ] JSDoc-комментарий с контрактами добавлен
- [ ] Unit-тесты для aggregated cache

---

## Фаза 5: Архитектурная очистка (Architecture Cleanup)

**Цель:** Устранить архитектурные несоответствия и legacy-следы.

---

### Задача 5.1: Вынести unified lifecycle для external data applied

**Приоритет:** Низкий/Средний  
**Аудит:** #13  
**Файлы:**
- `src/6-entities/Document/model/DocumentTabsStore.ts`

**Проблема:**
`openFromDrive()`, `restoreFromLocalStorage()`, `syncActiveDocumentWithDrive()` обновляют `session.data` и store pair разными путями. Где-то вызывается `onActiveDocumentChange`, где-то нет. `onStoresChange` в этих сценариях не участвует.

**Решение:**

Создать единый internal method для "document content replaced":

```typescript
/**
 * Внутренний метод для замены содержимого документа из внешнего источника.
 * Единообразно обновляет сессию, сторы и триггерит lifecycle.
 */
private applyDocumentContent(
	documentId: DocumentId,
	data: DocumentData,
	options: { triggerCallbacks?: boolean; markDirty?: boolean } = {}
) {
	const session = this.state.documents.get(documentId)
	if (!session) return

	const { triggerCallbacks = true, markDirty = false } = options

	// Обновляем сессию
	session.data = data
	if (markDirty) {
		session.state.isDirty = true
	}

	// Обновляем сторы через менеджер
	this.documentStoreManager.updateStoresData(documentId, {
		projectsList: data.projectsList,
		completedList: data.completedList,
		plannedList: data.plannedList
	})

	// Триггерим callback если нужно
	if (triggerCallbacks) {
		this.documentStoreManager.onActiveDocumentChange?.(documentId)
	}
}
```

Применить в `openFromDrive`, `restoreFromLocalStorage`, `syncActiveDocumentWithDrive`:

```typescript
// В openFromDrive:
this.applyDocumentContent(id, loadedSession.data, { triggerCallbacks: true, markDirty: false })

// В restoreFromLocalStorage:
this.applyDocumentContent(docSnapshot.id, dataSnapshot.data, { triggerCallbacks: false, markDirty: false })

// В syncActiveDocumentWithDrive:
this.applyDocumentContent(session.id, parsedData, { triggerCallbacks: true, markDirty: false })
```

**Критерий приёмки:**
- Все 3 метода используют `applyDocumentContent`
- Единый контракт для external data replacement

---

### Задача 5.2: Унифицировать валидацию document content

**Приоритет:** Низкий  
**Аудит:** #14  
**Файлы:**
- `src/7-shared/services/StorageService.ts`
- `src/6-entities/Document/model/DocumentTabsStore.types.ts`

**Проблема:**
`normalizeMainStoreData` в StorageService выпал из основного pipeline. Реальная загрузка идёт через `parseDocumentContent` в DocumentTabsStore. Валидация может расходиться.

**Решение:**

1. **Удалить `normalizeMainStoreData` из StorageService** (если не используется):

```typescript
// Удалить функцию normalizeMainStoreData из StorageService.ts
// Если она где-то нужна — перенести в shared helpers
```

2. **Убедиться что `parseDocumentContent` включает валидацию:**

```typescript
// В DocumentTabsStore.types.ts
export function parseDocumentContent(content: string): DocumentData {
	try {
		const parsed = JSON.parse(content)
		const normalized = normalizeDocumentData(parsed)
		return normalized
	} catch (e) {
		throw new Error(`Failed to parse document content: ${e.message}`)
	}
}

/**
 * Унифицированная нормализация/валидация DocumentData.
 * Единственная точка валидации для всего приложения.
 */
export function normalizeDocumentData(raw: unknown): DocumentData {
	// ... валидация projectsList, completedList, plannedList
	// аналогично normalizeMainStoreData, но для DocumentData
}
```

**Критерий приёмки:**
- `normalizeMainStoreData` удалён из StorageService (или перемещён)
- `parseDocumentContent` использует `normalizeDocumentData`
- Валидация в одном месте

---

### Задача 5.3: Упростить bootstrap и роли сервисов

**Приоритет:** Низкий  
**Аудит:** #15  
**Файлы:**
- `src/1-app/root.ts`

**Проблема:**
StorageService выглядит как core service в bootstrap-графе, хотя persistence уже в DocumentTabsStore.

**Решение:**

В `root.ts` — перекомментировать/упростить:

```typescript
// StorageService теперь отвечает только за экспорт/сериализацию
// Основная persistence — в DocumentTabsStore
export const storageService = new StorageService(documentTabsStore, () => uiStore.forceUpdate())
```

**Критерий приёмки:**
- Комментарии обновлены
- Нет функциональных изменений

---

### Задача 5.4: Удалить onActiveDocumentChange из DocumentStoreManager

**Приоритет:** Средний  
**Аудит:** #9  
**Файлы:**
- `src/6-entities/Document/model/DocumentStoreManager.ts`
- `src/6-entities/Document/model/DocumentTabsStore.ts`

**Проблема:**
`onActiveDocumentChange` — ответственность tabs store, не manager. Сейчас callback хранится в manager и вызывается через него.

**Решение:**

Переместить callback в DocumentTabsStore:

```typescript
// В DocumentTabsStore.ts
private _onActiveDocumentChange?: (documentId: DocumentId) => void

set onActiveDocumentChange(callback: (documentId: DocumentId) => void) {
	this._onActiveDocumentChange = callback
}

activateDocument(documentId: DocumentId) {
	// ...
	this._onActiveDocumentChange?.(documentId)  // <-- напрямую
}
```

Удалить из DocumentStoreManager:
- `onActiveDocumentChange?: (documentId: DocumentId) => void`
- Вызовы `this.onActiveDocumentChange?.(...)`

**Критерий приёмки:**
- `onActiveDocumentChange` полностью в DocumentTabsStore
- DocumentStoreManager не знает о active document lifecycle

---

### ✅ Чек-лист Фазы 5

- [ ] `applyDocumentContent()` метод добавлен
- [ ] Все 3 сценария загрузки используют `applyDocumentContent`
- [ ] `normalizeMainStoreData` удалён из StorageService
- [ ] `normalizeDocumentData` в DocumentTabsStore.types.ts
- [ ] Комментарии в root.ts обновлены
- [ ] `onActiveDocumentChange` перемещён в DocumentTabsStore
- [ ] DocumentStoreManager очищен от active document callbacks

---

## Фаза 6: Тестирование (Test Coverage)

**Цель:** Добавить недостающие unit-тесты и улучшить существующие.

---

### Задача 6.1: DocumentStoreManager unit-тесты

**Файл:** `src/6-entities/Document/model/DocumentStoreManager.spec.ts` — **НОВЫЙ**

**Сценарии:**
- `getOrCreateStores()` — создаёт сторы из сессии
- `getOrCreateStores()` — возвращает существующие сторы
- `getOrCreateStores()` — выбрасывает при отсутствии сессии
- `hasStores()` — true/false
- `removeStores()` — удаляет сторы
- `getAllStores()` — возвращает все инициализированные
- `getAllStoresInitialized()` — создаёт сторы для всех documentIds
- `updateStoresData()` — переинициализирует сторы и триггерит onStoresChange
- `onStoresChange` callback — вызывается при изменении eventsStore
- `onStoresChange` callback — вызывается при изменении projectsStore (после задачи 3.1)
- `isInitializing` per-document — не подавляет onChangeList глобально
- `clear()` — очищает все сторы

---

### Задача 6.2: DocumentTabsStore multi-document тесты

**Файл:** `src/6-entities/Document/model/DocumentTabsStore.spec.ts` — обновление

**Удалить legacy:**
- StorageServiceMock (не используется в новой архитектуре)
- Тесты на `applyContent`, `resetToEmptyContent`

**Добавить multi-document:**
- `openNewDocument()` x3 → 3 документа с独立的 сторами
- `activateDocument()` переключает → сторы другого документа
- `closeDocument()` → сторы удаляются
- `restoreFromLocalStorage()` → все документы восстанавливаются
- `getAllDocumentStores()` → все 3 документа имеют сторы
- `onStoresChange` → вызывается при изменении
- `onActiveDocumentChange` → вызывается при переключении

---

### Задача 6.3: EventsCache aggregated tests

**Файл:** `src/6-entities\EventsCache\EventsCache.spec.ts` — **НОВЫЙ или обновление**

**Сценарии:**
- `getAggregatedEvents()` — собирает события из всех документов
- `getAggregatedEvents()` — кэширует результаты
- `getAggregatedEvents()` — инвалидируется при `init()`
- `getAggregatedBalance()` — суммирует баланс всех документов
- `getEvents()` — только активного документа
- `init()` — корректно инициализирует кэш активного

---

### Задача 6.4: EventSearchStore null-safety tests

**Файл:** `src/5-features\EventSearch\EventSearchStore.spec.ts` — **НОВЫЙ**

**Сценарии:**
- `search()` без активного документа → пустые результаты, без crash
- `search()` → при смене документа результаты сбрасываются
- `nextResult()` / `prevResult()` без активного → без crash
- `toggleActive()` без активного → остаётся неактивным

---

### Задача 6.5: ProjectEditorStore document binding tests

**Файл:** `src/5-features\ProjectManager\ProjectEditor\ProjectEditorStore.spec.ts` — **НОВЫЙ**

**Сценарии:**
- `openAdd()` без активного → форма не открывается
- `openEdit()` без активного → форма не открывается
- Открыть в документе A, переключиться на B, `save()` → изменения в A
- `close()` → сбрасывает `_boundDocumentId`

---

### Задача 6.6: Улучшить assertions и убрать дублирование

**Общие рекомендации для всех тестов:**

1. **Вынести setup в fixtures:**

```typescript
// helpers/test-fixtures.ts
export function createDocumentSession(overrides: Partial<DocumentSession> = {}): DocumentSession {
	return {
		id: 'test-doc-id',
		ref: { fileId: null, name: 'Test Doc', mimeType: 'application/json', space: null, parentFolderId: null },
		data: createEmptyDocumentData(),
		state: createInitialDocumentState(),
		createdAt: Date.now(),
		lastAccessedAt: Date.now(),
		...overrides
	}
}
```

2. **Заменить time-based assertions на deterministic:**

```typescript
// Вместо jest.useFakeTimers() + Date.now()
const FIXED_TIMESTAMP = 1700000000000
jest.spyOn(Date, 'now').mockReturnValue(FIXED_TIMESTAMP)
```

3. **Добавить глубокие assertions:**

```typescript
// Вместо expect(result).toBeTruthy()
expect(result).toEqual(
	expect.objectContaining({
		id: expect.any(Number),
		name: 'Test Event',
		start: FIXED_TIMESTAMP
	})
)
```

---

### ✅ Чек-лист Фазы 6

- [ ] DocumentStoreManager.spec.ts — полный coverage
- [ ] DocumentTabsStore.spec.ts — multi-document сценарии
- [ ] EventsCache.spec.ts — aggregated tests
- [ ] EventSearchStore.spec.ts — null-safety tests
- [ ] ProjectEditorStore.spec.ts — document binding tests
- [ ] Legacy StorageServiceMock удалён
- [ ] Fixtures/helpers вынесены в shared
- [ ] Time-based assertions deterministic
- [ ] Все тесты проходят: `npm test`

---

## Приоритизация и порядок выполнения

| Фаза | Дней | Зависимости |
|------|------|-------------|
| **Фаза 1: Core Critical** | 1.5 | Нет |
| **Фаза 2: UI Critical** | 2.0 | Фаза 1 |
| **Фаза 3: Reactivity** | 1.5 | Фаза 1 |
| **Фаза 4: Aggregation** | 1.0 | Фаза 3 |
| **Фаза 5: Cleanup** | 1.0 | Фаза 3 |
| **Фаза 6: Tests** | 1.5 | Фазы 1-5 |
| **ИТОГО** | **~8.5 дней** | |

### Рекомендуемый порядок

1. **Фаза 1** — критичные дефекты делают агрегацию и persistence ненадёжными
2. **Фаза 2** — runtime crash-риски и кросс-документные race conditions
3. **Фаза 3** — реактивность и единый lifecycle
4. **Фаза 4** — кэширование aggregated (опционально, если нужен performance)
5. **Фаза 5** — архитектурная очистка (может быть параллельна с 4)
6. **Фаза 6** — тесты (после всех изменений)

---

## Риски и митигация

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| **Regression в существующем функционале** | Средняя | Поэтапный рефакторинг, тесты после каждой фазы |
| **Breaking changes в API** | Низкая | Все изменения backward compatible (deprecated вместо удаления) |
| **Недостаточное тестовое покрытие** | Средняя | Фаза 6 обязательна, CI check |
| **Производительность aggregated cache** | Низкая | Monitoring, lazy evaluation при >20 документах |

---

## Заключение

После выполнения этого плана архитектура per-document stores будет **полностью завершена**:
- ✅ Агрегация работает корректно для всех документов
- ✅ Persistence per-document, без legacy keys
- ✅ Null-safety во всех UI компонентах
- ✅ Кросс-документный risk устранён
- ✅ Единый lifecycle для всех сценариев
- ✅ Полное тестовое покрытие

**Следующий шаг:** Начать с Фазы 1, реализовать задачи 1.1-1.3, запустить тесты и ручной тест.
