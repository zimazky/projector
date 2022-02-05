import GAPI from './gapi.js'

async function getCachedFileId(filename) {
  var fileId = localStorage.getItem(filename)
  if(fileId) return fileId
  const files = await GAPI.find('name = "'+filename+'"')
  if(files.length > 0) fileId = files[0].id
  else fileId = await GAPI.createEmptyFile(filename)
  localStorage.setItem(filename, fileId)
  return fileId
}

export default class RemoteStorage {

  static async saveFile(filename, data) {
    if(GAPI.isLoggedIn()) {
      const fileId = await getCachedFileId(filename)
      await GAPI.upload(fileId, data)
    }
  }

  static async loadFile(filename) {
    if(GAPI.isLoggedIn()) {
      const fileId = await getCachedFileId(filename)
      return await GAPI.download(fileId)
    }
  }

}