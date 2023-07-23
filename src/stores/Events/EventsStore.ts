import ZCron from 'src/utils/zcron'
import { EventData } from './EventData'
import { IEventStructure, RepeatableEventStructure, SingleEventStructure, eventDataToIEventStructure, repeatableEventStructureToEventData, singleEventStructureToEventData } from './EventStructure'
import { timestamp } from 'src/utils/datetime'
import { projectsStore } from 'src/stores/MainStore'

/** 
 * Класс списка событий, полученных из хранилища и приведенных к оптимизированной для обработки форме.
 * Также подготавливает и оптимизирует данные для сохранения в хранилище (уменьшает размер)
 * Создает новые события, удаляет и изменяет существующие, переводит планируемые в выполненные
 */
export class EventsStore {
  /** Нумератор идентификаторов */
  private lastId = 1
  /** Список завершенных событий */
  completed: SingleEventStructure[] = []
  /** Список запланированных, одиночных событий */
  planned: SingleEventStructure[] = []
  /** Список запланированных, повторяемых событий */
  plannedRepeatable: RepeatableEventStructure[] = []
  /** Колбэк функция, вызывается при каждом изменении списка */
  onChangeList = () => {}

  /** Загрузка данных со сбросом предшествующих данных */
  load({completedList=[], plannedList=[]}) {
    this.lastId = 1
    this.completed = []
    completedList.forEach(e => { this.addCompletedEventData(e, false) })
    this.planned = []
    this.plannedRepeatable = []
    plannedList.forEach(e => this.addPlannedEventData(e, false))
    this.onChangeList()
  }

  /** Подготовка для сохранения в хранилище */
  prepareToSave() {
    const completedList = this.completed.map(e=>singleEventStructureToEventData(e))
    const plannedList: EventData[] = this.plannedRepeatable.reduce((a,e) => {
      return a.push(repeatableEventStructureToEventData(e)), a
    }, [])
    this.planned.reduce((a,e) => {
      return a.push(singleEventStructureToEventData(e)), a
    }, plannedList)
    return {completedList, plannedList}
  }

  getEventStructure(id: number): IEventStructure {
    let event = this.completed.find(e=>e.id===id)
    if(event !== undefined) return event
    event = this.planned.find(e=>e.id===id)
    if(event !== undefined) return event
    const revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) return revent
  }

  getEventData(id: number): EventData {
    let event = this.completed.find(e=>e.id===id)
    if(event !== undefined) return singleEventStructureToEventData(event)
    event = this.planned.find(e=>e.id===id)
    if(event !== undefined) return singleEventStructureToEventData(event)
    const revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) return repeatableEventStructureToEventData(revent)
  }

  /**
   * Добавление в список выполненного события
   * @param e Событие
   * @param isFinal Признак окончательной операции в цепочке. Если true, то при завершении вызывается onChangeList
   */
  addCompletedEventStructure(e: IEventStructure, isFinal: boolean = true) {
    let projectId = projectsStore.getIdWithIncEventsCount(e.project);

    //let projectId = e.project? this.projects.findIndex(p=>p.name===e.project) : 0
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

  addCompletedEventData(e: EventData, isFinal: boolean = true) {
    this.addCompletedEventStructure(eventDataToIEventStructure(e), isFinal)
  }

  /**
   * Добавление в список запланированного события
   * @param e Событие
   * @param isFinal Признак окончательной операции в цепочке. Если true, то при завершении вызывается onChangeList
   */
  addPlannedEventStructure(e: IEventStructure, isFinal: boolean = true) {
    let projectId = projectsStore.getIdWithIncEventsCount(e.project);

    //let projectId = e.project? this.projects.findIndex(p=>p.name===e.project) : 0
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

  addPlannedEventData(raw: EventData, isFinal: boolean = true) {
    this.addPlannedEventStructure(eventDataToIEventStructure(raw), isFinal)
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
   * @param e Модифицированное событие
   */
  completeEvent(id: number, currentdate: timestamp, e: EventData) {
    {
      let event = this.planned.find(e => e.id===id)
      if(event !== undefined) {
        this.addCompletedEventStructure({...event, ...eventDataToIEventStructure(e)}, false)
        this.deleteEvent(event.id)
        return
      }
    }
    let revent = this.plannedRepeatable.find(e => e.id===id)
    if(revent !== undefined) {
      this.addCompletedEventStructure({...eventDataToIEventStructure(e), start: currentdate, end: currentdate + 86400}, false)
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
      // Определяем первое повторяемое событие после выполненного
      else revent.start = ZCron.first(revent.repeat,currentdate + 86400)
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
  uncompleteEvent(id: number, raw: EventData) {
    let event = this.completed.find(e=>e.id===id)
    if(event !== undefined) {
      this.addPlannedEventStructure({...event, ...eventDataToIEventStructure(raw)}, false)
      this.deleteEvent(event.id)
      return
    }
  }

  /**
   * Изменение параметров события
   * @param id Идентификатор события
   * @param e Модифицированное событие в текстовом представлении rawEvent
   */
  updateEvent(id: number, e: EventData) {
    {
      let event = this.completed.find(e => e.id===id)
      if(event !== undefined) {
        this.addCompletedEventData(e, false)
        this.deleteEvent(id)
        return
      }
      event = this.planned.find(e => e.id===id)
      if(event !== undefined) {
        this.addPlannedEventData(e, false)
        this.deleteEvent(id)
        return
      }
    }
    let revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) {
      this.addPlannedEventData(e, false)
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
        this.addCompletedEventStructure(newevent)
        return
      }
      event = this.planned.find(e=>e.id===id)
      if(event !== undefined) {
        const delta = todate - event.start
        const newevent = {...event, start: todate, end: event.end? event.end+delta : event.end}
        this.addPlannedEventStructure(newevent)
        return
      }
    }
    let revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) {
      const delta = todate - revent.start
      const newevent = {...revent, repeat: '', start: todate, end: todate + 86400}
      this.addPlannedEventStructure(newevent)
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
  transformToSingleEvent(id: number, currentdate: timestamp, raw: EventData) {
    let revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) {
      this.addPlannedEventStructure({...eventDataToIEventStructure(raw), repeat: undefined, start: currentdate, end: currentdate + 86400}, false)
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

  /** 
   * Функция предварительной сортировки событий,
   * упорядочивает для более быстрой сортировки в методе getEvents
   */
  sort() {
    // в начало массива поднимаются события с самой ранней датой начала start
    // при одинаковой дате начала первыми идут задачи с наибольшей длительностью в днях days
    this.completed.sort((a,b)=>{
      const d = a.start-b.start
      return d === 0 ? b.days-a.days : d
    })
    this.planned.sort((a,b)=>{
      const d = a.start-b.start
      return d === 0 ? b.days-a.days : d
    })
    // повторяемые сортируются по времени
    this.plannedRepeatable.sort((a,b)=>a.time-b.time)
  }
}

/** Синглтон-экземпляр хранилища событий */
//export const eventsStore = new EventsStore;