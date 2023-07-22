import { projectsStore } from '../../stores/projects'
import { timestamp } from '../../utils/datetime'
import ZCron from '../../utils/zcron'
import { rawToEvent, repeatableEventToRaw, singleEventToRaw } from './rawEvents'

/** Базовый интерфейс события, общий для одиночных и повторяемых событий */
export interface IEvent {
  name: string
  repeat?: string
  comment: string
  project: string
  start: timestamp
  time: number | null
  duration: number
  end: timestamp
  credit: number
  debit: number
}

/** Тип события, сохраняемого во внешнем хранилище */
export type EventData = {
  /** Наименование события (обязательное поле) */
  name: string
  /** Комментарий */
  comment?: string
  /** Наименование проекта */
  project?: string
  /** Строка шаблона zcrone для повторяемых событий*/
  repeat?: string
  /** Дата события для одиночных / дата начала расписания для повторяемых событий ('YYYY.MM.DD') */
  start: string
  /** Время начала события ('H:MM') */
  time?: string
  /** 
   * Длительность события для одиночных событий ('Dd H:MM').
   * Дата завершения события считается как end = начало_след_дня(start+time+duration).
   * Для повторяемых - событие не должно выходить за пределы дня, иначе игнорируется.
   * */
  duration?: string
  /** 
   * Дата завершения события для одиночных событий ('YYYY.MM.DD').
   * Событие длится до указанной даты, исключая саму дату. 
   * Указанная дата игнорируется, если задана длительность события duration.
   * Для повторяемых событий - конец расписания.
   * */
  end?: string
  /** Поступление на счет */
  credit?: number
  /** Списание со счета */
  debit?: number
}

/** Структура одиночного события для хранения в классе хранилища */
export type SingleEventStructure = {
  /** Идентификатор события */
  id: number
  /** Наименование */
  name: string
  /** Комментарий */
  comment: string
  /** Наименование проекта */
  project: string
  /** Дата события, указывает на начало дня по местному времени */
  start: timestamp
  /** Время начала события, количество секунд с начала дня. null - неопределено */
  time: number | null
  /** Длительность события в секундах. 0 - неопределено. Если определено, end = начало_след_дня(start + time + duration) */
  duration: number
  /** Дата завершения. Игнорируется, если задана длительность. 0 - неопределено */
  end: timestamp
  /** Поступление средств на счет */
  credit: number
  /** Списание средств со счета */
  debit: number

  /** Индекс записи проекта */
  projectId: number
  /** Длительность события в днях */
  days: number
}

/** Структура повторяемого события для хранения в классе хранилища */
export type RepeatableEventStructure = {
  /** Идентификатор события */
  id: number
  /** Наименование */
  name: string
  /** Шаблон расписания в формате zcron "D M W" */
  repeat: string
  /** Комментарий */
  comment: string
  /** Наименование проекта */
  project: string
  /** Дата начала расписания, указывает на начало дня по местному времени */
  start: timestamp
  /** Время начала события, количество секунд с начала дня, null-неопределен */
  time: number | null
  /** Длительность события в секундах. Игнорируется, если событие выходит за пределы дня. */
  duration: number
  /** Дата завершения действия расписания. 0 - неопределено */
  end: timestamp
  /** Поступление средств на счет */
  credit: number
  /** Списание средств со счета */
  debit: number

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
  completed: SingleEventStructure[] = []
  /** Список запланированных, одиночных событий */
  planned: SingleEventStructure[] = []
  /** Список запланированных, повторяемых событий */
  plannedRepeatable: RepeatableEventStructure[] = []
  /** Колбэк функция, вызывается при каждом изменении списка */
  onChangeList = () => {}

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
    const plannedList: EventData[] = this.plannedRepeatable.reduce((a,e) => {
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

  getRawEvent(id: number): EventData {
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
  addCompletedEvent(e: IEvent, isFinal: boolean = true) {
    projectsStore.getIdWithIncEventsCount(e.project);

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
    projectsStore.getIdWithIncEventsCount(e.project);

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

  addPlannedRawEvent(raw: EventData, isFinal: boolean = true) {
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
  completeEvent(id: number, currentdate: timestamp, raw: EventData) {
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
  updateEvent(id: number, raw: EventData) {
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
  transformToSingleEvent(id: number, currentdate: timestamp, raw: EventData) {
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

