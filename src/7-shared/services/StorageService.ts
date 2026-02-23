import { makeAutoObservable, runInAction } from 'mobx'

import { ProjectData, ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'
import { EventsStore, EventsStoreData } from 'src/6-entities/Events/EventsStore'
import { mainStore } from 'src/1-app/root'

/** Сериализуемая структура данных приложения */
export type MainStoreData = {
  projectsList: ProjectData[]
} & EventsStoreData

/** Узкий type-guard для проверки "объектоподобного" значения */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Проверка структуры одного проекта в JSON-документе */
function isProjectData(value: unknown): value is ProjectData {
  if (!isRecord(value)) return false
  return typeof value.name === 'string'
    && typeof value.color === 'string'
    && typeof value.background === 'string'
}

/**
 * Нормализация и валидация входного контента документа.
 * При ошибке структуры бросает исключение с понятным текстом.
 */
function normalizeMainStoreData(rawContent: unknown): MainStoreData {
  const parsedContent = typeof rawContent === 'string'
    ? JSON.parse(rawContent)
    : rawContent

  if (!isRecord(parsedContent)) {
    throw new Error('Invalid document format: root value must be an object')
  }

  const rawProjects = parsedContent.projectsList
  const rawCompleted = parsedContent.completedList
  const rawPlanned = parsedContent.plannedList

  if (!Array.isArray(rawProjects)) {
    throw new Error('Invalid document format: projectsList must be an array')
  }
  if (!Array.isArray(rawCompleted)) {
    throw new Error('Invalid document format: completedList must be an array')
  }
  if (!Array.isArray(rawPlanned)) {
    throw new Error('Invalid document format: plannedList must be an array')
  }

  const projectsList = rawProjects.filter(isProjectData)
  if (projectsList.length !== rawProjects.length) {
    throw new Error('Invalid document format: projectsList contains invalid entries')
  }

  return {
    projectsList,
    completedList: rawCompleted as EventsStoreData['completedList'],
    plannedList: rawPlanned as EventsStoreData['plannedList']
  }
}

/**
 * Сервис хранения/загрузки данных приложения.
 * Отвечает за сериализацию, десериализацию и применение контента в сторы.
 */
export class StorageService {
  /** Флаг синхронизации с localStorage */
  isSyncWithLocalstorage: boolean = false
  /** Флаг синхронизации с Google Drive */
  isSyncWithGoogleDrive: boolean = false

  private projectsStore: ProjectsStore
  private eventsStore: EventsStore

  constructor(projectsStore: ProjectsStore, eventsStore: EventsStore) {
    this.projectsStore = projectsStore
    this.eventsStore = eventsStore
    makeAutoObservable(this)
  }

  /** Сбросить признаки синхронизации после локальных изменений */
  desyncWithStorages = () => {
    this.isSyncWithGoogleDrive = false
    this.isSyncWithLocalstorage = false
  }

  /** Отметить, что текущее состояние синхронизировано с Google Drive */
  markGoogleDriveSynced = () => {
    this.isSyncWithGoogleDrive = true
  }

  /** Сохранить текущее состояние приложения в localStorage */
  saveToLocalStorage = () => {
    const data: MainStoreData = {
      projectsList: this.projectsStore.getList(), ...this.eventsStore.prepareToSave()
    }
    const dataString = JSON.stringify(data)
    localStorage.setItem('data', dataString)
    this.isSyncWithLocalstorage = true
  }

  /** Получить снапшот данных для сохранения во внешнее хранилище */
  getContentToSave = () => {
    const data: MainStoreData = {
      projectsList: this.projectsStore.getList(), ...this.eventsStore.prepareToSave()
    }
    return data
  }

  /** Сбросить данные приложения к пустому состоянию (без привязки к Drive-файлу) */
  resetToEmptyContent = () => {
    this.projectsStore.init([])
    this.eventsStore.init({ completedList: [], plannedList: [] })
    runInAction(() => {
      this.isSyncWithLocalstorage = false
      this.isSyncWithGoogleDrive = false
      mainStore.mustForceUpdate = {}
    })
  }

  /**
   * Применить контент документа к сторам приложения.
   * Используется как единая точка входа для загрузки из произвольных источников.
   */
  applyContent = (content: unknown) => {
    const normalized = normalizeMainStoreData(content)
    this.projectsStore.init(normalized.projectsList)
    this.eventsStore.init(normalized)
    runInAction(() => {
      this.isSyncWithLocalstorage = false
      this.isSyncWithGoogleDrive = true
      mainStore.mustForceUpdate = {}
    })
  }

  /** Инициализация состояния приложения из localStorage с fallback на пустые данные */
  init = () => {
    const json = localStorage.getItem('data')
    if (!json) {
      this.projectsStore.init([])
      this.eventsStore.init({ completedList: [], plannedList: [] })
      this.isSyncWithLocalstorage = true
      return
    }

    try {
      const obj = normalizeMainStoreData(json)
      this.projectsStore.init(obj.projectsList)
      this.eventsStore.init(obj)
      this.isSyncWithLocalstorage = true
    } catch (e) {
      console.error('Failed to initialize app data from localStorage:', e)
      this.projectsStore.init([])
      this.eventsStore.init({ completedList: [], plannedList: [] })
      this.isSyncWithLocalstorage = true
    }
  }
}
