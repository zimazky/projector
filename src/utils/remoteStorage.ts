import GAPI from './gapi'

/** Получение идентификатора файла, используя кэш */
async function getCachedFileId(filename: string) {
  var fileId = localStorage.getItem(filename)
  if(fileId) return fileId
  const files = await GAPI.find(`name = "${filename}"`)
  if(files.length > 0) fileId = files[0].id
  else fileId = await GAPI.createEmptyFile(filename)
  localStorage.setItem(filename, fileId)
  return fileId
}

export default class RemoteStorage {

  /** Сохранение данных в файле на Google Drive */
  static async saveFile(filename: string, data: string | object) {
    const fileId = await getCachedFileId(filename)
    await GAPI.upload(fileId, data)
  }

  /** Загрузка данных из файла на Google Drive */
  static async loadFile(filename: string) {
    const fileId = await getCachedFileId(filename)
    return await GAPI.download(fileId)
  }

}