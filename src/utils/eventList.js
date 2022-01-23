import DateTime from './datetime.js'
import ZCron from './zcron.js'


// Преобразование повторяемого события в одиночное
const repeatableToSingle = (id, e, timestamp) => ({
  id: id,
  name: e.name,
  comment: e.comment,
  project: e.project,
  background: e.background,
  color: e.color,
  start: timestamp,
  time: e.time,
  end: timestamp + 86400,
  days: 1,
  credit: e.credit,
  debit: e.debit,
})

// Преобразование события в компактное представление для кэша и для отображения
const eventToCompact = (e, timestamp, completed) => ({
  id: e.id,
  name: e.name,
  background: e.background,
  color: e.color,
  start: e.start,
  time: e.time,
  end: e.end,
  days: Math.ceil((e.end-timestamp)/86400),
  credit: e.credit,
  debit: e.debit,
  completed: completed
})


// Класс списка событий, полученных из хранилища и приведенных к оптимизированной для обработки форме
// Также подготавливает и оптимизирует данные для сохранения в хранилище (уменьшает размер)
// Создает новые события, удаляет и изменяет существующие, переводит планируемые в выполненные
//
// формат записей в списках rawCompletedList и rowPlannedList:
// {                                          default   
//    name:string,                    mandatory   
//    comment:string,                 optional    ''
//    project:string,                 optional    ''
//  ??timezone:int,                   optional    local timezone
//    repeat:string 'D M W',          optional    ''
//    start:string 'YYYY.MM.DD',      mandatory
//    end:string 'YYYY.MM.DD',        optional
//    time:string 'HH:MI',            optional    
//    duration:string 'DD HH:MI',     optional  
//    credit:float,                   optional    0
//    debit:float                     optional    0
// }
//
const rawToEvent = e => {

  const start = DateTime.getBeginDayTimestamp(new Date(e.start)/1000)
  const time = e.time? DateTime.HHMMToSeconds(e.time) : null
  const duration = e.duration? DateTime.DDHHMMToSeconds(e.duration) : 0
  console.log(duration)


  if(e.repeat) {
    return {
      name: e.name,
      comment: e.comment ?? '',
      project: e.project ?? '',
      repeat: e.repeat,
      start, time, duration,
      repeatEnd: e.repeatEnd? DateTime.getBeginDayTimestamp(new Date(e.repeatEnd)/1000) : 0,
      credit: e.credit ?? 0, debit: e.debit ?? 0
    }
  }

  const startdatetime = time!==null? start + time : start
  const end = duration? startdatetime + duration : 
    e.end? DateTime.getBeginDayTimestamp(new Date(e.end)/1000) : start+86400

  return { 
    name: e.name, comment: e.comment ?? '', project: e.project ?? '',
    start, time, duration, end, credit: e.credit ?? 0, debit: e.debit ?? 0
  }
}

// формат записей в списках completed и planned:
// {
//    id:int,             идентификатор
//    name:string,        наименование
//    comment:string,     описание
//    project:string,     наименование проекта
//    background:string,  цвет фона, из проекта
//    color:string,       цвет текста, из проекта
//    start:timestamp,    дата события, указывает на начало дня по местному времени
//    time:sec,           время начала события, количество секунд с начала дня, null-неопределен
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

  constructor(rawCompletedList, rawPlannedList, rawProjects) {

    this.cachedPlannedEvents = []
    this.cachedCompletedEvents = []
    this.cachedActualBalance = []
    this.cachedPlannedBalance = []

    this.lastId = 1
    this.projects = [...rawProjects]
    this.completed = rawCompletedList.map(raw=>{
      const e = rawToEvent(raw)
      const project = e.project?
        this.projects.find(p=>p.name===e.project):
        {name: '', background: EventList.default_background, color: EventList.default_color}
      return {
        id: this.lastId++,
        name: e.name,
        comment: e.comment,
        project: project.name,
        background: project.background,
        color: project.color,
        start: e.start,
        time: e.time,
        duration: e.duration,
        end: e.end,
        days: Math.ceil((e.end-e.start)/86400),
        credit: e.credit,
        debit: e.debit,
      }
    })
    this.planned = []
    this.plannedRepeatable = []
    rawPlannedList.forEach(raw=>{
      const e = rawToEvent(raw)
      const project = e.project?
        this.projects.find(p=>p.name===e.project):
        {name: '', background: EventList.default_background, color: EventList.default_color}
      if(e.repeat) {
        this.plannedRepeatable.push({
          id: this.lastId++,
          name: e.name,
          comment: e.comment,
          project: project.name,
          background: project.background,
          color: project.color,
          repeat: e.repeat,
          repeatStart: e.start,
          time: e.time,
          duration: e.duration,
          repeatEnd: e.repeatEnd,
          days: 1,
          credit: e.credit,
          debit: e.debit,
        })
        return
      }
      this.planned.push({
        id: this.lastId++,
        name: e.name,
        comment: e.comment,
        project: project.name,
        background: project.background,
        color: project.color,
        start: e.start,
        time: e.time,
        duration: e.duration,
        end: e.end,
        days: Math.ceil((e.end-e.start)/86400),
        credit: e.credit,
        debit: e.debit,
      })
    })
    this.sort()
    this.lastActualBalance = this.calculateActualBalance()
    this.lastActualBalanceDate = this.completed[this.completed.length-1].start
    this.firstActualBalanceDate = this.completed[0].start
  }

  // Функция сортировки событий
  // подготавливает данные для корректной отрисовки
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

  // Вычисление фактического баланса на момент последнего выполненного события
  calculateActualBalance() {
    return this.completed.reduce((balance,e) => balance += e.credit-e.debit, 0)
  }

  // Список планируемых событий, используется кэширование
  getPlannedEvents(timestamp) {
    if(this.cachedPlannedEvents[timestamp] !== undefined) return this.cachedPlannedEvents[timestamp]
    const events = this.planned.reduce( (a,e)=>{
      if(timestamp < e.start || timestamp >= e.end) return a
      return a.push(eventToCompact(e,timestamp,false)), a
    }, [])
    this.plannedRepeatable.reduce( (a,e)=>{
      if(timestamp<e.repeatStart) return a
      if(e.repeatEnd && timestamp+e.time >= e.repeatEnd) return a
      if(ZCron.isMatch(e.repeat, e.repeatStart, timestamp)) 
        a.push(eventToCompact(repeatableToSingle(e.id,e,timestamp),timestamp,false))
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
      if(timestamp >= e.start && timestamp < e.end) a.push(eventToCompact(e,timestamp,true))
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
      if(timestamp > e.start+e.time) a += e.credit - e.debit
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
      out.start = DateTime.getYYYYMMDD(e.start)
      if(e.time!==null) out.time = DateTime.HHMMFromSeconds(e.time)
      if(e.duration) out.duration = DateTime.DDHHMMFromSeconds(e.duration)
      else out.end = DateTime.getYYYYMMDD(e.end)
      if(e.credit) out.credit = e.credit
      if(e.debit) out.debit = e.debit
      return out
    })

    const plannedList = this.plannedRepeatable.reduce((a,e) => {
      const out = {}
      out.name = e.name
      if(e.comment) out.comment = e.comment
      out.repeat = e.repeat
      out.start = DateTime.getYYYYMMDD(e.repeatStart)
      if(e.time!==null) out.time = DateTime.HHMMFromSeconds(e.time)
      if(e.duration) out.duration = DateTime.DDHHMMFromSeconds(e.duration)
      if(e.repeatEnd) out.repeatEnd = DateTime.getYYYYMMDD(e.repeatEnd)
      if(e.credit) out.credit = e.credit
      if(e.debit) out.debit = e.debit
      return a.push(out), a
    }, [])

    this.planned.reduce((a,e) => {
      const out = {}
      out.name = e.name
      if(e.comment) out.comment = e.comment
      out.start = DateTime.getYYYYMMDD(e.start)
      if(e.time!==null) out.time = DateTime.HHMMFromSeconds(e.time)
      if(e.duration) out.duration = DateTime.DDHHMMFromSeconds(e.duration)
      else out.end = DateTime.getYYYYMMDD(e.end)
      if(e.credit) out.credit = e.credit
      if(e.debit) out.debit = e.debit
      return a.push(out), a
    }, plannedList)

    return {completedList, plannedList}
  }


}

