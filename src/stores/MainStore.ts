import { ProjectData, ProjectsStore } from "src/stores/Projects/ProjectsStore"
import { EventsCache } from "src/stores/EventsCache/EventsCache"
import { EventsStore } from "src/stores/Events/EventsStore"
import RemoteStorage from "src/utils/remoteStorage"
import { EventData } from "./Events/EventData"
import { makeAutoObservable, runInAction } from "mobx"
import GAPI from "src/utils/gapi"
import { timestamp } from "src/utils/datetime"
import { WeatherStore } from "./Weather/WeatherStore"

/** Синглтон-экземпляр хранилища проектов */
export const projectsStore = new ProjectsStore

/** Синглтон-экземпляр хранилища событий */
export const eventsStore = new EventsStore

/** Синглтон-экземпляр хранилища данных прогноза погоды*/
export const weatherStore = new WeatherStore;

/** Тип данных приложения для сохранения во внешнем хранилище */
type MainStoreData = {
  projectsList: ProjectData[]
  completedList: EventData[]
  plannedList: EventData[]
}

type ViewMode = 'Calendar' | 'Day'

/** Класс главного хранилища приложения */
class MainStore {
  /** Признак соответствия данных хранилища данным в Localstorage */
  isSyncWithLocalstorage: boolean = false
  /** Признак соответствия данных хранилища данным в GoogleDrive */
  isSyncWithGoogleDrive: boolean = false
  /** Признак авторизации в сервисах Google */
  isGoogleLoggedIn: boolean = false
  /** Структура сигнализирующая необходимость обновления страницы */
  mustForceUpdate: {} = {}
  /** Режим отображения */
  viewMode: ViewMode = 'Calendar'
  /** Метка времени текущего дня */
  timestamp: timestamp

  constructor() {
    const json = localStorage.getItem('data') ?? '{}'
    console.log('localStorage', json)
    const obj: MainStoreData = JSON.parse(json)
    projectsStore.init(obj.projectsList)
    eventsStore.load(obj)
    this.isSyncWithLocalstorage = true
    this.timestamp = Date.now()/1000
    makeAutoObservable(this)
  }

  changeViewMode(props : {mode?: ViewMode, timestamp?: timestamp}) {
    if(props.mode) this.viewMode = props.mode
    if(props.timestamp) this.timestamp = props.timestamp
  }

  desyncWithStorages = () => {
    this.isSyncWithGoogleDrive = false
    this.isSyncWithLocalstorage = false
  }

  gapiInit = () => {
    GAPI.init({
      onSuccess: ()=>{
        runInAction(() => { this.isGoogleLoggedIn = GAPI.isLoggedIn() })
      },
      onSignIn: ()=>{
        runInAction(() => {
          this.isGoogleLoggedIn = GAPI.isLoggedIn()
          console.log('onSignIn', this.isGoogleLoggedIn)
        })
      },
      onExpiredToken: ()=>{ 
        runInAction(() => { this.isGoogleLoggedIn = false })
      }
    })
  }

  saveToLocalStorage = () => {
    const data: MainStoreData = {
      projectsList: projectsStore.getList(), ...eventsStore.prepareToSave()
    }
    const dataString = JSON.stringify(data)
    localStorage.setItem('data', dataString)
    console.log(dataString)
    this.isSyncWithLocalstorage = true
  }
  
  saveToGoogleDrive = async () => {
    const data: MainStoreData = {
      projectsList: projectsStore.getList(), ...eventsStore.prepareToSave()
    }
    try {
      await RemoteStorage.saveFile('data.json', data)
      console.log('save ok')
      runInAction(() => { this.isSyncWithGoogleDrive = true })
    }
    catch(e) {
      alert('Save error')
    }
  }

  loadFromGoogleDrive = async () => {
    try {
      if(!GAPI.isLoggedIn()) {
        console.log('logging...')
        await GAPI.logIn()
        console.log('login ok')
      }
      const obj = await RemoteStorage.loadFile('data.json')
      projectsStore.init(obj.projectsList)
      eventsStore.load(obj)
      runInAction(() => {
        this.isSyncWithLocalstorage = false
        this.isSyncWithGoogleDrive = true
        this.mustForceUpdate = {} 
      })
      //forceUpdate()
      eventsCache.clearCache()
    } catch(e) {
      console.log('Load error', e)
      alert('Load error')
    }
  }

  logIn = () => {
    GAPI.logIn()
  }

  logOut = () => {
    GAPI.logOut()
    this.isGoogleLoggedIn = false
  }
}

/** Синглтон-экземпляр хранилища приложения */
export const mainStore = new MainStore

/** Синглтон-экземпляр кэша событий */
export const eventsCache = new EventsCache
