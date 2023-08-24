import { makeAutoObservable } from 'mobx'

import { timestamp } from 'src/7-shared/helpers/DateTime'

import { EventData } from 'src/6-entities/stores/Events/EventData'

type EventFormStructure = {
  /** Идентификатор события (если не указан, то новое событие) */
  id: number | null
  /** Признак завершенности события */
  completed?: boolean 
  /** Метка времени дня */
  timestamp: timestamp
} & EventData

export class EventFormStore {
  /** Признак отображения модальной формы на экране */
  isShow: boolean = false
  /** Данные отображаемого события */
  eventData: EventFormStructure = {
    id: null,
    timestamp: 0,
    name: '',
    start: ''
  }

  constructor() {
    makeAutoObservable(this)
  }

  showForm = () => { this.isShow = true }

  hideForm = () => { this.isShow = false }

  setEventData = (e: EventFormStructure) => {
    this.eventData = e
  }

}