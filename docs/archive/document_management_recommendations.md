# Рекомендации по управлению документами из Google Drive

## Обзор

Для реализации возможности работы с различными документами, хранящимися на Google Drive (загрузка, сохранение, сохранение под новым именем, создание нового пустого документа), предлагается следующая архитектура, основанная на принципах FSD (Feature-Sliced Design) и использовании MobX для управления состоянием.

## 1. Структура данных для открытого документа (`IDocumentModel`)

Для представления текущего открытого документа предлагается использовать интерфейс `IDocumentModel`. Этот интерфейс будет содержать всю необходимую информацию о документе, включая его метаданные с Google Drive и текущее состояние в приложении.

**Местоположение:** `src/6-entities/Documents/IDocumentModel.ts` (или аналогичное в новом срезе `Documents`)

```typescript
export interface IDocumentModel {
  id: string | null; // Google Drive File ID. Null для нового, несохраненного документа.
  name: string; // Имя документа
  content: string; // Фактическое содержимое документа
  mimeType: string; // MIME-тип документа (например, 'text/plain', 'application/json')
  isDirty: boolean; // True, если содержимое было изменено с момента последнего сохранения
  isSaving: boolean; // True, если в данный момент происходит операция сохранения
  lastModifiedByMe?: string; // Дата последнего изменения (если доступна из Google Drive)
  webViewLink?: string; // Ссылка для просмотра документа на Google Drive
  parents?: string[]; // Массив идентификаторов родительских папок на Google Drive
}
```

## 2. Хранилище для управления документами (`DocumentStore`)

Для централизованного управления состоянием активного документа предлагается создать MobX-хранилище `DocumentStore`. Оно будет отвечать за загрузку, сохранение, создание новых документов и отслеживание их состояния.

**Местоположение:** `src/6-entities/Documents/DocumentStore.ts`

```typescript
import { makeAutoObservable, runInAction } from 'mobx';
import { GoogleApiService, SaveFileResult } from 'src/7-shared/services/GoogleApiService';
import { IDocumentModel } from './IDocumentModel'; // Предполагаем, что интерфейс будет находиться здесь

export class DocumentStore {
  activeDocument: IDocumentModel | null = null; // Текущий активный документ
  isLoading: boolean = false; // Флаг загрузки
  error: string | null = null; // Сообщение об ошибке

  constructor(private googleApiService: GoogleApiService) {
    makeAutoObservable(this); // Делаем класс наблюдаемым MobX
  }

  // --- Действия (Actions) ---

  /**
   * Инициализирует новый, пустой документ.
   * Устанавливает mimeType по умолчанию и помечает как измененный.
   */
  createNewDocument(): void {
    runInAction(() => {
      this.activeDocument = {
        id: null,
        name: 'Новый документ',
        content: '',
        mimeType: 'text/plain', // MIME-тип по умолчанию, может быть настроен
        isDirty: true,
        isSaving: false,
        parents: [], // Или идентификатор папки по умолчанию, куда сохранять новые документы
      };
      this.error = null;
    });
  }

  /**
   * Загружает документ из Google Drive по его ID.
   * @param fileId ID документа для загрузки.
   */
  async loadDocument(fileId: string): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      // Получаем метаданные файла
      const metadata = await this.googleApiService.getFileMetadata(fileId);
      // **ВНИМАНИЕ:** Требуется реализовать метод `getFileContent` в `GoogleApiService`.
      // Пример: const content = await this.googleApiService.getFileContent(fileId);
      // Для демонстрации пока используем заглушку
      const content = "Содержимое загруженного файла (заглушка)"; 
      
      runInAction(() => {
        this.activeDocument = {
          id: metadata.id,
          name: metadata.name,
          content: content.toString(), // Приводим к строке, т.к. `content` может быть объектом
          mimeType: metadata.mimeType,
          isDirty: false,
          isSaving: false,
          lastModifiedByMe: metadata.lastModifiedByMe,
          webViewLink: metadata.webViewLink,
          parents: metadata.parents,
        };
      });
    } catch (e: any) {
      runInAction(() => {
        this.error = `Не удалось загрузить документ: ${e.message}`;
        console.error(e);
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  /**
   * Сохраняет текущий активный документ на Google Drive.
   * Если это новый документ, он будет создан. Если существующий, его содержимое обновится.
   * Может использоваться для "Сохранить как..." путем передачи newName и/или parentFolderId.
   * @param newName Необязательно: Новое имя для документа.
   * @param parentFolderId Необязательно: ID родительской папки для сохранения нового документа или сохранения как.
   * @returns Promise<boolean> True в случае успеха, false в случае ошибки.
   */
  async saveDocument(newName?: string, parentFolderId?: string): Promise<boolean> {
    if (!this.activeDocument) {
      this.error = 'Нет активного документа для сохранения.';
      return false;
    }

    // Если документ не изменен и не является новым, и нет нового имени/папки для "Сохранить как", 
    // то нет необходимости сохранять.
    if (!this.activeDocument.isDirty && this.activeDocument.id && !newName && !parentFolderId) {
        return true; 
    }

    this.activeDocument.isSaving = true;
    this.error = null;

    try {
      let result: SaveFileResult;
      const currentName = newName || this.activeDocument.name;
      // Используем первый родительский ID или 'root' по умолчанию
      const currentParentFolderId = parentFolderId || (this.activeDocument.parents && this.activeDocument.parents[0]) || 'root'; 

      // Если документ уже имеет ID и это не "Сохранить как" (т.е. newName и parentFolderId не переданы)
      if (this.activeDocument.id && !newName && !parentFolderId) {
        // Обычное сохранение существующего документа
        result = await this.googleApiService.saveFile(
          currentName,
          this.activeDocument.content,
          this.activeDocument.mimeType,
          currentParentFolderId, // Это может быть не нужно для обновления, но saveFile ожидает
          'drive',
          this.activeDocument.id // Передаем ID для обновления
        );
      } else {
        // Новый документ или "Сохранить как"
        result = await this.googleApiService.saveFile(
          currentName,
          this.activeDocument.content,
          this.activeDocument.mimeType,
          currentParentFolderId,
          'drive',
          null // Не обновляем существующий файл по ID
        );
      }

      runInAction(() => {
        if (result.status === 'success') {
          this.activeDocument!.id = result.file.id;
          this.activeDocument!.name = result.file.name;
          this.activeDocument!.mimeType = result.file.mimeType;
          this.activeDocument!.isDirty = false; // Сбрасываем флаг изменения
          this.activeDocument!.lastModifiedByMe = result.file.lastModifiedByMe;
          this.activeDocument!.webViewLink = result.file.webViewLink;
          this.activeDocument!.parents = result.file.parents;
          // Дополнительные поля могут быть обновлены по необходимости
          // После успешного сохранения, если это было "Сохранить как", то `activeDocument` теперь
          // будет представлять новый сохраненный файл.
        } else {
          this.error = result.message || 'Не удалось сохранить документ из-за конфликта или ошибки.';
          console.error('Ошибка сохранения:', result);
        }
      });
      return result.status === 'success';

    } catch (e: any) {
      runInAction(() => {
        this.error = `Не удалось сохранить документ: ${e.message}`;
        console.error(e);
      });
      return false;
    } finally {
      runInAction(() => {
        if (this.activeDocument) {
          this.activeDocument.isSaving = false;
        }
      });
    }
  }

  /**
   * Устанавливает содержимое активного документа и помечает его как измененный.
   * @param newContent Новое содержимое документа.
   */
  setDocumentContent(newContent: string): void {
    if (this.activeDocument) {
      runInAction(() => {
        this.activeDocument!.content = newContent;
        // Помечаем документ как измененный, только если содержимое действительно изменилось
        if (this.activeDocument!.content !== newContent) {
            this.activeDocument!.isDirty = true;
        }
      });
    }
  }

  /**
   * Закрывает текущий активный документ, очищая его состояние.
   */
  closeDocument(): void {
    runInAction(() => {
      this.activeDocument = null;
      this.isLoading = false;
      this.error = null;
    });
  }

  /**
   * Очищает активные сообщения об ошибках.
   */
  clearError(): void {
    runInAction(() => {
      this.error = null;
    });
  }
}
```

## 3. Необходимые изменения в `GoogleApiService`

Для полноценной работы `DocumentStore` потребуется добавить в `GoogleApiService` метод для получения содержимого файла.

**Местоположение:** `src/7-shared/services/GoogleApiService.ts`

```typescript
// Внутри класса GoogleApiService добавьте:
  /**
   * Получает содержимое файла Google Drive по его ID.
   * Если пользователь не авторизован, попытается авторизоваться.
   * @param fileId ID файла для получения содержимого.
   * @returns Promise с содержимым файла (строка или объект).
   */
  async getFileContent(fileId: string): Promise<string | object> {
    if (!this.isGoogleLoggedIn) {
      await this.logIn();
      if (!this.isGoogleLoggedIn) {
        throw new Error("User not logged in to Google.");
      }
    }
    // Предполагается, что GAPI.download уже существует и работает
    return GAPI.download(fileId);
  }
```
***Примечание:** Метод `GAPI.download` уже существует в `src/7-shared/services/gapi.ts` и может быть использован для получения содержимого файла.*

## 4. Принципы FSD и интеграция

*   **Слой `entities`:** `IDocumentModel` и `DocumentStore` идеально вписываются в слой `entities` (например, `src/6-entities/Documents`), так как они представляют собой бизнес-сущность "документ" и логику управления ею.
*   **Использование `GoogleApiService`:** `DocumentStore` будет использовать `GoogleApiService` для всех низкоуровневых операций с Google Drive, таких как получение метаданных, загрузка и сохранение файлов.
*   **Интеграция в `MainStore`:** `DocumentStore` может быть инициализирован и зарегистрирован в `MainStore` (`src/1-app/Stores/MainStore.ts`), что позволит компонентам приложения получать доступ к состоянию активного документа через `MainStore`.

```typescript
// src/1-app/Stores/MainStore.ts
// ...
import { DocumentStore } from 'src/6-entities/Documents/DocumentStore'; // Импорт нового хранилища

export class MainStore {
  // ...
  documentStore: DocumentStore; // Добавляем ссылку на хранилище документов

  constructor(projectsStore: ProjectsStore, eventsStore: EventsStore, eventsCache: EventsCache, googleApiService: GoogleApiService, storageService: StorageService) {
    // ...
    this.googleApiService = googleApiService;
    // Инициализация DocumentStore
    this.documentStore = new DocumentStore(this.googleApiService); 
    makeAutoObservable(this)
  }
  // ...
}
```

## Заключение

Предложенная структура обеспечивает чистое разделение ответственности: `IDocumentModel` определяет данные, `DocumentStore` управляет состоянием и логикой работы с активным документом, а `GoogleApiService` инкапсулирует взаимодействие с Google API. Это соответствует современным практикам разработки, обеспечивает масштабируемость и легкость тестирования.

Дальнейшие шаги включают в себя создание соответствующих UI-компонентов (например, диалогов открытия/сохранения) и их интеграцию с `DocumentStore`.