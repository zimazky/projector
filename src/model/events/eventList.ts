import { timestamp } from '../../utils/datetime'
import ZCron from '../../utils/zcron'
import { IEvent, IRepeatableEvent, ISingleEvent } from './ievents'
import { rawEvent, rawToEvent, repeatableEventToRaw, singleEventToRaw } from './rawEvents'

/** Одиночное событие */
export type SingleEvent = ISingleEvent & {
  /** Идентификатор события */
  id: number
  /** Индекс записи проекта */
  projectId: number
  /** Длительность события в днях */
  days: number
}

/** Повторяемое событие */
export type RepeatableEvent = IRepeatableEvent & {
  /** Идентификатор события */
  id: number
  /** Индекс записи проекта */
  projectId: number
}

export type ProjectStyle = {
  color: string
  background: string
}

export type Project = {name: string} & ProjectStyle


/** 
 * Класс списка событий, полученных из хранилища и приведенных к оптимизированной для обработки форме.
 * Также подготавливает и оптимизирует данные для сохранения в хранилище (уменьшает размер)
 * Создает новые события, удаляет и изменяет существующие, переводит планируемые в выполненные
 */
export default class EventList {
  /** Нумератор идентификаторов */
  private lastId = 1
  /** Список проектов */
  projects: Project[] = [{name:'Default', background: 'lightgray', color: 'black'}]
  /** Список завершенных событий */
  completed: SingleEvent[] = []
  /** Список запланированных, одиночных событий */
  planned: SingleEvent[] = []
  /** Список запланированных, повторяемых событий */
  plannedRepeatable: RepeatableEvent[] = []
  /** Колбэк функция, вызывается при каждом изменении списка */
  onChangeList = () => {}

  constructor() {}

  /** Загрузка данных со сбросом предшествующих данных */
  load({completedList=[], plannedList=[], projectsList=[]}) {
    this.lastId = 1
    this.projects = [{name:'Default', background: 'lightgray', color: 'black'}, ...projectsList]
    this.completed = []
    completedList.forEach(raw => { this.addCompletedEvent(rawToEvent(raw), false) })
    this.planned = []
    this.plannedRepeatable = []
    plannedList.forEach(raw=>this.addPlannedEvent(rawToEvent(raw), false))
    this.onChangeList()
  }

  /** Подготовка для сохранения в хранилище */
  prepareToSave() {
    const completedList = this.completed.map(e=>singleEventToRaw(e))
    const plannedList: rawEvent[] = this.plannedRepeatable.reduce((a,e) => {
      return a.push(repeatableEventToRaw(e)), a
    }, [])
    this.planned.reduce((a,e) => {
      return a.push(singleEventToRaw(e)), a
    }, plannedList)
    return {projectsList: this.projects.slice(1), completedList, plannedList}
  }

  getEvent(id: number): IEvent {
    let event = this.completed.find(e=>e.id===id)
    if(event !== undefined) return event
    event = this.planned.find(e=>e.id===id)
    if(event !== undefined) return event
    const revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) return revent
  }

  getRawEvent(id: number): rawEvent {
    let event = this.completed.find(e=>e.id===id)
    if(event !== undefined) return singleEventToRaw(event)
    event = this.planned.find(e=>e.id===id)
    if(event !== undefined) return singleEventToRaw(event)
    const revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) return repeatableEventToRaw(revent)
  }

  /**
   * Добавление в список выполненного события
   * @param e Событие
   * @param isFinal Признак окончательной операции в цепочке. Если true, то при завершении вызывается onChangeList
   */
  addCompletedEvent(e: ISingleEvent, isFinal: boolean = true) {
    let projectId = e.project? this.projects.findIndex(p=>p.name===e.project) : 0
    if(projectId<0) projectId = 0

    this.completed.push({
      id: this.lastId++,
      name: e.name,
      comment: e.comment,
      project: e.project,
      projectId: projectId,
      start: e.start,
      time: e.time,
      duration: e.duration,
      end: e.end,
      days: Math.ceil((e.end-e.start)/86400),
      credit: e.credit,
      debit: e.debit,
    })
    if(isFinal) this.onChangeList()
  }

  /**
   * Добавление в список запланированного события
   * @param e Событие
   * @param isFinal Признак окончательной операции в цепочке. Если true, то при завершении вызывается onChangeList
   */
  addPlannedEvent(e: IEvent, isFinal: boolean = true) {
    let projectId = e.project? this.projects.findIndex(p=>p.name===e.project) : 0
    if(projectId<0) projectId = 0

    if(e.repeat) {
      this.plannedRepeatable.push({
        id: this.lastId++,
        name: e.name,
        comment: e.comment,
        project: e.project,
        projectId: projectId,
        repeat: e.repeat,
        start: e.start,
        time: e.time,
        duration: e.duration,
        end: e.end,
        credit: e.credit,
        debit: e.debit,
      })
    }
    else {
      this.planned.push({
        id: this.lastId++,
        name: e.name,
        comment: e.comment,
        project: e.project,
        projectId: projectId,
        start: e.start,
        time: e.time,
        duration: e.duration,
        end: e.end,
        days: Math.ceil((e.end-e.start)/86400),
        credit: e.credit,
        debit: e.debit,
      })
    }
    if(isFinal) this.onChangeList()
  }

  addPlannedRawEvent(raw: rawEvent, isFinal: boolean = true) {
    this.addPlannedEvent(rawToEvent(raw), isFinal)
  }

  /**
   * Удаление события
   * @param id Идентификатор события
   * @param isFinal Признак окончательной операции в цепочке. Если true, то при завершении вызывается onChangeList
   */
  deleteEvent(id: number, isFinal: boolean = true) {
    this.completed = this.completed.filter(e=>e.id!==id)
    this.planned = this.planned.filter(e=>e.id!==id)
    this.plannedRepeatable = this.plannedRepeatable.filter(e=>e.id!==id)
    if(isFinal) this.onChangeList()
  }

  /**
   * Завершение события с одновременной модификацией параметров события.
   * Повторяемые события при завершении трансформируются в одиночные, модификация затрагивает только
   * текущее событие.
   * @param id Идентификатор события
   * @param currentdate Текущая дата для уточнения события среди повторяемых
   * @param raw Модифицированное событие
   */
  completeEvent(id: number, currentdate: timestamp, raw: rawEvent) {
    {
      let event = this.planned.find(e=>e.id===id)
      if(event !== undefined) {
        this.addCompletedEvent({...event, ...rawToEvent(raw)}, false)
        this.deleteEvent(event.id)
        return
      }
    }
    let revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) {
      this.addCompletedEvent({...rawToEvent(raw), start: currentdate, end: currentdate + 86400}, false)
      // При выполнении одного из периодических событий перед ним могли остаться незавершенные события.
      // В этом случае добавляем еще одно периодическое событие, задающий шаблон для этих незавершенных 
      // событий в предшествующем интервале
      if(ZCron.ariseInInterval(revent.repeat, revent.start, revent.start, currentdate)) {
        const first = {...revent, end: currentdate, id: this.lastId++}
        this.plannedRepeatable.push(first)
      }
      if(revent.repeat[0]=='/') { // Для повторяемых в днях относительно начала шаблона пересчитываем начальную дату
        const d = +revent.repeat.substring(1)
        revent.start = currentdate + d*86400
      }
      else revent.start = currentdate + 86400
      // Удаляем, если в оставшемся интервале нет событий
      if(revent.end && !ZCron.ariseInInterval(revent.repeat,revent.start,revent.start,revent.end)) {
        this.deleteEvent(revent.id, false)
      }
      this.onChangeList()
      return
    }
  }

  /**
   * Отменить завершение события с одновременной модификацией параметров события.
   * @param id Идентификатор события
   * @param raw Модифицированное событие
   */
  uncompleteEvent(id: number, raw: rawEvent) {
    let event = this.completed.find(e=>e.id===id)
    if(event !== undefined) {
      this.addPlannedEvent({...event, ...rawToEvent(raw)}, false)
      this.deleteEvent(event.id)
      return
    }
  }

  /**
   * Изменение параметров события
   * @param id Идентификатор события
   * @param raw Модифицированное событие в текстовом представлении rawEvent
   */
  updateEvent(id: number, raw: rawEvent) {
    {
      let event = this.completed.find(e=>e.id===id)
      if(event !== undefined) {
        this.addCompletedEvent(rawToEvent(raw), false)
        this.deleteEvent(id)
        return
      }
      event = this.planned.find(e=>e.id===id)
      if(event !== undefined) {
        this.addPlannedEvent(rawToEvent(raw), false)
        this.deleteEvent(id)
        return
      }
    }
    let revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) {
      this.addPlannedEvent(rawToEvent(raw), false)
      this.deleteEvent(id)
      return
    }
  }

  /**
   * Сдвиг события в другую дату. 
   * Для периодических событий реализован сдвиг только для начального события, 
   * относительно которого построено расписание с шаблоном "/d"
   * @param id идентификатор события
   * @param todate дата в которую совершается перемещение
   * @param currentdate для повторяемых событий дата конкретного
   * */  
  shiftToDate(id: number, todate: timestamp, currentdate: timestamp) {
    {
      let event = this.completed.find(e=>e.id===id)
      if(event !== undefined) {
        const delta = todate - event.start
        event.start = todate
        event.end = event.end? event.end+delta : event.end
        this.onChangeList()
        return
      }
      event = this.planned.find(e=>e.id===id)
      if(event !== undefined) {
        const delta = todate - event.start
        event.start = todate
        event.end = event.end? event.end+delta : event.end
        this.onChangeList()
        return
      }
    }
    let revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) {
      if(revent.repeat[0]!=='/' || revent.start!==currentdate) return
      const delta = todate - currentdate
      revent.start = revent.start + delta
      revent.end = revent.end? revent.end+delta : revent.end
      this.onChangeList()
      return
    }
  }
  
  /**   
   * Копирование события в другую дату. Периодическое событие копируется как одиночное.
   * @param id идентификатор события
   * @param todate дата в которую совершается копирование
   * */  
  copyToDate(id: number, todate: timestamp) {
    {
      let event = this.completed.find(e=>e.id===id)
      if(event !== undefined) {
        const delta = todate - event.start
        const newevent = {...event, start: todate, end: event.end? event.end+delta : event.end}
        this.addCompletedEvent(newevent)
        return
      }
      event = this.planned.find(e=>e.id===id)
      if(event !== undefined) {
        const delta = todate - event.start
        const newevent = {...event, start: todate, end: event.end? event.end+delta : event.end}
        this.addPlannedEvent(newevent)
        return
      }
    }
    let revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) {
      const delta = todate - revent.start
      const newevent = {...revent, repeat: '', start: todate, end: todate + 86400}
      this.addPlannedEvent(newevent)
      return
    }
  }

  /**
   * Превращение повторяемого события в одиночное с одновременной модификацией параметров события.
   * Модификация затрагивает только текущее событие.
   * @param id Идентификатор события
   * @param currentdate Текущая дата для уточнения события среди повторяемых
   * @param raw Модифицированное событие
   */
  transformToSingleEvent(id: number, currentdate: timestamp, raw: rawEvent) {
    let revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) {
      this.addPlannedEvent({...rawToEvent(raw), repeat: undefined, start: currentdate, end: currentdate + 86400}, false)
      // При превращении одного из периодических событий перед ним могли остаться незавершенные события.
      // В этом случае добавляем еще одно периодическое событие, задающий шаблон для этих незавершенных 
      // событий в предшествующем интервале
      if(ZCron.ariseInInterval(revent.repeat, revent.start, revent.start, currentdate)) {
        const first = {...revent, end: currentdate, id: this.lastId++}
        this.plannedRepeatable.push(first)
      }
      if(revent.repeat[0]=='/') { // Для повторяемых в днях относительно начала шаблона пересчитываем начальную дату
        const d = +revent.repeat.substring(1)
        revent.start = currentdate + d*86400
      }
      else revent.start = currentdate + 86400
      // Удаляем, если в оставшемся интервале нет событий
      if(revent.end && !ZCron.ariseInInterval(revent.repeat,revent.start,revent.start,revent.end)) {
        this.deleteEvent(revent.id, false)
      }
      this.onChangeList()
      return
    }
  }

}

