import { timestamp } from 'src/utils/datetime'
import ZCron from 'src/utils/zcron'
import { IEvent, IRepeatableEvent, ISingleEvent } from './ievents'
import { rawEvent, rawToEvent, repeatableEventToRaw, singleEventToRaw } from './rawEvents'
import { compact, repeatableToCompact, singleToCompact } from './compact'

/** Одиночное событие */
type SingleEvent = ISingleEvent & {
  /** Идентификатор события */
  id: number
  /** Индекс записи проекта */
  projectId: number
  /** Длительность события в днях */
  days: number
}

/** Повторяемое событие */
type RepeatableEvent = IRepeatableEvent & {
  /** Идентификатор события */
  id: number
  /** Индекс записи проекта */
  projectId: number
}

/** 
 * Класс списка событий, полученных из хранилища и приведенных к оптимизированной для обработки форме.
 * Также подготавливает и оптимизирует данные для сохранения в хранилище (уменьшает размер)
 * Создает новые события, удаляет и изменяет существующие, переводит планируемые в выполненные
 */
export default class EventList {
  static default_background = 'lightgray'
  static default_color = 'black'

  private cachedEvents = []
  private cachedActualBalance = []
  private cachedPlannedBalance = []

  private lastId = 1
  projects = [{name:'Default', background:EventList.default_background, color:EventList.default_color}]
  completed: SingleEvent[] = []
  planned: SingleEvent[] = []
  plannedRepeatable: RepeatableEvent[] = []
  lastActualBalance = 0
  lastActualBalanceDate = 0
  firstActualBalanceDate = 0

  constructor({completedList = [], plannedList=[], projectsList=[]}) {
    this.reload({completedList, plannedList, projectsList})
  }
  
  reload({completedList=[], plannedList=[], projectsList=[]}) {
    this.cachedEvents = []
    this.cachedActualBalance = []
    this.cachedPlannedBalance = []
    this.lastId = 1
    this.projects = [{name:'Default', background:EventList.default_background, color:EventList.default_color}, ...projectsList]
    this.completed = []
    completedList.forEach(raw => { this.addCompletedEvent(rawToEvent(raw)) })
    this.planned = []
    this.plannedRepeatable = []
    plannedList.forEach(raw=>this.addPlannedEvent(rawToEvent(raw)))
    this.sort()
    this.lastActualBalance = this.calculateActualBalance()
    this.lastActualBalanceDate = this.completed.length? this.completed[this.completed.length-1].start : 0
    this.firstActualBalanceDate = this.completed.length? this.completed[0].start : 0
  }

  addCompletedEvent(e: ISingleEvent) {
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
  }

  addPlannedEvent(e: IEvent) {
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
      return
    }
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

  /** Очищение кэша */
  clearCache() {
    this.cachedEvents = []
    this.cachedActualBalance = []
    this.cachedPlannedBalance = []
    this.lastActualBalance = this.calculateActualBalance()
    this.lastActualBalanceDate = this.completed.length? this.completed[this.completed.length-1].start : 0
    this.firstActualBalanceDate = this.completed.length? this.completed[0].start : 0
  }

  /** Удаление события по идентификатору */
  deleteEvent(id: number) {
    this.completed = this.completed.filter(e=>e.id!==id)
    this.planned = this.planned.filter(e=>e.id!==id)
    this.plannedRepeatable = this.plannedRepeatable.filter(e=>e.id!==id)
    this.clearCache()
  }

  /**
   * Изменение признака завершенности события с одновременной модификацией параметров события.
   * Повторяемые события при завершении трансформируются в одиночные, модификация затрагивает только
   * текущее событие.
   * @param id Идентификатор события
   * @param currentdate 
   * @param raw 
   * @returns 
   */
  completeEvent(id: number, currentdate: timestamp, raw: rawEvent) {
    {
      let event = this.completed.find(e=>e.id===id)
      if(event !== undefined) {
        this.addPlannedEvent({...event, ...rawToEvent(raw)})
        this.sort()
        this.deleteEvent(event.id)
        return
      }
      event = this.planned.find(e=>e.id===id)
      if(event !== undefined) {
        this.addCompletedEvent({...event, ...rawToEvent(raw)})
        this.sort()
        this.deleteEvent(event.id)
        return
      }
    }
    let revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) {
      this.addCompletedEvent({...rawToEvent(raw), start: currentdate, end: currentdate + 86400})
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
        this.deleteEvent(revent.id)
      }
      this.sort()
      this.clearCache()
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
        this.addCompletedEvent(rawToEvent(raw))
        this.sort()
        this.deleteEvent(id)
        return
      }
      event = this.planned.find(e=>e.id===id)
      if(event !== undefined) {
        this.addPlannedEvent(rawToEvent(raw))
        this.sort()
        this.deleteEvent(id)
        return
      }
    }
    let revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) {
      this.addPlannedEvent(rawToEvent(raw))
      this.sort()
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
        this.sort()
        this.clearCache()
        return
      }
      event = this.planned.find(e=>e.id===id)
      if(event !== undefined) {
        const delta = todate - event.start
        event.start = todate
        event.end = event.end? event.end+delta : event.end
        this.sort()
        this.clearCache()
        return
      }
    }
    let revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) {
      if(revent.repeat[0]!=='/' || revent.start!==currentdate) return
      const delta = todate - currentdate
      revent.start = revent.start + delta
      revent.end = revent.end? revent.end+delta : revent.end
      this.sort()
      this.clearCache()
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
        this.sort()
        this.clearCache()
        return
      }
      event = this.planned.find(e=>e.id===id)
      if(event !== undefined) {
        const delta = todate - event.start
        const newevent = {...event, start: todate, end: event.end? event.end+delta : event.end}
        this.addPlannedEvent(newevent)
        this.sort()
        this.clearCache()
        return
      }
    }
    let revent = this.plannedRepeatable.find(e=>e.id===id)
    if(revent !== undefined) {
      const delta = todate - revent.start
      const newevent = {...revent, repeat: '', start: todate, end: todate + 86400}
      this.addPlannedEvent(newevent)
      this.sort()
      this.clearCache()
      return
    }
  }


  // Функция предварительной сортировки событий
  // упорядочивает для более быстрой сортировки в методе getEvents
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

  // список всех событий за день, отсортированных для отрисовки
  // данные кэшируются
  getEvents(timestamp: timestamp): compact[] {
    if(this.cachedEvents[timestamp] !== undefined) return this.cachedEvents[timestamp]
    const events: compact[] = this.planned.reduce( (a,e) => {
      if(timestamp < e.start || timestamp >= e.end) return a
      const color = this.projects[e.projectId].color
      const background = this.projects[e.projectId].background
      a.push(singleToCompact(e, timestamp, false, color, background))
      return a
    }, [])
    this.plannedRepeatable.reduce( (a,e) => {
      if(timestamp<e.start) return a
      if(e.end && timestamp+e.time >= e.end) return a
      if(ZCron.isMatch(e.repeat, e.start, timestamp)) {
        const color = this.projects[e.projectId].color
        const background = this.projects[e.projectId].background
        a.push(repeatableToCompact(e, timestamp, false, color, background))
      }
      return a
    }, events)
    this.completed.reduce( (a,e) => {
      if(timestamp >= e.start && timestamp < e.end) {
        const color = this.projects[e.projectId].color
        const background = this.projects[e.projectId].background
        a.push(singleToCompact(e,timestamp,true, color, background))
      }
      return a
    }, events)
    events.sort((a,b)=>{
      // сначала с более ранней датой начала start (многодневные наверху)
      // при одинаковой дате начала, первыми будут с наибольшей длительностью end-start
      // при одинаковой длительности, по времени события time
      var d = a.start-b.start
      if(d) return d
      d = (b.end-b.start)-(a.end-a.start)
      if(d) return d
      return a.time-b.time
    })
    this.cachedEvents[timestamp] = events
    return events
  }

  // Список событий за день с плейсхолдерами ({id:-1}), за исключением соответствующих id из стека skip
  // Может использоваться для создания структуры для рендеринга в календаре с многодневными событиями
  // Стек skip обновляется для возможности использования в цепочке обработок
  getEventsWithPlaceholders(timestamp, skip=[], events=[]) {
    // очистка стека
    while(skip.length>0) {
      // в стеке skip последний элемент может блокировать очищение стека если его действие не завершено
      // очищаем если последний элемент завершил действие
      if(timestamp < skip[skip.length-1].end) break
      skip.pop()
    }
    // добавление плейсхолдеров
    skip.forEach( _=>events.push({id: -1}) )

    this.getEvents(timestamp).reduce((a,e)=>{
      if(skip.some(s=>e.id===s.id)) return a
      if((e.end-e.start)>86400) skip.push({id:e.id,end:e.end})
      return a.push(e), a
    }, events)

    return events
  }

  // Список планируемых событий, за исключением id из стека skip
  // Может использоваться для создания списка, исключая повторы многодневных событий
  // стек skip обновляется для возможности использования в цепочке обработок
  getPlannedEventsFilteredBySkip(timestamp, skip=[], events=[]) {
    while(skip.length>0) {
      if(timestamp < skip[skip.length-1].end) break
      skip.pop()
    }
    this.getEvents(timestamp).reduce((a,e)=>{
      if(skip.some(s=>e.id===s.id) || e.completed) return a
      if(e.days>1) skip.push({id:e.id,end:e.end})
      return a.push(e), a
    }, events)
  }

  // Список планируемых событий за интервал времени (begin,end)
  getPlannedEventsInInterval(begin,end) {
    const events = [], skip = []
    for(let t=begin;t<end;t+=86400) this.getPlannedEventsFilteredBySkip(t, skip, events)
    return events
  }

  // Вычисление фактического баланса на момент последнего выполненного события
  calculateActualBalance() {
    return this.completed.reduce((balance,e) => balance += e.credit-e.debit, 0)
  }
  
  // Фактический баланс на начало дня
  getActualBalance(timestamp) {
    if(timestamp < this.firstActualBalanceDate) return 0
    if(timestamp > this.lastActualBalanceDate) return this.lastActualBalance
    if(this.cachedActualBalance[timestamp] !== undefined) return this.cachedActualBalance[timestamp]
    const balance = this.completed.reduce((a,e)=>{
      if(timestamp > e.start+e.time) a += e.credit - e.debit
      return a
    }, 0)
    this.cachedActualBalance[timestamp] = balance
    return balance
  }

  // Планируемый баланс на начало дня
  getPlannedBalance(timestamp) {
    if(timestamp < this.firstActualBalanceDate) return 0
    if(timestamp <= this.lastActualBalanceDate) return this.getActualBalance(timestamp)
    if(this.cachedPlannedBalance[timestamp] !== undefined) return this.cachedPlannedBalance[timestamp]
    const prevEvents = this.getPlannedEventsInInterval(this.lastActualBalanceDate,timestamp)
    const balance = prevEvents.reduce((a,e)=>a += e.credit-e.debit, this.lastActualBalance)
    this.cachedPlannedBalance[timestamp] = balance
    return balance
  }

  // Планируемое изменение баланса с учетом завершенных событий
  getPlannedBalanceChange(timestamp) {
    return this.getEvents(timestamp).reduce((a,e)=> a += e.credit-e.debit, 0)
  }

  // Подготовка для сохранения в хранилище
  prepareToStorage() {
    const completedList = this.completed.map(e=>singleEventToRaw(e))
    const plannedList = this.plannedRepeatable.reduce((a,e) => {
      return a.push(repeatableEventToRaw(e)), a
    }, [])
    this.planned.reduce((a,e) => {
      return a.push(singleEventToRaw(e)), a
    }, plannedList)
    return {projectsList: this.projects.slice(1), completedList, plannedList}
  }


}

