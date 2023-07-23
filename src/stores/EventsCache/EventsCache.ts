import { timestamp } from 'src/utils/datetime'
import ZCron from 'src/utils/zcron'
import { EventCacheStructure, repeatableEventToEventCache, singleEventToEventCache } from './EventCacheStructure'
import { eventsStore, mainStore, projectsStore } from 'src/stores/MainStore'
import { makeAutoObservable } from 'mobx'

/** Класс списка событий, кэширующий данные и представляющий данные для быстрого рендеринга */
export class EventsCache {

  private cachedEvents = []
  private cachedActualBalance = []
  private cachedPlannedBalance = []
  lastActualBalance = 0
  lastActualBalanceDate = 0
  firstActualBalanceDate = 0

  constructor() {
    //super()
    // Задание обработчика, вызываемого при изменении списка событий
    // Список пересортируется и сбрасывается кэш
    eventsStore.onChangeList = () => {
      eventsStore.sort()
      mainStore.desyncWithStorages()
      this.clearCache()
    }

    //makeAutoObservable(this)
  }

  /** Очищение кэша */
  clearCache() {
    this.cachedEvents = []
    this.cachedActualBalance = []
    this.cachedPlannedBalance = []
    this.lastActualBalance = this.calculateActualBalance()
    this.lastActualBalanceDate = eventsStore.completed.length? eventsStore.completed[eventsStore.completed.length-1].start : 0
    this.firstActualBalanceDate = eventsStore.completed.length? eventsStore.completed[0].start : 0
  }
 
  // список всех событий за день, отсортированных для отрисовки
  // данные кэшируются
  getEvents(date: timestamp): EventCacheStructure[] {
    if(this.cachedEvents[date] !== undefined) return this.cachedEvents[date]
    const events: EventCacheStructure[] = eventsStore.planned.reduce( (a,e) => {
      if(date < e.start || date >= e.end) return a
      //const {color, background} = this.projects[e.projectId].style
      //const color = this.projects[e.projectId].color
      //const background = this.projects[e.projectId].background
      const color = projectsStore.getById(e.projectId).color
      const background = projectsStore.getById(e.projectId).background
      a.push(singleEventToEventCache(e, date, false, color, background))
      return a
    }, [])
    eventsStore.plannedRepeatable.reduce( (a,e) => {
      if(date < e.start) return a
      if(e.end && date+e.time >= e.end) return a
      if(ZCron.isMatch(e.repeat, e.start, date)) {
        //const {color, background} = this.projects[e.projectId].style
        //const color = this.projects[e.projectId].color
        //const background = this.projects[e.projectId].background
        const color = projectsStore.getById(e.projectId).color
        const background = projectsStore.getById(e.projectId).background
        a.push(repeatableEventToEventCache(e, date, false, color, background))
      }
      return a
    }, events)
    eventsStore.completed.reduce( (a,e) => {
      if(date >= e.start && date < e.end) {
        //const {color, background} = this.projects[e.projectId].style
        //const color = this.projects[e.projectId].color
        //const background = this.projects[e.projectId].background
        const color = projectsStore.getById(e.projectId).color
        const background = projectsStore.getById(e.projectId).background
        a.push(singleEventToEventCache(e,date,true, color, background))
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

  static placeholder: EventCacheStructure = {
    id: -1, name: '', background: '', color: '', 
    start: 0, time: null, end: 0, days: 1, credit: 0, debit: 0, completed: false, repeatable: false
  }
  // Список событий за день с плейсхолдерами ({id:-1}), за исключением соответствующих id из стека skip
  // Может использоваться для создания структуры для рендеринга в календаре с многодневными событиями
  // Стек skip обновляется для возможности использования в цепочке обработок
  getEventsWithPlaceholders(date: timestamp, skip: {id: number, end: timestamp}[]=[], events: EventCacheStructure[]=[]) {
    // очистка стека
    while(skip.length>0) {
      // в стеке skip последний элемент может блокировать очищение стека если его действие не завершено
      // очищаем если последний элемент завершил действие
      if(date < skip[skip.length-1].end) break
      skip.pop()
    }
    // добавление плейсхолдеров
    skip.forEach( _=>events.push(EventsCache.placeholder) )

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
  getPlannedEventsFilteredBySkip(date: timestamp, skip: {id: number, end: timestamp}[]=[], events: EventCacheStructure[]=[]) {
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
    const events: EventCacheStructure[] = []
    for(let t=begin; t<end; t+=86400) this.getPlannedEventsFilteredBySkip(t, skip, events)
    return events
  }

  // Вычисление фактического баланса на момент последнего выполненного события
  calculateActualBalance() {
    return eventsStore.completed.reduce((balance,e) => balance += e.credit-e.debit, 0)
  }
  
  // Фактический баланс на начало дня
  getActualBalance(date: timestamp) {
    if(date < this.firstActualBalanceDate) return 0
    if(date > this.lastActualBalanceDate) return this.lastActualBalance
    if(this.cachedActualBalance[date] !== undefined) return this.cachedActualBalance[date]
    const balance = eventsStore.completed.reduce((a,e)=>{
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
    if(eventsStore.planned.length === 0) return 0
    let first = eventsStore.planned[0].start
    eventsStore.plannedRepeatable.forEach(e=>{
      if(e.start<first) first = e.start
    })
    return first
  }
}
