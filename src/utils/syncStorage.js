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