import { GoogleLoginCancelledError } from './GoogleAuthError'
import { driveErrorCode, driveErrorMessage } from './DriveApiError'

export const GOOGLE_LOGIN_TIMEOUT_MS = 120000
const GOOGLE_INIT_TIMEOUT_MS = 15000

/** Литерал Drive q: экранирование до URL-кодирования клиентской библиотекой. */
export function driveQueryLiteral(value: string): string {
	return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
}

export const DRIVE_DOCUMENT_FIELDS =
	'id,name,mimeType,parents,iconLink,webViewLink,modifiedTime,version,headRevisionId,md5Checksum,trashed'

export const DRIVE_WRITE_FIELDS =
	'id,title,mimeType,parents(id),alternateLink,modifiedDate,version,headRevisionId,md5Checksum,labels(trashed),etag'

export type DriveWriteCondition = Readonly<{ file: DriveFileMetadata; etag: string }>

export function isStrongDriveEtag(value: unknown): value is string {
	return typeof value === 'string' && /^"[\x21\x23-\x7e]+"$/.test(value)
}

/** v2 используется только для условной записи; доменная модель продолжает читать v3. */
function parseWriteMetadata(value: unknown, fileId: string): DriveWriteCondition {
	const raw = value as {
		id?: string
		title?: string
		mimeType?: string
		version?: string
		etag?: string
		parents?: { id?: string }[]
		alternateLink?: string
		modifiedDate?: string
		headRevisionId?: string
		md5Checksum?: string
		labels?: { trashed?: boolean }
	} | null
	if (
		!raw ||
		raw.id !== fileId ||
		!raw.title ||
		!raw.mimeType ||
		raw.labels?.trashed ||
		typeof raw.version !== 'string' ||
		!/^\d+$/.test(raw.version) ||
		!isStrongDriveEtag(raw.etag)
	)
		throw new Error('Drive не подтвердил версию и ETag файла. Сохранение не подтверждено.')
	return Object.freeze({
		etag: raw.etag,
		file: {
			id: raw.id,
			name: raw.title,
			mimeType: raw.mimeType,
			version: raw.version,
			parents: raw.parents?.map(parent => parent.id!).filter(Boolean),
			webViewLink: raw.alternateLink,
			modifiedTime: raw.modifiedDate,
			headRevisionId: raw.headRevisionId,
			md5Checksum: raw.md5Checksum,
			trashed: raw.labels?.trashed
		}
	})
}

const CLIENT_ID: string = process.env.CLIENT_ID ?? ''

const SCOPES = [
	'https://www.googleapis.com/auth/drive.file',
	'https://www.googleapis.com/auth/drive.readonly',
	'https://www.googleapis.com/auth/drive.appfolder',
	'https://www.googleapis.com/auth/userinfo.profile',
	'https://www.googleapis.com/auth/userinfo.email'
].join(' ')
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'

/** Обертка gapi-вызова в Promise с обработкой ошибок авторизации. */
async function prom(gapiCall: (arg: any) => Promise<any>, argObj: any) {
	try {
		return await gapiCall(argObj)
	} catch (error: unknown) {
		const code = driveErrorCode(error)
		if (code === 401) {
			gapi.client.setToken(null)
			expiredTokenHandle()
		}
		throw Object.assign(new Error(driveErrorMessage(error), { cause: error }), { status: code })
	}
}

/** Загрузка скрипта с ограниченным ожиданием и очисткой обработчиков. */
function loadScriptPromise(url: string, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const script = document.createElement('script')
		const finish = (error?: Error) => {
			clearTimeout(timer)
			signal.removeEventListener('abort', abort)
			script.onload = null
			script.onerror = null
			if (error) {
				script.remove()
				reject(error)
			} else resolve()
		}
		const abort = () => finish(new Error('Загрузка Google API отменена.'))
		const timer = setTimeout(() => finish(new Error('Истекло время загрузки Google API.')), GOOGLE_INIT_TIMEOUT_MS)
		signal.addEventListener('abort', abort, { once: true })
		script.src = url
		script.async = true
		script.onerror = () => finish(new Error('Не удалось загрузить Google API.'))
		script.onload = () => finish()
		document.head.appendChild(script)
	})
}

/** Очередь ожидающих завершения текущего login-flow. */
let loginWaiters: Array<{ resolve: () => void; reject: (reason?: unknown) => void }> = []
/** Текущий in-flight промис авторизации (дедупликация параллельных logIn). */
let pendingLoginPromise: Promise<void> | null = null
let loginTimer: ReturnType<typeof setTimeout> | null = null
let loginGeneration = 0
let refreshTokenClient: (() => void) | null = null
function clearLoginTimer() {
	if (loginTimer !== null) clearTimeout(loginTimer)
	loginTimer = null
}

function resolveLoginWaiters() {
	clearLoginTimer()
	const waiters = loginWaiters
	loginWaiters = []
	waiters.forEach(w => w.resolve())
	pendingLoginPromise = null
}

function rejectLoginWaiters(reason?: unknown) {
	clearLoginTimer()
	const waiters = loginWaiters
	loginWaiters = []
	waiters.forEach(w => w.reject(reason))
	pendingLoginPromise = null
}

/** Колбэк при истечении токена. */
let expiredTokenHandle = () => {}

export interface DriveFileMetadata {
	id: string
	name: string
	mimeType: string
	parents?: string[]
	iconLink?: string
	webViewLink?: string
	modifiedTime?: string
	version?: string
	headRevisionId?: string
	md5Checksum?: string
	trashed?: boolean
}

/** Класс статических методов для работы с Google API. */
export default class GAPI {
	/** Экземпляр OAuth token client. */
	static tokenClient: google.accounts.oauth2.TokenClient

	/** Инициализация GIS + GAPI. */
	static async init({
		onSuccess = () => {},
		onFailure = () => {},
		onSignIn = () => {},
		onExpiredToken = () => {},
		signal
	}: {
		onSuccess?: () => void
		onFailure?: () => void
		onSignIn?: () => void
		onExpiredToken?: () => void
		signal?: AbortSignal
	}) {
		if (signal?.aborted) return
		expiredTokenHandle = onExpiredToken
		const controller = new AbortController()
		let ownedRefresh: (() => void) | null = null
		const abort = () => {
			controller.abort()
			if (ownedRefresh && refreshTokenClient === ownedRefresh) {
				++loginGeneration
				rejectLoginWaiters(new GoogleLoginCancelledError())
				refreshTokenClient = null
				GAPI.tokenClient = undefined as unknown as google.accounts.oauth2.TokenClient
			}
			if (expiredTokenHandle === onExpiredToken) expiredTokenHandle = () => {}
		}
		signal?.addEventListener('abort', abort, { once: true })
		try {
			await Promise.all([
				loadScriptPromise('https://accounts.google.com/gsi/client', controller.signal),
				loadScriptPromise('https://apis.google.com/js/api.js', controller.signal)
			])
			if (controller.signal.aborted) return
			refreshTokenClient = () => {
				const generation = loginGeneration
				const current = () => !signal?.aborted && pendingLoginPromise !== null && generation === loginGeneration
				const tokenConfig: google.accounts.oauth2.TokenClientConfig & {
					error_callback: (error: { type: string }) => void
				} = {
					client_id: CLIENT_ID,
					scope: SCOPES,
					prompt: '',
					callback: tokenResponse => {
						if (!current()) return
						if (tokenResponse?.error) {
							rejectLoginWaiters(
								tokenResponse.error === 'access_denied'
									? new GoogleLoginCancelledError()
									: new Error('Не удалось войти в Google.')
							)
							return
						}
						if (!tokenResponse?.access_token) {
							rejectLoginWaiters(new Error('Google не вернул токен входа.'))
							return
						}
						gapi.client.setToken(tokenResponse)
						try {
							onSignIn()
							resolveLoginWaiters()
						} catch {
							rejectLoginWaiters(new Error('Не удалось завершить вход в Google.'))
						}
					},
					error_callback: error => {
						if (!current()) return
						rejectLoginWaiters(
							error.type === 'popup_closed'
								? new GoogleLoginCancelledError()
								: new Error('Не удалось открыть окно входа в Google.')
						)
					}
				}
				GAPI.tokenClient = google.accounts.oauth2.initTokenClient(tokenConfig)
			}
			ownedRefresh = refreshTokenClient
			refreshTokenClient()
			let initTimer: ReturnType<typeof setTimeout> | undefined
			let active = true
			let cancelInit: () => void = () => {}
			try {
				await new Promise<void>((resolve, reject) => {
					cancelInit = () => {
						active = false
						reject(new Error('Google API initialization cancelled'))
					}
					controller.signal.addEventListener('abort', cancelInit, { once: true })
					initTimer = setTimeout(() => {
						active = false
						reject(new Error('Истекло время инициализации Google API.'))
					}, GOOGLE_INIT_TIMEOUT_MS)
					gapi.load('client', () => {
						if (!active) return
						Promise.resolve()
							.then(() => {
								if (active) return gapi.client.init({ apiKey: getKey(), discoveryDocs: [DISCOVERY_DOC] })
							})
							.then(() => resolve(), reject)
					})
				})
			} finally {
				active = false
				clearTimeout(initTimer)
				controller.signal.removeEventListener('abort', cancelInit)
			}
			if (!signal?.aborted) onSuccess()
		} catch (_) {
			signal?.removeEventListener('abort', abort)
			abort()
			if (!signal?.aborted) onFailure()
		} finally {
			controller.abort()
		}
	}

	/**
	 * Запрос токена авторизации.
	 * Параллельные вызовы используют один общий in-flight промис.
	 */
	static logIn(prompt = '') {
		if (!GAPI.tokenClient) {
			return Promise.reject(new Error('Google token client is not initialized'))
		}

		if (pendingLoginPromise) {
			return pendingLoginPromise
		}

		const generation = ++loginGeneration
		const loginPromise = new Promise<void>((resolve, reject) => {
			loginWaiters.push({ resolve, reject })
		})
		pendingLoginPromise = loginPromise
		loginTimer = setTimeout(() => {
			if (generation === loginGeneration)
				rejectLoginWaiters(new Error('Истекло время входа в Google. Повторите попытку.'))
		}, GOOGLE_LOGIN_TIMEOUT_MS)
		try {
			refreshTokenClient?.()
			GAPI.tokenClient.requestAccessToken({ prompt })
		} catch {
			rejectLoginWaiters(new Error('Не удалось открыть окно входа в Google.'))
		}
		return loginPromise
	}

	/** Отзыв токена и выход из аккаунта. */
	static logOut() {
		rejectLoginWaiters(new GoogleLoginCancelledError())
		const token = gapi.client.getToken()
		if (token !== null) {
			google.accounts.oauth2.revoke(token.access_token, () => {
				gapi.client.setToken(null)
			})
		}
	}

	/** Проверка, авторизован ли пользователь. */
	static isLoggedIn() {
		const token = gapi.client.getToken()
		return token !== null
	}

	/** Проверка выданных приложению scope-разрешений. */
	static isGranted(scope: string, ...scopes: string[]) {
		return google.accounts.oauth2.hasGrantedAllScopes(
			gapi.client.getToken() as google.accounts.oauth2.TokenResponse,
			scope,
			...scopes
		)
	}

	/** Получение информации о текущем пользователе (профиль Google). */
	static async getUserInfo(): Promise<{ name?: string; picture?: string; email?: string }> {
		const token = gapi.client.getToken()
		if (!token || !token.access_token) {
			throw new Error('Google access token is not available')
		}

		const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
			headers: {
				Authorization: `Bearer ${token.access_token}`
			}
		})

		if (!response.ok) {
			throw new Error('Failed to fetch user info')
		}

		const data = (await response.json()) as { name?: string; picture?: string; email?: string }
		return data
	}

	static async createFileOrFolder(name: string, mimeType: string = 'text/plain', parents: string[]) {
		const resp = await prom(gapi.client.drive.files.create, {
			resource: {
				name: name,
				mimeType: mimeType,
				parents: parents
			},
			fields: 'id, name, mimeType, parents, iconLink, webViewLink'
		})
		return resp.result as DriveFileMetadata
	}

	/** Атомарное создание отдельного файла с полным содержимым, без PATCH исходного файла. */
	static async createDocument(
		name: string,
		content: string | Blob,
		mimeType: string,
		parents: string[],
		source?: DriveFileMetadata
	): Promise<DriveFileMetadata> {
		const text = typeof content === 'string' ? content : await content.text()
		const boundary = 'projector_' + Date.now().toString(36) + Math.random().toString(36).slice(2)
		const metadata = {
			name,
			mimeType,
			parents,
			...(source
				? { appProperties: { projectorSourceFileId: source.id, projectorSourceVersion: source.version! } }
				: {})
		}
		const body =
			'--' +
			boundary +
			'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
			JSON.stringify(metadata) +
			'\r\n--' +
			boundary +
			'\r\nContent-Type: ' +
			mimeType +
			'\r\n\r\n' +
			text +
			'\r\n--' +
			boundary +
			'--'
		const response = await prom(gapi.client.request, {
			path: '/upload/drive/v3/files',
			method: 'POST',
			params: { uploadType: 'multipart', fields: DRIVE_DOCUMENT_FIELDS },
			headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
			body
		})
		return response.result as DriveFileMetadata
	}

	/** Версия и условие получены одним ответом, не из разных ревизий. */
	static async getFileWriteCondition(fileId: string): Promise<DriveWriteCondition> {
		const response = await prom(gapi.client.request, {
			path: `/drive/v2/files/${encodeURIComponent(fileId)}`,
			method: 'GET',
			params: { fields: DRIVE_WRITE_FIELDS, supportsAllDrives: true, updateViewedDate: false }
		})
		return parseWriteMetadata(response.result, fileId)
	}

	/** Без сильного ETag обновление не отправляется. Безусловного пути и повторов нет. */
	static async updateDocument(
		fileId: string,
		content: string,
		mimeType: string,
		condition: DriveWriteCondition
	): Promise<DriveFileMetadata> {
		if (condition.file.id !== fileId || !isStrongDriveEtag(condition.etag))
			throw new Error('Нет действующего условия записи Drive.')
		const response = await prom(gapi.client.request, {
			path: `/upload/drive/v2/files/${encodeURIComponent(fileId)}`,
			method: 'PUT',
			params: {
				uploadType: 'media',
				fields: DRIVE_WRITE_FIELDS,
				supportsAllDrives: true,
				newRevision: true,
				updateViewedDate: false
			},
			headers: { 'Content-Type': mimeType, 'If-Match': condition.etag },
			body: content
		})
		return parseWriteMetadata(response.result, fileId).file
	}

	/** Чтение содержимого файла по fileId. */
	static async download(fileId: string) {
		const resp = await prom(gapi.client.drive.files.get, {
			fileId: fileId,
			alt: 'media'
		})
		return resp.result || resp.body
	}

	/** Поиск файлов и папок по query в указанном пространстве Drive. */
	static async find(
		query: string,
		folderId: string | null = null,
		fields: string = 'id, name, mimeType, parents, iconLink, webViewLink',
		spaces: string = 'drive'
	): Promise<DriveFileMetadata[]> {
		let ret: DriveFileMetadata[] = []
		let token: string | undefined

		const effectiveQueryParts: string[] = ['trashed = false']

		if (folderId) {
			effectiveQueryParts.unshift(driveQueryLiteral(folderId) + ' in parents')
		}

		if (query) {
			effectiveQueryParts.push(`(${query})`)
		}
		const effectiveQuery = effectiveQueryParts.join(' and ')

		do {
			const resp = await prom(gapi.client.drive.files.list, {
				q: effectiveQuery,
				spaces: spaces,
				fields: `nextPageToken, files(${fields})`,
				pageSize: 100,
				pageToken: token,
				orderBy: 'folder,name asc'
			})
			if (resp.result && resp.result.files) {
				ret = ret.concat(resp.result.files as DriveFileMetadata[])
			}
			token = resp.result.nextPageToken
		} while (token)

		return ret
	}

	/** Получение содержимого папки. */
	static async listFolderContents(
		folderId: string = 'root',
		fields: string = 'id, name, mimeType, parents, iconLink, webViewLink',
		spaces: string = 'drive'
	): Promise<DriveFileMetadata[]> {
		const query = ''
		return GAPI.find(query, folderId, fields, spaces)
	}

	/** Получение метаданных файла/папки по ID. */
	static async getFileMetadata(fileId: string): Promise<DriveFileMetadata> {
		const resp = await prom(gapi.client.drive.files.get, {
			fileId: fileId,
			fields: DRIVE_DOCUMENT_FIELDS
		})
		return resp.result as DriveFileMetadata
	}

	/** Удаление файла по ID. */
	static async deleteFile(fileId: string) {
		try {
			await prom(gapi.client.drive.files.delete, { fileId: fileId })
			return true
		} catch (err: unknown) {
			if (driveErrorCode(err) === 404) return false
			throw err
		}
	}
}

function getKey(): string {
	const e = 'cn1LBTIfdmVjcV0Pf3VYSHpXXw4MDC9nIk4JDQhDE0J7WQIhGSNV'
	const de = atob(e)
	const k = process.env.OPEN_WEATHER_KEY ?? ''
	let output = ''
	for (let i = 0; i < de.length; i++) {
		const charCode = de.charCodeAt(i) ^ k.charCodeAt(i % k.length)
		output += String.fromCharCode(charCode)
	}
	return output
}
