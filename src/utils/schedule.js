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



// ASANA svg format
// Task ID, Created At, Completed At, Last Modified, 
// Name, Section/Column, Assignee, Assignee Email, 
// Start Date, Due Date, Tags, Notes, Projects, Parent Task
const projects = [
  {id: 0, name: 'general', color: '#CCC'},
  {id: 1, name: 'routine', color: '#C20'}
]

export const actualTasks = [
  {name: 'НО +30000', credit:{account:1,amount:30000}, comment: 'начальный остаток', start: new Date('2022-01-01 00:00')/1000, balance: 52683},
  //{name: 'Дорога на дачу', debit:{account:1,amount:400+2500}, start: new Date('2021-11-05 09:00')/1000, duration: 2.5*60, balance: 29000 }
]
// используется упрощенный cron синтаксис
// предполагаемый диапазон значений и допустимые операторы
//  day       1-31    *,-/
//  month     0-11    *,-/
//  weekday   0-6     *,-/
//
//  */n - каждые n интервалов, начиная с start
//  m/n - каждые n интервалов, начиная с m

export const plannedTasks = [
  {name: 'ЗП +40020', credit:40020, repeat: '10,25 * *', start: new Date('2021-12-01 10:00')/1000, duration: 20},
  {name: 'пенсия мамы', credit:31000, repeat: '17', start: new Date('2021-12-01 09:00')/1000, duration: 20},

  {name: 'заправка', debit:2500, repeat: '/6', start: new Date('2022-01-12 15:00')/1000, duration: 30},
  {name: 'купить продукты', debit:8000, repeat: '* * 0', start: new Date('2022-01-04 15:00')/1000, duration: 80},
  {name: 'маму на укол', debit:40000, start: new Date('2022-02-05 10:00')/1000, duration: 80},


  //{name: 'четные', repeat: '2/2', repeatEnd:new Date('2022-01-16 1:30')/1000, start:new Date('2021-11-01 01:00')/1000, duration: 0},
  //{name: 'комплексные', repeat: '1/3,20-25', start: new Date('2021-11-01 01:00')/1000, duration: 0},
  //{name: 'дорога на работу', cost: 0, repeat: '* * 1-5', start: new Date('2021-11-01 08:00')/1000, duration: 60},
  //{name: 'работа', cost: 0, repeat: '* * 1-5', start: new Date('2021-11-01 09:00')/1000, duration: 9*60},
  {name: 'праздники', cost: 0, start: new Date('2021-12-31 00:00')/1000, end: new Date('2022-01-09 23:59')/1000},
  {name: 'test', cost: 0, start: new Date('2022-01-14 14:00')/1000, duration: 34*60-1},
  {name: 'отпуск', cost: 0, start: new Date('2022-01-07 00:00')/1000, duration: 14*24*60-1},

]

// Функция сортировки массива планируемых задач
// подготавливает данные для корректной отрисовки задач
// в начало массива поднимаются задачи с самой ранней датой начала start
// при одинаковой дате начала первыми идут задачи с наибольшей длительностью duration или (end-start)
// повторяемые задачи размещаются ниже всех остальных 
export function sortPlannedTasks() {
  plannedTasks.sort((a,b)=>{
    if(a.repeat) {
      if(b.repeat) return Event.getStartTime(a)-Event.getStartTime(b)
      else return 1
    }
    if(b.repeat) return -1
    const d = Event.getStartDay(a)-Event.getStartDay(b)
    if(d != 0) return d
    return Event.getDurationInDays(b)-Event.getDurationInDays(a)
  })
}

// Функция создания списка событий за день, определяемый timestamp
// list - массив, в который добавляются элементы списка
// stack - стэк элементов {id, endTimestamp} многодневных задач, которые не надо учитывать в расчетах 
//         и для которых нужно подставлять плэйсхолдеры при отображении
// {id, name, days, time, debit, credit}
//    id      - идентификатор/индекс задачи
//    name    - наименование
//    days    - длительность задачи в днях
//    debit   - списание средств
//    credit  - зачисление средств
export function dayPlannedTasks(list, timestamp, stack = [], addActualTasks = false) {
  // очистка стека и добавление плейсхолдеров
  while(stack.length>0) {
    if(timestamp < stack[stack.length-1].end) break
    stack.pop()
  } 
  stack.forEach(v=>{list.push({id: -1})})
  // проход по планируемым задачам
  const tasks = plannedTasks.reduce( (a,t,id)=>{
    if(t.repeat) {
      // Повторяемые задачи
      if(timestamp<t.start) return a
      if(t.repeatEnd && (timestamp+DateTime.getTime(t.start)>t.repeatEnd)) return a
      if(ZCron.isMatch(t.repeat, t.start, timestamp)) a.push(Event.toPlannedEventItem(id, t, 1))
      return a
    }
    // Одиночные задачи
    if(timestamp < Event.getStartDay(t)) return a
    const end = Event.getEndDayOfEnd(t)
    if(timestamp >= end) return a
    const days = Event.getDurationInDays(t)
    if(days>1) {
      if(stack.filter(v=>id==v.id).length>0) return a
      stack.push({id,end})
    }
    a.push(Event.toPlannedEventItem(id, t, DateTime.getDifferenceInDays(timestamp,end)))
    return a
  }, list)
  // проход по завершенным задачам
  addActualTasks && actualTasks.reduce( (a,t,id) => {
    if(t.start && DateTime.getBeginDayTimestamp(t.start)<=timestamp && DateTime.getEndDayTimestamp(t.start)>timestamp) {
      a.push(Event.toActualEventItem(id, t, 1))
    }
    return a
  }, tasks)
  return tasks
}

export function actualBalance(timestamp) {
  const prevTasks = actualTasks.filter(a=>a.start<timestamp)
  if(prevTasks.length == 0) return 0
  return prevTasks.slice(-1)[0].balance
}
export function plannedBalance(timestamp) {
  let lastActualBalanceDate = actualTasks[actualTasks.length-1].start
  let lastActualBalance = actualTasks[actualTasks.length-1].balance
  if(timestamp<lastActualBalanceDate) {
    lastActualBalanceDate = timestamp
    lastActualBalance = 0
  }
  const prevTasks = []
  const stack = []
  for(let t=DateTime.getBeginDayTimestamp(lastActualBalanceDate);t<timestamp;t+=86400) {
    dayPlannedTasks(prevTasks, t, stack)
  }
  const balance = prevTasks.reduce((a,v)=>a+=(v.credit?v.credit:0) - (v.debit?v.debit:0),lastActualBalance)
  return balance
}
