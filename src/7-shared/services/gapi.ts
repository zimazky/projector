const API_KEY: string = process.env.API_KEY ?? ''
const CLIENT_ID: string = process.env.CLIENT_ID ?? ''

const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.appfolder'
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'

/** Хелпер-функция, оборачиваюая в Promise вызовы Google API */
function prom(gapiCall: (arg: any)=>Promise<any>, argObj: any) {
  return new Promise<any>((resolve, reject) => {
    gapiCall(argObj)
    .then(resp => resolve(resp))
    .catch(err => {
      console.log('GAPI call failed', err)
      if(err.result.error.code == 401 || (err.result.error.code == 403) && (err.result.error.status == "PERMISSION_DENIED")) {
        console.log('401 denied')
        gapi.client.setToken(null) // Сброс токена
        expiredTokenHandle()
        reject(err)
      } else reject(err)
    })
  })
}

/** Promise-функция загрузки скрипта */
function loadScriptPromise(url: string) {
  return new Promise((resolve, reject)=>{
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.onerror = reject
    script.onload = resolve
    document.head.appendChild(script)
  })
}

/** Обработчик события ауторизации пользователя */
let onLogIn = (value?: unknown)=>{}

let expiredTokenHandle = ()=>{}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  iconLink?: string;
  webViewLink?: string;
}

/** Класс статических методов для работы с Google API */
export default class GAPI {
  /** Экземпляр клиента, для запроса на аутентификацию */
  static tokenClient: google.accounts.oauth2.TokenClient

  /** Асинхронная функция инициализации модулей Google API */
  static async init({onSuccess = ()=>{}, onFailure = ()=>{}, onSignIn = ()=>{}, onExpiredToken = ()=>{}}) {
    expiredTokenHandle = onExpiredToken
    try {
      const _gsi = loadScriptPromise('https://accounts.google.com/gsi/client')
      const _gapi = loadScriptPromise('https://apis.google.com/js/api.js')
      await _gsi
      GAPI.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        prompt: '',
        callback: (tokenResponse) => {
          console.log('tokenResponse', tokenResponse)
          onSignIn()
          onLogIn()
        }
      })
      console.log('gis inited')
      await _gapi
      gapi.load('client', ()=>{
        gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: [DISCOVERY_DOC],
          // NOTE: OAuth2 'scope' and 'client_id' parameters have moved to initTokenClient().
        })
        .then(function() {
          console.log('gapi inited')
          onSuccess()
        })
        .catch(()=>{
          console.log('gapi init error')
          onFailure()
        })
      })
    }
    catch(error) {
      console.log('error gapi or gis load')
      onFailure()
    }
  }

  /** Функция-промис авторизации в системе Google, делает запрос токена авторизации*/
  static logIn(prompt = '') {
    return new Promise((resolve, reject)=>{
      GAPI.tokenClient?.requestAccessToken({prompt})
      onLogIn = resolve
    })
  }

  /** Функция отзыва токена ауторизации */
  static logOut() {
    const token = gapi.client.getToken()
    if (token !== null) {
      google.accounts.oauth2.revoke(token.access_token,()=>{
        console.log('revoke', token.access_token)
        gapi.client.setToken(null)
      })
    }
  }

  /** Функция проверки ауторизации в системе Google*/
  static isLoggedIn() {
    const token = gapi.client.getToken()
    return token !== null
  }

  /** Функция проверки выданных приложению разрешений тем, которые перечислены в параметрах scope и scopes */
  static isGranted(scope: string, ...scopes: string[]) {
    return google.accounts.oauth2.hasGrantedAllScopes(gapi.client.getToken() as google.accounts.oauth2.TokenResponse, scope, ...scopes)
  }

  /** Создание файла в папке приложения appDataFolder */
  static async createEmptyFile(name: string, mimeType: string = 'text/plain') {
    const resp = await prom(gapi.client.drive.files.create, {
      resource: {
        name: name,
        // для создания папки используйте
        // mimeType = 'application/vnd.google-apps.folder'
        mimeType: mimeType,
        // вместо 'appDataFolder' можно использовать ID папки
        parents: ['appDataFolder']
      },
      fields: 'id'
    })
    // функция возвращает строку — идентификатор нового файла
    return resp.result.id
  }

  /** Запись содержимого content в файл, заданный идентификатором fileId */
  static async upload(fileId: string, content: string | object) {
    // функция принимает либо строку, либо объект, который можно сериализовать в JSON
    return prom(gapi.client.request, {
      path: `/upload/drive/v3/files/${fileId}`,
      method: 'PATCH',
      params: {uploadType: 'media'},
      body: typeof content === 'string' ? content : JSON.stringify(content)
    })
  }

  /** Получение содержимого файла, заданного идентификатором fileId */
  static async download(fileId: string) {
    const resp = await prom(gapi.client.drive.files.get, {
      fileId: fileId,
      alt: 'media'
    })
    // resp.body хранит ответ в виде строки
    // resp.result — это попытка интерпретировать resp.body как JSON.
    // Если она провалилась, значение resp.result будет false
    // Т.о. функция возвращает либо объект, либо строку
    return resp.result || resp.body
  }

  /** Получение списка файлов, соответствующих запросу query */
  static async find(
    query: string,
    folderId: string | null = null, // null означает не фильтровать по родителям
    fields: string = 'id, name, mimeType, parents, iconLink, webViewLink', // Default fields without 'files()' wrapper
    spaces: string = 'drive' // По умолчанию искать в основном диске пользователя
  ): Promise<DriveFileMetadata[]> {
    let ret: DriveFileMetadata[] = []
    let token: string | undefined

    // Build the effective query string
    let effectiveQueryParts: string[] = ['trashed = false']; // Always filter out trashed files

    if (folderId) {
      effectiveQueryParts.unshift(`'${folderId}' in parents`); // 'in parents' clause should usually come first
    }

    if (query) {
      effectiveQueryParts.push(`(${query})`); // Add additional query if present
    }
    const effectiveQuery = effectiveQueryParts.join(' and ');

    // Determine the final 'spaces' parameter
    // If folderId is 'root', force spaces to 'drive'. Otherwise, use provided 'spaces' or 'drive'.
    const finalSpaces = (folderId === 'root' || folderId === null) ? 'drive' : spaces;

    do {
      const resp = await prom(gapi.client.drive.files.list, {
        q: effectiveQuery,
        spaces: finalSpaces, // Use the dynamically determined spaces
        fields: `nextPageToken, files(${fields})`, // Explicitly wrap fields with 'files()'
        pageSize: 100,
        pageToken: token,
        orderBy: 'folder,name asc' // Сортировка сначала папки, потом по имени
      })
      ret = ret.concat(resp.result.files as DriveFileMetadata[])
      token = resp.result.nextPageToken
    } while (token)
    return ret
  }

  /** Получение содержимого папки */
  static async listFolderContents(
    folderId: string = 'root',
    fields: string = 'id, name, mimeType, parents, iconLink, webViewLink' // Pass the same raw fields
  ): Promise<DriveFileMetadata[]> {
    const query = ''; // Пустой запрос, если нужно просто получить все
    return GAPI.find(query, folderId, fields);
  }

  /** Получение метаданных файла или папки по его ID */
  static async getFileMetadata(fileId: string): Promise<DriveFileMetadata> {
    const resp = await prom(gapi.client.drive.files.get, {
      fileId: fileId,
      fields: 'id, name, mimeType, parents, iconLink, webViewLink'
    });
    return resp.result as DriveFileMetadata;
  }

  /** Удаление файла */
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

/*

///////////////////////////////////////////////////////////////////////////////
// Пример синхронизации данных

// Интервал между синхронизациями конфига
const SYNC_PERIOD = 1000 * 60 * 3     // 3 минуты
// Конфигурация по умолчанию
const DEFAULT_CONFIG = {
    // ...
}

// храним ID таймера синхронизации, чтобы иметь возможность его сбросить
let configSyncTimeoutId

async function getConfigFileId() {
    // берем configFileId
    let configFileId = localStorage.getItem('configFileId')
    if (!configFileId) {
        // ищем нужный файл на Google Drive
        const configFiles = await find('name = "config.json"')
        if (configFiles.length > 0) {
            // берем первый (раньше всех созданный) файл
            configFileId = configFiles[0].id
        } else {
            // создаем новый
            configFileId = await createEmptyFile('config.json')
        }
        // сохраняем ID
        localStorage.setItem('configFileId', configFileId)
    }
    return configFileId
}

async function onSignIn() {
    // обработчик события логина/логаута (см. выше)
    if (isLoggedIn()) {
        // пользователь зашел
        // шедулим (как это по-русски?) немедленную синхронизацию конфига
        scheduleConfigSync(0)
    } else {
        // пользователь вышел
        // в следующий раз пользователь может зайти под другим аккаунтом
        // поэтому забываем config file ID
        localStorage.removeItem('configFileId')
        // в localStorage лежит актуальный конфиг, дальше пользуемся им
    }
}

function getConfig() {
    let ret
    try {
        ret = JSON.parse(localStorage.getItem('config'))
    } catch(e) {}
    // если сохраненного конфига нет, возвращаем копию дефолтного
    return ret || {...DEFAULT_CONFIG}
}

async function saveConfig(newConfig) {
    // эту функцию зовем всегда, когда надо изменить конфиг
    localStorage.setItem('config', JSON.stringify(newConfig))
    if (isLoggedIn()) {
        // получаем config file ID
        const configFileId = await getConfigFileId()
        // заливаем новый конфиг в Google Drive
        upload(configFileId, newConfig)
    }
}

async function syncConfig() {
    if (!isLoggedIn()) {
        return
    }
    // получаем config file ID
    const configFileId = await getConfigFileId()
    try {
        // загружаем конфиг
        const remoteConfig = await download(configFileId)
        if (!remoteConfig || typeof remoteConfig !== 'object') {
            // пустой или испорченный конфиг, перезаписываем текущим
            upload(configFileId, getConfig())
        } else {
            // сохраняем локально, перезаписывая существующие данные
            localStorage.setItem('config', JSON.stringify(remoteConfig))
        }
        // синхронизация завершена, в localStorage актуальный конфиг
    } catch(e) {
        if (e.status === 404) {
            // кто-то удалил наш конфиг, забываем неверный fileID и пробуем еще раз
            localStorage.removeItem('configFileId')
            syncConfig()
        } else {
            throw e
        }
    }
}

function scheduleConfigSync(delay) {
    // сбрасываем старый таймер, если он был
    if (configSyncTimeoutId) {
        clearTimeout(configSyncTimeoutId)
    }
    configSyncTimeoutId = setTimeout(() => {
        // выполняем синхронизацию и шедулим снова
        syncConfig()
            .catch(e => console.log('Failed to synchronize config', e))
            .finally(() => scheduleSourcesSync())
    }, typeof delay === 'undefined' ? SYNC_PERIOD : delay)
}

function initApp() {
    // запускаем синхронизацию при старте приложения
    scheduleConfigSync()
}

*/