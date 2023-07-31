import { makeAutoObservable } from "mobx"
import { EventData } from "src/stores/Events/EventData"
import { timestamp } from "src/utils/datetime"

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