import type { EventDto } from 'src/6-entities/Events/EventDto'
import type { DriveSpace, ProjectDocumentData } from './types'

/** Уникальный идентификатор документа в сессии */
export type DocumentId = string

export type DocumentSaveResult =
	| { status: 'saved' }
	| { status: 'cancelled' }
	| { status: 'failed'; message: string }
	| { status: 'conflict'; message: string; conflict?: Extract<SyncResult, { status: 'conflict' }> }

export type DocumentCloseDecision = 'save' | 'discard' | 'cancel'
export type DocumentCloseResult = { status: 'closed' } | Exclude<DocumentSaveResult, { status: 'saved' }>

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
	/** Серверная дата только для отображения, не для сравнения версий. */
	serverModifiedAt?: string | null
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
export type DocumentOperationContext = DocumentSnapshot & Readonly<{ token: number; checkedVersion?: string }>

export type DocumentPullResult = { status: 'pulled' } | Exclude<DocumentSaveResult, { status: 'saved' }>
export type DocumentResolveResult = DocumentSaveResult | DocumentPullResult
export type DocumentOpenResult =
	{ status: 'opened'; documentId: DocumentId } | Exclude<DocumentSaveResult, { status: 'saved' }>

/** Данные одного документа (проекты и события) */
export type LegacyDocumentData = {
	projectsList: ProjectDocumentData[]
	completedList: EventDto[]
	plannedList: EventDto[]
}

export type DocumentData = LegacyDocumentData | import('./ResourceDocument.types').ResourceDocumentData

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
	/** Единственный источник состояния синхронизации */
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

/** Формат сессии независим от формата документов Drive. Старые версии читает миграция. */
export type DocumentSessionSnapshot<Data extends DocumentData, Version extends number> = {
	schemaVersion: Version
	activeDocumentId: DocumentId | null
	documentOrder: DocumentId[]
	documents: Array<{
		data: Data
		id: DocumentId
		ref: DocumentRef
		sync: DocumentSyncSnapshot
		lastAccessedAt: number
	}>
	savedAt: number
}

export type DocumentTabsSnapshot = DocumentSessionSnapshot<DocumentData, 3>

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
