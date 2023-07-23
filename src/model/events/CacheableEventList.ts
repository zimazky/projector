import { timestamp } from 'src/utils/datetime'
import ZCron from '../../utils/zcron'
import { EventsStore, SingleEventStructure, RepeatableEventStructure } from './eventList'

/** Компактная структура события, предназначенная для кэширования и быстрого рендеринга */
export type compact = {
  /** идентификатор */
  id: number
  /** наименование */
  name: string
  /** цвет фона */
  background: string
  /** цвет текста */
  color: string
  /** начальная дата события / текущая дата для повторяемых событий (unixtime) */
  start: timestamp
  /** время события в секундах с начала дня */
  time: number | null
  /** дата завершения события */
  end: timestamp
  /** длительность в днях, начиная с текущей даты / 1 для повторяемых событий */
  days: number
  /** поступление средств */
  credit: number
  /** списание средств */
  debit: number
  /** Признак завершенности события */
  completed: boolean
  /** Признак повторяемого события */
  repeatable: boolean
}

/** 
 * Функция преобразования одиночного события в компактное представление для отображения и кэширования. 
 * Многодневные события представлены отдельными событиями на каждый день.
 */
function singleToCompact(e: SingleEventStructure, currentDate: timestamp, completed: boolean, color: string, background: string): compact {
  const c: compact = {
    id: e.id,
    name: e.name,
    background: background,
    color: color,
    start: e.start,
    time: e.time,
    end: e.end,
    days: Math.ceil((e.end-currentDate)/86400),
    credit: e.credit,
    debit: e.debit,
    completed: completed,
    repeatable: false
  }
  return c
}

/** 
 * Функция преобразования повторяемого события в компактное представление для отображения и кэширования. 
 * Повторяемых событий нет, они представляются одиночными.
 */
function repeatableToCompact(e: RepeatableEventStructure, currentDate: timestamp, completed: boolean, color: string, background: string): compact {
  const c: compact = {
    id: e.id,
    name: e.name,
    background: background,
    color: color,
    start: currentDate,
    time: e.time,
    end: currentDate + 86400,
    days: 1,
    credit: e.credit,
    debit: e.debit,
    completed: completed,
    repeatable: true
  }
  return c
}

/** Класс списка событий, кэширующий данные и представляющий данные для быстрого рендеринга */
export class CacheableEventList extends EventsStore {

  private cachedEvents = []
  private cachedActualBalance = []
  private cachedPlannedBalance = []
  lastActualBalance = 0
  lastActualBalanceDate = 0
  firstActualBalanceDate = 0

  constructor() {
    super()
    // Задание обработчика, вызываемого при изменении списка событий
    // Список пересортируется и сбрасывается кэш
    this.onChangeList = ()=>{
      this.sort()
      this.clearCache()
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

  /** Очищение кэша */
  clearCache() {
    this.cachedEvents = []
    this.cachedActualBalance = []
    this.cachedPlannedBalance = []
    this.lastActualBalance = this.calculateActualBalance()
    this.lastActualBalanceDate = this.completed.length? this.completed[this.completed.length-1].start : 0
    this.firstActualBalanceDate = this.completed.length? this.completed[0].start : 0
  }
 
  // список всех событий за день, отсортированных для отрисовки
  // данные кэшируются
  getEvents(date: timestamp): compact[] {
    if(this.cachedEvents[date] !== undefined) return this.cachedEvents[date]
    const events: compact[] = this.planned.reduce( (a,e) => {
      if(date < e.start || date >= e.end) return a
      //const {color, background} = this.projects[e.projectId].style
      const color = this.projects[e.projectId].color
      const background = this.projects[e.projectId].background

      a.push(singleToCompact(e, date, false, color, background))
      return a
    }, [])
    this.plannedRepeatable.reduce( (a,e) => {
      if(date < e.start) return a
      if(e.end && date+e.time >= e.end) return a
      if(ZCron.isMatch(e.repeat, e.start, date)) {
        //const {color, background} = this.projects[e.projectId].style
        const color = this.projects[e.projectId].color
        const background = this.projects[e.projectId].background
        a.push(repeatableToCompact(e, date, false, color, background))
      }
      return a
    }, events)
    this.completed.reduce( (a,e) => {
      if(date >= e.start && date < e.end) {
        //const {color, background} = this.projects[e.projectId].style
        const color = this.projects[e.projectId].color
        const background = this.projects[e.projectId].background
        a.push(singleToCompact(e,date,true, color, background))
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
    this.cachedEvents[date] = events
    return events
  }

  static placeholder: compact = {
    id: -1, name: '', background: '', color: '', 
    start: 0, time: null, end: 0, days: 1, credit: 0, debit: 0, completed: false, repeatable: false
  }
  // Список событий за день с плейсхолдерами ({id:-1}), за исключением соответствующих id из стека skip
  // Может использоваться для создания структуры для рендеринга в календаре с многодневными событиями
  // Стек skip обновляется для возможности использования в цепочке обработок
  getEventsWithPlaceholders(date: timestamp, skip: {id: number, end: timestamp}[]=[], events: compact[]=[]) {
    // очистка стека
    while(skip.length>0) {
      // в стеке skip последний элемент может блокировать очищение стека если его действие не завершено
      // очищаем если последний элемент завершил действие
      if(date < skip[skip.length-1].end) break
      skip.pop()
    }
    // добавление плейсхолдеров
    skip.forEach( _=>events.push(CacheableEventList.placeholder) )

    this.getEvents(date).reduce((a,e)=>{
      if(skip.some(s=>e.id===s.id)) return a
      if((e.end-e.start)>86400) skip.push({id:e.id,end:e.end})
      return a.push(e), a
    }, events)

    return events
  }

  // Список планируемых событий, за исключением id из стека skip
  // Может использоваться для создания списка, исключая повторы многодневных событий
  // стек skip обновляется для возможности использования в цепочке обработок
  getPlannedEventsFilteredBySkip(date: timestamp, skip: {id: number, end: timestamp}[]=[], events: compact[]=[]) {
    while(skip.length>0) {
      if(date < skip[skip.length-1].end) break
      skip.pop()
    }
    this.getEvents(date).reduce((a,e)=>{
      if(skip.some(s=>e.id===s.id) || e.completed) return a
      if(e.days>1) skip.push({id:e.id,end:e.end})
      return a.push(e), a
    }, events)
  }

  // Список планируемых событий за интервал времени (begin,end)
  getPlannedEventsInInterval(begin: timestamp, end: timestamp) {
    const skip: {id: number, end: timestamp}[] = []
    const events: compact[] = []
    for(let t=begin; t<end; t+=86400) this.getPlannedEventsFilteredBySkip(t, skip, events)
    return events
  }

  // Вычисление фактического баланса на момент последнего выполненного события
  calculateActualBalance() {
    return this.completed.reduce((balance,e) => balance += e.credit-e.debit, 0)
  }
  
  // Фактический баланс на начало дня
  getActualBalance(date: timestamp) {
    if(date < this.firstActualBalanceDate) return 0
    if(date > this.lastActualBalanceDate) return this.lastActualBalance
    if(this.cachedActualBalance[date] !== undefined) return this.cachedActualBalance[date]
    const balance = this.completed.reduce((a,e)=>{
      if(date > e.start+e.time) a += e.credit - e.debit
      return a
    }, 0)
    this.cachedActualBalance[date] = balance
    return balance
  }

  // Планируемый баланс на начало дня
  getPlannedBalance(date: timestamp) {
    if(date < this.firstActualBalanceDate) return 0
    if(date <= this.lastActualBalanceDate) return this.getActualBalance(date)
    if(this.cachedPlannedBalance[date] !== undefined) return this.cachedPlannedBalance[date]
    const prevEvents = this.getPlannedEventsInInterval(this.lastActualBalanceDate,date)
    const balance = prevEvents.reduce((a,e)=>a += e.credit-e.debit, this.lastActualBalance)
    this.cachedPlannedBalance[date] = balance
    return balance
  }

  // Планируемое изменение баланса с учетом завершенных событий
  getPlannedBalanceChange(date: timestamp) {
    return this.getEvents(date).reduce((a,e)=> a += e.credit-e.debit, 0)
  }


  getFirstPlannedEventDate() {
    if(this.planned.length === 0) return 0
    let first = this.planned[0].start
    this.plannedRepeatable.forEach(e=>{
      if(e.start<first) first = e.start
    })
    return first
  }
}
