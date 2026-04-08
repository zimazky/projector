import type { EventDto } from 'src/6-entities/Events/EventDto'
import type { DriveSpace, ProjectDocumentData } from './types'

/** Фиксированный ID виртуального агрегированного документа */
export const VIRTUAL_AGGREGATED_DOCUMENT_ID = '__virtual_aggregated__'

/** Уникальный идентификатор документа в сессии */
export type DocumentId = string

/** Тип документа: реальный или виртуальный агрегированный */
export type DocumentType = 'real' | 'virtual-aggregated'

/** Статус синхронизации документа с Google Drive */
export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'needs-sync' | 'update-available' | 'error'

/** Результат синхронизации с Google Drive */
export type SyncResult =
	| { status: 'success' }
	| {
			status: 'conflict'
			message: string
			remoteMetadata: DriveFileMetadata
			localModifiedAt: number
			remoteModifiedAt: number
			hasLocalChanges: boolean
			hasRemoteChanges: boolean
	  }
	| { status: 'error'; message: string }

/** Данные одного документа (проекты и события) */
export type DocumentData = {
	projectsList: ProjectDocumentData[]
	completedList: EventDto[]
	plannedList: EventDto[]
}

/**
 * Расширенное событие с метаданными документа-источника.
 * Используется ТОЛЬКО для агрегированных данных виртуального документа.
 * НЕ сохраняется во внешнее хранилище.
 */
export type AggregatedEventDto = EventDto & {
	/** Временный ID события с префиксом документа (строка вместо number) */
	id: string
	/** ID документа-источника */
	documentId: DocumentId
	/** Цвет документа-источника */
	documentColor: string
}

/**
 * Агрегированные данные виртуального документа.
 * Содержат события из всех реальных документов с метаданными источника.
 */
export type AggregatedDocumentData = {
	projectsList: ProjectDocumentData[]
	completedList: AggregatedEventDto[]
	plannedList: AggregatedEventDto[]
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
	/** Тип документа: реальный или виртуальный агрегированный */
	type: DocumentType
	ref: DocumentRef | null
	/** Данные документа (для виртуального документа — AggregatedDocumentData) */
	data: DocumentData | AggregatedDocumentData
	state: DocumentState
	createdAt: number
	lastAccessedAt: number
	/** Цвет документа для визуального различения в общем календаре */
	color?: string
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

/** Создать пустые данные для виртуального агрегированного документа */
export function createVirtualDocumentData(): AggregatedDocumentData {
	return {
		projectsList: [],
		completedList: [],
		plannedList: []
	}
}

/** Создать начальное состояние виртуального документа */
export function createVirtualDocumentState(): DocumentState {
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
