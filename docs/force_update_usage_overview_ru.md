## Использование `forceUpdate` и `mustForceUpdate` в проекте Projector

### 1. Текущие технические механизмы

- **Технический триггер в `UIStore`**
  - Файл: `src/1-app/Stores/UIStore.ts`

```12:30:src/1-app/Stores/UIStore.ts
  /** Триггер принудительного обновления UI */
  mustForceUpdate: {} = {}

  /** Триггернуть обновление UI */
  forceUpdate() {
    this.mustForceUpdate = {}
  }
```

  - **Назначение:** `mustForceUpdate` служит наблюдаемым маркером, изменение которого заставляет MobX‑наблюдателей пересчитать вычисления/перерисовать компоненты. Метод `forceUpdate()` обновляет это поле и тем самым «пинает» UI.

- **Хук `useUpdate`**
  - Файл: `src/7-shared/hooks/useUpdate.ts`

```1:5:src/7-shared/hooks/useUpdate.ts
import React from 'react'

const useUpdate = () => {
  const [, setState] = React.useState({});
  return React.useCallback(() => { console.log('forceUpdate'); setState({}) }, []);
};

export default useUpdate;
```

  - **Назначение:** локальный React‑механизм для принудительного ререндера компонента через «пустой» `setState({})`. В связке с `mustForceUpdate` используется для синхронизации с изменениями в сторах.

---

### 2. Использование в корневом `App`

- Файл: `src/1-app/App/App.tsx`

```14:18:src/1-app/App/App.tsx
const App: React.FC = observer(function() {
  const forceUpdate = useUpdate()
  const { uiStore } = useContext(StoreContext)

  React.useEffect(forceUpdate, [uiStore.mustForceUpdate])
```

- **Сценарий:** когда где‑то в коде вызывается `uiStore.forceUpdate()`, меняется `mustForceUpdate`, MobX сообщает об изменении, и эффект в `App` срабатывает, вызывая `forceUpdate()` из `useUpdate`. Это приводит к явной перерисовке корневого компонента `App`.
- **Фактически:** `App` ререндерится не только по наблюдаемым данным MobX, но и по «техническому» флагу.

---

### 3. Использование в `Calendar` (страница календаря)

- Файл: `src/3-pages/Calendar/Calendar.tsx`

```19:28:src/3-pages/Calendar/Calendar.tsx
const Calendar: React.FC = observer(function() {
  const forceUpdate = useUpdate()
  const { calendarStore, eventFormStore, eventsStore, uiStore } = useContext(StoreContext)

  React.useEffect(()=>{
    const weekDiv = document.getElementById(calendarStore.week.toString())
    weekDiv?.scrollIntoView(true)
  }, [calendarStore.week, uiStore.mustForceUpdate])
```

```59:66:src/3-pages/Calendar/Calendar.tsx
  const dragDrop = (e: React.DragEvent<HTMLElement>, timestamp: timestamp) => {
    e.preventDefault()
    console.log(e.dataTransfer)
    const c = JSON.parse(e.dataTransfer.getData('event_item'))
    if(e.ctrlKey) eventsStore.copyToDate(c.id,timestamp)
    else eventsStore.shiftToDate(c.id,timestamp,c.start)
    forceUpdate()
  }
```

- **Сценарии:**
  - Эффект с зависимостью `[calendarStore.week, uiStore.mustForceUpdate]`:
    - при смене недели или при внешнем вызове `uiStore.forceUpdate()` ищет DOM‑элемент недели и прокручивает календарь к нему.
  - Обработчик `dragDrop`:
    - после изменения событий в `eventsStore` явно вызывает `forceUpdate()` (через `useUpdate`), чтобы перепостроить визуальное представление.

---

### 4. Использование в `Header`

- Файл: `src/4-widgets/Header/Header.tsx`

```12:27:src/4-widgets/Header/Header.tsx
const Header: React.FC = observer(function() {
  const { calendarStore, uiStore, documentSessionStore } = useContext(StoreContext)
  const documentTitle = documentSessionStore.isOpened
    ? `${documentSessionStore.title}${documentSessionStore.state.isDirty ? ' *' : ''}`
    : 'Документ не открыт'

  return <header className={styles.header}>
    <CalendarIconBar/>
    <span className={styles.documentName}>
      {documentTitle}
    </span>
    <span className={styles.caption}>{ calendarStore.caption }</span>
    <Time onClick={()=>{
      calendarStore.setWeek(Date.now()/1000)
      uiStore.forceUpdate()
    }}></Time>
  </header>
```

- **Сценарий:** при клике по компоненту `Time`:
  - устанавливается текущая неделя в `calendarStore`,
  - вызывается `uiStore.forceUpdate()`, что косвенно триггерит обновления в `App`/`Calendar` через `mustForceUpdate`.

---

### 5. Использование в composition-root (`root.ts`)

- Файл: `src/1-app/root.ts`

```27:33:src/1-app/root.ts
export const uiStore = new UIStore()
export const googleApiService = new GoogleApiService()
export const storageService = new StorageService(
  projectsStore,
  eventsStore,
  () => {
    uiStore.forceUpdate()
  }
)
```

- **Сценарий:** при применении/сбросе контента в `StorageService` вызывается переданный колбэк `onContentApplied`, который сейчас реализован как `uiStore.forceUpdate()`. Это:
  - помечает UI как «нужно перерисовать»,
  - далее срабатывает эффект в `App`, завязанный на `uiStore.mustForceUpdate`.

---

### 6. Краткое резюме связей

- **Источник триггера:** 
  - методы `uiStore.forceUpdate()` (из `Header`, из колбэка `StorageService` и потенциально из других мест);
  - прямые вызовы `forceUpdate()` из `useUpdate` (например, в `Calendar.dragDrop`).
- **Хранилище триггера:** `uiStore.mustForceUpdate` в `UIStore`.
- **Потребители триггера:**
  - `App` — эффект с зависимостью `[uiStore.mustForceUpdate]` вызывает `forceUpdate()` (через `useUpdate`), перерисовывая корневой компонент.
  - `Calendar` — эффект `[calendarStore.week, uiStore.mustForceUpdate]` использует изменение триггера для повторного вызова логики прокрутки.
- **Итого:** `mustForceUpdate` и `forceUpdate` образуют техничeский «байпас» поверх обычной MobX‑реактивности, используемый для:
  - ручного ререндера после сложных операций с календарём (drag&drop событий);
  - синхронизации UI после смены недели и смены/загрузки содержимого документа через `StorageService`.

