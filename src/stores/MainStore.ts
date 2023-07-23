import { ProjectData, ProjectsStore } from "src/stores/Projects/ProjectsStore"
import { EventsCache } from "src/stores/EventsCache/EventsCache"
import { EventsStore } from "src/stores/Events/EventsStore"
import RemoteStorage from "src/utils/remoteStorage"
import { EventData } from "./Events/EventData"
import { makeAutoObservable, runInAction } from "mobx"
import GAPI from "src/utils/gapi"

/** Синглтон-экземпляр хранилища проектов */
export const projectsStore = new ProjectsStore

/** Синглтон-экземпляр хранилища событий */
export const eventsStore = new EventsStore

/** Синглтон-экземпляр кэша событий */
export const eventsCache = new EventsCache

/** Тип данных приложения для сохранения во внешнем хранилище */
type MainStoreData = {
  projectsList: ProjectData[]
  completedList: EventData[]
  plannedList: EventData[]
}

/** Класс главного хранилища приложения */
class MainStore {
  /** Признак соответствия данных хранилища данным в Localstorage */
  isSyncWithLocalstorage: boolean
  /** Признак соответствия данных хранилища данным в GoogleDrive */
  isSyncWithGoogleDrive: boolean
  /** Признак авторизации в сервисах Google */
  isGoogleLoggedIn: boolean

  constructor() {
    const json = localStorage.getItem('data') ?? '{}'
    console.log('localStorage', json)
    const obj: MainStoreData = JSON.parse(json)
    projectsStore.init(obj.projectsList)
    eventsStore.load(obj)
    this.isSyncWithLocalstorage = true
    this.isSyncWithGoogleDrive = false
    this.isGoogleLoggedIn = false

    makeAutoObservable(this)
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
    RemoteStorage.saveFile('data.json', data)
      .then(()=>console.log('save ok'))
      .catch(()=>alert('Save error'))
    runInAction(()=>{ this.isSyncWithGoogleDrive = true})
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
      //forceUpdate()
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