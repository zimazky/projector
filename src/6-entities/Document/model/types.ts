import type { EventDto } from 'src/6-entities/Events/EventDto'

/** Пространство Google Drive, в котором расположен документ */
export type DriveSpace = 'drive' | 'appDataFolder'

/** Сериализуемая часть проекта в документе */
export type ProjectDocumentData = {
  name: string
  color: string
  background: string
}

/** Полный контент документа приложения */
export type DocumentContent = {
  projectsList: ProjectDocumentData[]
  completedList: EventDto[]
  plannedList: EventDto[]
}

/** Ссылка на текущий открытый документ и его метаданные */
export type OpenDocumentRef = {
  fileId: string | null
  name: string
  mimeType: string
  space: DriveSpace | null
  parentFolderId: string | null
  webViewLink?: string
}

/** Состояние сессии документа в приложении */
export type OpenDocumentState = {
  ref: OpenDocumentRef | null
  isDirty: boolean
  isLoading: boolean
  isSaving: boolean
  lastLoadedAt: number | null
  lastSavedAt: number | null
  error: string | null
}

/** Снимок для сохранения последнего открытого документа в localStorage */
export type LastOpenedDocumentSnapshot = {
  fileId: string | null
  name: string
  mimeType: string
  space: DriveSpace | null
  parentFolderId: string | null
  updatedAt: number
}

/** Базовое состояние: документ не открыт, операций нет */
export function createInitialOpenDocumentState(): OpenDocumentState {
  return {
    ref: null,
    isDirty: false,
    isLoading: false,
    isSaving: false,
    lastLoadedAt: null,
    lastSavedAt: null,
    error: null
  }
}
