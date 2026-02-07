import { makeAutoObservable, runInAction } from 'mobx'

import RemoteStorage from './remoteStorage'
import { ProjectData, ProjectsStore } from 'src/6-entities/stores/Projects/ProjectsStore'
import { EventsStore, EventsStoreData } from 'src/6-entities/stores/Events/EventsStore'
import { GoogleApiService } from './GoogleApiService' // Import the type
import { mainStore } from 'src/root' 

/** Тип данных приложения для сохранения во внешнем хранилище */
type MainStoreData = {
  projectsList: ProjectData[]
} & EventsStoreData

/**
 * Сервис для управления сохранением и загрузкой данных.
 * Абстрагирует взаимодействие с localStorage и Google Drive.
 */
export class StorageService {
  /** Признак соответствия данных хранилища данным в Localstorage */
  isSyncWithLocalstorage: boolean = false
  /** Признак соответствия данных хранилища данным в GoogleDrive */
  isSyncWithGoogleDrive: boolean = false

  // Dependencies that need to be injected
  private projectsStore: ProjectsStore
  private eventsStore: EventsStore
  private googleApiService: GoogleApiService

  constructor(projectsStore: ProjectsStore, eventsStore: EventsStore, googleApiService: GoogleApiService) {
    this.projectsStore = projectsStore
    this.eventsStore = eventsStore
    this.googleApiService = googleApiService
    makeAutoObservable(this)
  }

  /** Установить флаги рассинхронизации данных с внешними хранилищами */
  desyncWithStorages = () => {
    this.isSyncWithGoogleDrive = false
    this.isSyncWithLocalstorage = false
  }

  /** Сохранить данные в локальное хранилище */
  saveToLocalStorage = () => {
    const data: MainStoreData = {
      projectsList: this.projectsStore.getList(), ...this.eventsStore.prepareToSave()
    }
    const dataString = JSON.stringify(data)
    localStorage.setItem('data', dataString)
    this.isSyncWithLocalstorage = true
  }

  /** Сохранить данные в Google Drive */
  saveToGoogleDrive = async () => {
    const data: MainStoreData = {
      projectsList: this.projectsStore.getList(), ...this.eventsStore.prepareToSave()
    }
    try {
      await RemoteStorage.saveFile('data.json', data)
      console.log('save ok')
      runInAction(() => { this.isSyncWithGoogleDrive = true })
    }
    catch(e) {
      alert('Save error') // TODO: Replace with proper error handling
    }
  }

  /** Загрузить данные из Google Drive */
  loadFromGoogleDrive = async () => {
    try {
      if(!this.googleApiService.isLoggedIn()) {
        console.log('logging...')
        await this.googleApiService.logIn()
        console.log('login ok')
      }
      const obj = await RemoteStorage.loadFile('data.json')
      this.projectsStore.init(obj.projectsList)
      this.eventsStore.init(obj)
      runInAction(() => {
        this.isSyncWithLocalstorage = false
        this.isSyncWithGoogleDrive = true
        mainStore.mustForceUpdate = {}
      })
    } catch(e) {
      console.log('Load error', e)
      alert('Load error') // TODO: Replace with proper error handling
    }
  }

  /**
   * Инициализация сервиса хранения, загрузка данных из localStorage.
   * Вызывается на старте приложения.
   */
  init = () => {
    const json = localStorage.getItem('data') ?? '{}'
    const obj: MainStoreData = JSON.parse(json)
    this.projectsStore.init(obj.projectsList)
    this.eventsStore.init(obj)
    this.isSyncWithLocalstorage = true
  }
}


