import { makeAutoObservable, runInAction } from 'mobx'

import RemoteStorage from 'src/7-shared/services/remoteStorage'
import GAPI from 'src/7-shared/services/gapi'

import { ProjectData, ProjectsStore } from 'src/6-entities/stores/Projects/ProjectsStore'
import { EventsCache } from 'src/6-entities/stores/EventsCache/EventsCache'
import { EventsStore, EventsStoreData } from 'src/6-entities/stores/Events/EventsStore'

import { WeatherStore } from './Weather/WeatherStore'
import { CalendarStore } from './Calendar/CalendarStore'
import { EventFormStore } from './EventForm/EventFormStore'
import { DayListStore } from './DayListStore/DayListStore'

/** Тип данных приложения для сохранения во внешнем хранилище */
type MainStoreData = {
  projectsList: ProjectData[]
} & EventsStoreData

type ViewMode = 'Calendar' | 'Day' | 'Projects'

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

  constructor(projectsStore: ProjectsStore, eventsStore: EventsStore, eventsCache: EventsCache) {
    this.projectsStore = projectsStore
    this.eventsStore = eventsStore
    this.eventsCache = eventsCache
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
  changeViewMode(props : {mode?: ViewMode}) {
    if(props.mode) this.viewMode = props.mode
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

  forceUpdate() {
    this.mustForceUpdate = {}
  }
}

/** Синглтон-экземпляр хранилища проектов */
export const projectsStore = new ProjectsStore

/** Синглтон-экземпляр хранилища событий */
export const eventsStore = new EventsStore(projectsStore)

/** Синглтон-экземпляр кэша событий */
export const eventsCache = new EventsCache(projectsStore, eventsStore)

/** Синглтон-экземпляр хранилища данных прогноза погоды*/
export const weatherStore = new WeatherStore;

/** Синглтон-экземпляр хранилища календаря */
export const calendarStore = new CalendarStore(eventsCache, weatherStore)

/** Синглтон-экземпляр хранилища компонента DayList */
export const dayListStore = new DayListStore(eventsCache, weatherStore, calendarStore)

/** Синглтон-экземпляр хранилища формы события */
export const eventFormStore = new EventFormStore

/** Синглтон-экземпляр хранилища приложения */
export const mainStore = new MainStore(projectsStore, eventsStore, eventsCache)
mainStore.init()

