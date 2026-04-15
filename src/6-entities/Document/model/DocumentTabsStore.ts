import { makeAutoObservable, runInAction } from 'mobx'

import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
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
	createInitialSyncSnapshot,
	parseDocumentContent,
	parseDocumentTabsSnapshot,
	DocumentRef,
	DocumentSyncSnapshot,
	DocumentOrigin
} from './DocumentTabsStore.types'
import { DocumentStoreManager } from './DocumentStoreManager'
import type { DocumentStores, IEventsStoreProvider } from './DocumentStoreManager.types'
import type { DocumentStoreCallbacks } from './DocumentStoreManager'
import { normalizeMainStoreData } from './DocumentTabsStore.utils'
import { computeFingerprint } from './DocumentSyncFingerprint'
import { syncLegacyStateFromNewModel } from './DocumentSyncSelectors'

const DOCUMENT_TABS_KEY = 'documentTabs'
const DOCUMENT_DATA_PREFIX = 'document_'

/**
 * Store для управления несколькими открытыми документами.
 * Поддерживает вкладки, персистентность в localStorage и синхронизацию с Google Drive.
 */
export class DocumentTabsStore implements IEventsStoreProvider {
	private state: DocumentTabsState
	private documentStoreManager: DocumentStoreManager

	constructor(private readonly googleApiService: GoogleApiService) {
		this.state = {
			documents: new Map(),
			activeDocumentId: null,
			documentOrder: []
		}

		// Создаём менеджер внутри конструктора, передаём себя как провайдер данных
		const self = this
		this.documentStoreManager = new DocumentStoreManager({
			getDocumentData: id => self.state.documents.get(id)?.data ?? null,
			get activeDocumentId(): DocumentId | null {
				return self.state.activeDocumentId
			}
		})

		makeAutoObservable(this)
	}

	/** Установить колбэки при изменении данных в пер-документных сторах (вызывается из MainStore) */
	setOnStoresChanged(callbacks: DocumentStoreCallbacks): void {
		this.documentStoreManager.setCallbacks(callbacks)
	}

	/** Колбэк при смене активного документа (для инвалидации кэша и т.п.) */
	private onActiveDocumentChanged?: (documentId: DocumentId) => void

	/** Установить колбэк при смене активного документа (вызывается из MainStore) */
	setOnActiveDocumentChanged(callback: (documentId: DocumentId) => void): void {
		this.onActiveDocumentChanged = callback
	}

	// === Методы доступа к сторам (делегирование к DocumentStoreManager) ===

	/** Получить сторы активного документа */
	getActiveDocumentStores(): DocumentStores | null {
		return this.documentStoreManager.activeStores
	}

	/** Получить все сторы (для общего календаря) */
	getAllDocumentStores(): DocumentStores[] {
		return this.documentStoreManager.getAllDocumentStores()
	}

	/** Получить сторы конкретного документа */
	getDocumentStores(documentId: DocumentId): DocumentStores | null {
		return this.documentStoreManager.getStores(documentId)
	}

	// === IEventsStoreProvider ===

	get activeEventsStore() {
		return this.documentStoreManager.activeEventsStore
	}
	get activeProjectsStore() {
		return this.documentStoreManager.activeProjectsStore
	}

	// === Управление вкладками ===

	/** Создать новый документ */
	openNewDocument(name: string = 'Новый документ') {
		const id = generateDocumentId()
		const data = createEmptyDocumentData()
		const sync = createInitialSyncSnapshot('new-local')
		sync.localFingerprint = computeFingerprint(data)

		const session: DocumentSession = {
			id,
			ref: {
				fileId: null,
				name,
				mimeType: 'application/json',
				space: null,
				parentFolderId: null
			},
			data,
			state: {
				...createInitialDocumentState(),
				syncStatus: 'offline'
			},
			sync,
			operation: 'idle',
			error: null,
			operationToken: null,
			createdAt: Date.now(),
			lastAccessedAt: Date.now()
		}
		this.state.documents.set(id, session)
		this.state.documentOrder.push(id)
		this.state.activeDocumentId = id

		// Создаём сторы через DocumentStoreManager
		// Блокируем onChangeList на время загрузки
		session.state.isLoading = true
		this.documentStoreManager.createStores(id)
		session.state.isLoading = false

		this.persistToLocalStorage()
		this.persistDocumentDataToLocalStorage(id)

		this.onActiveDocumentChanged?.(id)
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
			sync: createInitialSyncSnapshot('drive'),
			operation: 'idle',
			error: null,
			operationToken: null,
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

			// Вычисляем fingerprint и устанавливаем base
			const fingerprint = computeFingerprint(loadedSession.data)
			loadedSession.sync.localFingerprint = fingerprint
			loadedSession.sync.baseFingerprint = fingerprint
			loadedSession.sync.baseRevisionId = metadata.id ?? null
			loadedSession.sync.remoteRevisionId = metadata.id ?? null
			loadedSession.sync.lastSyncAt = Date.now()
			loadedSession.sync.lastRemoteCheckAt = Date.now()

			loadedSession.state.syncStatus = 'synced'
			loadedSession.state.lastLoadedAt = Date.now()
			loadedSession.state.lastSyncedAt = Date.now()

			// Создаём сторы через менеджер (с блокировкой onChangeList)
			// Данные уже загружены в session.data, dataProvider вернёт их при createStores
			loadedSession.state.isLoading = true
			this.documentStoreManager.createStores(id)
			loadedSession.state.isLoading = false

			loadedSession.state.isDirty = false

			this.persistDocumentDataToLocalStorage(id)
			this.persistToLocalStorage()

			this.onActiveDocumentChanged?.(id)
		} catch (error: any) {
			const failedSession = this.state.documents.get(id)!
			failedSession.state.error = error.message
			failedSession.state.isLoading = false
			failedSession.state.syncStatus = 'error'
			failedSession.error = {
				code: 'open-failed',
				message: error.message,
				at: Date.now()
			}
			console.error('Failed to open document from Drive:', error)
		}
	}

	/**
	 * Открыть документ из localStorage без синхронизации с Google Drive.
	 * Документ помечается как 'offline' и требует явной синхронизации пользователем.
	 */
	openFromLocalStorageSnapshot(docSnapshot: RestoredDocumentSnapshot, syncSnapshot?: DocumentSyncSnapshot) {
		const id = docSnapshot.id
		const origin: DocumentOrigin = docSnapshot.ref?.fileId ? 'restored-local' : 'new-local'
		const sync = syncSnapshot ?? createInitialSyncSnapshot(origin)

		// Если документ восстановлен из localStorage и имеет fileId, помечаем что нужна проверка
		if (origin === 'restored-local' && !syncSnapshot) {
			sync.needsRemoteCheck = true
		}

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
			sync,
			operation: 'idle',
			error: null,
			operationToken: null,
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

		// Удаляем сторы
		this.documentStoreManager.removeStores(documentId)

		if (this.state.activeDocumentId) {
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

		// Убеждаемся что сторы существуют (данные уже в памяти!)
		// Блокируем onChangeList чтобы не было ложного isDirty
		const previousLoadingState = session.state.isLoading
		session.state.isLoading = true
		if (!this.documentStoreManager.hasStores(documentId)) {
			this.documentStoreManager.createStores(documentId)
		}

		session.state.isLoading = previousLoadingState

		// Уведомляем об изменении активного документа (инвалидация кэша и т.п.)
		this.onActiveDocumentChanged?.(documentId)

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

		// Пересчитываем fingerprint локальных данных
		session.sync.localFingerprint = computeFingerprint(data)

		// Если документ был синхронизирован, теперь он требует сохранения
		if (session.state.syncStatus === 'synced') {
			session.state.syncStatus = 'needs-sync'
		}
		// Если была доступна новая версия с Drive, а пользователь начал редактировать —
		// это конфликт: обе стороны изменены
		else if (session.state.syncStatus === 'update-available') {
			session.state.syncStatus = 'needs-sync'
			// Помечаем что есть remote-ahead ситуация для будущего conflict-диалога
			session.state.hasUnsyncedChanges = true
		}

		// Синхронизируем legacy-поля с новой моделью
		syncLegacyStateFromNewModel(session)

		this.persistDocumentDataToLocalStorage(this.state.activeDocumentId)
		this.persistToLocalStorage()
	}

	/**
	 * Отметить документ как сохранённый в Google Drive.
	 * Единственная точка записи состояния после успешного сохранения.
	 * Вызывается из SaveToDriveStore вместо прямой мутации.
	 */
	markDocumentSavedToDrive(
		documentId: DocumentId,
		fileMetadata: {
			id: string
			name: string
			mimeType?: string
			parents?: string[]
			webViewLink?: string
		},
		space: 'drive' | 'appDataFolder' = 'drive'
	): void {
		const session = this.state.documents.get(documentId)
		if (!session) return

		runInAction(() => {
			// Вычисляем fingerprint текущих данных
			const fingerprint = computeFingerprint(session.data)

			session.state.isDirty = false
			session.state.hasUnsyncedChanges = false
			session.state.isSaving = false
			session.state.lastSavedAt = Date.now()
			session.state.syncStatus = 'synced'
			session.state.lastSyncedAt = Date.now()
			session.state.error = null

			// Обновляем sync-модель: локальная версия становится базовой
			session.sync.localFingerprint = fingerprint
			session.sync.baseFingerprint = fingerprint
			session.sync.baseRevisionId = fileMetadata.id
			session.sync.remoteRevisionId = fileMetadata.id
			session.sync.lastSyncAt = Date.now()
			session.sync.needsRemoteCheck = false
			session.sync.origin = session.sync.origin === 'new-local' ? 'drive' : session.sync.origin

			session.ref = {
				fileId: fileMetadata.id,
				name: fileMetadata.name,
				mimeType: fileMetadata.mimeType || session.ref?.mimeType || 'application/json',
				space,
				parentFolderId: fileMetadata.parents?.[0] ?? session.ref?.parentFolderId ?? null,
				webViewLink: fileMetadata.webViewLink
			}

			// Синхронизируем legacy-поля с новой моделью
			syncLegacyStateFromNewModel(session)
		})

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
				this.markDocumentSavedToDrive(session.id, result.file, session.ref!.space || 'drive')
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
	 * Проверка состояния активного документа на Google Drive.
	 * Загружает только метаданные и сравнивает с локальной версией.
	 * НЕ меняет локальные данные автоматически.
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

			// Загрузка только метаданных для проверки версии
			const remoteMetadata = await this.googleApiService.getFileMetadata(session.ref.fileId)
			const remoteModifiedAt = remoteMetadata.modifiedTime ? new Date(remoteMetadata.modifiedTime).getTime() : 0
			const localModifiedAt = session.state.lastSavedAt ?? 0

			// Определение наличия изменений
			const hasLocalChanges = session.state.isDirty
			const hasRemoteChanges = remoteModifiedAt > localModifiedAt

			// Если есть изменения с любой стороны — возвращаем конфликт для диалога
			if (hasLocalChanges || hasRemoteChanges) {
				// Устанавливаем соответствующий статус синхронизации
				if (hasLocalChanges && !hasRemoteChanges) {
					session.state.syncStatus = 'needs-sync'
				} else if (hasRemoteChanges && !hasLocalChanges) {
					session.state.syncStatus = 'update-available'
				} else {
					// Обе стороны изменены — конфликт
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

			// Нет изменений — просто обновляем статус
			session.state.syncStatus = 'synced'
			session.state.lastSyncedAt = Date.now()

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
	 * Внутренний метод синхронизации конкретного документа по ID.
	 * Не меняет activeDocumentId, работает напрямую с документом.
	 */
	private async syncDocumentById(documentId: DocumentId): Promise<SyncResult> {
		const session = this.state.documents.get(documentId)
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

			// Загрузка только метаданных для проверки версии
			const remoteMetadata = await this.googleApiService.getFileMetadata(session.ref.fileId)
			const remoteModifiedAt = remoteMetadata.modifiedTime
				? new Date(remoteMetadata.modifiedTime).getTime()
				: 0
			const localModifiedAt = session.state.lastSavedAt ?? 0

			// Определение наличия изменений
			const hasLocalChanges = session.state.isDirty
			const hasRemoteChanges = remoteModifiedAt > localModifiedAt

			// Если есть изменения с любой стороны — возвращаем результат
			if (hasLocalChanges || hasRemoteChanges) {
				if (hasLocalChanges && !hasRemoteChanges) {
					session.state.syncStatus = 'needs-sync'
				} else if (hasRemoteChanges && !hasLocalChanges) {
					session.state.syncStatus = 'update-available'
				} else {
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

			// Нет изменений — просто обновляем статус
			session.state.syncStatus = 'synced'
			session.state.lastSyncedAt = Date.now()

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
	 * НЕ меняет activeDocumentId — работает напрямую с каждым документом.
	 */
	async syncAllDocumentsWithDrive(): Promise<Map<DocumentId, SyncResult>> {
		const results: Map<DocumentId, SyncResult> = new Map()

		for (const [id, session] of this.state.documents.entries()) {
			if (session.ref?.fileId && session.state.syncStatus === 'offline') {
				const result = await this.syncDocumentById(id)
				results.set(id, result)
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

	// === Методы для замены StorageService ===

	/**
	 * Применить контент к активному документу.
	 * Нормализует данные, обновляет сторы и сессию.
	 * Используется при выборе удалённой версии при конфликте.
	 */
	applyContentToActiveDocument(content: unknown): void {
		const session = this.activeDocument
		if (!session) return

		const normalized = normalizeMainStoreData(content)

		// Обновляем данные сессии
		session.data = normalized

		// Пересчитываем fingerprint
		const fingerprint = computeFingerprint(normalized)
		session.sync.localFingerprint = fingerprint
		session.sync.baseFingerprint = fingerprint
		session.sync.needsRemoteCheck = false

		// Обновляем сторы (с блокировкой onChangeList)
		session.state.isLoading = true
		this.documentStoreManager.updateStoresData(session.id, {
			projectsList: normalized.projectsList,
			completedList: normalized.completedList,
			plannedList: normalized.plannedList
		})
		session.state.isLoading = false

		session.state.syncStatus = 'synced'
		session.state.lastSyncedAt = Date.now()
		session.state.lastLoadedAt = Date.now()

		// Синхронизируем legacy-поля с новой моделью
		syncLegacyStateFromNewModel(session)

		this.persistDocumentDataToLocalStorage(session.id)
		this.persistToLocalStorage()
	}

	/** Получить данные документа для сохранения */
	getDocumentDataForSave(documentId?: DocumentId): DocumentData | null {
		const docId = documentId ?? this.state.activeDocumentId
		if (!docId) return null
		return this.documentStoreManager.getDocumentDataForSave(docId)
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
						// Сохраняем реальное значение hasUnsyncedChanges, а не копию isDirty
						hasUnsyncedChanges: session.state.hasUnsyncedChanges
					},
					// Новая модель синхронизации (для миграции)
					sync: session.sync,
					// Операция не сохраняется — всегда сбрасывается в idle при перезапуске
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

		const snapshot: DocumentDataSnapshot = {
			data: session.data,
			savedAt: Date.now()
		}
		localStorage.setItem(`${DOCUMENT_DATA_PREFIX}${documentId}`, JSON.stringify(snapshot))
	}

	/** Удалить данные документа из localStorage */
	private removeDocumentDataFromLocalStorage(documentId: DocumentId) {
		localStorage.removeItem(`${DOCUMENT_DATA_PREFIX}${documentId}`)
	}

	/**
	 * Восстановление сессии из localStorage.
	 * Все документы восстанавливаются из локального кэша без синхронизации.
	 * Поддерживает миграцию: если есть новая sync-модель в snapshot — использует её.
	 */
	async restoreFromLocalStorage(): Promise<boolean> {
		const tabsJson = localStorage.getItem(DOCUMENT_TABS_KEY)
		if (!tabsJson) return false

		const snapshot = parseDocumentTabsSnapshot(tabsJson)
		if (!snapshot) return false

		// Восстановление метаданных
		for (const docSnapshot of snapshot.documents) {
			// Передаём новую sync-модель если она есть в snapshot
			this.openFromLocalStorageSnapshot(docSnapshot, docSnapshot.sync)
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

					// Вычисляем fingerprint для восстановленных данных
					const fingerprint = computeFingerprint(session.data)
					session.sync.localFingerprint = fingerprint
					// Если нет baseFingerprint (старый snapshot), используем текущий как base
					if (!session.sync.baseFingerprint) {
						session.sync.baseFingerprint = fingerprint
					}

					// Синхронизируем legacy-поля с новой моделью
					syncLegacyStateFromNewModel(session)

					// Создаём сторы (с блокировкой onChangeList)
					// Данные уже загружены в session.data, dataProvider вернёт их при createStores
					session.state.isLoading = true
					this.documentStoreManager.createStores(docSnapshot.id)
					session.state.isLoading = false
				} catch (e) {
					console.error(`Failed to load data for document ${docSnapshot.id}:`, e)
				}
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
		this.documentStoreManager.clear()
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
