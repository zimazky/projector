const API_KEY = 'AIzaSyDRPEe6LBi-O697m5NPCxhn8swqHm3ExEg'
const CLIENT_ID = '153901704601-4n12u2s1bup0sinlesv6aetfgjdsldt2.apps.googleusercontent.com'
const SCOPES = 'https://www.googleapis.com/auth/drive.appfolder'
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'

function prom(gapiCall, argObj) {
  return new Promise((resolve, reject) => {
      gapiCall(argObj).then(resp => {
          if (resp && (resp.status < 200 || resp.status > 299)) {
              console.log('GAPI call returned bad status', resp)
              reject(resp)
          } else {
              resolve(resp)
          }
      }, err => {
          console.log('GAPI call failed', err)
          reject(err)
      })
  })
}

function loadScriptPromise(url) {
  return new Promise((resolve, reject)=>{
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.onerror = reject
    script.onload = resolve
    document.head.appendChild(script)
  })
}
  
let onLogIn = ()=>{}

export default class GAPI {
  static tokenClient

  static async init({onSuccess = ()=>{}, onFailure = ()=>{}, onSignIn = ()=>{}}) {
    try {
      const gsi = loadScriptPromise('https://accounts.google.com/gsi/client')
      const gapi = loadScriptPromise('https://apis.google.com/js/api.js')
      await gsi
      GAPI.tokenClient = window.google.accounts.oauth2.initTokenClient({
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
      await gapi
      window.gapi.load('client', ()=>{
        window.gapi.client.init({
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

  static logIn() {
    return new Promise((resolve, reject)=>{
      GAPI.tokenClient?.requestAccessToken({prompt: ''})
      onLogIn = resolve
    })
  }

  static logOut() {
    const token = window.gapi.client.getToken()
    if (token !== null) {
      window.google.accounts.oauth2.revoke(token.access_token,()=>{
        console.log('revoke', token.access_token)
        window.gapi.client.setToken(null)
      })
    }
  }

  static isLoggedIn() {
    const token = window.gapi.client.getToken()
    console.log('check token', token)
    return token !== null
  }

  static isGranted(scope, ...scopes) {
    console.log(scope)
    console.log(...scopes)
    return window.google.accounts.oauth2.hasGrantedAllScopes(window.gapi.client.getToken(), scope, ...scopes)
  }

  //static isGapiLoaded = () => gapi && gapi.auth2

  static async createEmptyFile(name, mimeType) {
    const resp = await prom(gapi.client.drive.files.create, {
        resource: {
            name: name,
            // для создания папки используйте
            // mimeType = 'application/vnd.google-apps.folder'
            mimeType: mimeType || 'text/plain',
            // вместо 'appDataFolder' можно использовать ID папки
            parents: ['appDataFolder']
        },
        fields: 'id'
    })
    // функция возвращает строку — идентификатор нового файла
    return resp.result.id
  }

  static async upload(fileId, content) {
    // функция принимает либо строку, либо объект, который можно сериализовать в JSON
    return prom(gapi.client.request, {
        path: `/upload/drive/v3/files/${fileId}`,
        method: 'PATCH',
        params: {uploadType: 'media'},
        body: typeof content === 'string' ? content : JSON.stringify(content)
    })
  }

  static async download(fileId) {
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

  static async find(query) {
    let ret = []
    let token
    do {
        const resp = await prom(gapi.client.drive.files.list, {
            // вместо 'appDataFolder' можно использовать ID папки
            spaces: 'appDataFolder',
            fields: 'files(id, name), nextPageToken',
            pageSize: 100,
            pageToken: token,
            orderBy: 'createdTime',
            q: query
        })
        ret = ret.concat(resp.result.files)
        token = resp.result.nextPageToken
    } while (token)
    // результат: массив объектов вида [{id: '...', name: '...'}], 
    // отсортированных по времени создания
    return ret
  }

  static async deleteFile(fileId) {
    try {
        await prom(gapi.client.drive.files.delete, {
            fileId: fileId
        })
        return true
    } catch (err) {
        if (err.status === 404) {
            return false
        }
        throw err
    }
  }
}

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
/*
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
*/
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