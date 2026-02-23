# План реализации управления документами Google Drive

## 1. Краткий вывод по реализуемости

Функционал полностью реализуем в текущем проекте без смены технологического стека.

Почему это реалистично:
- Уже есть рабочий `DriveFilePicker` для выбора произвольного файла (`src/4-widgets/DriveFilePicker/DriveFilePicker.tsx`).
- Уже есть `SaveToDrive`-диалог с выбором папки, именем файла и обработкой конфликтов (`src/4-widgets/SaveToDrive/model/SaveToDriveStore.ts`).
- В `GoogleApiService` уже реализованы операции листинга, чтения метаданных, загрузки/обновления контента, создания файлов (`src/7-shared/services/GoogleApiService.ts`).
- `StorageService` уже умеет загрузку по `fileId`, но не хранит контекст открытого документа (`src/7-shared/services/StorageService.ts`).

Главный архитектурный пробел сейчас:
- Нет единого состояния «открытый документ» (id, имя, папка, пространство Drive, dirty-state, статус загрузки/сохранения).
- Логика документа размазана между `StorageService`, `RemoteStorage`, `SaveToDriveStore`, `CalendarIconBar`.

## 2. Текущее состояние и ограничения

Текущее поведение:
- «Старый» путь: сохранение/загрузка в фиксированный `data.json` через `RemoteStorage` (`saveToGoogleDrive`, `loadFromGoogleDrive`).
- «Новый» путь: можно выбрать произвольный файл для загрузки через пикер и загрузить его по `fileId`.
- Сохранение через `SaveToDrive` сейчас больше похоже на экспорт: пользователь вручную выбирает папку/имя, но это не становится «текущим документом» приложения.

Ограничения:
- Кнопка «Сохранить» не знает, в какой файл нужно писать по умолчанию.
- Нет «Сохранить как» в терминах активного документа (создать копию и сделать ее текущей/или нет — поведение не зафиксировано).
- Нет операций «Новый документ» и «Закрыть документ» как части жизненного цикла.
- Нет централизованной проверки несохраненных изменений при переключении документа/закрытии.

## 3. Целевая модель данных

Рекомендуется добавить сущность документа в слое `entities`.

### 3.1 Типы

```ts
// src/6-entities/Document/model/types.ts
export type DriveSpace = 'drive' | 'appDataFolder';

export type DocumentContent = {
  projectsList: import('src/3-pages/Projects/ProjectsStore').ProjectData[];
  completedList: import('src/6-entities/Events/EventDto').EventDto[];
  plannedList: import('src/6-entities/Events/EventDto').EventDto[];
};

export type OpenDocumentRef = {
  fileId: string | null;          // null => новый/еще не сохраненный документ
  name: string;                   // отображаемое имя (например "Новый документ")
  mimeType: string;               // обычно application/json
  space: DriveSpace | null;       // null пока неизвестно
  parentFolderId: string | null;  // null пока неизвестно
  webViewLink?: string;
};

export type OpenDocumentState = {
  ref: OpenDocumentRef | null;    // null => документ закрыт
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  lastLoadedAt: number | null;
  lastSavedAt: number | null;
  error: string | null;
};
```

### 3.2 Store

```ts
// src/6-entities/Document/model/DocumentSessionStore.ts
class DocumentSessionStore {
  state: OpenDocumentState;

  createNew(): void;
  close(): void;

  openFromDriveFile(fileId: string, options?: { space?: DriveSpace }): Promise<void>;
  save(): Promise<void>; // в тот же файл, если fileId известен
  saveAs(target: { name: string; folderId: string; space: DriveSpace }): Promise<void>;

  markDirty(): void;
  clearError(): void;

  get canSave(): boolean;
  get isOpened(): boolean;
  get title(): string;
}
```

Ключевая идея:
- `DocumentSessionStore` хранит только «сессию документа» и координаты файла в Drive.
- Фактические данные календаря продолжают жить в `ProjectsStore` + `EventsStore`.
- `isDirty` выставляется при изменениях через существующий `onChangeList` в `MainStore`.

## 4. Предложение по архитектуре (FSD + MobX)

### 4.1 Размещение по слоям

- `6-entities/Document/model/*`:
  - типы и `DocumentSessionStore`.
- `7-shared/services/GoogleApiService.ts`:
  - добавить/уточнить методы чтения контента + метаданных по `fileId`, сохранения с возвратом полной меты.
- `4-widgets/SaveToDrive/*`:
  - использовать как UI для `saveAs`.
- `4-widgets/DriveFilePicker/*`:
  - использовать как UI для `openFromDriveFile`.
- `4-widgets/CalendarIconBar/CalendarIconBar.tsx`:
  - перевести команды `Новый`, `Открыть`, `Сохранить`, `Сохранить как`, `Закрыть` на `DocumentSessionStore`.

### 4.2 Роли существующих сервисов

- `StorageService` оставить как сервис сериализации/десериализации данных приложения:
  - `getContentToSave()` уже подходит.
  - добавить метод `applyContent(content)` для инициализации `projectsStore/eventsStore` в одном месте.
- `RemoteStorage` постепенно вывести из primary flow (оставить как backward compatibility для фиксированного `data.json`, либо удалить позже).

### 4.3 Интеграция в root

В `src/1-app/root.ts`:
- создать `documentSessionStore` после `storageService` и `googleApiService`.
- прокинуть в `StoreContext`.

В `src/1-app/Stores/MainStore.ts`:
- добавить ссылку на `documentSessionStore`.
- в `eventsStore.onChangeList` после текущей логики вызывать `documentSessionStore.markDirty()`.

## 5. Поведение операций (целевое)

### 5.1 Открыть

1. Пользователь выбирает файл в `DriveFilePicker`.
2. `documentSessionStore.openFromDriveFile(fileId)`:
- грузит контент + метаданные;
- валидирует JSON-структуру;
- применяет данные через `storageService.applyContent`;
- заполняет `state.ref`;
- сбрасывает `isDirty=false`.

### 5.2 Сохранить

- Если `state.ref.fileId != null`: обновить тот же файл (без диалога).
- Если `state.ref.fileId == null`: открыть `SaveToDrive` и выполнить `saveAs`.

### 5.3 Сохранить как

- Всегда открыть `SaveToDrive`.
- Создать новый файл и после успеха обновить `state.ref` на новый документ.

### 5.4 Новый документ

- Проверить `isDirty` текущего документа.
- При подтверждении: очистить данные до дефолта (`projectsStore.init(undefined)`, `eventsStore.init({} as ...)` через `applyContent(emptyDoc)`), создать сессию с `fileId=null`, `name='Новый документ'`, `isDirty=false`.

### 5.5 Закрыть документ

- Проверить `isDirty`.
- При подтверждении закрытия:
  - `state.ref = null`;
  - очистить данные приложения к дефолту (или загрузить local snapshot, если это требование UX).

## 6. Изменения в существующих компонентах

`src/4-widgets/CalendarIconBar/CalendarIconBar.tsx`:
- заменить прямые вызовы `storageService.saveToGoogleDrive/loadFromGoogleDrive*` на операции `documentSessionStore`.
- добавить команды меню:
  - `Новый документ`
  - `Открыть...`
  - `Сохранить`
  - `Сохранить как...`
  - `Закрыть документ`

`src/4-widgets/SaveToDrive/model/SaveToDriveStore.ts`:
- оставить только UI-функцию выбора места/имени.
- фактическое действие после confirm: вызвать `documentSessionStore.saveAs(...)`.

`src/4-widgets/DriveFilePicker/DriveFilePicker.tsx`:
- по `onSelect(file)` вызывать `documentSessionStore.openFromDriveFile(file.id, { space })`.

## 7. План внедрения (итеративно)

1. Ввести `DocumentSessionStore` и типы в `6-entities/Document/model`.
2. Добавить `storageService.applyContent(content)` + валидацию входного контента.
3. Расширить `GoogleApiService` методами `downloadFileContent(fileId)` и `getFileMetadata(fileId)` с единым контрактом ошибок.
4. Интегрировать новый store в `root.ts`, `StoreContext`, `MainStore`.
5. Перевести `open`-сценарий из `CalendarIconBar` на `documentSessionStore.openFromDriveFile`.
6. Реализовать `save` (в тот же файл) и fallback на `saveAs`.
7. Подключить `SaveToDrive` как UI для `saveAs`.
8. Добавить операции `createNew` и `close` с защитой от потери несохраненных изменений.
9. Обновить визуальные индикаторы (dirty/имя активного документа в header/icon bar).
10. Деактивировать legacy-flow `RemoteStorage(data.json)` либо оставить за feature-flag на период миграции.

## 8. Риски и как их закрыть

- Риск: неверный формат JSON в произвольном файле.
  - Решение: runtime-валидация структуры + понятная ошибка пользователю.
- Риск: потеря данных при `Новый/Закрыть/Открыть` при `isDirty=true`.
  - Решение: единый confirm-диалог с вариантами `Сохранить / Не сохранять / Отмена`.
- Риск: гонки сохранений (двойной клик).
  - Решение: `isSaving` lock в `DocumentSessionStore`.
- Риск: дублирование логики между `SaveToDriveStore` и `DocumentSessionStore`.
  - Решение: бизнес-логика только в `DocumentSessionStore`, `SaveToDriveStore` оставить UI-oriented.

## 9. Критерии готовности

- Можно открыть любой JSON-файл из `drive` и `appDataFolder`.
- Кнопка `Сохранить` обновляет текущий открытый файл без диалога.
- Кнопка `Сохранить как` сохраняет в новый файл и переключает текущий контекст на него.
- Есть операции `Новый документ` и `Закрыть документ`.
- Dirty-state корректно меняется и блокирует рискованные операции без подтверждения.
- Legacy-сценарий фиксированного `data.json` удален или явно изолирован.

## 10. Рекомендуемые файлы для изменений

- `src/6-entities/Document/model/types.ts` (new)
- `src/6-entities/Document/model/DocumentSessionStore.ts` (new)
- `src/7-shared/services/StorageService.ts`
- `src/7-shared/services/GoogleApiService.ts`
- `src/1-app/root.ts`
- `src/1-app/Providers/StoreContext.ts`
- `src/1-app/Stores/MainStore.ts`
- `src/4-widgets/CalendarIconBar/CalendarIconBar.tsx`
- `src/4-widgets/SaveToDrive/model/SaveToDriveStore.ts`
- `src/4-widgets/DriveFilePicker/DriveFilePicker.tsx`

## 11. Persistence текущего документа (localStorage)

Цель:
- Сохранять метаданные текущего открытого документа локально.
- При старте приложения автоматически восстанавливать последнюю сессию и подгружать соответствующий файл из Google Drive.

### 11.1 Что сохраняем в localStorage

Ключ: `lastOpenedDocument`

```ts
type LastOpenedDocumentSnapshot = {
  fileId: string | null;
  name: string;
  mimeType: string;
  space: 'drive' | 'appDataFolder' | null;
  parentFolderId: string | null;
  updatedAt: number;
};
```

Правила:
- Сохраняем snapshot после `open`, успешного `save`, успешного `saveAs`.
- Для `new` документа допускается `fileId = null`.
- При `close` удаляем ключ `lastOpenedDocument`.

### 11.2 Где реализовать

- В `DocumentSessionStore` добавить методы:
  - `persistSessionToLocalStorage()`
  - `restoreSessionFromLocalStorage()`
  - `clearPersistedSession()`
- В `MainStore.init()` или в bootstrap после инициализации Google API запускать:
  - `documentSessionStore.restoreSessionFromLocalStorage()`
  - если в snapshot есть `fileId`, вызвать `openFromDriveFile(fileId, { space })`

### 11.3 Поведение при ошибках восстановления

- Если файл удален/недоступен/403/404:
  - показывать ненавязчивую ошибку;
  - очищать `lastOpenedDocument`;
  - продолжать с пустым/локальным состоянием приложения.
- Если токен невалиден:
  - инициировать login flow;
  - повторить восстановление после успешной авторизации.

### 11.4 Изменения в плане внедрения

Добавить отдельные шаги:
1. Реализовать snapshot-модель и persistence API в `DocumentSessionStore`.
2. Подключить автозагрузку последнего документа в startup-потоке.
3. Добавить обработку неуспешного восстановления (403/404/invalid JSON).
4. Обновить UI-индикацию при автозагрузке (`isLoading`, сообщение об ошибке при fallback).

### 11.5 Обновление критериев готовности

Дополнительно к текущим критериям:
- После перезапуска приложения автоматически открывается последний документ, если он доступен.
- При недоступности последнего документа приложение не падает и корректно переходит в fallback-состояние.
