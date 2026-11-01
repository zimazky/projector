# Подробный план реализации нового подхода синхронизации документа

**Дата:** 14 апреля 2026 г.  
**Основание:** [`document_sync_architecture_review_and_proposal.md`](./document_sync_architecture_review_and_proposal.md)

## 1. Цель

Реализовать новый подход к синхронизации документов с Google Drive без потери данных и без резкого ломающего рефакторинга.

Целевые свойства решения:

- один доменный источник истины для состояния синхронизации;
- разделение `check`, `save`, `pull`, `resolve`;
- отсутствие автоматической перезаписи локальных данных после проверки Drive;
- единый контракт для UI;
- постепенная миграция с сохранением работоспособности текущего приложения.

---

## 2. Что считаем результатом

После реализации должны выполняться следующие условия:

- `DocumentTabsStore` становится единственной точкой записи состояния документа;
- `SaveToDriveStore` больше не мутирует `activeDoc.state` напрямую;
- синхронизация не зависит от временной смены `activeDocumentId`;
- состояние документа вычисляется из новой модели `sync + operation + error`, а не из набора пересекающихся флагов;
- проверка удалённой версии выполняется по правилам `drive-available`, TTL и pre-save check;
- UI использует нормализованный `DocumentUiState`;
- конфликтный диалог открывается только по явному результату доменной проверки.

---

## 3. Основные принципы внедрения

### 3.1 Не делать big-bang рефакторинг

Переход должен быть пошаговым:

1. сначала убрать опасные точки;
2. затем ввести новую внутреннюю модель;
3. потом перевести UI и команды;
4. только после этого удалить legacy-флаги.

### 3.2 Сначала меняем доменную модель, потом UI

Нельзя начинать с новых иконок и визуальных состояний. Сначала должны появиться:

- новые типы;
- селекторы;
- новый API команд синхронизации.

### 3.3 Сохраняем совместимость на переходный период

До полной миграции допустимо временно поддерживать:

- старые поля `state.isDirty`, `state.syncStatus`, `state.hasUnsyncedChanges`;
- новые вычисляемые селекторы поверх новой модели;
- адаптеры для старого UI.

Но новые сценарии уже должны писаться только через новый API.

---

## 4. Целевая структура изменений

### 4.1 Новые сущности состояния

Вместо центра тяжести на `DocumentState` вводим новую внутреннюю модель:

```ts
type SyncOperation = 'idle' | 'checking' | 'saving' | 'pulling'

type SyncErrorState = {
    code: string
    message: string
    at: number
} | null

type AppDriveAvailability = 'drive-unavailable' | 'drive-available'

type DocumentSyncSnapshot = {
    localFingerprint: string | null
    baseFingerprint: string | null
    remoteFingerprint: string | null
    baseRevisionId: string | null
    remoteRevisionId: string | null
    lastSyncAt: number | null
    lastRemoteCheckAt: number | null
    needsRemoteCheck: boolean
    origin: 'new-local' | 'drive' | 'restored-local'
}
```

### 4.2 Новые derive-селекторы

Нужны селекторы уровня model:

- `getIsDirty(session)`
- `getHasRemoteAhead(session)`
- `getHasConflict(session)`
- `getUiSyncStatus(session)`
- `getShouldWarnOnClose(session)`
- `isRemoteCheckFresh(session, now, ttl)`
- `shouldCheckRemote(session, availability, now, ttl)`

### 4.3 Новый набор команд

Вместо одной перегруженной команды `syncActiveDocumentWithDrive()` должны появиться:

- `checkDocumentRemoteState(documentId)`
- `saveDocumentToDrive(documentId)`
- `pullDocumentFromDrive(documentId)`
- `resolveConflictByKeepingLocal(documentId)`
- `resolveConflictByApplyingRemote(documentId)`

Текущую `syncActiveDocumentWithDrive()` нужно сохранить временно как совместимый фасад, который внутри вызывает новый pipeline.

---

## 5. Файлы, которые потребуется изменить

### 5.1 Model-слой документа

- `src/6-entities/Document/model/DocumentTabsStore.types.ts`
- `src/6-entities/Document/model/DocumentTabsStore.ts`
- `src/6-entities/Document/model/index.ts`

### 5.2 Слои orchestration

- `src/1-app/Stores/MainStore.ts`
- новый файл, например:
  - `src/6-entities/Document/model/DocumentSyncSelectors.ts`
  - `src/6-entities/Document/model/DocumentSyncFingerprint.ts`
  - `src/6-entities/Document/model/DocumentDriveAvailabilityStore.ts`
  - или `DocumentSyncScheduler.ts`

### 5.3 UI и пользовательские сценарии

- `src/7-shared/ui/DocumentTabs/DocumentTabs.tsx`
- `src/4-widgets/Header/Header.tsx`
- `src/4-widgets/CalendarIconBar/CalendarIconBar.tsx`
- `src/4-widgets/SaveToDrive/model/SaveToDriveStore.ts`
- `src/7-shared/ui/ConflictDialog/types.ts`
- `src/7-shared/ui/ConflictDialog/ConflictDialog.tsx`
- `src/1-app/App/App.tsx`

### 5.4 Тесты

- `src/6-entities/Document/model/DocumentTabsStore.spec.ts`
- `src/1-app/App/App.spec.tsx`
- новые unit-тесты для селекторов и переходов

---

## 6. Пошаговый план реализации

## Этап 1. Устранение опасных мест в текущем коде

### Цель

Сначала убрать то, что уже сейчас потенциально ведёт к потере данных или рассинхронизации модели.

### Изменения

#### 1. Убрать прямую мутацию документа из `SaveToDriveStore`

Файл:

- [SaveToDriveStore.ts](/d:/@projects/projector/src/4-widgets/SaveToDrive/model/SaveToDriveStore.ts:1)

Что сделать:

- добавить в `DocumentTabsStore` публичный метод, например `markActiveDocumentSavedToDrive(...)` или `markDocumentSavedToDrive(documentId, file)`;
- после успешного `saveFile()` в `SaveToDriveStore` вызывать этот метод вместо прямого изменения `activeDoc.ref` и `activeDoc.state`.

#### 2. Убрать destructive-refresh из `syncActiveDocumentWithDrive()`

Файл:

- [DocumentTabsStore.ts](/d:/@projects/projector/src/6-entities/Document/model/DocumentTabsStore.ts:382)

Что сделать:

- убрать автоматический `downloadFileContent()` из ветки "нет изменений";
- `syncActiveDocumentWithDrive()` временно превратить в `check + result`;
- локальные данные менять только в явном `pull`.

#### 3. Убрать подмену `activeDocumentId` в пакетной синхронизации

Файл:

- [DocumentTabsStore.ts](/d:/@projects/projector/src/6-entities/Document/model/DocumentTabsStore.ts:469)

Что сделать:

- добавить внутренний метод синхронизации по `documentId`;
- переписать `syncAllDocumentsWithDrive()` на него.

#### 4. Не терять remote-состояние при локальном edit

Файл:

- [DocumentTabsStore.ts](/d:/@projects/projector/src/6-entities/Document/model/DocumentTabsStore.ts:294)

Что сделать:

- перестать безусловно переводить `update-available` в `needs-sync`;
- до полной миграции хотя бы сохранить отдельный признак конфликта или remote-ahead.

#### 5. Исправить сохранение snapshot

Файлы:

- [DocumentTabsStore.ts](/d:/@projects/projector/src/6-entities/Document/model/DocumentTabsStore.ts:548)
- [DocumentTabsStore.types.ts](/d:/@projects/projector/src/6-entities/Document/model/DocumentTabsStore.types.ts:1)

Что сделать:

- перестать писать `hasUnsyncedChanges: session.state.isDirty`;
- подготовить структуру snapshot к будущему хранению новой `sync`-модели.

### Критерий завершения этапа

- нет прямых мутаций документа вне `DocumentTabsStore`;
- проверка Drive больше не заменяет локальные данные автоматически;
- массовая проверка не меняет активную вкладку;
- сохранены все текущие пользовательские сценарии.

---

## Этап 2. Введение новой модели состояния

### Цель

Добавить новую внутреннюю модель, но не ломать существующий UI.

### Изменения

#### 1. Расширить типы документа

Файл:

- [DocumentTabsStore.types.ts](/d:/@projects/projector/src/6-entities/Document/model/DocumentTabsStore.types.ts:1)

Что добавить:

- `SyncOperation`
- `SyncErrorState`
- `AppDriveAvailability`
- `DocumentSyncSnapshot`
- новые типы результата:
  - `RemoteCheckResult`
  - `SaveToDriveResult`
  - `PullRemoteResult`
  - `ConflictType`

#### 2. Расширить `DocumentSession`

Новые поля:

- `sync: DocumentSyncSnapshot`
- `operation: SyncOperation`
- `error: SyncErrorState`
- `operationToken: number | null`

Переходный режим:

- старый `state` пока остаётся;
- он начинает жить как compatibility-layer.

#### 3. Добавить инициализацию новой модели

В `openNewDocument`, `openFromDrive`, `openFromLocalStorageSnapshot`, `restoreFromLocalStorage` нужно инициализировать `sync`.

Правила:

- новый локальный документ:
  - `origin = 'new-local'`
  - `baseFingerprint = null`
  - `localFingerprint = null`
- документ из Drive:
  - `origin = 'drive'`
  - `localFingerprint = baseFingerprint`
  - `baseRevisionId` и `remoteRevisionId` выставлены
- восстановленный документ:
  - `origin = 'restored-local'`
  - `needsRemoteCheck = true`

#### 4. Добавить fingerprint-утилиту

Новый файл:

- `DocumentSyncFingerprint.ts`

Что сделать:

- детерминированно сериализовать `DocumentData`;
- вычислять быстрый fingerprint;
- использовать его при:
  - открытии из Drive;
  - локальном edit;
  - save;
  - pull.

### Критерий завершения этапа

- в `DocumentSession` присутствует новая модель;
- создание и восстановление документов заполняет `sync`;
- старый UI продолжает работать.

---

## Этап 3. Селекторы и compatibility-layer

### Цель

Сделать новую модель usable для UI и для переходной логики.

### Изменения

#### 1. Создать файл селекторов

Новый файл:

- `DocumentSyncSelectors.ts`

Туда вынести:

- `getIsDirty`
- `getHasRemoteAhead`
- `getHasConflict`
- `getUiSyncStatus`
- `getShouldWarnOnClose`
- `getDocumentUiState`
- `isRemoteCheckFresh`
- `shouldCheckRemote`

#### 2. Ввести адаптер старого состояния

В `DocumentTabsStore` или рядом добавить функцию синхронизации legacy-полей из новой модели:

```ts
syncLegacyStateFromNewModel(session: DocumentSession): void
```

Она временно выставляет:

- `state.isDirty`
- `state.syncStatus`
- `state.hasUnsyncedChanges`
- `state.error`

на основе новой модели.

#### 3. Обновить snapshot-формат

Нужно сериализовать:

- `sync`
- `operation` только как `idle` после перезапуска;
- `error` в безопасной форме;
- legacy-state можно пока оставить для обратной совместимости чтения.

#### 4. Добавить миграцию старых snapshot

При чтении старого `localStorage`:

- если новой структуры нет, восстанавливать её из старых полей максимально консервативно;
- все спорные случаи помечать через `needsRemoteCheck = true`.

### Критерий завершения этапа

- UI и логика могут читать данные через селекторы;
- старые поля больше не являются первичным источником истины;
- старые snapshot продолжают корректно восстанавливаться.

---

## Этап 4. Разделение команд синхронизации

### Цель

Перестать использовать "магическую" команду, которая сама решает всё сразу.

### Изменения

#### 1. Реализовать `checkDocumentRemoteState(documentId)`

Файл:

- `DocumentTabsStore.ts`

Что делает:

- проверяет доступность Drive;
- загружает только метаданные;
- обновляет `remoteRevisionId`, `remoteFingerprint` если доступно;
- ставит `lastRemoteCheckAt`;
- не меняет `session.data`.

Результаты:

- `up-to-date`
- `remote-ahead`
- `conflict`
- `unavailable`
- `error`

#### 2. Реализовать `saveDocumentToDrive(documentId)`

Что делает:

- перед сохранением при необходимости запускает `checkDocumentRemoteState`;
- если обнаружен конфликт, не сохраняет автоматически;
- при успехе обновляет:
  - `baseFingerprint`
  - `baseRevisionId`
  - `remoteRevisionId`
  - `lastSyncAt`
  - `needsRemoteCheck = false`

#### 3. Реализовать `pullDocumentFromDrive(documentId)`

Что делает:

- загружает контент только по явному действию пользователя;
- заменяет `session.data`;
- обновляет сторы через `DocumentStoreManager`;
- пересчитывает fingerprint;
- обновляет `base*` и `remote*`.

#### 4. Реализовать команды resolve

- `resolveConflictByKeepingLocal(documentId)` -> вызывает `saveDocumentToDrive`
- `resolveConflictByApplyingRemote(documentId)` -> вызывает `pullDocumentFromDrive`

#### 5. Добавить `operationToken`

Для всех async-команд:

- `check`
- `save`
- `pull`

каждый запуск получает токен, и устаревший результат игнорируется.

### Критерий завершения этапа

- синхронизация разложена на отдельные команды;
- локальные данные не меняются после обычного `check`;
- все async-операции защищены от устаревших результатов.

---

## Этап 5. Реализация доступности Drive и правил проверки

### Цель

Встроить согласованные триггеры проверки Drive из архитектурного документа.

### Изменения

#### 1. Добавить store/coordinator доступности Drive

Новый файл:

- `DocumentDriveAvailabilityStore.ts` или `DocumentSyncScheduler.ts`

Минимальная ответственность:

- хранить `AppDriveAvailability`;
- реагировать на:
  - `googleApiService.isGoogleLoggedIn`;
  - успешные remote-операции;
  - ошибки доступа к Drive;
- давать методы:
  - `markDriveAvailable()`
  - `markDriveUnavailable()`

#### 2. Подключить coordinator в `MainStore`

Файл:

- [MainStore.ts](/d:/@projects/projector/src/1-app/Stores/MainStore.ts:1)

Что сделать:

- создать coordinator;
- подписать его на изменения активного документа;
- при инициализации после `restoreFromLocalStorage()` запускать initial scheduling;
- после успешного логина инициировать фоновый `check`.

#### 3. Реализовать scheduling remote-check

Нужно поддержать сценарии:

- переход в `drive-available`;
- активация документа;
- pre-save check;
- повторная попытка после ошибки доступа.

#### 4. Ввести TTL

На первом проходе:

- активный документ: `30-60 секунд`;
- фоновые документы: только при `drive-available` и при активации.

### Критерий завершения этапа

- проверка Drive запускается предсказуемо и не слишком часто;
- отсутствие отдельного `offline`-режима не мешает сценариям;
- доступность Drive становится явной частью orchestration-слоя.

---

## Этап 6. Перевод UI на новый контракт

### Цель

Сделать UI согласованным и независимым от внутренних полей legacy-state.

### Изменения

#### 1. Обновить `DocumentTabs`

Файл:

- [DocumentTabs.tsx](/d:/@projects/projector/src/7-shared/ui/DocumentTabs/DocumentTabs.tsx:1)

Что сделать:

- вместо ручной комбинации `isDirty`, `hasUnsyncedChanges`, `syncStatus` использовать `getDocumentUiState(session)`;
- рисовать индикатор по единому `status`.

#### 2. Обновить `Header`

Файл:

- [Header.tsx](/d:/@projects/projector/src/4-widgets/Header/Header.tsx:1)

Что сделать:

- suffix `*` или другой индикатор строить через `getShouldWarnOnClose` или `getIsDirty`;
- синхронизировать логику заголовка с табами.

#### 3. Обновить `CalendarIconBar`

Файл:

- [CalendarIconBar.tsx](/d:/@projects/projector/src/4-widgets/CalendarIconBar/CalendarIconBar.tsx:1)

Что сделать:

- вместо старых условий использовать `DocumentUiState`;
- кнопку синхронизации перевести на новые команды:
  - `check`
  - `save`
  - `pull`
  - `resolve`

#### 4. Обновить `ConflictDialog`

Файлы:

- [ConflictDialog/types.ts](/d:/@projects/projector/src/7-shared/ui/ConflictDialog/types.ts:1)
- [ConflictDialog.tsx](/d:/@projects/projector/src/7-shared/ui/ConflictDialog/ConflictDialog.tsx:1)

Что сделать:

- заменить текущую модель через `localModifiedAt / remoteModifiedAt / hasLocalChanges / hasRemoteChanges`;
- передавать нормализованный `conflictType`;
- показывать правильные действия:
  - сохранить локальную версию;
  - загрузить удалённую;
  - отменить.

#### 5. Обновить диалог закрытия документа

Файл:

- [App.tsx](/d:/@projects/projector/src/1-app/App/App.tsx:1)

Что сделать:

- использовать `getShouldWarnOnClose(session)`;
- перестать вручную различать только `isDirty` и `hasUnsyncedChanges`.

### Критерий завершения этапа

- все основные UI-компоненты используют единый derive-контракт;
- одинаковые состояния документа показываются одинаково во всех частях интерфейса.

---

## Этап 7. Очистка legacy

### Цель

После стабилизации убрать старую модель, чтобы она больше не порождала новые баги.

### Изменения

Удалить или перестать использовать:

- `hasUnsyncedChanges`
- `syncStatus`
- прямое чтение `state.isDirty` из UI
- legacy-ветки в snapshot, если миграция уже завершена

Возможный промежуточный шаг:

- оставить `state` как read-only facade;
- затем удалить полностью.

### Критерий завершения этапа

- модель синхронизации держится только на новых структурах;
- старые поля больше не участвуют в принятии решений.

---

## 7. Технические детали по реализации команд

### 7.1 `checkDocumentRemoteState(documentId)`

Псевдологика:

```ts
1. Проверить, что документ связан с Drive
2. Проверить доступность Drive
3. Создать operationToken
4. operation = 'checking'
5. Получить remote metadata
6. Обновить remoteRevisionId / remoteFingerprint / lastRemoteCheckAt
7. Вычислить derive-status:
   - synced
   - remote-ahead
   - conflict
8. operation = 'idle'
9. error = null
```

Особое правило:

- `check` никогда не меняет `session.data`.

### 7.2 `saveDocumentToDrive(documentId)`

Псевдологика:

```ts
1. Проверить доступность Drive
2. Если remote-check устарел -> выполнить check
3. Если есть conflict -> вернуть conflict result
4. operation = 'saving'
5. Сохранить текущий snapshot данных
6. Выполнить save в Drive
7. По ответу сервера обновить baseFingerprint/baseRevisionId/remoteRevisionId
8. operation = 'idle'
```

Особое правило:

- `save` не должен "тихо" перезаписывать удалённую версию после устаревшего знания о remote-состоянии.

### 7.3 `pullDocumentFromDrive(documentId)`

Псевдологика:

```ts
1. Проверить доступность Drive
2. operation = 'pulling'
3. Загрузить remote content
4. Обновить session.data
5. Обновить DocumentStoreManager
6. Пересчитать fingerprints
7. Обновить base/remote snapshot
8. operation = 'idle'
```

Особое правило:

- `pull` разрешён только как явное действие пользователя или часть explicit conflict resolution.

---

## 8. План тестирования

## 8.1 Unit-тесты model-слоя

Нужно покрыть:

- создание нового локального документа;
- открытие документа из Drive;
- восстановление документа из `localStorage`;
- `getIsDirty`, `getHasConflict`, `getUiSyncStatus`;
- `checkDocumentRemoteState` для:
  - актуальной версии;
  - remote-ahead;
  - конфликта;
  - ошибки доступа;
- `saveDocumentToDrive`:
  - успешное сохранение;
  - блокировка при конфликте;
  - pre-save check;
- `pullDocumentFromDrive`:
  - успешная загрузка;
  - игнорирование устаревшего operationToken.

## 8.2 Integration-тесты UI

Нужно проверить:

- одинаковую индикацию статуса в табах и заголовке;
- правильное открытие `ConflictDialog`;
- предупреждение при закрытии документа;
- отсутствие ложного конфликта при обычном save;
- корректное поведение после восстановления из `localStorage`.

## 8.3 Регрессионные сценарии

Обязательно вручную проверить:

1. Открыть документ из Drive, изменить локально, сохранить.
2. Открыть документ из Drive, изменить его удалённо, вернуться в приложение, выполнить check.
3. Восстановить документ из `localStorage`, затем войти в Google.
4. Открыть несколько документов и выполнить массовую проверку.
5. Быстро переключать вкладки во время `check/save/pull`.
6. Потерять доступ к Drive во время операции.

---

## 9. Порядок поставки по PR

Чтобы не тащить всё в один большой PR, лучше разбить так:

### PR 1

- убрать прямые мутации из `SaveToDriveStore`
- убрать destructive-refresh
- убрать подмену `activeDocumentId`

### PR 2

- добавить новую модель `sync + operation + error`
- добавить fingerprint
- добавить snapshot migration

### PR 3

- добавить селекторы
- подключить compatibility-layer
- частично обновить `DocumentTabs` и `Header`

### PR 4

- реализовать новые команды `check/save/pull/resolve`
- добавить `operationToken`
- обновить `CalendarIconBar` и `ConflictDialog`

### PR 5

- добавить `AppDriveAvailability`/scheduler
- настроить TTL и pre-save check
- обновить `MainStore`

### PR 6

- удалить legacy-флаги
- зачистить старый код
- довести тесты

---

## 10. Риски и способы их снизить

### Риск 1. Поломка восстановления старых документов

Снижение:

- делать миграцию snapshot консервативной;
- в неясных случаях ставить `needsRemoteCheck = true`.

### Риск 2. Лишние запросы к Drive

Снижение:

- TTL только для активного документа;
- для фоновых вкладок проверка только по событию доступности или активации.

### Риск 3. Скрытые зависимости UI от старых полей

Снижение:

- сначала ввести `getDocumentUiState`;
- через поиск убрать прямые чтения `isDirty`, `syncStatus`, `hasUnsyncedChanges`.

### Риск 4. Сложность поддержки двух моделей на переходе

Снижение:

- держать переходный период коротким;
- новые фичи писать только на новой модели;
- legacy использовать только как фасад для совместимости.

---

## 11. Итоговая рекомендация по реализации

Реализацию лучше вести в следующем порядке:

1. Сначала убрать текущие опасные точки в `DocumentTabsStore` и `SaveToDriveStore`.
2. Затем добавить новую внутреннюю модель и fingerprint.
3. После этого ввести селекторы и перевести UI на нормализованный контракт.
4. Потом разложить синхронизацию на `check/save/pull/resolve`.
5. В конце подключить coordinator доступности Drive и удалить legacy.

Это даст самый безопасный маршрут: сначала устраняется риск потери данных, затем стабилизируется доменная модель, и только потом меняется интерфейс и orchestration-логика.
