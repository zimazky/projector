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
	generateDocumentId,
	createInitialSyncSnapshot,
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
import { computeFingerprint, cloneDocumentData, freezeSnapshot } from './DocumentSyncFingerprint'
import type { DocumentUiState } from './DocumentSyncSelectors'
import { getIsDirty, getShouldWarnOnClose, getDocumentUiState } from './DocumentSyncSelectors'

import type { DocumentPersistence } from './DocumentPersistence'
import { legacyDocumentRuntime, type DocumentRuntime, type DocumentRuntimeSnapshot } from './DocumentRuntime'
import { storageDiagnostic, storageFailureMessage, type StorageDiagnostic } from './DocumentStorageDiagnostic'
import type { LegacyStorageCleanupResult } from './DocumentStorageCleanup'

/**
 * Store для управления несколькими открытыми документами.
 * Поддерживает вкладки, персистентность в localStorage и синхронизацию с Google Drive.
 */
export class DocumentTabsStore implements IEventsStoreProvider {
	private state: DocumentTabsState
	private documentStoreManager: DocumentStoreManager
	private operationSequence = 0
	/** Только синхронное применение данных, не состояние сетевой операции. */
	private applyingContent = new Set<DocumentId>()
	private pendingSaves = new Map<DocumentSession, Promise<DocumentSaveResult>>()
	private storeCallbacks: DocumentStoreCallbacks = {}
	private recoveryBlocked = false
	persistenceError: string | null = null
	persistenceDiagnostic: StorageDiagnostic | null = null
	isPersistingLocalSession = false
	isRestoringLocalSession = false
	private localSaveSequence = 0
	private localRestoreSequence = 0
	private pendingLocalSave: Promise<void> | null = null
	isCleaningLegacyStorage = false
	private pendingLegacyCleanup: Promise<LegacyStorageCleanupResult> | null = null
	private disposed = false
	private readonly persistence: DocumentPersistence<DocumentRuntimeSnapshot>

	constructor(
		private readonly googleApiService: GoogleApiService,
		persistence: DocumentPersistence<DocumentRuntimeSnapshot> | undefined = undefined,
		private readonly runtime: DocumentRuntime = legacyDocumentRuntime
	) {
		this.persistence = persistence ?? runtime.createPersistence()
		this.state = {
			documents: new Map(),
			activeDocumentId: null,
			documentOrder: []
		}

		// Создаём менеджер внутри конструктора, передаём себя как провайдер данных
		const self = this
		this.documentStoreManager = new DocumentStoreManager(
			{
				getDocumentData: id => self.state.documents.get(id)?.data ?? null,
				get activeDocumentId(): DocumentId | null {
					return self.state.activeDocumentId
				}
			},
			{},
			runtime.resourceAccounting
		)

		this.setOnStoresChanged({})
		makeAutoObservable<
			this,
			| 'applyingContent'
			| 'pendingSaves'
			| 'operationSequence'
			| 'persistence'
			| 'pendingLocalSave'
			| 'localSaveSequence'
			| 'localRestoreSequence'
			| 'pendingLegacyCleanup'
			| 'runtime'
		>(this, {
			applyingContent: false,
			pendingSaves: false,
			persistence: false,
			runtime: false,
			pendingLocalSave: false,
			pendingLegacyCleanup: false,
			localSaveSequence: false,
			localRestoreSequence: false,
			operationSequence: false
		})
	}

	/** Установить колбэки при изменении данных в пер-документных сторах (вызывается из MainStore) */
	setOnStoresChanged(callbacks: DocumentStoreCallbacks): void {
		this.storeCallbacks = callbacks
		// Персистентность принадлежит документу, а не наличию MainStore или активной вкладке.
		this.documentStoreManager.setCallbacks({
			onEventsChanged: stores => {
				callbacks.onEventsChanged?.(stores)
			},
			onProjectsChanged: stores => {
				callbacks.onProjectsChanged?.(stores)
			},
			onDocumentChanged: stores => {
				this.recordStoresChanged(stores)
				callbacks.onDocumentChanged?.(stores)
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
		if (this.disposed) return null
		const session = this.state.documents.get(documentId)
		if (!snapshot || session !== snapshot.session || session.operation === 'saving' || session.operation === 'opening')
			return null
		const context = Object.freeze({ ...snapshot, token: ++this.operationSequence })
		session.operation = operation
		session.operationToken = context.token
		session.error = null
		this.persistToLocalStorage()
		return context
	}

	/** Проверяется после каждого await, в том числе в catch/finally. */
	isDocumentOperationCurrent(context: DocumentOperationContext): boolean {
		return (
			!this.disposed &&
			this.state.documents.get(context.documentId) === context.session &&
			context.session.operationToken === context.token
		)
	}

	finishDocumentOperation(context: DocumentOperationContext): void {
		if (!this.isDocumentOperationCurrent(context)) return
		context.session.operation = 'idle'
		this.persistToLocalStorage()
	}

	/** Смена доступности не меняет содержимое и не снимает dirty. */
	requireRemoteCheck(documentId: DocumentId): void {
		const session = this.state.documents.get(documentId)
		if (!session?.ref?.fileId || session.sync.needsRemoteCheck) return
		session.sync.needsRemoteCheck = true
		this.persistToLocalStorage()
	}

	/** Dispose координатора отменяет только принадлежащую ему проверку. */
	cancelBackgroundCheck(documentId: DocumentId, token: number | null): void {
		const session = this.state.documents.get(documentId)
		if (!session || session.operation !== 'checking' || session.operationToken !== token) return
		session.operationToken = ++this.operationSequence
		session.operation = 'idle'
		session.sync.needsRemoteCheck = true
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
		this.persistToLocalStorage()
		return { status: 'failed', message }
	}

	/** Колбэк при смене активного документа (для инвалидации кэша и т.п.) */
	private onActiveDocumentChanged?: (documentId: DocumentId) => void

	/** Установить колбэк при смене активного документа (вызывается из MainStore) */
	setOnActiveDocumentChanged(callback?: (documentId: DocumentId) => void): void {
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
		if (this.isRestoringLocalSession) return
		const id = generateDocumentId()
		const data = this.runtime.createEmptyData()
		const sync = createInitialSyncSnapshot('new-local')
		sync.localFingerprint = computeFingerprint(data)
		if (this.runtime.resourceAccounting) sync.baseFingerprint = sync.localFingerprint

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

		// Новые сторы подключают callbacks только после инициализации.
		this.documentStoreManager.createStores(id)

		this.persistToLocalStorage()

		this.onActiveDocumentChanged?.(id)
	}

	/** Открыть документ из Google Drive */
	async openFromDrive(fileId: string, space?: 'drive' | 'appDataFolder'): Promise<DocumentOpenResult> {
		if (this.isRestoringLocalSession) return { status: 'cancelled' }
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
			data: this.runtime.createEmptyData(),
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
			const remote = await readDriveDocument(
				this.googleApiService,
				fileId,
				() => this.isDocumentOperationCurrent(context),
				this.runtime.parseData
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
			})
			if (context.session.sync.localVersion !== context.localVersion) {
				this.observeRemote(context, metadata)
				return {
					status: 'conflict',
					message: 'Во время открытия появились локальные изменения. Данные с Drive не применены.'
				}
			}
			this.applyContentToDocument(id, content, metadata)
			return { status: 'opened', documentId: id }
		} catch (error: unknown) {
			return this.failDocumentOperation(context, error)
		} finally {
			this.finishDocumentOperation(context)
		}
	}

	/** Миграция формата уже завершена до создания рабочей сессии. */
	private createRestoredSession(docSnapshot: DocumentRuntimeSnapshot['documents'][number]): DocumentSession {
		const origin: DocumentOrigin = docSnapshot.ref.fileId ? 'restored-local' : 'new-local'
		const sync = { ...docSnapshot.sync, origin }
		if (docSnapshot.ref.fileId) {
			sync.needsRemoteCheck = true
			sync.lastRemoteCheckAt = null
		}
		if (!isDriveVersion(sync.baseRevisionId)) sync.baseRevisionId = null
		if (!isDriveVersion(sync.remoteRevisionId)) sync.remoteRevisionId = null
		return {
			id: docSnapshot.id,
			ref: { ...docSnapshot.ref },
			data: cloneDocumentData(docSnapshot.data),
			sync,
			operation: 'idle',
			error: null,
			operationToken: null,
			createdAt: docSnapshot.lastAccessedAt,
			lastAccessedAt: docSnapshot.lastAccessedAt
		}
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

		this.persistToLocalStorage()
	}

	/** Активировать документ */
	activateDocument(documentId: DocumentId) {
		const session = this.state.documents.get(documentId)
		if (!session) return

		this.state.activeDocumentId = documentId
		session.lastAccessedAt = Date.now()

		if (!this.documentStoreManager.hasStores(documentId)) {
			this.documentStoreManager.createStores(documentId)
		}

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
		if (!session || this.applyingContent.has(documentId)) return
		const copy = cloneDocumentData(this.runtime.parseData(data))
		session.data = copy
		session.sync.localVersion++
		session.sync.localFingerprint = computeFingerprint(copy)
		// Возврат к базе распознаётся только точным сравнением, не равенством хэшей.
		if (session.sync.localFingerprint === session.sync.baseFingerprint) {
			session.sync.baseLocalVersion = session.sync.localVersion
		}
		session.lastAccessedAt = Date.now()
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
		session.ref = {
			fileId: metadata.id,
			name: metadata.name,
			mimeType: metadata.mimeType || session.ref?.mimeType || 'application/json',
			space,
			parentFolderId: metadata.parents?.[0] ?? context.ref?.parentFolderId ?? null,
			webViewLink: metadata.webViewLink ?? (metadata.id === context.ref?.fileId ? context.ref.webViewLink : undefined)
		}
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
				? 'Базовая версия неизвестна. Выберите локальные данные для записи в этот файл или загрузите Drive.'
				: 'Локальная версия или версия Drive изменились. Выберите действие.'
		}
	}

	private async performDocumentSave(
		context: DocumentOperationContext,
		decision?: DocumentOperationContext
	): Promise<DocumentSaveResult> {
		const ref = context.ref!
		try {
			let remote = await this.googleApiService.getFileMetadata(ref.fileId!)
			if (!this.isDocumentOperationCurrent(context)) return { status: 'cancelled' }
			this.observeRemote(context, remote)
			const expected = decision?.checkedVersion ?? context.session.sync.baseRevisionId
			if (
				!decision &&
				isDriveVersion(expected ?? null) &&
				driveVersion(remote, ref.fileId!) !== expected &&
				context.session.sync.baseLocalVersion !== null &&
				context.session.sync.baseFingerprint !== null
			) {
				// Drive может менять служебную version после чтения/записи без изменения данных.
				// Принимаем новую базу только после согласованного чтения и точного сравнения.
				const checked = await readDriveDocument(
					this.googleApiService,
					ref.fileId!,
					() => this.isDocumentOperationCurrent(context),
					this.runtime.parseData
				)
				if (!checked) return { status: 'cancelled' }
				remote = checked.metadata
				this.observeRemote(context, remote)
				const manager = new DocumentStoreManager({
					getDocumentData: () => checked.data,
					activeDocumentId: context.documentId
				})
				let fingerprint: string
				try {
					manager.createStores(context.documentId)
					fingerprint = computeFingerprint(manager.getDocumentDataForSave(context.documentId)!)
				} finally {
					manager.dispose()
				}
				if (fingerprint === context.session.sync.baseFingerprint) context.session.sync.baseRevisionId = checked.version
			}
			const verifiedBase = decision?.checkedVersion ?? context.session.sync.baseRevisionId
			if (!isDriveVersion(verifiedBase ?? null) || driveVersion(remote, ref.fileId!) !== verifiedBase) {
				const conflict = this.conflictFor(context, remote)
				return { status: 'conflict', message: conflict.message, conflict }
			}
			if (!decision && !getIsDirty(context.session)) return { status: 'saved' }
			const result = await this.googleApiService.updateFileContent(
				ref.fileId!,
				this.runtime.serializeData(context.data),
				ref.mimeType,
				remote.version!,
				() => this.isDocumentOperationCurrent(context)
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
			const remote = await readDriveDocument(
				this.googleApiService,
				context.ref.fileId,
				() => this.isDocumentOperationCurrent(context),
				this.runtime.parseData
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
		const normalized = cloneDocumentData(this.runtime.parseData(content))

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

		// Подавляем callbacks только при синхронном применении снимка.
		const wasApplying = this.applyingContent.has(documentId)
		this.applyingContent.add(documentId)
		try {
			if (this.documentStoreManager.hasStores(documentId))
				this.documentStoreManager.updateStoresData(documentId, normalized)
			else this.documentStoreManager.createStores(documentId)
		} finally {
			if (!wasApplying) this.applyingContent.delete(documentId)
		}
		// База использует ту же сериализацию, что и доменные сторы. Check не превращает
		// нормализацию нулевых/необязательных полей DTO в новую локальную правку.
		session.data = cloneDocumentData(this.getDocumentDataForSave(documentId) ?? normalized)
		session.sync.localFingerprint = computeFingerprint(session.data)
		session.sync.baseFingerprint = metadata ? session.sync.localFingerprint : null

		session.sync.lastSyncAt = Date.now()

		this.persistToLocalStorage()
		if (this.activeDocumentId === documentId) this.onActiveDocumentChanged?.(documentId)
	}

	/** Получить данные документа для сохранения */
	getDocumentDataForSave(documentId?: DocumentId): DocumentData | null {
		const docId = documentId ?? this.state.activeDocumentId
		if (!docId) return null
		return this.documentStoreManager.getDocumentDataForSave(docId)
	}

	/** Одна проверенная публикация по исходному ID, в том числе для неактивной вкладки. */
	editDocument(documentId: DocumentId, edit: (draft: DocumentData) => void): void {
		if (this.disposed) throw new Error('Document store is disposed')
		this.documentStoreManager.editDocument(documentId, edit)
	}

	// === Персистентность ===

	/** Полный атомарный снимок метаданных и содержимого всех вкладок. */
	private createLocalSnapshot(): DocumentRuntimeSnapshot {
		return {
			schemaVersion: this.runtime.sessionSchemaVersion,
			activeDocumentId: this.state.activeDocumentId,
			documentOrder: this.state.documentOrder,
			documents: this.state.documentOrder.map(id => {
				const session = this.state.documents.get(id)!
				return {
					id: session.id,
					data: session.data,
					ref: session.ref!,
					sync: session.sync,
					// Операция не сохраняется — всегда сбрасывается в idle при перезапуске
					lastAccessedAt: session.lastAccessedAt
				}
			}),
			savedAt: Date.now()
		}
	}

	private persistToLocalStorage(): void {
		if (this.disposed || this.recoveryBlocked) return
		const sequence = ++this.localSaveSequence
		const success = () => {
			if (sequence !== this.localSaveSequence) return
			this.persistenceError = null
			this.persistenceDiagnostic = null
			this.isPersistingLocalSession = false
		}
		const failure = (error: unknown) => {
			if (sequence !== this.localSaveSequence) return
			this.persistenceDiagnostic = storageDiagnostic(error)
			this.persistenceError = storageFailureMessage(this.persistenceDiagnostic)
			this.isPersistingLocalSession = false
		}
		try {
			const saving = this.persistence.save(this.createLocalSnapshot())
			if (saving) {
				this.isPersistingLocalSession = true
				this.pendingLocalSave = saving.then(
					() => runInAction(success),
					error => runInAction(() => failure(error))
				)
			} else success()
		} catch (error: unknown) {
			failure(error)
		}
	}

	async waitForLocalPersistence(): Promise<boolean> {
		let pending: Promise<void> | null
		do {
			pending = this.pendingLocalSave
			await pending
		} while (pending !== this.pendingLocalSave)
		return !this.persistenceError && !this.recoveryBlocked
	}

	/** Повтор после освобождения квоты; не маскирует повреждённый исходный снимок. */
	retryLocalPersistence(): void {
		if (!this.recoveryBlocked) this.persistToLocalStorage()
	}

	get canPersistLocalSession(): boolean {
		return !this.recoveryBlocked
	}

	exportLocalSession(): string {
		return JSON.stringify(this.createLocalSnapshot(), null, 2)
	}

	exportRecoverySource(): string | Promise<string> {
		return this.persistence.exportSource()
	}

	cleanupLegacyLocalStorage(): Promise<LegacyStorageCleanupResult> {
		if (this.pendingLegacyCleanup) return this.pendingLegacyCleanup
		this.isCleaningLegacyStorage = true
		const cleanup = async () => {
			if (this.isRestoringLocalSession || this.recoveryBlocked)
				throw new Error('Сначала восстановите и сохраните текущую сессию. Старые записи не удалены.')
			if (!(await this.waitForLocalPersistence()))
				throw new Error('Локальная сессия не сохранена. Устраните ошибку записи перед очисткой.')
			if (!this.persistence.cleanupLegacy) throw new Error('Это хранилище не поддерживает очистку старых записей.')
			return this.persistence.cleanupLegacy()
		}
		const pending = cleanup().finally(() =>
			runInAction(() => {
				this.isCleaningLegacyStorage = false
				this.pendingLegacyCleanup = null
			})
		)
		this.pendingLegacyCleanup = pending
		return pending
	}

	/** Архив сессии добавляет копии вкладок; уже открытые документы остаются в сессии. */
	importLocalSession(json: string): number {
		if (this.isRestoringLocalSession || this.documents.some(document => document.operation !== 'idle'))
			throw new Error('Дождитесь завершения текущих операций перед импортом сессии.')
		const imported = this.runtime.parseSession(json)
		if (!imported.documents.length) throw new Error('В архиве сессии нет документов.')
		const merged = this.createLocalSnapshot()
		const ids = new Map<string, string>()
		for (const document of imported.documents) ids.set(document.id, generateDocumentId())
		const order = imported.documentOrder.map(id => ids.get(id)!)
		merged.documents.push(
			...imported.documents.map(document => ({
				...document,
				id: ids.get(document.id)!,
				ref: { ...document.ref, name: document.ref.name + ' (восстановлено)' }
			}))
		)
		merged.documentOrder = [...merged.documentOrder, ...order]
		merged.activeDocumentId = ids.get(imported.activeDocumentId!)!
		// Проверяем весь объединённый снимок до замены доменных сторов.
		this.installRestoredSnapshot(this.runtime.parseSession(JSON.stringify(merged)))
		this.persistToLocalStorage()
		return imported.documents.length
	}

	/** Полная проверка и подготовка сторов предшествуют атомарной замене сессии в памяти. */
	async restoreFromLocalStorage(): Promise<boolean> {
		if (this.disposed || this.documents.length) return false
		const restoreSequence = ++this.localRestoreSequence
		this.isRestoringLocalSession = true
		this.recoveryBlocked = true
		try {
			const loading = this.persistence.load()
			const snapshot = loading instanceof Promise ? await loading : loading
			return runInAction(() => {
				if (restoreSequence !== this.localRestoreSequence) return false
				if (this.documents.length) {
					this.persistenceError =
						'Во время восстановления открыты новые документы. Экспортируйте их перед повторным запуском; исходная сессия не перезаписана.'
					return false
				}
				if (!snapshot) {
					this.recoveryBlocked = false
					this.persistenceError = null
					this.persistenceDiagnostic = null
					return false
				}
				const restored = this.installRestoredSnapshot(this.runtime.parseSession(JSON.stringify(snapshot)))
				if (restored && loading instanceof Promise) this.persistToLocalStorage()
				return restored
			})
		} catch (error: unknown) {
			return runInAction(() => {
				if (restoreSequence !== this.localRestoreSequence) return false
				this.persistenceDiagnostic = null
				this.recoveryBlocked = true
				this.persistenceError =
					'Не удалось восстановить локальную сессию. ' +
					(error instanceof Error ? error.message : 'Хранилище недоступно.')
				return false
			})
		} finally {
			runInAction(() => {
				if (restoreSequence === this.localRestoreSequence) this.isRestoringLocalSession = false
			})
		}
	}

	private installRestoredSnapshot(snapshot: DocumentRuntimeSnapshot): boolean {
		const nextState: DocumentTabsState = {
			documents: new Map(),
			documentOrder: [...snapshot.documentOrder],
			activeDocumentId: snapshot.activeDocumentId
		}
		for (const item of snapshot.documents) {
			const session = this.createRestoredSession(item)
			const fingerprint = computeFingerprint(session.data)
			if (session.sync.localFingerprint !== fingerprint && session.sync.baseLocalVersion !== null) {
				session.sync.localVersion = Math.max(session.sync.localVersion, session.sync.baseLocalVersion) + 1
			}
			session.sync.localFingerprint = fingerprint
			if (session.sync.baseLocalVersion !== null && session.sync.baseFingerprint === fingerprint)
				session.sync.baseLocalVersion = session.sync.localVersion
			nextState.documents.set(item.id, session)
		}
		let installed = false
		const self = this
		const manager = new DocumentStoreManager(
			{
				getDocumentData: id => (installed ? self.state : nextState).documents.get(id)?.data ?? null,
				get activeDocumentId() {
					return (installed ? self.state : nextState).activeDocumentId
				}
			},
			{},
			this.runtime.resourceAccounting
		)
		for (const id of nextState.documentOrder) manager.createStores(id)
		this.documentStoreManager.dispose()
		this.state = nextState
		installed = true
		this.documentStoreManager = manager
		this.setOnStoresChanged(this.storeCallbacks)
		this.recoveryBlocked = false
		this.persistenceError = null
		this.persistenceDiagnostic = null
		if (this.activeDocumentId) this.onActiveDocumentChanged?.(this.activeDocumentId)
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

	/** ID активного документа */
	get activeDocumentId(): DocumentId | null {
		return this.state.activeDocumentId
	}

	/** Остановить продолжения и подписки; сохранённая сессия и очередь записи остаются. */
	dispose(): void {
		if (this.disposed) return
		this.disposed = true
		++this.localRestoreSequence
		this.isRestoringLocalSession = false
		this.onActiveDocumentChanged = undefined
		this.storeCallbacks = {}
		this.documentStoreManager.setCallbacks({})
		this.documentStoreManager.dispose()
	}

	/** Очистить состояние стора (для тестов) */
	clear() {
		++this.localRestoreSequence
		this.isRestoringLocalSession = false
		const saveSequence = ++this.localSaveSequence
		this.pendingLocalSave = null
		this.isPersistingLocalSession = false
		this.state = {
			documents: new Map(),
			activeDocumentId: null,
			documentOrder: []
		}
		this.documentStoreManager.clear()
		this.recoveryBlocked = false
		this.persistenceError = null
		this.persistenceDiagnostic = null
		try {
			const clearing = this.persistence.clear()
			if (clearing) {
				this.isPersistingLocalSession = true
				this.pendingLocalSave = clearing.then(
					() =>
						runInAction(() => {
							if (saveSequence === this.localSaveSequence) this.isPersistingLocalSession = false
						}),
					() =>
						runInAction(() => {
							if (saveSequence !== this.localSaveSequence) return
							this.isPersistingLocalSession = false
							this.persistenceError = 'Не удалось очистить локальную сессию.'
						})
				)
			}
		} catch {
			this.persistenceError = 'Не удалось очистить локальную сессию.'
		}
	}
}
