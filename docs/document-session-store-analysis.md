# Анализ: DocumentSessionStore — УДАЛЁН

**Дата:** 9 апреля 2026 г.
**Автор:** AI Assistant
**Статус:** ✅ УДАЛЁН (после Фазы 6)
**Приоритет:** Завершено

---

## Итог

`DocumentSessionStore` был **полностью удалён** из кодовой базы как дублирующий компонент.

### Что было сделано:

1. ✅ Удалён из `root.ts` (создание и экспорт)
2. ✅ Удалён из конструктора `MainStore`
3. ✅ Удалён из интерфейса `IRootStore` в `StoreContext.ts`
4. ✅ Удалён из `index.tsx` (StoreProvider)
5. ✅ Удалён из `App.spec.tsx` (тесты)
6. ✅ Удалён из `index.ts` экспорта
7. ✅ Удалены файлы:
   - `DocumentSessionStore.ts`
   - `DocumentSessionStore.spec.ts`

### Почему безопасно:

- **Не использовался в UI** — ни один компонент не вызывал методы `documentSessionStore.*`
- **Функциональность дублируется** — `DocumentTabsStore` полностью покрывает:
  - `openNewDocument()` ↔ `createNew()`
  - `openFromDrive()` ↔ `openFromDriveFile()`
  - `saveActiveDocument()` ↔ `saveToCurrentFile()`
  - `activateDocument()` ↔ `openDocument()`
  - `closeDocument()` ↔ `close()`
  - `restoreFromLocalStorage()` ↔ `restoreLastOpenedDocument()`
- **SaveToDriveStore уже использует** `documentTabsStore`, а не `documentSessionStore`

### Дополнительные исправления:

Во время удаления исправлена **бесконечная рекурсия** в DocumentStoreManager:
- Добавлен флаг `isInitializing` для блокировки `onChangeList` во время инициализации
- `getOrCreateStores()` больше не вызывает `onChangeList()` (вызывается в MainStore после restore)
- `updateStoresData()` больше не вызывает `onChangeList()` (вызывается в DocumentTabsStore)
- `EventsCache.init()` проверяет `isInitialized` перед доступ к сторам

---

**Связанные документы:**
- [document-store-manager-migration-plan.md](./document-store-manager-migration-plan.md)
- [per-document-eventstore-analysis.md](./per-document-eventstore-analysis.md)
