import GAPI, { DriveFileMetadata } from './gapi'
import { makeAutoObservable, runInAction } from 'mobx'

export type SaveFileResult =
  | { status: 'success'; file: DriveFileMetadata }
  | { status: 'conflict'; existingFiles: DriveFileMetadata[] }
  | { status: 'error'; message: string };

/**
 * Сервис для инкапсуляции логики взаимодействия с Google API.
 * Управляет инициализацией GAPI, авторизацией/деавторизацией и статусом входа.
 */
export class GoogleApiService {
  isGoogleLoggedIn: boolean = false

  constructor() {
    makeAutoObservable(this)
  }

  /**
   * Инициализирует Google API.
   * Устанавливает обработчики для успешной инициализации, входа и истечения токена.
   */
  initGapi = () => {
    GAPI.init({
      onSuccess: () => {
        runInAction(() => { this.isGoogleLoggedIn = GAPI.isLoggedIn() })
      },
      onSignIn: () => {
        runInAction(() => {
          this.isGoogleLoggedIn = GAPI.isLoggedIn()
          console.log('onSignIn in GoogleApiService', this.isGoogleLoggedIn)
        })
      },
      onExpiredToken: () => {
        runInAction(() => { this.isGoogleLoggedIn = false })
      }
    })
  }

  /**
   * Авторизоваться в Google сервисах.
   * @returns Promise<void>
   */
  logIn = async () => {
    await GAPI.logIn()
    runInAction(() => { this.isGoogleLoggedIn = GAPI.isLoggedIn() })
  }

  /**
   * Разлогиниться в Google.
   */
  logOut = () => {
    GAPI.logOut()
    runInAction(() => { this.isGoogleLoggedIn = false })
  }

  /**
   * Проверяет, авторизован ли пользователь в Google.
   * @returns boolean
   */
  isLoggedIn = (): boolean => {
    return GAPI.isLoggedIn()
  }

  /**
   * Получает содержимое указанной папки Google Drive.
   * Если пользователь не авторизован, попытается авторизоваться.
   * @param folderId ID папки для получения содержимого. По умолчанию 'root'.
   * @returns Promise с массивом метаданных файлов.
   */
  async listDriveFolderContents(
    folderId: string = 'root',
    fields: string = 'id, name, mimeType, parents, iconLink, webViewLink',
    spaces: string = 'drive'
  ): Promise<DriveFileMetadata[]> {
    if (!this.isGoogleLoggedIn) {
      await this.logIn();
      if (!this.isGoogleLoggedIn) {
        throw new Error("User not logged in to Google.");
      }
    }
    return GAPI.listFolderContents(folderId, fields, spaces);
  }

  /**
   * Получает метаданные файла или папки по его ID.
   * Если пользователь не авторизован, попытается авторизоваться.
   * @param fileId ID файла или папки.
   * @returns Promise с метаданными файла.
   */
  async getFileMetadata(fileId: string): Promise<DriveFileMetadata> {
    if (!this.isGoogleLoggedIn) {
      await this.logIn();
      if (!this.isGoogleLoggedIn) {
        throw new Error("User not logged in to Google.");
      }
    }
    return GAPI.getFileMetadata(fileId);
  }

  async createFolder(name: string, parentFolderId: string): Promise<DriveFileMetadata> {
    if (!this.isGoogleLoggedIn) {
      await this.logIn();
      if (!this.isGoogleLoggedIn) {
        throw new Error("User not logged in to Google.");
      }
    }
    return GAPI.createFileOrFolder(name, 'application/vnd.google-apps.folder', [parentFolderId]);
  }

  async deleteItem(itemId: string): Promise<boolean> {
    if (!this.isGoogleLoggedIn) {
      await this.logIn();
      if (!this.isGoogleLoggedIn) {
        throw new Error("User not logged in to Google.");
      }
    }
    return GAPI.deleteFile(itemId);
  }

  async saveFile(
    name: string,
    content: string | Blob,
    mimeType: string,
    parentFolderId: string,
    spaces: string = 'drive', // New parameter
    existingFileIdToUpdate: string | null = null
  ): Promise<SaveFileResult> {
    if (!this.isGoogleLoggedIn) {
      await this.logIn();
      if (!this.isGoogleLoggedIn) {
        return { status: 'error', message: "User not logged in to Google." };
      }
    }

    try {
      if (existingFileIdToUpdate) {
        const updatedFile = await this.updateFileContent(existingFileIdToUpdate, content, mimeType);
        return { status: 'success', file: updatedFile };
      }

      const queryForFind = `name = '${name}'`;
      const existingFiles = await GAPI.find(queryForFind, parentFolderId, undefined, spaces); // Pass spaces here

      if (existingFiles.length > 0) {
        return { status: 'conflict', existingFiles };
      }

      const createdFileMetadata = await GAPI.createFileOrFolder(name, mimeType, [parentFolderId]);
      await GAPI.upload(createdFileMetadata.id, content);
      return { status: 'success', file: createdFileMetadata };
    } catch (e: any) {
      console.error("Failed to save file to Drive:", e);
      return { status: 'error', message: e.message || "Failed to save file to Drive." };
    }
  }

  async updateFileContent(fileId: string, content: string | Blob, mimeType: string): Promise<DriveFileMetadata> {
    if (!this.isGoogleLoggedIn) {
      await this.logIn();
      if (!this.isGoogleLoggedIn) {
        throw new Error("User not logged in to Google."); // Or handle more gracefully
      }
    }

    // GAPI.upload can be used to update content of an existing file
    await GAPI.upload(fileId, content);

    // After updating, fetch and return the updated metadata
    // Potentially update mimeType if it has changed, though GAPI.upload doesn't directly support that.
    // A separate call to drive.files.update might be needed for mimeType.
    // For now, we assume mimeType is not changing or will be handled by GAPI.upload.
    // If we need to update mimeType, it would look like this:
    // await prom(gapi.client.drive.files.update, {
    //   fileId: fileId,
    //   resource: { mimeType: mimeType }
    // });

    return GAPI.getFileMetadata(fileId);
  }
}

