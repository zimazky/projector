import { GoogleLoginCancelledError } from './GoogleAuthError'
import { driveErrorCode, driveErrorMessage } from './DriveApiError'

export const DRIVE_DOCUMENT_FIELDS =
	'id,name,mimeType,parents,iconLink,webViewLink,modifiedTime,version,headRevisionId,md5Checksum,trashed'

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
		throw new Error(driveErrorMessage(error), { cause: error })
	}
}

/** Загрузка внешнего скрипта через Promise. */
function loadScriptPromise(url: string) {
	return new Promise((resolve, reject) => {
		const script = document.createElement('script')
		script.src = url
		script.async = true
		script.onerror = reject
		script.onload = resolve
		document.head.appendChild(script)
	})
}

/** Очередь ожидающих завершения текущего login-flow. */
let loginWaiters: Array<{ resolve: () => void; reject: (reason?: unknown) => void }> = []
/** Текущий in-flight промис авторизации (дедупликация параллельных logIn). */
let pendingLoginPromise: Promise<void> | null = null

function resolveLoginWaiters() {
	const waiters = loginWaiters
	loginWaiters = []
	waiters.forEach(w => w.resolve())
	pendingLoginPromise = null
}

function rejectLoginWaiters(reason?: unknown) {
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
	static async init({ onSuccess = () => {}, onFailure = () => {}, onSignIn = () => {}, onExpiredToken = () => {} }) {
		expiredTokenHandle = onExpiredToken
		try {
			const _gsi = loadScriptPromise('https://accounts.google.com/gsi/client')
			const _gapi = loadScriptPromise('https://apis.google.com/js/api.js')
			await _gsi

			// error_callback поддерживается GIS, но отсутствует в установленных старых типах.
			const tokenConfig: google.accounts.oauth2.TokenClientConfig & {
				error_callback: (error: { type: string }) => void
			} = {
				client_id: CLIENT_ID,
				scope: SCOPES,
				prompt: '',
				callback: tokenResponse => {
					if (tokenResponse?.error) {
						rejectLoginWaiters(
							tokenResponse.error === 'access_denied'
								? new GoogleLoginCancelledError()
								: new Error('Не удалось войти в Google.')
						)
						return
					}
					onSignIn()
					resolveLoginWaiters()
				},
				error_callback: error =>
					rejectLoginWaiters(
						error.type === 'popup_closed'
							? new GoogleLoginCancelledError()
							: new Error('Не удалось открыть окно входа в Google.')
					)
			}
			GAPI.tokenClient = google.accounts.oauth2.initTokenClient(tokenConfig)
			console.log('gis inited')
			await _gapi
			gapi.load('client', () => {
				gapi.client
					.init({
						apiKey: getKey(),
						discoveryDocs: [DISCOVERY_DOC]
					})
					.then(() => {
						console.log('gapi inited')
						onSuccess()
					})
					.catch(() => {
						console.log('gapi init error')
						onFailure()
					})
			})
		} catch (_) {
			console.log('error gapi or gis load')
			onFailure()
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

		const loginPromise = new Promise<void>((resolve, reject) => {
			loginWaiters.push({ resolve, reject })
		})
		pendingLoginPromise = loginPromise
		try {
			GAPI.tokenClient.requestAccessToken({ prompt })
		} catch {
			rejectLoginWaiters(new Error('Не удалось открыть окно входа в Google.'))
		}
		return loginPromise
	}

	/** Отзыв токена и выход из аккаунта. */
	static logOut() {
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

	/** Запись контента в файл по его fileId. */
	static async upload(fileId: string, content: string | object) {
		return prom(gapi.client.request, {
			path: `/upload/drive/v3/files/${fileId}`,
			method: 'PATCH',
			params: { uploadType: 'media' },
			body: typeof content === 'string' ? content : JSON.stringify(content)
		})
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
			effectiveQueryParts.unshift(`'${folderId}' in parents`)
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
		} catch (err: any) {
			if (err.status === 404) return false
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
