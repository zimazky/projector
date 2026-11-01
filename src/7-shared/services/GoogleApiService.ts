import GAPI, { DriveFileMetadata, DRIVE_DOCUMENT_FIELDS, driveQueryLiteral } from './gapi'
import { driveErrorCode, driveErrorMessage } from './DriveApiError'
import { makeAutoObservable, runInAction } from 'mobx'

export type SaveFileResult =
	| { status: 'success'; file: DriveFileMetadata }
	| { status: 'conflict'; existingFiles: DriveFileMetadata[] }
	| { status: 'error'; message: string }

/**
 * Сервис для инкапсуляции логики взаимодействия с Google API.
 * Управляет инициализацией GAPI, авторизацией/деавторизацией и статусом входа.
 */
export class GoogleApiService {
	isGoogleLoggedIn: boolean = false
	userName: string | null = null
	userAvatarUrl: string | null = null
	userEmail: string | null = null
	private isGapiInitStarted: boolean = false
	private gapiReadyPromise: Promise<void> | null = null
	private resolveGapiReady: (() => void) | null = null
	private rejectGapiReady: ((reason?: unknown) => void) | null = null
	private lifetime = new AbortController()

	constructor() {
		makeAutoObservable(this)
	}

	private resetGapiReadyPromise() {
		this.gapiReadyPromise = new Promise<void>((resolve, reject) => {
			this.resolveGapiReady = resolve
			this.rejectGapiReady = reject
		})
		void this.gapiReadyPromise.catch(() => {})
	}

	/**
	 * Инициализирует Google API.
	 * Устанавливает обработчики для успешной инициализации, входа и истечения токена.
	 */
	initGapi = () => {
		if (this.isGapiInitStarted || this.lifetime.signal.aborted) return
		this.isGapiInitStarted = true
		this.resetGapiReadyPromise()

		GAPI.init({
			signal: this.lifetime.signal,
			onSuccess: () => {
				if (this.lifetime.signal.aborted) return
				runInAction(() => {
					this.isGoogleLoggedIn = GAPI.isLoggedIn()
				})
				this.loadUserProfile().catch(() => {
					// ignore profile loading errors on init
				})
				this.resolveGapiReady?.()
			},
			onFailure: () => {
				if (this.lifetime.signal.aborted) return
				this.isGapiInitStarted = false
				this.rejectGapiReady?.(new Error('Failed to initialize Google API'))
			},
			onSignIn: () => {
				if (this.lifetime.signal.aborted) return
				runInAction(() => {
					this.isGoogleLoggedIn = GAPI.isLoggedIn()
					console.log('onSignIn in GoogleApiService', this.isGoogleLoggedIn)
				})
				this.loadUserProfile().catch(() => {
					// ignore profile loading errors on sign in
				})
			},
			onExpiredToken: () => {
				if (this.lifetime.signal.aborted) return
				runInAction(() => {
					this.isGoogleLoggedIn = false
					this.userName = null
					this.userAvatarUrl = null
					this.userEmail = null
				})
			}
		})
	}

	/** Освободить загрузчики и OAuth-ожидания без отзыва выданного разрешения. */
	dispose = () => {
		if (this.lifetime.signal.aborted) return
		this.lifetime.abort()
		this.rejectGapiReady?.(new Error('Google API service disposed'))
		this.resolveGapiReady = null
		this.rejectGapiReady = null
	}

	/** Дождаться завершения инициализации GAPI */
	waitForGapiReady = async () => {
		if (!this.gapiReadyPromise) {
			throw new Error('GAPI initialization has not been started')
		}
		await this.gapiReadyPromise
	}

	/**
	 * Авторизоваться в Google сервисах.
	 * @returns Promise<void>
	 */
	logIn = async () => {
		if (this.lifetime.signal.aborted) throw new Error('Google API service disposed')
		if (!this.isGapiInitStarted) this.initGapi()
		await this.waitForGapiReady()
		await GAPI.logIn()
		if (this.lifetime.signal.aborted) return
		runInAction(() => {
			this.isGoogleLoggedIn = GAPI.isLoggedIn()
		})
		await this.loadUserProfile()
	}

	/**
	 * Разлогиниться в Google.
	 */
	logOut = () => {
		GAPI.logOut()
		runInAction(() => {
			this.isGoogleLoggedIn = false
			this.userName = null
			this.userAvatarUrl = null
			this.userEmail = null
		})
	}

	/** Загрузить профиль текущего пользователя Google (имя и аватар). */
	private async loadUserProfile() {
		if (!this.isGoogleLoggedIn) return
		try {
			const info = await GAPI.getUserInfo()
			if (this.lifetime.signal.aborted) return
			runInAction(() => {
				this.userName = info.name ?? null
				this.userAvatarUrl = info.picture ?? null
				this.userEmail = info.email ?? null
			})
		} catch {
			console.error('Failed to load Google user profile')
		}
	}

	/**
	 * Проверяет, авторизован ли пользователь в Google.
	 * @returns boolean
	 */
	isLoggedIn = (): boolean => {
		return GAPI.isLoggedIn()
	}

	/**
	 * Получает содержимое указанной папки Google Drive.
	 * Если пользователь не авторизован, попытается авторизоваться.
	 * @param folderId ID папки для получения содержимого. По умолчанию 'root'.
	 * @returns Promise с массивом метаданных файлов.
	 */
	async listDriveFolderContents(
		folderId: string = 'root',
		fields: string = 'id, name, mimeType, parents, iconLink, webViewLink',
		spaces: string = 'drive'
	): Promise<DriveFileMetadata[]> {
		if (!this.isGoogleLoggedIn) {
			await this.logIn()
			if (!this.isGoogleLoggedIn) {
				throw new Error('User not logged in to Google.')
			}
		}
		return GAPI.listFolderContents(folderId, fields, spaces)
	}

	/**
	 * Получает метаданные файла или папки по его ID.
	 * Если пользователь не авторизован, попытается авторизоваться.
	 * @param fileId ID файла или папки.
	 * @returns Promise с метаданными файла.
	 */
	async getFileMetadata(fileId: string): Promise<DriveFileMetadata> {
		if (!this.isGoogleLoggedIn) {
			await this.logIn()
			if (!this.isGoogleLoggedIn) {
				throw new Error('User not logged in to Google.')
			}
		}
		return GAPI.getFileMetadata(fileId)
	}

	/**
	 * Получает контент файла Google Drive по ID.
	 * Возвращает либо объект (если JSON распарсился), либо строку.
	 */
	async downloadFileContent(fileId: string): Promise<unknown> {
		if (!this.isGoogleLoggedIn) {
			await this.logIn()
			if (!this.isGoogleLoggedIn) {
				throw new Error('User not logged in to Google.')
			}
		}
		return GAPI.download(fileId)
	}

	async createFolder(name: string, parentFolderId: string): Promise<DriveFileMetadata> {
		if (!this.isGoogleLoggedIn) {
			await this.logIn()
			if (!this.isGoogleLoggedIn) {
				throw new Error('User not logged in to Google.')
			}
		}
		return GAPI.createFileOrFolder(name, 'application/vnd.google-apps.folder', [parentFolderId])
	}

	async deleteItem(itemId: string): Promise<boolean> {
		if (!this.isGoogleLoggedIn) {
			await this.logIn()
			if (!this.isGoogleLoggedIn) {
				throw new Error('User not logged in to Google.')
			}
		}
		return GAPI.deleteFile(itemId)
	}

	/** Обычное сохранение обновляет текущий fileId только по проверенной версии и ETag. */
	async updateFileContent(
		fileId: string,
		content: string,
		mimeType: string,
		expectedVersion: string,
		isCurrent: () => boolean = () => true
	): Promise<SaveFileResult> {
		if (!this.isGoogleLoggedIn) await this.logIn()
		if (!this.isGoogleLoggedIn) return { status: 'error', message: 'Войдите в Google для сохранения.' }
		let writing = false
		try {
			if (!isCurrent()) return { status: 'error', message: 'Операция сохранения отменена.' }
			if (!fileId || !/^\d+$/.test(expectedVersion)) throw new Error('Нет проверенной версии для сохранения.')
			const condition = await GAPI.getFileWriteCondition(fileId)
			if (!isCurrent()) return { status: 'error', message: 'Операция сохранения отменена.' }
			if (condition.file.version !== expectedVersion) return { status: 'conflict', existingFiles: [condition.file] }
			writing = true
			const updated = await GAPI.updateDocument(fileId, content, mimeType, condition)
			if (
				updated.id !== fileId ||
				!updated.version ||
				!/^\d+$/.test(updated.version) ||
				BigInt(updated.version) <= BigInt(expectedVersion) ||
				updated.trashed
			)
				throw new Error('Drive не подтвердил новую версию исходного файла.')
			return { status: 'success', file: updated }
		} catch (error: unknown) {
			if (driveErrorCode(error) === 412) {
				try {
					return { status: 'conflict', existingFiles: [await this.getFileMetadata(fileId)] }
				} catch {
					return {
						status: 'error',
						message: 'Файл Drive изменился во время сохранения. Обновление отклонено; повторите проверку.'
					}
				}
			}
			return {
				status: 'error',
				message: writing
					? 'Результат сохранения не подтверждён. Локальные данные сохранены; проверьте Drive перед повтором. ' +
						driveErrorMessage(error)
					: driveErrorMessage(error)
			}
		}
	}

	/** «Сохранить как» создаёт отдельный файл, включая явный выбор версии при конфликте имени. */
	async saveFile(
		name: string,
		content: string | Blob,
		mimeType: string,
		parentFolderId: string,
		spaces = 'drive',
		sourceId: string | null = null,
		expectedVersion?: string
	): Promise<SaveFileResult> {
		if (!this.isGoogleLoggedIn) await this.logIn()
		if (!this.isGoogleLoggedIn) return { status: 'error', message: 'Войдите в Google для сохранения.' }
		try {
			let source: DriveFileMetadata | undefined
			if (sourceId) {
				source = await this.getFileMetadata(sourceId)
				if (
					source.id !== sourceId ||
					typeof source.version !== 'string' ||
					!/^\d+$/.test(source.version) ||
					source.trashed
				)
					throw new Error('Не удалось подтвердить версию исходного файла.')
				if (source.version !== expectedVersion) return { status: 'conflict', existingFiles: [source] }
				const dot = name.lastIndexOf('.')
				const stem = (dot > 0 ? name.slice(0, dot) : name).replace(
					/\s+\(версия \d{4}-\d{2}-\d{2}T[\d-]+Z-[a-z0-9]*\)$/,
					''
				)
				const extension = dot > 0 ? name.slice(dot) : '.json'
				name =
					stem +
					' (версия ' +
					new Date().toISOString().replace(/[:.]/g, '-') +
					'-' +
					Math.random().toString(36).slice(2, 8) +
					')' +
					extension
			} else {
				const existing = await GAPI.find(
					'name = ' + driveQueryLiteral(name),
					parentFolderId,
					DRIVE_DOCUMENT_FIELDS,
					spaces
				)
				if (existing.length) return { status: 'conflict', existingFiles: existing }
			}
			const folder = spaces === 'appDataFolder' && parentFolderId === 'root' ? 'appDataFolder' : parentFolderId
			const created = await GAPI.createDocument(name, content, mimeType, [folder], source)
			if (
				!created.id ||
				typeof created.version !== 'string' ||
				!/^\d+$/.test(created.version) ||
				created.id === sourceId
			) {
				throw new Error(
					'Файл отправлен, но Drive не подтвердил новую версию. Локальные данные сохранены; проверьте папку Drive перед повтором.'
				)
			}
			return { status: 'success', file: created }
		} catch (error: unknown) {
			return { status: 'error', message: driveErrorMessage(error) }
		}
	}
}
