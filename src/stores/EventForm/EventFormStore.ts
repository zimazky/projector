import { makeAutoObservable } from "mobx"
import { EventData } from "src/stores/Events/EventData"

export class EventFormStore {
  /** Признак отображения модальной формы на экране */
  isShow: boolean = false
  /** Идентификатор события, отображаемого в форме */
  eventId: number
  /** Данные отображаемого события */
  eventData: EventData

  constructor() {
    makeAutoObservable(this)
  }

  show = () => { this.isShow = true }

  hide = () => { this.isShow = false }

}