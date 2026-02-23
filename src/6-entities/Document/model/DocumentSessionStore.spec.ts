import { DocumentSessionStore } from './DocumentSessionStore'
import { OpenDocumentRef } from './types'

const LAST_OPENED_DOCUMENT_KEY = 'lastOpenedDocument'

type GoogleApiServiceMock = {
  isGoogleLoggedIn: boolean
  getFileMetadata: jasmine.Spy
  downloadFileContent: jasmine.Spy
  saveFile: jasmine.Spy
}

type StorageServiceMock = {
  applyContent: jasmine.Spy
  getContentToSave: jasmine.Spy
  markGoogleDriveSynced: jasmine.Spy
}

function createGoogleApiServiceMock(): GoogleApiServiceMock {
  let loggedIn = true

  return {
    get isGoogleLoggedIn() {
      return loggedIn
    },
    set isGoogleLoggedIn(value: boolean) {
      loggedIn = value
    },
    getFileMetadata: jasmine.createSpy('getFileMetadata'),
    downloadFileContent: jasmine.createSpy('downloadFileContent'),
    saveFile: jasmine.createSpy('saveFile')
  }
}

function createStorageServiceMock(): StorageServiceMock {
  return {
    applyContent: jasmine.createSpy('applyContent'),
    getContentToSave: jasmine.createSpy('getContentToSave').and.returnValue({
      projectsList: [],
      completedList: [],
      plannedList: []
    }),
    markGoogleDriveSynced: jasmine.createSpy('markGoogleDriveSynced')
  }
}

function createStore() {
  const googleApiService = createGoogleApiServiceMock()
  const storageService = createStorageServiceMock()
  const store = new DocumentSessionStore(googleApiService as any, storageService as any)
  return { store, googleApiService, storageService }
}

describe('DocumentSessionStore', () => {
  beforeEach(() => {
    localStorage.removeItem(LAST_OPENED_DOCUMENT_KEY)
  })

  afterEach(() => {
    localStorage.removeItem(LAST_OPENED_DOCUMENT_KEY)
  })

  it('createNew sets unsaved document and persists snapshot', () => {
    const { store } = createStore()

    store.createNew('Новый документ', 'application/json')

    expect(store.state.ref?.fileId).toBeNull()
    expect(store.state.ref?.name).toBe('Новый документ')
    expect(store.state.isDirty).toBeFalse()

    const rawSnapshot = localStorage.getItem(LAST_OPENED_DOCUMENT_KEY)
    expect(rawSnapshot).not.toBeNull()
  })

  it('openFromDriveFile loads metadata/content and marks document as opened', async () => {
    const { store, googleApiService, storageService } = createStore()
    googleApiService.getFileMetadata.and.resolveTo({
      id: 'file-1',
      name: 'calendar.json',
      mimeType: 'application/json',
      parents: ['folder-1'],
      webViewLink: 'https://drive.google.com/file/d/file-1/view'
    })
    googleApiService.downloadFileContent.and.resolveTo({
      projectsList: [],
      completedList: [],
      plannedList: []
    })

    await store.openFromDriveFile('file-1', { space: 'drive' })

    expect(googleApiService.getFileMetadata).toHaveBeenCalledWith('file-1')
    expect(googleApiService.downloadFileContent).toHaveBeenCalledWith('file-1')
    expect(storageService.applyContent).toHaveBeenCalled()
    expect(store.state.ref?.fileId).toBe('file-1')
    expect(store.state.ref?.name).toBe('calendar.json')
    expect(store.state.isDirty).toBeFalse()
    expect(store.state.error).toBeNull()
  })

  it('saveToCurrentFile returns false when fileId is missing', async () => {
    const { store, googleApiService } = createStore()
    store.createNew('Unsaved', 'application/json')

    const result = await store.saveToCurrentFile()

    expect(result).toBeFalse()
    expect(googleApiService.saveFile).not.toHaveBeenCalled()
    expect(store.state.error).toBe('No opened file to save')
  })

  it('saveToCurrentFile saves opened file and clears dirty flag', async () => {
    const { store, googleApiService, storageService } = createStore()

    const ref: OpenDocumentRef = {
      fileId: 'file-2',
      name: 'plan.json',
      mimeType: 'application/json',
      space: 'drive',
      parentFolderId: 'root'
    }
    store.openDocument(ref)
    store.markDirty()

    googleApiService.saveFile.and.resolveTo({
      status: 'success',
      file: {
        id: 'file-2',
        name: 'plan.json',
        mimeType: 'application/json',
        parents: ['root'],
        webViewLink: 'https://drive.google.com/file/d/file-2/view'
      }
    })

    const result = await store.saveToCurrentFile()

    expect(result).toBeTrue()
    expect(googleApiService.saveFile).toHaveBeenCalled()
    expect(storageService.markGoogleDriveSynced).toHaveBeenCalled()
    expect(store.state.isDirty).toBeFalse()
    expect(store.state.error).toBeNull()
  })

  it('restoreSessionFromLocalStorage clears malformed snapshot', () => {
    const { store } = createStore()

    localStorage.setItem(LAST_OPENED_DOCUMENT_KEY, JSON.stringify({ bad: 'shape' }))

    const snapshot = store.restoreSessionFromLocalStorage()

    expect(snapshot).toBeNull()
    expect(localStorage.getItem(LAST_OPENED_DOCUMENT_KEY)).toBeNull()
  })

  it('restoreLastOpenedDocument does not try to open Drive file when not logged in', async () => {
    const { store, googleApiService } = createStore()

    localStorage.setItem(LAST_OPENED_DOCUMENT_KEY, JSON.stringify({
      fileId: 'file-3',
      name: 'doc.json',
      mimeType: 'application/json',
      space: 'drive',
      parentFolderId: 'root',
      updatedAt: Date.now()
    }))

    googleApiService.isGoogleLoggedIn = false

    const restored = await store.restoreLastOpenedDocument()

    expect(restored).toBeFalse()
    expect(googleApiService.getFileMetadata).not.toHaveBeenCalled()
    expect(store.state.error).toBe('Для восстановления документа требуется вход в Google.')
    expect(localStorage.getItem(LAST_OPENED_DOCUMENT_KEY)).not.toBeNull()
  })

  it('close clears document state and removes persisted snapshot', () => {
    const { store } = createStore()

    store.createNew('Draft', 'application/json')
    expect(localStorage.getItem(LAST_OPENED_DOCUMENT_KEY)).not.toBeNull()

    store.close()

    expect(store.state.ref).toBeNull()
    expect(localStorage.getItem(LAST_OPENED_DOCUMENT_KEY)).toBeNull()
  })
})
