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

export default class GAPI {
  
  static init({onSuccess=()=>{}, onFailure=()=>{}, onSignIn=()=>{}}) {
    gapi.load('client:auth2', ()=>{
      gapi.client.init({
        apiKey: process.env.API_KEY,
        clientId: process.env.CLIENT_ID,
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        scope: 'https://www.googleapis.com/auth/drive.appfolder'
      }).then(() => {
        console.log('Init GAPI client ok')
        gapi.auth2.getAuthInstance().isSignedIn.listen(onSignIn)
        onSuccess()
      }, error => {
        console.log('Failed to init GAPI client', error)
        onFailure()
      })
    })
  }

  static isGapiLoaded = () => gapi && gapi.auth2

  // откроется стандартное окно Google с выбором аккаунта
  static logIn = () => { if(GAPI.isGapiLoaded()) gapi.auth2.getAuthInstance().signIn()}

  static logOut = () => { if(GAPI.isGapiLoaded()) gapi.auth2.getAuthInstance().signOut()}

  static isLoggedIn = () => GAPI.isGapiLoaded() && gapi.auth2.getAuthInstance().isSignedIn.get()

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