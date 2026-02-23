import { makeAutoObservable, runInAction } from 'mobx'

import { GoogleApiService, SaveFileResult } from 'src/7-shared/services/GoogleApiService'
import { DriveFileMetadata } from 'src/7-shared/services/gapi'
import { MainStore } from 'src/1-app/Stores/MainStore'
import { DocumentSessionStore, DriveSpace } from 'src/6-entities/Document/model'

export class SaveToDriveStore {
  isOpen: boolean = false
  fileName: string = ''
  fileContent: string | Blob | null = null
  mimeType: string = 'text/plain'

  isSaving: boolean = false
  error: string | null = null

  showConflictDialog: boolean = false
  conflictingFiles: DriveFileMetadata[] = []
  newFileNameForConflict: string = ''

  constructor(
    private googleApiService: GoogleApiService,
    private mainStore: MainStore,
    private documentSessionStore: DocumentSessionStore
  ) {
    makeAutoObservable(this)
  }

  open = (initialFileName: string, content: string | Blob, mime: string = 'text/plain') => {
    this.isOpen = true
    this.fileName = initialFileName
    this.fileContent = content
    this.mimeType = mime
    this.error = null
    this.resetConflictState()
  }

  close = () => {
    this.isOpen = false
    this.resetState()
    this.resetConflictState()
  }

  setFileName = (name: string) => {
    this.fileName = name
  }

  setNewFileNameForConflict = (name: string) => {
    this.newFileNameForConflict = name
  }

  closeConflictDialog = () => {
    this.showConflictDialog = false
    this.resetConflictState()
  }

  saveFile = async (
    selectedFolderId: string,
    spaces: string,
    currentFileName: string = this.fileName,
    fileContentToSave: string | Blob | null = this.fileContent,
    fileIdToUpdate: string | null = null
  ) => {
    if (!fileContentToSave || !currentFileName) {
      this.error = 'Имя файла и содержимое не могут быть пустыми.'
      runInAction(() => { this.isSaving = false })
      return
    }

    this.isSaving = true
    this.error = null
    try {
      if (!this.googleApiService.isGoogleLoggedIn) {
        await this.googleApiService.logIn()
      }

      if (this.googleApiService.isGoogleLoggedIn) {
        const result: SaveFileResult = await this.googleApiService.saveFile(
          currentFileName,
          fileContentToSave,
          this.mimeType,
          selectedFolderId,
          spaces,
          fileIdToUpdate
        )

        runInAction(() => {
          if (result.status === 'success') {
            this.mainStore.fileSavedNotifier.fire()
            const documentSpace: DriveSpace = spaces === 'appDataFolder' ? 'appDataFolder' : 'drive'
            this.documentSessionStore.markSaveCompleted({
              fileId: result.file.id,
              name: result.file.name,
              mimeType: result.file.mimeType || this.mimeType,
              space: documentSpace,
              parentFolderId: result.file.parents?.[0] ?? selectedFolderId,
              webViewLink: result.file.webViewLink
            })
            this.close()
          } else if (result.status === 'conflict') {
            this.conflictingFiles = result.existingFiles
            this.newFileNameForConflict = this.generateUniqueFileName(currentFileName, result.existingFiles)
            this.showConflictDialog = true
          } else {
            this.error = result.message
          }
        })
      } else {
        runInAction(() => {
          this.error = 'Пожалуйста, войдите в Google для сохранения файла.'
        })
      }
    } catch (e: any) {
      runInAction(() => {
        console.error('Не удалось сохранить файл на Google Drive:', e)
        this.error = e.message || 'Не удалось сохранить файл на Google Drive.'
      })
    } finally {
      runInAction(() => {
        this.isSaving = false
      })
    }
  }

  resolveConflict = async (resolution: 'overwrite' | 'rename' | 'cancel', selectedFolderId: string, spaces: string) => {
    this.closeConflictDialog()

    if (resolution === 'cancel') {
      this.isSaving = false
      return
    }

    if (!this.fileContent) {
      this.error = 'Содержимое файла отсутствует.'
      return
    }

    if (resolution === 'overwrite') {
      const fileToOverwriteId = this.conflictingFiles.length > 0 ? this.conflictingFiles[0].id : null
      if (fileToOverwriteId) {
        await this.saveFile(selectedFolderId, spaces, this.fileName, this.fileContent, fileToOverwriteId)
      } else {
        this.error = 'Нет файла для перезаписи.'
      }
    } else if (resolution === 'rename') {
      if (this.newFileNameForConflict.trim() === '') {
        this.error = 'Новое имя файла не может быть пустым.'
        return
      }
      await this.saveFile(selectedFolderId, spaces, this.newFileNameForConflict, this.fileContent)
    }
  }

  private resetState = () => {
    this.fileName = ''
    this.fileContent = null
    this.mimeType = 'text/plain'
    this.isSaving = false
    this.error = null
  }

  private resetConflictState = () => {
    this.showConflictDialog = false
    this.conflictingFiles = []
    this.newFileNameForConflict = ''
  }

  private generateUniqueFileName = (originalName: string, existingFiles: DriveFileMetadata[]): string => {
    let newName = originalName
    let counter = 1
    const nameParts = originalName.split('.')
    const extension = nameParts.length > 1 ? `.${nameParts.pop()}` : ''
    const nameWithoutExt = nameParts.join('.')

    while (existingFiles.some(file => file.name === newName)) {
      newName = `${nameWithoutExt} (${counter})${extension}`
      counter++
    }
    return newName
  }
}
