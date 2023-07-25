import { ProjectData, ProjectsStore } from "src/stores/Projects/ProjectsStore"
import { EventsCache } from "src/stores/EventsCache/EventsCache"
import { EventsStore, EventsStoreData } from "src/stores/Events/EventsStore"
import RemoteStorage from "src/utils/remoteStorage"
import { makeAutoObservable, runInAction } from "mobx"
import GAPI from "src/utils/gapi"
import DateTime, { timestamp } from "src/utils/datetime"
import { WeatherStore } from "./Weather/WeatherStore"
import { CalendarStore } from "./Calendar/CalendarStore"

/** Тип данных приложения для сохранения во внешнем хранилище */
type MainStoreData = {
  projectsList: ProjectData[]
} & EventsStoreData

type ViewMode = 'Calendar' | 'Day'

/** Класс главного хранилища приложения */
class MainStore {
  /** Ссылка на хранилище проектов */
  projectsStore: ProjectsStore
  /** Ссылка на хранилище событий */
  eventsStore: EventsStore
  /** Ссылка на кэш событий */
  eventsCache: EventsCache
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
  /** Метка времени выбранного дня для отображения */
  currentDay: timestamp

  constructor(projectsStore: ProjectsStore, eventsStore: EventsStore, eventsCache: EventsCache) {
    this.projectsStore = projectsStore
    this.eventsStore = eventsStore
    this.eventsCache = eventsCache
    this.currentDay = Date.now()/1000
    makeAutoObservable(this)
  }

  /** 
   * Инициализация главного хранилища приложения
   * Загружаются данные из localstorage
   */
  init() {
    const json = localStorage.getItem('data') ?? '{}'
    //console.log('localStorage', json)
    const obj: MainStoreData = JSON.parse(json)
    this.projectsStore.init(obj.projectsList)
    this.eventsStore.init(obj)
    this.isSyncWithLocalstorage = true
    this.eventsCache.init()
    // Задание обработчика, вызываемого при изменении списка событий
    // Список пересортируется и сбрасывается кэш
    this.eventsStore.onChangeList = () => {
      this.eventsStore.sort()
      this.eventsCache.init()
      this.desyncWithStorages()
    }
  }

  /** Изменить режим просмотра приложения */
  changeViewMode(props : {mode?: ViewMode, timestamp?: timestamp}) {
    if(props.mode) this.viewMode = props.mode
    if(props.timestamp) { 
      this.currentDay = props.timestamp
    }
  }

  /** Установить текущий день и неделю */
  setCurrentDay(t: timestamp) {
    this.currentDay = t
  }

  /** Установить флаги рассинхронизации данных с внешними хранилищами */
  desyncWithStorages = () => {
    this.isSyncWithGoogleDrive = false
    this.isSyncWithLocalstorage = false
  }

  /** Инициализировать Google API */
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

  /** Сохранить данные в локальное хранилище */
  saveToLocalStorage = () => {
    const data: MainStoreData = {
      projectsList: this.projectsStore.getList(), ...this.eventsStore.prepareToSave()
    }
    const dataString = JSON.stringify(data)
    localStorage.setItem('data', dataString)
    //console.log(dataString)
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
      alert('Save error')
    }
  }

  /** Загрузить данные из Google Drive */
  loadFromGoogleDrive = async () => {
    try {
      if(!GAPI.isLoggedIn()) {
        console.log('logging...')
        await GAPI.logIn()
        console.log('login ok')
      }
      const obj = await RemoteStorage.loadFile('data.json')
      this.projectsStore.init(obj.projectsList)
      this.eventsStore.init(obj)
      runInAction(() => {
        this.isSyncWithLocalstorage = false
        this.isSyncWithGoogleDrive = true
        this.mustForceUpdate = {} 
      })
    } catch(e) {
      console.log('Load error', e)
      alert('Load error')
    }
  }

  /** Авторизоваться в Google сервисах */
  logIn = () => {
    GAPI.logIn()
  }

  /** Разлогиниться в Google */
  logOut = () => {
    GAPI.logOut()
    this.isGoogleLoggedIn = false
  }
}

/** Синглтон-экземпляр хранилища календаря */
export const calendarStore = new CalendarStore

/** Синглтон-экземпляр хранилища проектов */
export const projectsStore = new ProjectsStore

/** Синглтон-экземпляр хранилища событий */
export const eventsStore = new EventsStore(projectsStore)

/** Синглтон-экземпляр кэша событий */
export const eventsCache = new EventsCache(projectsStore, eventsStore)

/** Синглтон-экземпляр хранилища данных прогноза погоды*/
export const weatherStore = new WeatherStore;

/** Синглтон-экземпляр хранилища приложения */
export const mainStore = new MainStore(projectsStore, eventsStore, eventsCache)
mainStore.init()

