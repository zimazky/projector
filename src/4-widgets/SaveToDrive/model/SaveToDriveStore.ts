import { serializeDocumentData } from 'src/6-entities/Document/model/DocumentFormat'
import { makeAutoObservable, runInAction } from 'mobx'

import { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { DriveFileMetadata } from 'src/7-shared/services/gapi'
import { DocumentTabsStore } from 'src/6-entities/Document/model'
import type { DocumentSnapshot, DocumentSaveResult } from 'src/6-entities/Document/model/DocumentTabsStore.types'
import { GoogleLoginCancelledError } from 'src/7-shared/services/GoogleAuthError'

type SaveRequest = {
	folderId: string
	space: string
	name: string
	content: string | Blob
	mime: string
	documentId: string | null
	snapshot: DocumentSnapshot | null
}

export class SaveToDriveStore {
	isOpen = false
	fileName = ''
	fileContent: string | Blob | null = null
	mimeType = 'text/plain'
	isSaving = false
	error: string | null = null
	showConflictDialog = false
	conflictingFiles: DriveFileMetadata[] = []
	newFileNameForConflict = ''
	selectedConflictFileId = ''
	private documentId: string | null = null
	private sourceSnapshot: DocumentSnapshot | null = null
	private conflictRequest: SaveRequest | null = null
	private completion: ((result: DocumentSaveResult) => void) | null = null
	private disposed = false

	constructor(
		private googleApiService: GoogleApiService,
		private onFileSaved: () => void,
		private documentTabsStore: DocumentTabsStore
	) {
		makeAutoObservable(this)
	}

	openForDocument = (documentId: string): Promise<DocumentSaveResult> => {
		const document = this.documentTabsStore.documents.find(doc => doc.id === documentId)
		const data = this.documentTabsStore.getDocumentDataForSave(documentId)
		if (!document || !data) return Promise.resolve({ status: 'failed', message: 'Нет документа для сохранения.' })
		return this.open(
			document.ref?.name || 'calendar.json',
			serializeDocumentData(data),
			document.ref?.mimeType || 'application/json',
			documentId
		)
	}

	open = (
		initialFileName: string,
		content: string | Blob,
		mime = 'text/plain',
		documentId: string | null = null
	): Promise<DocumentSaveResult> => {
		if (this.disposed) return Promise.resolve({ status: 'cancelled' })
		if (this.isOpen) return Promise.resolve({ status: 'failed', message: 'Завершите открытое сохранение.' })
		const snapshot = documentId ? this.documentTabsStore.captureDocumentSnapshot(documentId) : null
		if (documentId && !snapshot) return Promise.resolve({ status: 'cancelled' })
		this.isOpen = true
		this.documentId = documentId
		this.sourceSnapshot = snapshot
		this.fileName = initialFileName
		this.fileContent = snapshot ? serializeDocumentData(snapshot.data) : content
		this.mimeType = mime
		this.error = null
		this.resetConflictState()
		return new Promise(resolve => {
			this.completion = resolve
		})
	}

	close = () => {
		if (this.isSaving) return
		this.complete({ status: 'cancelled' })
		this.isOpen = false
		this.fileName = ''
		this.fileContent = null
		this.documentId = null
		this.sourceSnapshot = null
		this.error = null
		this.resetConflictState()
	}

	setFileName = (name: string) => {
		this.fileName = name
	}
	setNewFileNameForConflict = (name: string) => {
		this.newFileNameForConflict = name
	}
	setSelectedConflictFileId = (id: string) => {
		this.selectedConflictFileId = id
	}
	closeConflictDialog = () => {
		if (this.isSaving) return
		this.resetConflictState()
		this.complete({ status: 'cancelled' })
	}

	saveFile = async (folderId: string, space: string): Promise<DocumentSaveResult> => {
		if (this.isSaving) return { status: 'failed', message: 'Дождитесь завершения сохранения.' }
		if (this.fileContent === null || !this.fileName.trim())
			return this.fail('Имя файла и содержимое не могут быть пустыми.')
		return this.performSave({
			folderId,
			space,
			name: this.fileName.trim(),
			content: this.sourceSnapshot ? serializeDocumentData(this.sourceSnapshot.data) : this.fileContent,
			mime: this.mimeType,
			documentId: this.documentId,
			snapshot: this.sourceSnapshot
		})
	}

	private performSave = async (
		request: SaveRequest,
		overwriteId: string | null = null,
		expectedVersion?: string
	): Promise<DocumentSaveResult> => {
		if (this.disposed) return { status: 'cancelled' }
		const context = request.snapshot
			? this.documentTabsStore.beginDocumentOperation(request.snapshot.documentId, 'saving', request.snapshot)
			: null
		if (request.documentId && !context) {
			this.complete({ status: 'cancelled' })
			return { status: 'cancelled' }
		}
		this.isSaving = true
		this.error = null
		try {
			if (!this.googleApiService.isGoogleLoggedIn) await this.googleApiService.logIn()
			if (this.disposed) return { status: 'cancelled' }
			if (context && !this.documentTabsStore.isDocumentOperationCurrent(context)) {
				this.complete({ status: 'cancelled' })
				return { status: 'cancelled' }
			}
			if (!this.googleApiService.isGoogleLoggedIn) {
				this.complete({ status: 'cancelled' })
				return { status: 'cancelled' }
			}
			const result = await this.googleApiService.saveFile(
				request.name,
				request.content,
				request.mime,
				request.folderId,
				request.space,
				overwriteId,
				expectedVersion
			)
			return runInAction(() => {
				if (this.disposed) return { status: 'cancelled' }
				if (context && !this.documentTabsStore.isDocumentOperationCurrent(context)) {
					this.complete({ status: 'cancelled' })
					return { status: 'cancelled' }
				}
				if (result.status === 'success') {
					if (context) {
						this.documentTabsStore.markDocumentSavedToDrive(
							context,
							result.file,
							request.space === 'appDataFolder' ? 'appDataFolder' : 'drive'
						)
					}
					this.complete({ status: 'saved' })
					this.isSaving = false
					this.close()
					this.onFileSaved()
					return { status: 'saved' }
				}
				if (result.status === 'conflict') {
					this.conflictRequest = request
					this.conflictingFiles = result.existingFiles
					this.selectedConflictFileId = result.existingFiles.length === 1 ? result.existingFiles[0].id : ''
					this.newFileNameForConflict = this.generateUniqueFileName(request.name, result.existingFiles)
					this.showConflictDialog = true
					return { status: 'conflict', message: 'Файл с таким именем уже существует.' }
				}
				if (context) this.documentTabsStore.failDocumentOperation(context, new Error(result.message))
				return this.fail(result.message)
			})
		} catch (error: unknown) {
			if (this.disposed) return { status: 'cancelled' }
			if (context && !this.documentTabsStore.isDocumentOperationCurrent(context)) {
				this.complete({ status: 'cancelled' })
				return { status: 'cancelled' }
			}
			if (context) this.documentTabsStore.failDocumentOperation(context, error)
			if (error instanceof GoogleLoginCancelledError) {
				return runInAction(() => {
					this.complete({ status: 'cancelled' })
					return { status: 'cancelled' }
				})
			}
			return runInAction(() =>
				this.fail(error instanceof Error ? error.message : 'Не удалось сохранить файл на Google Drive.')
			)
		} finally {
			if (context) this.documentTabsStore.finishDocumentOperation(context)
			runInAction(() => {
				this.isSaving = false
			})
		}
	}

	/** Завершить ожидающий диалог, не подтверждая незавершённую сетевую запись. */
	dispose = () => {
		this.disposed = true
		this.isSaving = false
		this.close()
	}

	resolveConflict = async (resolution: 'overwrite' | 'rename' | 'cancel'): Promise<DocumentSaveResult> => {
		if (this.isSaving) return { status: 'failed', message: 'Дождитесь завершения сохранения.' }
		if (resolution === 'cancel') {
			this.closeConflictDialog()
			return { status: 'cancelled' }
		}
		// Решение и адрес назначения захватываются до очистки диалога.
		const request = this.conflictRequest
		const newName = this.newFileNameForConflict.trim()
		const selectedId = this.selectedConflictFileId
		const selectedVersion = this.conflictingFiles.find(file => file.id === selectedId)?.version
		if (!request) return this.fail('Нет конфликта для разрешения.')
		if (resolution === 'rename' && !newName) return this.fail('Новое имя файла не может быть пустым.')
		if (resolution === 'overwrite' && !this.conflictingFiles.some(file => file.id === selectedId)) {
			return this.fail('Выберите файл для перезаписи.')
		}
		this.resetConflictState()
		if (resolution === 'rename') {
			this.fileName = newName
			return this.performSave({ ...request, name: newName })
		}
		return this.performSave(request, selectedId, selectedVersion)
	}

	private complete = (result: DocumentSaveResult) => {
		const completion = this.completion
		this.completion = null
		completion?.(result)
	}

	private fail = (message: string): DocumentSaveResult => {
		this.error = message
		const result: DocumentSaveResult = { status: 'failed', message }
		this.complete(result)
		return result
	}

	private resetConflictState = () => {
		this.showConflictDialog = false
		this.conflictingFiles = []
		this.selectedConflictFileId = ''
		this.newFileNameForConflict = ''
		this.conflictRequest = null
	}

	private generateUniqueFileName = (originalName: string, existingFiles: DriveFileMetadata[]): string => {
		const dot = originalName.lastIndexOf('.')
		const base = dot > 0 ? originalName.slice(0, dot) : originalName
		const extension = dot > 0 ? originalName.slice(dot) : ''
		let name = originalName
		let counter = 1
		while (existingFiles.some(file => file.name === name)) name = `${base} (${counter++})${extension}`
		return name
	}
}
