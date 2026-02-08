import GAPI from './gapi'

/** Получение идентификатора файла, используя кэш */
async function getCachedFileId(filename: string): Promise<string | null> {
  var fileId: string | null = localStorage.getItem(filename)
  if(fileId !== null) return fileId
  const files = await GAPI.find(`name = "${filename}"`)
  if(files.length > 0) fileId = files[0].id
  else {
    const newFile = await GAPI.createFileOrFolder(filename, 'text/plain', ['root']);
    fileId = newFile.id;
  }
  if(fileId === null) return null
  localStorage.setItem(filename, fileId)
  return fileId
}

export default class RemoteStorage {

  /** Сохранение данных в файле на Google Drive */
  static async saveFile(filename: string, data: string | object) {
    const fileId = await getCachedFileId(filename)
    if(fileId===null) {
      throw new Error('Не определен fileId')
    }
    await GAPI.upload(fileId, data)
  }

  /** Загрузка данных из файла на Google Drive */
  static async loadFile(filename: string) {
    const fileId = await getCachedFileId(filename)
    if(fileId===null) {
      throw new Error('Не определен fileId')
    }
    return await GAPI.download(fileId)
  }

}