import { makeAutoObservable, runInAction } from 'mobx'

import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { StorageService } from 'src/7-shared/services/StorageService'
import {
	DocumentId,
	DocumentSession,
	DocumentTabsState,
	DocumentData,
	SyncResult,
	RestoredDocumentSnapshot,
	DocumentTabsSnapshot,
	DocumentDataSnapshot,
	createEmptyDocumentData,
	generateDocumentId,
	createInitialDocumentState,
	parseDocumentContent,
	parseDocumentTabsSnapshot,
	DocumentRef
} from './DocumentTabsStore.types'

const DOCUMENT_TABS_KEY = 'documentTabs'
const DOCUMENT_DATA_PREFIX = 'document_'

/**
 * Store для управления несколькими открытыми документами.
 * Поддерживает вкладки, персистентность в localStorage и синхронизацию с Google Drive.
 */
export class DocumentTabsStore {
	private state: DocumentTabsState

	constructor(
		private readonly googleApiService: GoogleApiService,
		private readonly storageService: StorageService
	) {
		this.state = {
			documents: new Map(),
			activeDocumentId: null,
			documentOrder: []
		}
		makeAutoObservable(this)
	}

	// === Управление вкладками ===

	/** Создать новый документ */
	openNewDocument(name: string = 'Новый документ') {
		const id = generateDocumentId()
		const session: DocumentSession = {
			id,
			ref: {
				fileId: null,
				name,
				mimeType: 'application/json',
				space: null,
				parentFolderId: null
			},
			data: createEmptyDocumentData(),
			state: {
				...createInitialDocumentState(),
				syncStatus: 'offline'
			},
			createdAt: Date.now(),
			lastAccessedAt: Date.now()
		}
		this.state.documents.set(id, session)
		this.state.documentOrder.push(id)
		this.state.activeDocumentId = id

		// Применить пустые данные к сторам
		this.storageService.applyContent(session.data)

		this.persistToLocalStorage()
		this.persistDocumentDataToLocalStorage(id)
	}

	/** Открыть документ из Google Drive */
	async openFromDrive(fileId: string, space?: 'drive' | 'appDataFolder') {
		// Проверка: уже открыт такой документ?
		const existing = this.findDocumentByFileId(fileId)
		if (existing) {
			this.activateDocument(existing.id)
			return
		}

		const id = generateDocumentId()
		const session: DocumentSession = {
			id,
			ref: {
				fileId,
				name: 'Загрузка...',
				mimeType: 'application/json',
				space: space ?? null,
				parentFolderId: null
			},
			data: createEmptyDocumentData(),
			state: {
				...createInitialDocumentState(),
				isLoading: true,
				syncStatus: 'syncing'
			},
			createdAt: Date.now(),
			lastAccessedAt: Date.now()
		}
		this.state.documents.set(id, session)
		this.state.documentOrder.push(id)
		this.state.activeDocumentId = id

		// Загрузка данных
		try {
			const metadata = await this.googleApiService.getFileMetadata(fileId)
			const content = await this.googleApiService.downloadFileContent(fileId)

			const loadedSession = this.state.documents.get(id)!
			loadedSession.ref = {
				fileId: metadata.id,
				name: metadata.name,
				mimeType: metadata.mimeType || 'application/json',
				space: space ?? null,
				parentFolderId: metadata.parents?.[0] ?? null,
				webViewLink: metadata.webViewLink
			}
			loadedSession.data = parseDocumentContent(content)
			loadedSession.state.syncStatus = 'synced'
			loadedSession.state.lastLoadedAt = Date.now()
			loadedSession.state.lastSyncedAt = Date.now()

			// Применить данные к сторам (isLoading ещё true, чтобы заблокировать onChangeList)
			this.storageService.applyContent(loadedSession.data)

			// Сбрасываем isLoading и явно очищаем isDirty после применения данных
			loadedSession.state.isLoading = false
			loadedSession.state.isDirty = false

			this.persistDocumentDataToLocalStorage(id)
			this.persistToLocalStorage()
		} catch (error: any) {
			const failedSession = this.state.documents.get(id)!
			failedSession.state.error = error.message
			failedSession.state.isLoading = false
			failedSession.state.syncStatus = 'error'
			console.error('Failed to open document from Drive:', error)
		}
	}

	/**
	 * Открыть документ из localStorage без синхронизации с Google Drive.
	 * Документ помечается как 'offline' и требует явной синхронизации пользователем.
	 */
	openFromLocalStorageSnapshot(docSnapshot: RestoredDocumentSnapshot) {
		const id = docSnapshot.id
		const session: DocumentSession = {
			id,
			ref: docSnapshot.ref,
			data: createEmptyDocumentData(), // Данные загрузятся отдельно
			state: {
				isDirty: false, // Сбрасываем — новая сессия
				isLoading: false,
				isSaving: docSnapshot.state.isSaving,
				lastLoadedAt: docSnapshot.lastAccessedAt,
				lastSavedAt: docSnapshot.state.lastSavedAt,
				error: docSnapshot.state.error,
				syncStatus: docSnapshot.ref?.fileId ? 'offline' : 'offline',
				lastSyncedAt: null,
				hasUnsyncedChanges: docSnapshot.state.hasUnsyncedChanges
			},
			createdAt: docSnapshot.lastAccessedAt,
			lastAccessedAt: docSnapshot.lastAccessedAt
		}
		this.state.documents.set(id, session)
		this.state.documentOrder.push(id)
	}

	/** Закрыть документ */
	closeDocument(documentId: DocumentId) {
		const session = this.state.documents.get(documentId)
		if (!session) return

		// Проверка несохранённых изменений (в сессии или с предыдущей сессии)
		if (session.state.isDirty || session.state.hasUnsyncedChanges) {
			// TODO: Показать диалог подтверждения
			console.warn('Closing document with unsaved changes')
		}

		this.state.documents.delete(documentId)
		this.state.documentOrder = this.state.documentOrder.filter(id => id !== documentId)

		if (this.state.activeDocumentId === documentId) {
			this.state.activeDocumentId = this.state.documentOrder[0] ?? null
		}

		// Если закрыли последний документ, сбросить данные в сторам
		if (this.state.documentOrder.length === 0) {
			this.storageService.resetToEmptyContent()
		} else if (this.state.activeDocumentId) {
			// Активировать новый документ (с блокировкой onChangeList)
			this.activateDocument(this.state.activeDocumentId)
		}

		this.removeDocumentDataFromLocalStorage(documentId)
		this.persistToLocalStorage()
	}

	/** Активировать документ */
	activateDocument(documentId: DocumentId) {
		const session = this.state.documents.get(documentId)
		if (!session) return

		this.state.activeDocumentId = documentId
		session.lastAccessedAt = Date.now()

		// Временно устанавливаем isLoading для блокировки onChangeList
		const previousLoadingState = session.state.isLoading
		session.state.isLoading = true

		// Применить данные активного документа к основным сторам
		this.storageService.applyContent(session.data)

		// Восстанавливаем состояние isLoading
		session.state.isLoading = previousLoadingState

		this.persistToLocalStorage()
	}

	// === Операции с данными ===

	/** Обновить данные активного документа */
	updateActiveDocumentData(data: DocumentData) {
		if (!this.state.activeDocumentId) return

		const session = this.state.documents.get(this.state.activeDocumentId)
		if (!session) return

		// Не обновляем isDirty, если документ сейчас сохраняется или загружается
		if (session.state.isSaving || session.state.isLoading) return

		session.data = data
		session.state.isDirty = true
		session.lastAccessedAt = Date.now()

		// Если документ был синхронизирован, теперь он требует сохранения
		if (session.state.syncStatus === 'synced') {
			session.state.syncStatus = 'needs-sync'
		}
		// Если была доступна новая версия с Drive, а пользователь начал редактировать — сбрасываем
		else if (session.state.syncStatus === 'update-available') {
			session.state.syncStatus = 'needs-sync'
		}

		this.persistDocumentDataToLocalStorage(this.state.activeDocumentId)
		this.persistToLocalStorage()
	}

	/** Сохранить активный документ в Google Drive */
	async saveActiveDocument(): Promise<boolean> {
		if (!this.state.activeDocumentId) return false

		const session = this.state.documents.get(this.state.activeDocumentId)
		if (!session || !session.ref?.fileId) return false

		session.state.isSaving = true
		this.persistToLocalStorage()

		try {
			const content = JSON.stringify(session.data, null, 2)
			const result = await this.googleApiService.saveFile(
				session.ref.name,
				content,
				session.ref.mimeType,
				session.ref.parentFolderId || 'root',
				session.ref.space || 'drive',
				session.ref.fileId
			)

			if (result.status === 'success') {
				runInAction(() => {
					session.state.isDirty = false
					session.state.hasUnsyncedChanges = false
					session.state.isSaving = false
					session.state.lastSavedAt = Date.now()
					session.state.syncStatus = 'synced'
					session.state.lastSyncedAt = Date.now()
					session.ref = {
						...session.ref,
						fileId: result.file.id,
						name: result.file.name,
						mimeType: result.file.mimeType || session.ref!.mimeType,
						space: session.ref!.space,
						parentFolderId: result.file.parents?.[0] ?? session.ref!.parentFolderId,
						webViewLink: result.file.webViewLink
					}
				})
				this.persistToLocalStorage()
				return true
			} else {
				runInAction(() => {
					session.state.error = result.status === 'error' ? result.message : 'Conflict while saving'
					session.state.isSaving = false
					session.state.syncStatus = 'error'
				})
				this.persistToLocalStorage()
				return false
			}
		} catch (error: any) {
			runInAction(() => {
				const session = this.state.documents.get(this.state.activeDocumentId!)
				if (session) {
					session.state.error = error.message
					session.state.isSaving = false
					session.state.syncStatus = 'error'
				}
			})
			this.persistToLocalStorage()
			return false
		}
	}

	/**
	 * Явная синхронизация активного документа с Google Drive.
	 * Загружает актуальную версию из Drive и сравнивает с локальной.
	 */
	async syncActiveDocumentWithDrive(): Promise<SyncResult> {
		const session = this.state.documents.get(this.state.activeDocumentId!)
		if (!session || !session.ref?.fileId) {
			return { status: 'error', message: 'Нет документа для синхронизации' }
		}

		session.state.syncStatus = 'syncing'
		this.persistToLocalStorage()

		try {
			// Проверка авторизации
			const isLoggedIn = this.googleApiService.isGoogleLoggedIn
			if (!isLoggedIn) {
				await this.googleApiService.logIn()
			}

			// Загрузка метаданных для проверки версии
			const remoteMetadata = await this.googleApiService.getFileMetadata(session.ref.fileId)
			const remoteModifiedAt = remoteMetadata.modifiedTime ? new Date(remoteMetadata.modifiedTime).getTime() : 0
			const localModifiedAt = session.state.lastSavedAt ?? 0

			// Определение наличия изменений
			const hasLocalChanges = session.state.isDirty
			const hasRemoteChanges = remoteModifiedAt > localModifiedAt

			// Если есть изменения с любой стороны — показываем диалог
			if (hasLocalChanges || hasRemoteChanges) {
				// Устанавливаем соответствующий статус синхронизации
				if (hasLocalChanges && !hasRemoteChanges) {
					session.state.syncStatus = 'needs-sync'
				} else if (hasRemoteChanges && !hasLocalChanges) {
					session.state.syncStatus = 'update-available'
				} else {
					// Обе стороны изменены
					session.state.syncStatus = 'needs-sync'
				}
				this.persistToLocalStorage()

				return {
					status: 'conflict',
					message: hasRemoteChanges
						? 'Версия на Google Drive новее локальной'
						: 'Есть локальные изменения, не сохранённые в Drive',
					remoteMetadata,
					localModifiedAt,
					remoteModifiedAt,
					hasLocalChanges,
					hasRemoteChanges
				}
			}

			// Нет изменений — загружаем для проверки и синхронизируем
			const content = await this.googleApiService.downloadFileContent(session.ref.fileId)

			// Устанавливаем isLoading для блокировки onChangeList во время применения данных
			session.state.isLoading = true
			session.data = parseDocumentContent(content)
			this.storageService.applyContent(session.data)
			session.state.isLoading = false

			session.state.syncStatus = 'synced'
			session.state.lastSyncedAt = Date.now()
			session.state.lastLoadedAt = Date.now()

			this.persistDocumentDataToLocalStorage(session.id)
			this.persistToLocalStorage()

			return { status: 'success' }
		} catch (error: any) {
			runInAction(() => {
				session.state.error = error.message
				session.state.syncStatus = 'error'
			})
			this.persistToLocalStorage()

			return { status: 'error', message: error.message }
		}
	}

	/**
	 * Синхронизация всех документов с fileId.
	 */
	async syncAllDocumentsWithDrive(): Promise<Map<DocumentId, SyncResult>> {
		const results: Map<DocumentId, SyncResult> = new Map()

		for (const [id, session] of this.state.documents.entries()) {
			if (session.ref?.fileId && session.state.syncStatus === 'offline') {
				const previousActiveId = this.state.activeDocumentId
				this.state.activeDocumentId = id
				const result = await this.syncActiveDocumentWithDrive()
				results.set(id, result)
				this.state.activeDocumentId = previousActiveId
			}
		}

		return results
	}

	/** Сохранить все изменённые документы */
	async saveAllDirtyDocuments(): Promise<Map<DocumentId, boolean>> {
		const results: Map<DocumentId, boolean> = new Map()

		for (const [id, session] of this.state.documents.entries()) {
			if (session.state.isDirty && session.ref?.fileId) {
				const previousActiveId = this.state.activeDocumentId
				this.state.activeDocumentId = id
				const saved = await this.saveActiveDocument()
				results.set(id, saved)
				this.state.activeDocumentId = previousActiveId
			}
		}

		return results
	}

	// === Персистентность ===

	/** Сохранить метаданные вкладок в localStorage */
	private persistToLocalStorage() {
		const snapshot: DocumentTabsSnapshot = {
			activeDocumentId: this.state.activeDocumentId,
			documentOrder: this.state.documentOrder,
			documents: this.state.documentOrder.map(id => {
				const session = this.state.documents.get(id)!
				return {
					id: session.id,
					ref: session.ref!,
					state: {
						isDirty: session.state.isDirty,
						isLoading: session.state.isLoading,
						isSaving: session.state.isSaving,
						lastLoadedAt: session.state.lastLoadedAt,
						lastSavedAt: session.state.lastSavedAt,
						error: session.state.error,
						syncStatus: session.state.syncStatus,
						lastSyncedAt: session.state.lastSyncedAt,
						hasUnsyncedChanges: session.state.isDirty
					},
					lastAccessedAt: session.lastAccessedAt
				}
			}),
			savedAt: Date.now()
		}
		localStorage.setItem(DOCUMENT_TABS_KEY, JSON.stringify(snapshot))
	}

	/** Сохранить данные документа в localStorage */
	private persistDocumentDataToLocalStorage(documentId: DocumentId) {
		const session = this.state.documents.get(documentId)
		if (!session) return

		const dataSnapshot: DocumentDataSnapshot = {
			data: session.data,
			savedAt: Date.now()
		}
		localStorage.setItem(`${DOCUMENT_DATA_PREFIX}${documentId}`, JSON.stringify(dataSnapshot))
	}

	/** Удалить данные документа из localStorage */
	private removeDocumentDataFromLocalStorage(documentId: DocumentId) {
		localStorage.removeItem(`${DOCUMENT_DATA_PREFIX}${documentId}`)
	}

	/**
	 * Восстановление сессии из localStorage.
	 * Все документы восстанавливаются из локального кэша без синхронизации.
	 */
	async restoreFromLocalStorage(): Promise<boolean> {
		const tabsJson = localStorage.getItem(DOCUMENT_TABS_KEY)
		if (!tabsJson) return false

		const snapshot = parseDocumentTabsSnapshot(tabsJson)
		if (!snapshot) return false

		// Восстановление метаданных
		for (const docSnapshot of snapshot.documents) {
			this.openFromLocalStorageSnapshot(docSnapshot)
		}
		this.state.documentOrder = snapshot.documentOrder
		this.state.activeDocumentId = snapshot.activeDocumentId

		// Загрузка данных каждого документа из localStorage
		for (const docSnapshot of snapshot.documents) {
			const dataJson = localStorage.getItem(`${DOCUMENT_DATA_PREFIX}${docSnapshot.id}`)
			if (dataJson) {
				try {
					const dataSnapshot = JSON.parse(dataJson) as DocumentDataSnapshot
					const session = this.state.documents.get(docSnapshot.id)!
					session.data = dataSnapshot.data
				} catch (e) {
					console.error(`Failed to load data for document ${docSnapshot.id}:`, e)
				}
			}
		}

		// Применить данные активного документа
		if (this.state.activeDocumentId) {
			const activeSession = this.state.documents.get(this.state.activeDocumentId)
			if (activeSession) {
				// Временно устанавливаем isLoading для блокировки onChangeList
				activeSession.state.isLoading = true
				this.storageService.applyContent(activeSession.data)
				activeSession.state.isLoading = false
			}
		}

		return true
	}

	// === Геттеры ===

	/** Найти документ по fileId */
	private findDocumentByFileId(fileId: string): DocumentSession | null {
		for (const session of this.state.documents.values()) {
			if (session.ref?.fileId === fileId) {
				return session
			}
		}
		return null
	}

	/** Активный документ */
	get activeDocument(): DocumentSession | null {
		if (!this.state.activeDocumentId) return null
		return this.state.documents.get(this.state.activeDocumentId) ?? null
	}

	/** Все документы в порядке вкладок */
	get documents(): DocumentSession[] {
		return this.state.documentOrder.map(id => this.state.documents.get(id)!).filter(Boolean)
	}

	/** Количество изменённых документов */
	get dirtyDocumentsCount(): number {
		return this.documents.filter(d => d.state.isDirty).length
	}

	/** Количество офлайн-документов с fileId */
	get offlineDocumentsCount(): number {
		return this.documents.filter(d => d.ref?.fileId && d.state.syncStatus === 'offline').length
	}

	/** ID активного документа */
	get activeDocumentId(): DocumentId | null {
		return this.state.activeDocumentId
	}

	/** Очистить состояние стора (для тестов) */
	clear() {
		this.state = {
			documents: new Map(),
			activeDocumentId: null,
			documentOrder: []
		}
		// Очистка localStorage
		localStorage.removeItem('documentTabs')
		const keysToRemove: string[] = []
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i)
			if (key && key.startsWith('document_')) {
				keysToRemove.push(key)
			}
		}
		keysToRemove.forEach(key => localStorage.removeItem(key))
	}
}
