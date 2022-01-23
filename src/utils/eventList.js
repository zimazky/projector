import DateTime from './datetime.js'
import ZCron from './zcron.js'

class Event {
  static getStartDay = obj=>DateTime.getBeginDayTimestamp(obj.start)
  static getStartTime = obj=>DateTime.getTime(obj.start)
  static getEnd = obj => obj.end!==undefined ? obj.end : obj.duration!==undefined ?
    obj.start+obj.duration*60 : DateTime.getEndDayTimestamp(obj.start)
  static getEndDayOfEnd = obj => DateTime.getEndDayTimestamp(Event.getEnd(obj))
  static getDuration = obj => obj.end!==undefined ? obj.end-obj.start :
    obj.duration!==undefined ? obj.duration*60 : DateTime.getTimeToEndDay(obj.start)
  static getDurationInDays = obj => {
    const d = obj.end!==undefined ? 
    (DateTime.getEndDayTimestamp(obj.end)-DateTime.getBeginDayTimestamp(obj.start))/86400 :
      obj.duration!==undefined ? 
        (DateTime.getEndDayTimestamp(obj.start+obj.duration*60)-DateTime.getBeginDayTimestamp(obj.start))/86400 : 1
    return Math.ceil(d)
  }
  static isRepeatable = obj=>obj.repeat!==undefined
  static isIncludes = (obj,timestamp) => timestamp>=Event.getStartDay(obj) && timestamp<Event.getEndDayOfEnd(obj)

  static toPlannedEventItem = (id,obj,days) => (
    {id, name: obj.name, time: Event.getStartTime(obj), days, debit: obj.debit??0, credit: obj.credit??0})
  static toActualEventItem = (id,obj,days) => (
    {id, name: obj.name, time: Event.getStartTime(obj), days, debit: obj.debit??0, credit: obj.credit??0})

}

const dateToString = d => new Date(d*1000).toLocaleString() 

// Преобразование повторяемого события в одиночное
const repeatableToSingle = (id,e,timestamp) => {
  const start = timestamp + e.time
  return ({
    id: id,
    name: e.name,
    comment: e.comment,
    project: e.project,
    background: e.background,
    color: e.color,
    start: start,
    startDay: DateTime.getBeginDayTimestamp(start),
    end: start + e.duration,
    days: 1,
    credit: e.credit,
    debit: e.debit,
    completed: e.completed
  })
}

// Преобразование события в компактное представление для кэша и для отображения
const eventToCompact = (e,timestamp) => ({
  id: e.id,
  name: e.name,
  background: e.background,
  color: e.color,
  start: e.start,
  end: e.end,
  days: DateTime.getDifferenceInDays(timestamp,e.end)+1,
  credit: e.credit,
  debit: e.debit,
  completed: e.completed
})


// Класс списка событий, полученных из хранилища и приведенных к оптимизированной для обработки форме
// Также подготавливает и оптимизирует данные для сохранения в хранилище (уменьшает размер)
// Создает новые события, удаляет и изменяет существующие, переводит планируемые в выполненные
//
// формат записей в списках rowCompletedList и rowPlannedList:
// {                                          default   
//    name:string,                mandatory   
//    comment:string,             optional    ''
//    project:string,             optional    ''
//    timezone:int,               optional    local timezone
//    start:string 'YYYY.MM.DD',  mandatory
//    repeat:string 'D M W',      optional    ''
//    time:string 'HH:MI',        optional    
//    duration:string 'DD HH:MI', optional    
//    end:string 'YYYY.MM.DD',    optional
//    credit:float,               optional    0
//    debit:float                 optional    0
// }
//
// формат записей в списках completed и planned:
// {
//    id:int,             идентификатор
//    name:string,        наименование
//    comment:string,     описание
//    project:string,     наименование проекта
//    background:string,  цвет фона, из проекта
//    color:string,       цвет текста, из проекта
//    start:timestamp,    дата события, указывает на начало дня по местному времени
//    time:sec,           время начала события, количество секунд с начала дня, (-1)-неопределен
//    duration:sec,       длительность в секундах, 0-неопределен, если определен задает дату завершения
//    days:int,           длительность в днях, минимум 1
//  ??end:timestamp,      дата завершения, 0-неопределен, если определен и duration==0 задает дату завершения
//    credit:float,       поступление средств
//    debit:float,        списание средств
//    completed:boolean   true/false
// }
// формат записей в списке plannedRepeatable:
// {
//    id:int,             идентификатор
//    name:string,        наименование
//    comment:string,     описание
//    project:string,     наименование проекта
//    background:string,  цвет фона, из проекта
//    color:string,       цвет текста, из проекта
//    repeat:string,      шаблон расписания
//    start:timestamp,    дата начала расписания, указывает на начало дня по местному времени
//    time:sec,           время начала события, количество секунд с начала дня, (-1)-неопределен
//    duration:sec,       длительность события в секундах, 0-неопределен
//    days:int,           длительность в днях
//    end:timestamp,      конец действия расписания, 0-неопределен
//    credit:float,       поступление средств
//    debit:float,        списание средств
//    completed:boolean   false
// }


export default class EventList {
  static default_background = 'lightgray'
  static default_color = 'black'

  constructor(rowCompletedList, rowPlannedList, rowProjects) {

    this.cachedPlannedEvents = []
    this.cachedCompletedEvents = []
    this.cachedActualBalance = []
    this.cachedPlannedBalance = []

    this.lastId = 1
    this.projects = [...rowProjects]
    console.log(this.projects)
    this.completed = rowCompletedList.map(e=>{
      const project = e.project?
        this.projects.find(p=>p.name===e.project):
        {name: '', background: EventList.default_background, color: EventList.default_color}
      return {
        id: this.lastId++,
        name: e.name,
        comment: e.comment?? '',
        project: project.name,
        background: project.background,
        color: project.color,
        start: e.start,
        startDay: DateTime.getBeginDayTimestamp(e.start),
        end: Event.getEnd(e),
        days: Event.getDurationInDays(e),
        credit: e.credit?? 0,
        debit: e.debit?? 0,
        completed: true
      }
    })
    this.planned = []
    this.plannedRepeatable = []
    rowPlannedList.forEach(e=>{
      const project = e.project?
        this.projects.find(p=>p.name===e.project):
        {name: '', background: EventList.default_background, color: EventList.default_color}
      if(e.repeat) {
        this.plannedRepeatable.push({
          id: this.lastId++,
          name: e.name,
          comment: e.comment?? '',
          project: project.name,
          background: project.background,
          color: project.color,
          repeat: e.repeat,
          repeatStart: e.start, //?????? может не нужен
          repeatStartDay: DateTime.getBeginDayTimestamp(e.start),
          time: DateTime.getTime(e.start),
          duration: e.duration ? e.duration*60 : DateTime.getTimeToEndDay(e.start),
          repeatEnd: e.repeatEnd?? null,
          days: 1,
          credit: e.credit?? 0,
          debit: e.debit?? 0,
          completed: false
        })
        return
      }
      this.planned.push({
        id: this.lastId++,
        name: e.name,
        comment: e.comment?? '',
        project: project.name,
        background: project.background,
        color: project.color,
        start: e.start,
        startDay: DateTime.getBeginDayTimestamp(e.start),
        end: Event.getEnd(e),
        days: Event.getDurationInDays(e),
        credit: e.credit?? 0,
        debit: e.debit?? 0,
        completed: false
      })
    })
    this.sort()
    this.lastActualBalance = this.calculateActualBalance()
    this.lastActualBalanceDate = this.completed[this.completed.length-1].startDay
    this.firstActualBalanceDate = this.completed[0].startDay
  }

  // Функция сортировки событий
  // подготавливает данные для корректной отрисовки
  sort() {
    // в начало массива поднимаются события с самой ранней датой начала startDay
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

  // Вычисление фактического баланса на момент последнего выполненного события
  calculateActualBalance() {
    return this.completed.reduce((balance,e) => balance += e.credit-e.debit, 0)
  }

  // Список планируемых событий, используется кэширование
  getPlannedEvents(timestamp) {
    if(this.cachedPlannedEvents[timestamp] !== undefined) return this.cachedPlannedEvents[timestamp]
    const events = this.planned.reduce( (a,e)=>{
      if(timestamp < e.startDay || timestamp >= DateTime.getEndDayTimestamp(e.end)) return a
      return a.push(eventToCompact(e,timestamp)), a
    }, [])
    this.plannedRepeatable.reduce( (a,e)=>{
      if(timestamp<e.repeatStartDay) return a
      if(e.repeatEnd && timestamp+e.time >= e.repeatEnd) return a
      if(ZCron.isMatch(e.repeat, e.repeatStartDay, timestamp)) a.push(eventToCompact(repeatableToSingle(e.id,e,timestamp),timestamp))
      return a
    }, events)
    this.cachedPlannedEvents[timestamp] = events
    //console.log(events)
    return events
  }

  // Список выполненных событий, используется кэширование
  getCompletedEvents(timestamp) {
    if(this.cachedCompletedEvents[timestamp] !== undefined) return this.cachedCompletedEvents[timestamp]
    const events = this.completed.reduce( (a,e) => {
      if(timestamp >= e.startDay && timestamp < DateTime.getEndDayTimestamp(e.start)) a.push(eventToCompact(e,timestamp))
      return a
    }, [])
    this.cachedCompletedEvents[timestamp] = events
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

    this.getPlannedEvents(timestamp).reduce((a,e)=>{
      //if(e.days>1) {
      if(skip.some(s=>e.id===s.id)) return a
      if(e.days>1) skip.push({id:e.id,end:e.end})
      //}
      return a.push(e), a
    }, events)

    this.getCompletedEvents(timestamp).reduce((a,e)=>{
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
    this.getPlannedEvents(timestamp).reduce((a,e)=>{
      //if(e.days>1) {
      if(skip.some(s=>e.id===s.id)) return a
      if(e.days>1) skip.push({id:e.id,end:e.end})
      //}
      return a.push(e), a
    }, events)
  }

  // Список планируемых событий за интервал времени (begin,end)
  getPlannedEventsInInterval(begin,end) {
    const events = [], skip = []
    for(let t=begin;t<end;t+=86400) this.getPlannedEventsFilteredBySkip(t, skip, events)
    return events
  }

  // Фактический баланс на начало дня
  getActualBalance(timestamp) {
    if(timestamp < this.firstActualBalanceDate) return 0
    if(timestamp >= this.lastActualBalanceDate) return this.lastActualBalance
    if(this.cachedActualBalance[timestamp] !== undefined) return this.cachedActualBalance[timestamp]
    const balance = this.completed.reduce((a,e)=>{
      if(timestamp >= e.start) a += e.credit - e.debit
      return a
    }, 0)
    this.cachedActualBalance[timestamp] = balance
    return balance
  }

  // Планируемый баланс на начало дня
  getPlannedBalance(timestamp) {
    if(timestamp < this.firstActualBalanceDate) return 0
    if(timestamp < this.lastActualBalanceDate) return this.getActualBalance(timestamp)
    if(this.cachedPlannedBalance[timestamp] !== undefined) return this.cachedPlannedBalance[timestamp]
    const prevEvents = this.getPlannedEventsInInterval(this.lastActualBalanceDate,timestamp)
    const balance = prevEvents.reduce((a,e)=>a += e.credit-e.debit, this.lastActualBalance)
    this.cachedPlannedBalance[timestamp] = balance
    return balance
  }

  getPlannedBalanceChange(timestamp) {
    return this.getPlannedEvents(timestamp).reduce((a,e)=> a += e.credit-e.debit, 0)
  }

  // Подготовка для сохранения в хранилище
  prepareToStorage() {
    const completedList = this.completed.map(e=>{
      const out = {}
      out.name = e.name
      if(e.comment) out.comment = e.comment
      out.start = dateToString(e.start)
      out.end = dateToString(e.end)
      if(e.credit) out.credit = e.credit
      if(e.debit) out.debit = e.debit
      return out
    })

    const plannedList = this.plannedRepeatable.reduce((a,e) => {
      const out = {}
      out.name = e.name
      if(e.comment) out.comment = e.comment
      out.repeat = e.repeat
      out.start = dateToString(e.repeatStart)
      out.duration = e.duration
      if(e.repeatEnd) out.repeatEnd = dateToString(e.repeatEnd)
      if(e.credit) out.credit = e.credit
      if(e.debit) out.debit = e.debit
      return a.push(out), a
    }, [])

    this.planned.reduce((a,e) => {
      const out = {}
      out.name = e.name
      if(e.comment) out.comment = e.comment
      out.start = dateToString(e.start)
      out.end = dateToString(e.end)
      if(e.credit) out.credit = e.credit
      if(e.debit) out.debit = e.debit
      return a.push(out), a
    }, plannedList)

    return {completedList, plannedList}
  }


}

