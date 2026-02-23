import { makeAutoObservable } from 'mobx'

import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { StorageService } from 'src/7-shared/services/StorageService'
import {
  createInitialOpenDocumentState,
  DriveSpace,
  LastOpenedDocumentSnapshot,
  OpenDocumentRef,
  OpenDocumentState
} from './types'

const LAST_OPENED_DOCUMENT_KEY = 'lastOpenedDocument'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isDriveSpace(value: unknown): value is DriveSpace | null {
  return value === null || value === 'drive' || value === 'appDataFolder'
}

function toSnapshot(value: unknown): LastOpenedDocumentSnapshot | null {
  if (!isRecord(value)) return null

  const { fileId, name, mimeType, space, parentFolderId, updatedAt } = value
  if (fileId !== null && typeof fileId !== 'string') return null
  if (typeof name !== 'string') return null
  if (typeof mimeType !== 'string') return null
  if (!isDriveSpace(space)) return null
  if (parentFolderId !== null && typeof parentFolderId !== 'string') return null
  if (typeof updatedAt !== 'number') return null

  return {
    fileId,
    name,
    mimeType,
    space,
    parentFolderId,
    updatedAt
  }
}

/**
 * Store-сессия документа.
 * Хранит метаданные открытого документа и технические флаги загрузки/сохранения.
 */
export class DocumentSessionStore {
  /** Текущее состояние сессии документа */
  state: OpenDocumentState = createInitialOpenDocumentState()

  constructor(
    private readonly googleApiService: GoogleApiService,
    private readonly storageService: StorageService
  ) {
    makeAutoObservable(this)
  }

  /** Создать новый несохраненный документ */
  createNew(name: string = 'New document', mimeType: string = 'application/json') {
    this.state.ref = {
      fileId: null,
      name,
      mimeType,
      space: null,
      parentFolderId: null
    }
    this.state.isDirty = false
    this.state.error = null
    this.persistSessionToLocalStorage()
  }

  /** Открыть документ по уже известной ссылке/метаданным */
  openDocument(ref: OpenDocumentRef) {
    this.state.ref = { ...ref }
    this.state.isDirty = false
    this.state.error = null
    this.state.lastLoadedAt = Date.now()
    this.persistSessionToLocalStorage()
  }

  /**
   * Загрузить документ из Google Drive по fileId, применить его в сторы приложения
   * и зафиксировать сессию как активную.
   */
  async openFromDriveFile(fileId: string, options?: { space?: DriveSpace }) {
    this.startLoading()
    try {
      // Важно: выполняем последовательно, чтобы не запускать параллельный login-flow.
      // Иначе оба запроса могут одновременно вызвать logIn(), что вызывает гонку колбэка в gapi.ts.
      const metadata = await this.googleApiService.getFileMetadata(fileId)
      const content = await this.googleApiService.downloadFileContent(fileId)

      this.storageService.applyContent(content)

      this.markLoadCompleted({
        fileId: metadata.id,
        name: metadata.name,
        mimeType: metadata.mimeType || 'application/json',
        space: options?.space ?? null,
        parentFolderId: metadata.parents?.[0] ?? null,
        webViewLink: metadata.webViewLink
      })
    } catch (e: any) {
      console.error('Failed to open file from Google Drive:', e)
      this.finishLoading()
      this.setError(e?.message || 'Failed to open file from Google Drive')
    }
  }

  /** Сохранить активный документ в тот же файл Google Drive */
  async saveToCurrentFile() {
    if (!this.state.ref?.fileId) {
      this.setError('No opened file to save')
      return false
    }

    this.startSaving()
    try {
      const contentToSave = JSON.stringify(this.storageService.getContentToSave(), null, 2)
      const result = await this.googleApiService.saveFile(
        this.state.ref.name,
        contentToSave,
        this.state.ref.mimeType || 'application/json',
        this.state.ref.parentFolderId || 'root',
        this.state.ref.space || 'drive',
        this.state.ref.fileId
      )

      if (result.status !== 'success') {
        this.finishSaving()
        this.setError(result.status === 'error' ? result.message : 'Conflict while saving file')
        return false
      }

      this.markSaveCompleted({
        fileId: result.file.id,
        name: result.file.name,
        mimeType: result.file.mimeType || this.state.ref.mimeType || 'application/json',
        space: this.state.ref.space,
        parentFolderId: result.file.parents?.[0] ?? this.state.ref.parentFolderId,
        webViewLink: result.file.webViewLink
      })
      return true
    } catch (e: any) {
      console.error('Failed to save opened document:', e)
      this.finishSaving()
      this.setError(e?.message || 'Failed to save opened document')
      return false
    }
  }

  /** Закрыть текущий документ и сбросить состояние сессии */
  close() {
    this.state = createInitialOpenDocumentState()
    this.clearPersistedSession()
  }

  /** Частично обновить метаданные текущего документа */
  updateRef(patch: Partial<OpenDocumentRef>) {
    if (!this.state.ref) return
    this.state.ref = {
      ...this.state.ref,
      ...patch
    }
  }

  /** Отметить документ как измененный */
  markDirty() {
    if (!this.state.ref) return
    this.state.isDirty = true
  }

  /** Сбросить признак несохраненных изменений */
  markPristine() {
    this.state.isDirty = false
  }

  /** Перевести сессию в состояние загрузки */
  startLoading() {
    this.state.isLoading = true
    this.state.error = null
  }

  /** Завершить состояние загрузки */
  finishLoading() {
    this.state.isLoading = false
  }

  /** Перевести сессию в состояние сохранения */
  startSaving() {
    this.state.isSaving = true
    this.state.error = null
  }

  /** Завершить состояние сохранения */
  finishSaving() {
    this.state.isSaving = false
  }

  /** Зафиксировать успешную загрузку документа */
  markLoadCompleted(ref: OpenDocumentRef) {
    this.state.ref = { ...ref }
    this.state.isLoading = false
    this.state.isDirty = false
    this.state.error = null
    this.state.lastLoadedAt = Date.now()
    this.persistSessionToLocalStorage()
  }

  /** Зафиксировать успешное сохранение документа */
  markSaveCompleted(updatedRef?: OpenDocumentRef) {
    if (updatedRef) {
      this.state.ref = { ...updatedRef }
    }
    this.state.isSaving = false
    this.state.isDirty = false
    this.state.error = null
    this.state.lastSavedAt = Date.now()
    this.storageService.markGoogleDriveSynced()
    this.persistSessionToLocalStorage()
  }

  /** Установить/сбросить текст ошибки */
  setError(error: string | null) {
    this.state.error = error
  }

  /** Очистить ошибку сессии */
  clearError() {
    this.state.error = null
  }

  /** Сохранить ссылку на текущий документ в localStorage */
  persistSessionToLocalStorage() {
    if (!this.state.ref) return
    const snapshot: LastOpenedDocumentSnapshot = {
      fileId: this.state.ref.fileId,
      name: this.state.ref.name,
      mimeType: this.state.ref.mimeType,
      space: this.state.ref.space,
      parentFolderId: this.state.ref.parentFolderId,
      updatedAt: Date.now()
    }
    localStorage.setItem(LAST_OPENED_DOCUMENT_KEY, JSON.stringify(snapshot))
  }

  /** Удалить сохраненный снимок сессии документа */
  clearPersistedSession() {
    localStorage.removeItem(LAST_OPENED_DOCUMENT_KEY)
  }

  /** Получить и провалидировать снимок последнего открытого документа */
  restoreSessionFromLocalStorage(): LastOpenedDocumentSnapshot | null {
    const raw = localStorage.getItem(LAST_OPENED_DOCUMENT_KEY)
    if (!raw) return null

    try {
      const snapshot = toSnapshot(JSON.parse(raw))
      if (!snapshot) this.clearPersistedSession()
      return snapshot
    } catch {
      this.clearPersistedSession()
      return null
    }
  }

  /** Автоматически восстановить последний документ из localStorage */
  async restoreLastOpenedDocument() {
    const snapshot = this.restoreSessionFromLocalStorage()
    if (!snapshot) return false

    if (snapshot.fileId) {
      const isLoggedIn = this.googleApiService.isGoogleLoggedIn === true

      // Важно: не инициируем login-flow автоматически на старте приложения.
      // Иначе браузер блокирует popup как не связанный с пользовательским действием.
      if (!isLoggedIn) {
        this.setError('Для восстановления документа требуется вход в Google.')
        return false
      }

      await this.openFromDriveFile(snapshot.fileId, { space: snapshot.space ?? undefined })
      // Не удаляем snapshot на временных ошибках (например, GAPI еще не инициализирован).
      // Иначе lastOpenedDocument будет теряться после перезагрузки приложения.
      if (this.state.error) return false
      return true
    }

    this.openDocument({
      fileId: null,
      name: snapshot.name,
      mimeType: snapshot.mimeType,
      space: snapshot.space,
      parentFolderId: snapshot.parentFolderId
    })
    return true
  }

  /** Проверка, открыт ли документ */
  get isOpened() {
    return this.state.ref !== null
  }

  /** Проверка доступности сохранения в текущий момент */
  get canSave() {
    return this.isOpened && !this.state.isSaving && !this.state.isLoading
  }

  /** Заголовок активного документа для UI */
  get title() {
    return this.state.ref?.name ?? 'No document'
  }
}
