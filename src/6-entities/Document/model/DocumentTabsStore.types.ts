import type { EventDto } from 'src/6-entities/Events/EventDto'
import type { DriveSpace, ProjectDocumentData } from './types'

/** Уникальный идентификатор документа в сессии */
export type DocumentId = string

export type DocumentSaveResult =
	| { status: 'saved' }
	| { status: 'cancelled' }
	| { status: 'failed'; message: string }
	| { status: 'conflict'; message: string }

export type DocumentCloseDecision = 'save' | 'discard' | 'cancel'
export type DocumentCloseResult = { status: 'closed' } | Exclude<DocumentSaveResult, { status: 'saved' }>

/** Статус синхронизации документа с Google Drive (legacy) */
export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'needs-sync' | 'update-available' | 'error'

/** Текущая операция синхронизации */
export type SyncOperation = 'idle' | 'opening' | 'checking' | 'saving' | 'pulling'

/** Состояние ошибки операции */
export type SyncErrorState = {
	code: string
	message: string
	at: number
} | null

/** Доступность Drive на уровне приложения */
export type AppDriveAvailability = 'drive-unavailable' | 'drive-available'

/** Происхождение документа */
export type DocumentOrigin = 'new-local' | 'drive' | 'restored-local'

/** Снимок синхронизации документа — новая модель состояния */
export type DocumentSyncSnapshot = {
	/** Монотонная версия локального содержимого, сохраняется между перезапусками. */
	localVersion: number
	/** Локальная версия подтверждённого снимка; null означает неизвестную базу. */
	baseLocalVersion: number | null
	/** Отпечаток текущих локальных данных */
	localFingerprint: string | null
	/** Отпечаток базовой синхронизированной версии */
	baseFingerprint: string | null
	/** Отпечаток удалённой версии (если известна) */
	remoteFingerprint: string | null
	/** ID ревизии, от которой началось локальное редактирование */
	baseRevisionId: string | null
	/** ID последней известной удалённой ревизии */
	remoteRevisionId: string | null
	/** Время последней успешной синхронизации */
	lastSyncAt: number | null
	/** Время последней проверки удалённой версии */
	lastRemoteCheckAt: number | null
	/** Требуется ли проверка удалённой версии */
	needsRemoteCheck: boolean
	/** Происхождение документа */
	origin: DocumentOrigin
}

/** Результат синхронизации с Google Drive */
export type SyncResult =
	| { status: 'success' }
	| { status: 'cancelled' }
	| {
			status: 'conflict'
			context: DocumentOperationContext
			message: string
			remoteMetadata: DriveFileMetadata
			localModifiedAt: number
			remoteModifiedAt: number
			hasLocalChanges: boolean
			hasRemoteChanges: boolean
	  }
	| { status: 'error'; message: string }

/** Снимок адреса, сессии и данных в момент начала команды или открытия «Сохранить как». */
export type DocumentSnapshot = Readonly<{
	documentId: DocumentId
	session: DocumentSession
	ref: DocumentRef | null
	data: DocumentData
	localVersion: number
}>

/** Токен защищает все продолжения операции, включая ошибки и finally. */
export type DocumentOperationContext = DocumentSnapshot & Readonly<{ token: number }>

export type DocumentPullResult = { status: 'pulled' } | Exclude<DocumentSaveResult, { status: 'saved' }>
export type DocumentResolveResult = DocumentSaveResult | DocumentPullResult
export type DocumentOpenResult =
	{ status: 'opened'; documentId: DocumentId } | Exclude<DocumentSaveResult, { status: 'saved' }>

/** Данные одного документа (проекты и события) */
export type DocumentData = {
	projectsList: ProjectDocumentData[]
	completedList: EventDto[]
	plannedList: EventDto[]
}

/** Состояние документа */
export type DocumentState = {
	isDirty: boolean
	isLoading: boolean
	isSaving: boolean
	lastLoadedAt: number | null
	lastSavedAt: number | null
	error: string | null
	syncStatus: SyncStatus
	lastSyncedAt: number | null
	hasUnsyncedChanges: boolean
}

/** Метаданные документа */
export type DocumentRef = {
	fileId: string | null
	name: string
	mimeType: string
	space: DriveSpace | null
	parentFolderId: string | null
	webViewLink?: string
}

/** Полная сессия документа */
export type DocumentSession = {
	id: DocumentId
	ref: DocumentRef | null
	data: DocumentData
	state: DocumentState
	/** Новая модель синхронизации (этап 2+) */
	sync: DocumentSyncSnapshot
	/** Текущая операция */
	operation: SyncOperation
	/** Состояние ошибки */
	error: SyncErrorState
	/** Токен текущей операции для защиты от устаревших результатов */
	operationToken: number | null
	createdAt: number
	lastAccessedAt: number
}

/** Снимок состояния вкладки для localStorage */
export type DocumentTabsSnapshot = {
	activeDocumentId: DocumentId | null
	documentOrder: DocumentId[]
	documents: Array<{
		id: DocumentId
		ref: DocumentRef
		state: {
			isDirty: boolean
			isLoading: boolean
			isSaving: boolean
			lastLoadedAt: number | null
			lastSavedAt: number | null
			error: string | null
			syncStatus: SyncStatus
			lastSyncedAt: number | null
			hasUnsyncedChanges: boolean
		}
		/** Новая модель синхронизации (сериализуется для миграции) */
		sync?: DocumentSyncSnapshot
		operation?: SyncOperation
		lastAccessedAt: number
	}>
	savedAt: number
}

/** Снимок данных документа для localStorage */
export type DocumentDataSnapshot = {
	data: DocumentData
	savedAt: number
}

/** Снимок восстановленного документа */
export type RestoredDocumentSnapshot = {
	id: DocumentId
	ref: DocumentRef
	state: {
		isDirty: boolean
		isLoading: boolean
		isSaving: boolean
		lastLoadedAt: number | null
		lastSavedAt: number | null
		error: string | null
		syncStatus: SyncStatus
		lastSyncedAt: number | null
		hasUnsyncedChanges: boolean
	}
	lastAccessedAt: number
}

/** Состояние хранилища вкладок документов */
export type DocumentTabsState = {
	documents: Map<DocumentId, DocumentSession>
	activeDocumentId: DocumentId | null
	documentOrder: DocumentId[]
}

/** Импорт типа DriveFileMetadata из gapi */
import type { DriveFileMetadata } from 'src/7-shared/services/gapi'
export type { DriveFileMetadata }

/** Создать пустые данные документа */
export function createEmptyDocumentData(): DocumentData {
	return {
		projectsList: [],
		completedList: [],
		plannedList: []
	}
}

/** Сгенерировать уникальный ID документа */
export function generateDocumentId(): DocumentId {
	return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/** Создать начальное состояние документа */
export function createInitialDocumentState(): DocumentState {
	return {
		isDirty: false,
		isLoading: false,
		isSaving: false,
		lastLoadedAt: null,
		lastSavedAt: null,
		error: null,
		syncStatus: 'offline',
		lastSyncedAt: null,
		hasUnsyncedChanges: false
	}
}

/** Создать новый DocumentSyncSnapshot для локального документа */
export function createInitialSyncSnapshot(origin: DocumentOrigin = 'new-local'): DocumentSyncSnapshot {
	return {
		localVersion: 0,
		baseLocalVersion: origin === 'new-local' ? 0 : null,
		localFingerprint: null,
		baseFingerprint: null,
		remoteFingerprint: null,
		baseRevisionId: null,
		remoteRevisionId: null,
		lastSyncAt: null,
		lastRemoteCheckAt: null,
		needsRemoteCheck: false,
		origin
	}
}

/** Парсить контент документа */
export function parseDocumentContent(content: unknown): DocumentData {
	if (typeof content === 'string') {
		return JSON.parse(content) as DocumentData
	}
	return content as DocumentData
}

/** Валидировать и парсить снимок вкладок */
export function parseDocumentTabsSnapshot(json: string): DocumentTabsSnapshot | null {
	try {
		const parsed = JSON.parse(json)
		if (!parsed || typeof parsed !== 'object') return null
		if (!Array.isArray(parsed.documents)) return null
		if (!Array.isArray(parsed.documentOrder)) return null
		if (typeof parsed.savedAt !== 'number') return null
		return parsed as DocumentTabsSnapshot
	} catch {
		return null
	}
}
