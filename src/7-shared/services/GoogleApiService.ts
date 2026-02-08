import GAPI, { DriveFileMetadata } from './gapi'
import { makeAutoObservable, runInAction } from 'mobx'

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
}


