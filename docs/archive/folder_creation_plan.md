# План реализации функционала создания папок в DriveFilePicker

## 1. Введение

Этот документ описывает реализованный функционал создания новых папок в Google Drive непосредственно из компонента `DriveFilePicker`. Ранее `DriveFilePicker` был предназначен только для выбора файлов. В соответствии с новым требованием пользователя, была добавлена возможность создания папок с указанием имени.

## 2. Обзор изменений

Изменения коснулись трех основных файлов:
*   `src/7-shared/services/gapi.ts`: Добавлен обобщенный метод для создания файлов/папок и обновлены SCOPES.
*   `src/7-shared/services/GoogleApiService.ts`: Добавлен метод-обертка для создания папок.
*   `src/6-entities/stores/DrivePicker/DrivePickerStore.ts`: Расширено состояние и добавлены действия для управления процессом создания папки.
*   `src/4-widgets/DriveFilePicker/DriveFilePicker.tsx`: Модифицирован UI для инициации и управления процессом создания папки.
*   `src/4-widgets/DriveFilePicker/DriveFilePicker.module.css`: Добавлены стили для нового UI создания папки.

## 3. Детальное описание изменений

### 3.1. `src/7-shared/services/gapi.ts`

**Цель:** Расширить возможности Google API-хелпера для поддержки создания файлов и папок в произвольных директориях и обновить необходимые SCOPES для Drive API.

**Изменения:**
*   **Обновление SCOPES:** В константу `SCOPES` добавлен `https://www.googleapis.com/auth/drive.file`. Это позволяет приложению создавать и управлять файлами, созданными этим приложением, в любых папках пользователя, а не только в `appDataFolder`.
    ```typescript
    const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.appfolder'
    ```
*   **Переименование и модификация `createEmptyFile`:** Метод `createEmptyFile` был переименован в `createFileOrFolder`. Он теперь принимает `parentFolderId` как опциональный параметр (по умолчанию `appDataFolder`), что позволяет создавать файлы/папки в любой указанной родительской папке. Также теперь возвращает полную `DriveFileMetadata`, а не только `id`.
    ```typescript
    static async createFileOrFolder(name: string, mimeType: string = 'text/plain', parentFolderId: string = 'appDataFolder'): Promise<DriveFileMetadata> {
      const resp = await prom(gapi.client.drive.files.create, {
        resource: {
          name: name,
          mimeType: mimeType,
          parents: [parentFolderId]
        },
        fields: 'id, name, mimeType, parents, iconLink, webViewLink'
      })
      return resp.result as DriveFileMetadata
    }
    ```

### 3.2. `src/7-shared/services/GoogleApiService.ts`

**Цель:** Предоставить высокоуровневый метод для создания папок, используя обновленный `gapi.ts`, и инкапсулировать логику авторизации.

**Изменения:**
*   **Добавлен метод `createFolder`:** Этот асинхронный метод вызывает `GAPI.createFileOrFolder`, передавая имя папки, MIME-тип `application/vnd.google-apps.folder` и идентификатор родительской папки. Он также обеспечивает, чтобы пользователь был авторизован перед выполнением запроса.
    ```typescript
    async createFolder(name: string, parentFolderId: string): Promise<DriveFileMetadata> {
      if (!this.isGoogleLoggedIn) {
        await this.logIn();
        if (!this.isGoogleLoggedIn) {
          throw new Error("User not logged in to Google.");
        }
      }
      return GAPI.createFileOrFolder(name, 'application/vnd.google-apps.folder', parentFolderId);
    }
    ```

### 3.3. `src/6-entities/stores/DrivePicker/DrivePickerStore.ts`

**Цель:** Управлять состоянием UI создания папки, обрабатывать ввод имени новой папки и инициировать вызов API для создания папки.

**Изменения:**
*   **Новые свойства состояния:**
    *   `selectedItem: DriveFileMetadata | null = null;`: Заменил `selectedFile` для более общего представления выбранного элемента (файл или папка).
    *   `isCreatingFolder: boolean = false;`: Флаг, указывающий, находится ли пользователь в режиме создания папки.
    *   `newFolderName: string = '';`: Хранит имя новой папки, введенное пользователем.
    *   `currentFolderMetadata: DriveFileMetadata | null = null;`: Метаданные текущей открытой папки, полезные для выбора текущей папки или определения родителя для новой папки.
*   **Новые действия (`actions`):**
    *   `setNewFolderName(name: string)`: Устанавливает `newFolderName`.
    *   `startCreatingFolder()`: Переводит стор в режим создания папки (`isCreatingFolder = true`).
    *   `cancelCreatingFolder()`: Выходит из режима создания папки (`isCreatingFolder = false`) и очищает `newFolderName`.
    *   `createFolder()`: Асинхронное действие, которое вызывает `googleApiService.createFolder` с `newFolderName` и `currentFolderId`. После успешного создания обновляет список элементов в текущей папке и сбрасывает состояние создания папки. Обрабатывает ошибки.
*   **Обновление `loadFolder`:** Теперь после загрузки содержимого папки также извлекаются и сохраняются метаданные `currentFolderMetadata` для текущей папки.
*   **Обновление `setSelectedItem` и `reset`:** Методы были адаптированы для работы с `selectedItem` вместо `selectedFile`.

### 3.4. `src/4-widgets/DriveFilePicker/DriveFilePicker.tsx`

**Цель:** Добавить UI для кнопки "Создать папку", поле ввода имени новой папки и кнопок действий, а также интегрировать его с `DrivePickerStore`.

**Изменения:**
*   **Импорты:** Добавлены `TextField` и `DialogActions` из общих UI-компонентов проекта.
*   **`handleItemClick` и `handleSelectClick`:** Обновлены для использования `drivePickerStore.setSelectedItem` и `drivePickerStore.selectedItem` соответственно.
*   **Кнопка "Создать папку":** Добавлен `ListItem` с иконкой "➕" и текстом "Создать папку", который вызывает `drivePickerStore.startCreatingFolder()` при клике.
*   **UI создания папки:** Используется условный рендеринг:
    *   Если `drivePickerStore.isCreatingFolder` истинно, отображается `div` с `TextField` (для ввода `newFolderName`) и `DialogActions` с кнопками "Отмена" и "Создать".
    *   Кнопка "Создать" деактивируется, если `newFolderName` пусто.
    *   Кнопки вызывают соответствующие действия из `drivePickerStore` (`createFolder`, `cancelCreatingFolder`).
*   **Основные кнопки модального окна:** Кнопка "Выбрать" теперь деактивируется, если `drivePickerStore.selectedItem` равен `null`.

### 3.5. `src/4-widgets/DriveFilePicker/DriveFilePicker.module.css`

**Цель:** Предоставить базовые стили для нового UI создания папки.

**Изменения:**
*   Добавлены стили для `.createFolderContainer` (flex-контейнер для поля ввода и кнопок) и `.createFolderContainer .dialogActions` (выравнивание кнопок).

## 4. Использование

После этих изменений, компонент `DriveFilePicker` позволяет пользователю:
1.  Выбрать существующий файл или папку.
2.  Создать новую папку в текущей директории, введя её имя.

## 5. Дальнейшие шаги (не реализовано в данном запросе)

*   **Переименование папок/файлов:** В текущем запросе не было затребовано, но логика уже частично заложена (возможность получить метаданные).
*   **Удаление папок/файлов:** Требует дополнительных методов в `gapi.ts` и `GoogleApiService.ts`, а также UI.
*   **Обработка ошибок UX:** Улучшение отображения ошибок для пользователя (например, Toast-уведомления).
*   **Валидация имени папки:** Дополнительная проверка на недопустимые символы или дубликаты имен перед созданием.
*   **Выбор текущей папки:** Добавление кнопки "Выбрать текущую папку" для подтверждения выбора текущей просматриваемой папки.
