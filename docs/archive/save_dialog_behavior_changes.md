# Документация по изменению поведения диалога сохранения файла SaveToDrive

## 1. Обзор задачи

Исходная задача заключалась в изменении поведения диалога сохранения файла `SaveToDrive`. Изначально после успешного сохранения файла диалог автоматически закрывался. Требовалось, чтобы диалог оставался открытым, но при этом содержимое списка файлов (`DriveFileList`) в нем обновлялось, отражая внесенные изменения (например, появление нового файла или обновление существующего).

## 2. Анализ проблемы и выбор подхода

Для реализации новой логики требовалось установить связь между моментом успешного сохранения файла в `SaveToDriveStore` и компонентами `DriveFileList`, отвечающими за отображение содержимого диска.

### 2.1. Исходный анализ

*   **Компонент `SaveToDrive` (`src/5-features/SaveToDrive/SaveToDrive.tsx`)**: Отображает диалог сохранения и взаимодействует со `SaveToDriveStore`.
*   **Стор `SaveToDriveStore` (`src/5-features/SaveToDrive/model/SaveToDriveStore.ts`)**: Отвечает за логику сохранения файла на Google Диск. В нем находилась строка `this.close();` после успешного сохранения.
*   **Компонент `DriveContentExplorer` (`src/4-widgets/DriveContentExplorer/DriveContentExplorer.tsx`)**: Включает в себя две вкладки, каждая из которых рендерит компонент `DriveFileList`.
*   **Компонент `DriveFileList` (`src/5-features/DriveFileList/DriveFileList.tsx`)**: Отвечает за отображение списка файлов и папок. Он создает свой собственный экземпляр `DriveFileListStore`.
*   **Стор `DriveFileListStore` (`src/5-features/DriveFileList/model/DriveFileListStore.ts`)**: Загружает данные с Google Диска и управляет состоянием списка файлов для конкретного пространства (например, "Мой диск" или "Раздел приложения"). Метод `reset()` или `loadFolder()` используется для обновления содержимого.
*   **`StoreContext` (`src/1-app/Providers/StoreContext.ts`) и `IRootStore`**: Определяют корневую структуру хранилищ, доступных через контекст React. `SaveToDriveStore` является частью `IRootStore`, а `DriveFileListStore` — нет (он инстанцируется локально).
*   **`root.ts` (`src/1-app/root.ts`)**: Место, где инстанцируются все корневые сторы и сервисы.

Основная сложность заключалась в том, что `SaveToDriveStore` и `DriveFileListStore` являются сторами разных "фич" (features) согласно FSD. Прямое обращение одного стора к другому или передача напрямую экземпляра `DriveFileListStore` в `SaveToDriveStore` нарушило бы принципы слабой связанности FSD. Также `DriveFileListStore` инстанцируется локально в компоненте `DriveFileList`, а не глобально, что не позволяет `SaveToDriveStore` напрямую управлять его экземплярами.

### 2.2. Выбор подхода: Система событий

Наиболее подходящим и соответствующим принципам FSD был выбран **подход на основе событий**. Этот подход обеспечивает слабую связанность между фичами: `SaveToDriveStore` просто "сообщает" о том, что файл сохранен, не зная, кто и как будет реагировать на это событие, а `DriveFileListStore` "слушает" это событие и обновляет свои данные.

Для реализации системы событий было решено использовать следующий механизм:
1.  Создать простой класс `Observable`, который позволяет подписываться на события и "выстреливать" их.
2.  Внедрить экземпляр `Observable` в `MainStore` (`fileSavedNotifier`), так как `MainStore` является центральным хранилищем-оркестратором, доступным глобально.
3.  `SaveToDriveStore` будет вызывать `fileSavedNotifier.fire()` после успешного сохранения файла.
4.  `DriveFileListStore` будет подписываться на `mainStore.fileSavedNotifier` в своем конструкторе и вызывать метод `loadFolder()` для обновления списка файлов при получении уведомления.

## 3. Выполненные изменения

Следующие изменения были внесены в проект:

### 3.1. Создание класса Observable (`src/7-shared/libs/Observable/Observable.ts`)

Был создан новый универсальный класс `Observable<T>`, который позволяет управлять подписчиками и рассылать уведомления. Он размещен в `src/7-shared/libs/` как общая утилита.

```typescript
// src/7-shared/libs/Observable/Observable.ts
type Listener<T> = (event: T) => void;

class Observable<T> {
  private listeners: Listener<T>[] = [];

  subscribe(listener: Listener<T>) {
    this.listeners.push(listener);
    return () => this.unsubscribe(listener); // Возвращаем функцию отписки
  }

  unsubscribe(listener: Listener<T>) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  fire(event: T) {
    this.listeners.forEach(listener => listener(event));
  }
}

export { Observable };
```

### 3.2. Добавление `fileSavedNotifier` в `MainStore` (`src/1-app/Stores/MainStore.ts`)

В `MainStore` был добавлен новый observable- notifier `fileSavedNotifier`, предназначенный для оповещения о событиях сохранения файлов.

```typescript
// src/1-app/Stores/MainStore.ts
import { Observable } from 'src/7-shared/libs/Observable/Observable';

export class MainStore {
  // ... существующие свойства
  /** Уведомитель об успешном сохранении файла на Google Диске */
  fileSavedNotifier = new Observable<void>();
  // ...
}
```

### 3.3. Обновление интерфейса `IRootStore` (`src/1-app/Providers/StoreContext.ts`)

Интерфейс `IRootStore` был обновлен, чтобы включать `fileSavedNotifier`, делая его доступным через контекст приложения. Также был добавлен импорт `Observable`.

```typescript
// src/1-app/Providers/StoreContext.ts
import { Observable } from 'src/7-shared/libs/Observable/Observable';
// ...
export interface IRootStore {
  // ... существующие сторы
  fileSavedNotifier: Observable<void>;
}
```

### 3.4. Обновление `SaveToDriveStore` (`src/5-features/SaveToDrive/model/SaveToDriveStore.ts`)

*   **Конструктор**: Был изменен для приема экземпляра `MainStore`.
    ```typescript
    // src/5-features/SaveToDrive/model/SaveToDriveStore.ts
    import { MainStore } from 'src/1-app/Stores/MainStore';
    // ...
    constructor(private googleApiService: GoogleApiService, private mainStore: MainStore) {
      makeAutoObservable(this);
    }
    ```
*   **Метод `saveFile`**: После успешного сохранения файла теперь вызывается `this.mainStore.fileSavedNotifier.fire()`, отправляя уведомление о событии. Строка `this.close();` была удалена, чтобы диалог оставался открытым.
    ```typescript
    // src/5-features/SaveToDrive/model/SaveToDriveStore.ts
    runInAction(() => {
      if (result.status === 'success') {
        console.log("Файл успешно сохранен:", result.file);
        this.mainStore.fileSavedNotifier.fire(); // Отправка уведомления
      } // ...
    });
    ```

### 3.5. Корректировка порядка инстанцирования в `root.ts` (`src/1-app/root.ts`)

Порядок инстанцирования сторов и сервисов был скорректирован. `mainStore` теперь инстанцируется перед `saveToDriveStore`, чтобы `saveToDriveStore` мог получить `mainStore` в качестве зависимости.

```typescript
// src/1-app/root.ts
// ... (инстанцирование projectsStore, eventsStore, eventsCache, weatherStore, calendarStore, dayListStore, eventFormStore, uiStore, googleApiService, storageService)

// 4. Инстанцирование MainStore (оркестратора) с его основными зависимостями
export const mainStore = new MainStore(projectsStore, eventsStore, eventsCache, googleApiService, storageService)

// 5. Инстанцирование SaveToDriveStore (зависит от GoogleApiService и MainStore)
export const saveToDriveStore = new SaveToDriveStore(googleApiService, mainStore);

// ...
```

### 3.6. Обновление `DriveFileListStore` (`src/5-features/DriveFileList/model/DriveFileListStore.ts`)

*   **Конструктор**: Был изменен для приема экземпляра `MainStore`. В конструкторе `DriveFileListStore` теперь подписывается на `mainStore.fileSavedNotifier`. При получении уведомления вызывается `this.loadFolder()` для текущей открытой папки, что приводит к обновлению списка файлов.
    ```typescript
    // src/5-features/DriveFileList/model/DriveFileListStore.ts
    import { MainStore } from 'src/1-app/Stores/MainStore';
    // ...
    constructor(googleApiService: GoogleApiService, mainStore: MainStore) {
      makeAutoObservable(this);
      this.googleApiService = googleApiService;
      this.mainStore = mainStore;

      // Подписка на уведомления о сохранении файла
      this.mainStore.fileSavedNotifier.subscribe(() => {
        // Обновляем текущую папку при сохранении файла
        this.loadFolder(this.currentFolderId, this.currentSpace);
      });
    }
    ```

### 3.7. Обновление `StoreProvider` в `index.tsx` (`src/1-app/index.tsx`)

Компонент `StoreProvider` теперь явно получает `fileSavedNotifier` из `mainStore` в качестве пропса, соответствуя обновленному интерфейсу `IRootStore`.

```typescript
// src/1-app/index.tsx
root.render(
  <StoreProvider
    // ... другие сторы
    saveToDriveStore={saveToDriveStore}
    fileSavedNotifier={mainStore.fileSavedNotifier} // Передача notifier
  >
    <App />
  </StoreProvider>
)
```

## 4. Альтернативные подходы

В процессе анализа рассматривались следующие альтернативные подходы:

### 4.1. Прямой доступ к `DriveFileListStore` из `SaveToDriveStore`

*   **Описание**: Модифицировать `IRootStore` так, чтобы он содержал ссылку на экземпляр `DriveFileListStore` (или массив ссылок, если таких компонентов несколько), и затем `SaveToDriveStore` напрямую вызывал бы `reset()` на соответствующем экземпляре.
*   **Недостатки**:
    *   **Нарушение FSD**: Глобальный стор (`MainStore` или `IRootStore`) не должен иметь прямых ссылок и управлять логикой конкретных фич (`DriveFileListStore`). Это создало бы жесткую связанность.
    *   **Сложность при множественных экземплярах**: Учитывая, что `DriveFileList` используется в двух вкладках (`"Мой диск"` и `"Раздел приложения"`), потребовалось бы управлять несколькими экземплярами `DriveFileListStore`, что усложнило бы логику `SaveToDriveStore`.

### 4.2. Использование колбэков компонента (`onSaveSuccess`)

*   **Описание**: Компонент `SaveToDrive` мог бы принимать пропс `onSaveSuccess: () => void`. После успешного сохранения `SaveToDriveStore` (через `SaveToDrive` компонент) вызывал бы этот колбэк. Родительский компонент (`App.tsx`) затем отвечал бы за вызов метода обновления на `DriveContentExplorer`.
*   **Недостатки**:
    *   **Пропс-дреллинг (Prop drilling)**: Потребовалось бы передавать колбэк через несколько слоев компонентов (`App` -> `DriveContentExplorer` -> `DriveFileList`), что увеличивает сложность и делает код менее читаемым.
    *   **Нарушение FSD**: Внедрение логики обновления списка файлов на уровне корневого компонента приложения также создало бы ненужную связанность и ответственность для `App.tsx`. `App.tsx` должен быть максимально "глупым" компонентом-контейнером.

## 5. Рекомендации

Выбранный подход на основе `Observable` (системы событий) является наиболее предпочтительным по следующим причинам:

*   **Слабая связанность (Loose Coupling)**: `SaveToDriveStore` и `DriveFileListStore` не знают друг о друге напрямую. `SaveToDriveStore` просто объявляет о событии, а `DriveFileListStore` на него реагирует. Это соответствует принципам FSD и делает систему более модульной и легкой для расширения.
*   **Четкое разделение ответственности (Clear Separation of Concerns)**: Каждый стор отвечает за свою доменную область. `MainStore` выступает как центральный хаб для глобальных уведомлений.
*   **Масштабируемость**: Если в будущем появятся другие компоненты, которым необходимо реагировать на событие сохранения файла, им достаточно будет просто подписаться на `fileSavedNotifier`.
*   **Поддержка MobX**: Подход легко интегрируется с MobX, используя его реактивные возможности.

Таким образом, реализованные изменения значительно улучшают архитектуру приложения, делая взаимодействие между различными функциональными областями более чистым и поддерживаемым.
