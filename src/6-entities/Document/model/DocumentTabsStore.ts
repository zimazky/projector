import { makeAutoObservable, runInAction } from 'mobx'

import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { driveErrorMessage } from 'src/7-shared/services/DriveApiError'
import { driveVersion, isDriveVersion, readDriveDocument, DriveReadChangedError } from './DocumentDriveProtocol'
import { GoogleLoginCancelledError } from 'src/7-shared/services/GoogleAuthError'
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
	parseDocumentTabsSnapshot,
	DocumentSyncSnapshot,
	DocumentOrigin
} from './DocumentTabsStore.types'
import type {
	DocumentSaveResult,
	DocumentCloseDecision,
	DocumentCloseResult,
	DocumentSnapshot,
	DocumentOperationContext,
	DocumentPullResult,
	DocumentResolveResult,
	DocumentOpenResult,
	SyncOperation,
	DriveFileMetadata
} from './DocumentTabsStore.types'
import { DocumentStoreManager } from './DocumentStoreManager'
import type { DocumentStores, IEventsStoreProvider } from './DocumentStoreManager.types'
import type { DocumentStoreCallbacks } from './DocumentStoreManager'
import { normalizeMainStoreData } from './DocumentTabsStore.utils'
import { computeFingerprint, cloneDocumentData, freezeSnapshot } from './DocumentSyncFingerprint'
import type { DocumentUiState } from './DocumentSyncSelectors'
import {
	getIsDirty,
	getShouldWarnOnClose,
	getDocumentUiState,
	syncLegacyStateFromNewModel
} from './DocumentSyncSelectors'

const DOCUMENT_TABS_KEY = 'documentTabs'
const DOCUMENT_DATA_PREFIX = 'document_'

/**
 * Store для управления несколькими открытыми документами.
 * Поддерживает вкладки, персистентность в localStorage и синхронизацию с Google Drive.
 */
export class DocumentTabsStore implements IEventsStoreProvider {
	private state: DocumentTabsState
	private documentStoreManager: DocumentStoreManager
	private operationSequence = 0
	private pendingSaves = new Map<DocumentSession, Promise<DocumentSaveResult>>()

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

		this.setOnStoresChanged({})
		makeAutoObservable<this, 'pendingSaves' | 'operationSequence'>(this, {
			pendingSaves: false,
			operationSequence: false
		})
	}

	/** Установить колбэки при изменении данных в пер-документных сторах (вызывается из MainStore) */
	setOnStoresChanged(callbacks: DocumentStoreCallbacks): void {
		// Персистентность принадлежит документу, а не наличию MainStore или активной вкладке.
		this.documentStoreManager.setCallbacks({
			onEventsChanged: stores => {
				callbacks.onEventsChanged?.(stores)
				this.recordStoresChanged(stores)
			},
			onProjectsChanged: stores => {
				callbacks.onProjectsChanged?.(stores)
				this.recordStoresChanged(stores)
			}
		})
	}

	private recordStoresChanged(stores: DocumentStores): void {
		if (this.documentStoreManager.getStores(stores.documentId)?.eventsStore !== stores.eventsStore) return
		const data = this.documentStoreManager.getDocumentDataForSave(stores.documentId)
		if (data) this.updateDocumentData(stores.documentId, data)
	}

	/** Согласованный неизменяемый снимок исходной сессии, включая локальную версию. */
	captureDocumentSnapshot(documentId: DocumentId): DocumentSnapshot | null {
		const session = this.state.documents.get(documentId)
		if (!session) return null
		const data = this.getDocumentDataForSave(documentId) ?? session.data
		if (computeFingerprint(data) !== computeFingerprint(session.data)) this.updateDocumentData(documentId, data)
		return Object.freeze({
			documentId,
			session,
			ref: session.ref ? Object.freeze({ ...session.ref }) : null,
			data: freezeSnapshot(cloneDocumentData(session.data)),
			localVersion: session.sync.localVersion
		})
	}

	/** Сохранение блокирует конкурирующие записи; check/pull могут вытеснить старую проверку. */
	beginDocumentOperation(
		documentId: DocumentId,
		operation: Exclude<SyncOperation, 'idle'>,
		snapshot = this.captureDocumentSnapshot(documentId)
	): DocumentOperationContext | null {
		const session = this.state.documents.get(documentId)
		if (!snapshot || session !== snapshot.session || session.operation === 'saving' || session.operation === 'opening')
			return null
		const context = Object.freeze({ ...snapshot, token: ++this.operationSequence })
		session.operation = operation
		session.operationToken = context.token
		session.error = null
		syncLegacyStateFromNewModel(session)
		this.persistToLocalStorage()
		return context
	}

	/** Проверяется после каждого await, в том числе в catch/finally. */
	isDocumentOperationCurrent(context: DocumentOperationContext): boolean {
		return (
			this.state.documents.get(context.documentId) === context.session &&
			context.session.operationToken === context.token
		)
	}

	finishDocumentOperation(context: DocumentOperationContext): void {
		if (!this.isDocumentOperationCurrent(context)) return
		context.session.operation = 'idle'
		syncLegacyStateFromNewModel(context.session)
		this.persistToLocalStorage()
	}

	/** Смена доступности не меняет содержимое и не снимает dirty. */
	requireRemoteCheck(documentId: DocumentId): void {
		const session = this.state.documents.get(documentId)
		if (!session?.ref?.fileId || session.sync.needsRemoteCheck) return
		session.sync.needsRemoteCheck = true
		syncLegacyStateFromNewModel(session)
		this.persistToLocalStorage()
	}

	/** Dispose координатора отменяет только принадлежащую ему проверку. */
	cancelBackgroundCheck(documentId: DocumentId, token: number | null): void {
		const session = this.state.documents.get(documentId)
		if (!session || session.operation !== 'checking' || session.operationToken !== token) return
		session.operationToken = ++this.operationSequence
		session.operation = 'idle'
		session.sync.needsRemoteCheck = true
		syncLegacyStateFromNewModel(session)
		this.persistToLocalStorage()
	}

	/** Ошибка устаревшего запроса не меняет ни новую операцию, ни другую вкладку. */
	failDocumentOperation(
		context: DocumentOperationContext,
		error: unknown
	): Exclude<DocumentSaveResult, { status: 'saved' }> {
		if (!this.isDocumentOperationCurrent(context)) return { status: 'cancelled' }
		if (error instanceof GoogleLoginCancelledError) return { status: 'cancelled' }
		context.session.sync.needsRemoteCheck = true
		if (error instanceof DriveReadChangedError) return { status: 'conflict', message: error.message }
		const message = driveErrorMessage(error)
		context.session.error = { code: 'operation-failed', message, at: Date.now() }
		syncLegacyStateFromNewModel(context.session)
		this.persistToLocalStorage()
		return { status: 'failed', message }
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
	async openFromDrive(fileId: string, space?: 'drive' | 'appDataFolder'): Promise<DocumentOpenResult> {
		// Проверка: уже открыт такой документ?
		const existing = this.findDocumentByFileId(fileId)
		if (existing) {
			this.activateDocument(existing.id)
			return { status: 'opened', documentId: existing.id }
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

		this.onActiveDocumentChanged?.(id)
		const context = this.beginDocumentOperation(id, 'opening')!
		try {
			const remote = await readDriveDocument(this.googleApiService, fileId, () =>
				this.isDocumentOperationCurrent(context)
			)
			if (!remote) return { status: 'cancelled' }
			const { metadata, data: content } = remote
			runInAction(() => {
				context.session.ref = {
					fileId: metadata.id,
					name: metadata.name,
					mimeType: metadata.mimeType || 'application/json',
					space: space ?? null,
					parentFolderId: metadata.parents?.[0] ?? null,
					webViewLink: metadata.webViewLink
				}
				this.applyContentToDocument(id, content, metadata)
			})
			return { status: 'opened', documentId: id }
		} catch (error: unknown) {
			return this.failDocumentOperation(context, error)
		} finally {
			if (this.isDocumentOperationCurrent(context)) {
				runInAction(() => {
					context.session.state.isLoading = false
				})
				this.finishDocumentOperation(context)
			}
		}
	}

	/**
	 * Открыть документ из localStorage без синхронизации с Google Drive.
	 * Документ помечается как 'offline' и требует явной синхронизации пользователем.
	 */
	openFromLocalStorageSnapshot(docSnapshot: RestoredDocumentSnapshot, syncSnapshot?: DocumentSyncSnapshot) {
		const id = docSnapshot.id
		const origin: DocumentOrigin = docSnapshot.ref?.fileId ? 'restored-local' : 'new-local'
		const sync = { ...createInitialSyncSnapshot(origin), ...syncSnapshot }
		// Миграция старого снимка: 32-битный хэш не подтверждает базу и не снимает предупреждение.
		if (!Number.isSafeInteger(syncSnapshot?.localVersion)) {
			sync.localVersion = docSnapshot.state.isDirty || docSnapshot.state.hasUnsyncedChanges ? 1 : 0
			sync.baseLocalVersion = null
			sync.baseFingerprint = null
		}
		if (docSnapshot.ref?.fileId) {
			sync.needsRemoteCheck = true
			sync.lastRemoteCheckAt = null
		}

		sync.origin = origin
		if (!isDriveVersion(sync.baseRevisionId)) sync.baseRevisionId = null
		if (!isDriveVersion(sync.remoteRevisionId)) sync.remoteRevisionId = null

		const session: DocumentSession = {
			id,
			ref: docSnapshot.ref,
			data: createEmptyDocumentData(), // Данные загрузятся отдельно
			state: {
				isDirty: false, // Сбрасываем — новая сессия
				isLoading: false,
				isSaving: false,
				lastLoadedAt: docSnapshot.lastAccessedAt,
				lastSavedAt: docSnapshot.state.lastSavedAt,
				error: null,
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

	/** Общий сценарий закрытия для вкладки и меню. */
	async requestCloseDocument(
		documentId: DocumentId,
		requestDecision: (ui: DocumentUiState) => Promise<DocumentCloseDecision>,
		save: (id: DocumentId) => Promise<DocumentSaveResult>
	): Promise<DocumentCloseResult> {
		const session = this.state.documents.get(documentId)
		if (!session) return { status: 'cancelled' }
		if (session.operation === 'saving') return { status: 'failed', message: 'Дождитесь завершения сохранения.' }
		if (getShouldWarnOnClose(session)) {
			const decision = await requestDecision(getDocumentUiState(session))
			if (this.state.documents.get(documentId) !== session || decision === 'cancel') return { status: 'cancelled' }
			if (decision === 'save') {
				const beforeSave = JSON.stringify(this.getDocumentDataForSave(documentId) ?? session.data)
				let result: DocumentSaveResult
				try {
					result = await save(documentId)
				} catch {
					return { status: 'failed', message: 'Не удалось сохранить документ.' }
				}
				if (result.status !== 'saved') return result
				if (this.state.documents.get(documentId) !== session) return { status: 'cancelled' }
				if (beforeSave !== JSON.stringify(this.getDocumentDataForSave(documentId) ?? session.data)) {
					return {
						status: 'failed',
						message: 'Во время сохранения появились новые изменения. Вкладка оставлена открытой.'
					}
				}
			}
		}
		this.closeDocument(documentId)
		return { status: 'closed' }
	}

	/** Удалить документ после подтверждения закрытия. */
	closeDocument(documentId: DocumentId) {
		const session = this.state.documents.get(documentId)
		if (!session) return

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

	/** Совместимый фасад; запись всегда адресуется исходному ID. */
	updateActiveDocumentData(data: DocumentData): void {
		if (this.activeDocumentId) this.updateDocumentData(this.activeDocumentId, data)
	}

	/** Фиксирует правки любого документа, включая неактивный и сохраняемый. */
	updateDocumentData(documentId: DocumentId, data: DocumentData): void {
		const session = this.state.documents.get(documentId)
		if (!session || session.state.isLoading) return
		const copy = cloneDocumentData(data)
		session.data = copy
		session.sync.localVersion++
		session.sync.localFingerprint = computeFingerprint(copy)
		// Возврат к базе распознаётся только точным сравнением, не равенством хэшей.
		if (session.sync.localFingerprint === session.sync.baseFingerprint) {
			session.sync.baseLocalVersion = session.sync.localVersion
		}
		session.lastAccessedAt = Date.now()
		syncLegacyStateFromNewModel(session)
		this.persistDocumentDataToLocalStorage(documentId)
		this.persistToLocalStorage()
	}

	/** Подтверждает только реально отправленный снимок актуальной операции. */
	markDocumentSavedToDrive(
		context: DocumentOperationContext,
		metadata: DriveFileMetadata,
		space: 'drive' | 'appDataFolder' = 'drive'
	): boolean {
		if (!this.isDocumentOperationCurrent(context) || context.session.operation !== 'saving') return false
		const version = driveVersion(metadata)
		const session = context.session
		this.captureDocumentSnapshot(context.documentId)
		session.sync.baseFingerprint = computeFingerprint(context.data)
		session.sync.baseLocalVersion = context.localVersion
		if (session.sync.localFingerprint === session.sync.baseFingerprint) {
			session.sync.baseLocalVersion = session.sync.localVersion
		}
		session.sync.lastSyncAt = Date.now()
		// fileId не является ревизией; неизвестный серверный маркер не выдумываем.
		session.sync.baseRevisionId = version
		session.sync.remoteRevisionId = version
		session.sync.serverModifiedAt = metadata.modifiedTime ?? null
		session.sync.lastRemoteCheckAt = Date.now()
		session.sync.needsRemoteCheck = false
		session.sync.origin = 'drive'
		session.error = null
		session.state.lastSavedAt = Date.now()
		session.state.lastSyncedAt = Date.now()
		session.ref = {
			fileId: metadata.id,
			name: metadata.name,
			mimeType: metadata.mimeType || session.ref?.mimeType || 'application/json',
			space,
			parentFolderId: metadata.parents?.[0] ?? context.ref?.parentFolderId ?? null,
			webViewLink: metadata.webViewLink
		}
		syncLegacyStateFromNewModel(session)
		this.persistDocumentDataToLocalStorage(context.documentId)
		this.persistToLocalStorage()
		return true
	}

	/** Сохранить активный документ в Google Drive */
	async saveActiveDocument(): Promise<boolean> {
		if (!this.state.activeDocumentId) return false
		return (await this.saveDocument(this.state.activeDocumentId)).status === 'saved'
	}

	saveDocument(documentId: DocumentId, decision?: DocumentOperationContext): Promise<DocumentSaveResult> {
		if (decision && (!this.isDocumentOperationCurrent(decision) || decision.documentId !== documentId))
			return Promise.resolve({ status: 'cancelled' })
		const session = this.state.documents.get(documentId)
		if (!session?.ref?.fileId)
			return Promise.resolve({ status: 'failed', message: 'Нет связанного файла для сохранения.' })
		const pending = this.pendingSaves.get(session)
		if (pending) return pending
		const context = this.beginDocumentOperation(documentId, 'saving')
		if (!context) return Promise.resolve({ status: 'failed', message: 'Дождитесь завершения операции.' })
		const saving = this.performDocumentSave(context, decision).finally(() => {
			if (this.pendingSaves.get(session) === saving) this.pendingSaves.delete(session)
		})
		this.pendingSaves.set(session, saving)
		return saving
	}

	private observeRemote(context: DocumentOperationContext, metadata: DriveFileMetadata): void {
		const version = driveVersion(metadata, context.ref!.fileId!)
		context.session.sync.remoteRevisionId = version
		context.session.sync.serverModifiedAt = metadata.modifiedTime ?? null
		context.session.sync.lastRemoteCheckAt = Date.now()
		context.session.sync.needsRemoteCheck = false
	}

	private conflictFor(
		context: DocumentOperationContext,
		metadata: DriveFileMetadata
	): Extract<SyncResult, { status: 'conflict' }> {
		const version = driveVersion(metadata, context.ref!.fileId!)
		const unknownBase = !isDriveVersion(context.session.sync.baseRevisionId)
		return {
			status: 'conflict',
			context: Object.freeze({ ...context, checkedVersion: version }),
			remoteMetadata: metadata,
			localModifiedAt: context.session.lastAccessedAt,
			remoteModifiedAt: Date.parse(metadata.modifiedTime || '') || 0,
			hasLocalChanges: getIsDirty(context.session) || unknownBase,
			hasRemoteChanges: unknownBase || version !== context.session.sync.baseRevisionId,
			message: unknownBase
				? 'Базовая версия неизвестна. Сохраните отдельную версию или загрузите Drive.'
				: 'Локальная версия или версия Drive изменились. Выберите действие.'
		}
	}

	private async performDocumentSave(
		context: DocumentOperationContext,
		decision?: DocumentOperationContext
	): Promise<DocumentSaveResult> {
		const ref = context.ref!
		try {
			const remote = await this.googleApiService.getFileMetadata(ref.fileId!)
			if (!this.isDocumentOperationCurrent(context)) return { status: 'cancelled' }
			this.observeRemote(context, remote)
			const expected = decision?.checkedVersion ?? context.session.sync.baseRevisionId
			if (!isDriveVersion(expected ?? null) || driveVersion(remote, ref.fileId!) !== expected) {
				const conflict = this.conflictFor(context, remote)
				return { status: 'conflict', message: conflict.message, conflict }
			}
			if (!decision && !getIsDirty(context.session)) return { status: 'saved' }
			const result = await this.googleApiService.saveFile(
				ref.name,
				JSON.stringify(context.data, null, 2),
				ref.mimeType,
				ref.parentFolderId || 'root',
				ref.space || 'drive',
				ref.fileId,
				remote.version
			)
			if (!this.isDocumentOperationCurrent(context)) return { status: 'cancelled' }
			if (result.status === 'success') {
				this.markDocumentSavedToDrive(context, result.file, ref.space || 'drive')
				return { status: 'saved' }
			}
			if (result.status === 'conflict') {
				const latest = result.existingFiles.find(file => file.id === ref.fileId)
				if (!latest) throw new Error('Не удалось подтвердить исходный файл Drive.')
				this.observeRemote(context, latest)
				const conflict = this.conflictFor(context, latest)
				return { status: 'conflict', message: conflict.message, conflict }
			}
			return this.failDocumentOperation(context, new Error(result.message))
		} catch (error: unknown) {
			return this.failDocumentOperation(context, error)
		} finally {
			this.finishDocumentOperation(context)
		}
	}

	/** Совместимый фасад над единственной реализацией check по ID. */
	async syncActiveDocumentWithDrive(): Promise<SyncResult> {
		return this.activeDocumentId
			? this.checkDocument(this.activeDocumentId)
			: { status: 'error', message: 'Нет документа для синхронизации' }
	}

	/** Проверяет метаданные, не заменяя локальное содержимое. */
	async checkDocument(documentId: DocumentId, options: { background?: boolean } = {}): Promise<SyncResult> {
		const session = this.state.documents.get(documentId)
		if (!session?.ref?.fileId) return { status: 'error', message: 'Нет документа для синхронизации' }
		if (options.background && (!this.googleApiService.isGoogleLoggedIn || session.operation !== 'idle'))
			return { status: 'cancelled' }
		const context = this.beginDocumentOperation(documentId, 'checking')
		if (!context) return { status: 'error', message: 'Дождитесь завершения операции.' }
		try {
			if (!this.googleApiService.isGoogleLoggedIn) await this.googleApiService.logIn()
			if (!this.isDocumentOperationCurrent(context)) return { status: 'cancelled' }
			const metadata = await this.googleApiService.getFileMetadata(context.ref!.fileId!)
			if (!this.isDocumentOperationCurrent(context)) return { status: 'cancelled' }
			this.observeRemote(context, metadata)
			if (
				getIsDirty(session) ||
				!isDriveVersion(session.sync.baseRevisionId) ||
				session.sync.remoteRevisionId !== session.sync.baseRevisionId
			)
				return this.conflictFor(context, metadata)
			return { status: 'success' }
		} catch (error: unknown) {
			const result = this.failDocumentOperation(context, error)
			return result.status === 'cancelled' ? result : { status: 'error', message: result.message }
		} finally {
			this.finishDocumentOperation(context)
		}
	}

	/** Привязывает выбор пользователя к исходной проверке и локальной версии. */
	async resolveDocumentConflict(
		context: DocumentOperationContext,
		choice: 'local' | 'remote'
	): Promise<DocumentResolveResult> {
		if (!this.isDocumentOperationCurrent(context)) return { status: 'cancelled' }
		if (context.session.sync.localVersion !== context.localVersion) {
			return { status: 'conflict', message: 'Документ изменился после проверки. Повторите синхронизацию.' }
		}
		return choice === 'local'
			? this.saveDocument(context.documentId, context)
			: this.pullDocument(context.documentId, context)
	}

	/** Ответ pull применяется только к исходной сессии без новых локальных правок. */
	async pullDocument(documentId: DocumentId, expected?: DocumentOperationContext): Promise<DocumentPullResult> {
		if (expected && (!this.isDocumentOperationCurrent(expected) || expected.documentId !== documentId))
			return { status: 'cancelled' }
		if (expected && expected.session.sync.localVersion !== expected.localVersion) {
			return { status: 'conflict', message: 'Документ изменился после проверки. Повторите синхронизацию.' }
		}
		const context = this.beginDocumentOperation(documentId, 'pulling')
		if (!context?.ref?.fileId) {
			if (context) this.finishDocumentOperation(context)
			return { status: 'failed', message: 'Нет доступного документа для загрузки.' }
		}
		try {
			const remote = await readDriveDocument(this.googleApiService, context.ref.fileId, () =>
				this.isDocumentOperationCurrent(context)
			)
			if (!remote || !this.isDocumentOperationCurrent(context)) return { status: 'cancelled' }
			if (context.session.sync.localVersion !== context.localVersion) {
				return {
					status: 'conflict',
					message: 'Во время загрузки появились локальные изменения. Данные с Drive не применены.'
				}
			}
			if (expected?.checkedVersion && remote.version !== expected.checkedVersion) {
				this.observeRemote(context, remote.metadata)
				const conflict = this.conflictFor(context, remote.metadata)
				return { status: 'conflict', message: conflict.message, conflict }
			}
			this.applyContentToDocument(documentId, remote.data, remote.metadata)
			return { status: 'pulled' }
		} catch (error: unknown) {
			return this.failDocumentOperation(context, error)
		} finally {
			this.finishDocumentOperation(context)
		}
	}

	/**
	 * Синхронизация всех документов с fileId.
	 * НЕ меняет activeDocumentId — работает напрямую с каждым документом.
	 */
	async syncAllDocumentsWithDrive(): Promise<Map<DocumentId, SyncResult>> {
		const results: Map<DocumentId, SyncResult> = new Map()

		for (const [id, session] of Array.from(this.state.documents.entries())) {
			if (this.state.documents.get(id) !== session) continue
			if (session.ref?.fileId && session.sync.needsRemoteCheck) {
				const result = await this.checkDocument(id)
				results.set(id, result)
			}
		}

		return results
	}

	/** Сохранить все изменённые документы */
	async saveAllDirtyDocuments(): Promise<Map<DocumentId, boolean>> {
		const results: Map<DocumentId, boolean> = new Map()

		for (const [id, session] of Array.from(this.state.documents.entries())) {
			if (this.state.documents.get(id) !== session) continue
			if (getIsDirty(session) && session.ref?.fileId) {
				const result = await this.saveDocument(id)
				results.set(id, result.status === 'saved')
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
		if (this.activeDocumentId) this.applyContentToDocument(this.activeDocumentId, content)
	}

	/** Синхронное применение проверенного снимка по ID; сетевые команды проверяют токен до вызова. */
	applyContentToDocument(documentId: DocumentId, content: unknown, metadata?: DriveFileMetadata): void {
		const session = this.state.documents.get(documentId)
		if (!session) return

		const version = metadata ? driveVersion(metadata, session.ref?.fileId || metadata.id) : null
		const normalized = cloneDocumentData(normalizeMainStoreData(content))

		// Обновляем данные сессии
		session.data = normalized

		// Пересчитываем fingerprint
		const fingerprint = computeFingerprint(normalized)
		session.sync.localFingerprint = fingerprint
		session.sync.baseFingerprint = fingerprint
		session.sync.localVersion++
		session.sync.baseLocalVersion = metadata ? session.sync.localVersion : null
		session.sync.baseRevisionId = version
		session.sync.remoteRevisionId = version
		session.sync.serverModifiedAt = metadata?.modifiedTime ?? null
		session.sync.lastRemoteCheckAt = metadata ? Date.now() : null
		session.sync.needsRemoteCheck = !metadata

		// Обновляем сторы (с блокировкой onChangeList)
		session.state.isLoading = true
		try {
			if (this.documentStoreManager.hasStores(documentId))
				this.documentStoreManager.updateStoresData(documentId, normalized)
			else this.documentStoreManager.createStores(documentId)
		} finally {
			session.state.isLoading = false
		}
		// База использует ту же сериализацию, что и доменные сторы. Check не превращает
		// нормализацию нулевых/необязательных полей DTO в новую локальную правку.
		session.data = cloneDocumentData(this.getDocumentDataForSave(documentId) ?? normalized)
		session.sync.localFingerprint = computeFingerprint(session.data)
		session.sync.baseFingerprint = metadata ? session.sync.localFingerprint : null

		session.state.lastSyncedAt = Date.now()
		session.state.lastLoadedAt = Date.now()
		session.sync.lastSyncAt = Date.now()

		// Синхронизируем legacy-поля с новой моделью
		syncLegacyStateFromNewModel(session)

		this.persistDocumentDataToLocalStorage(session.id)
		this.persistToLocalStorage()
		if (this.activeDocumentId === documentId) this.onActiveDocumentChanged?.(documentId)
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
					// Данные записываются перед метаданными: при прерывании между двумя записями
					// новый контент не должен получить старую «чистую» локальную версию.
					if (session.sync.localFingerprint !== fingerprint && session.sync.baseLocalVersion !== null) {
						session.sync.localVersion = Math.max(session.sync.localVersion, session.sync.baseLocalVersion) + 1
					}
					session.sync.localFingerprint = fingerprint
					if (session.sync.baseFingerprint === fingerprint) {
						session.sync.baseLocalVersion = session.sync.localVersion
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
