import { beginDayTS, daysDifference, endDayTS, isScheduledDay } from './daytime'


// ASANA svg format
// Task ID, Created At, Completed At, Last Modified, 
// Name, Section/Column, Assignee, Assignee Email, 
// Start Date, Due Date, Tags, Notes, Projects, Parent Task
const projects = [
  {id: 0, name: 'general', color: '#CCC'},
  {id: 1, name: 'routine', color: '#C20'}
]

export const actualTasks = [
  {name: 'НО +30000', type: 'initial', value: 30000, comment: 'начальный остаток', date: new Date('2021-11-15 10:00')/1000, balance: 30000},
  {name: 'Дорога на дачу', category: 'дача', value: 450+2000, date: new Date('2021-11-05 09:00')/1000, duration: 2.5*60, balance: 29000 }
]
//          min hrs   day  Month weekday year holyday
// repeat: '0   10   10,25  *       *      *     !'  каждый месяц 10-ого и 25-ого в 10:00
//
// используется упрощенный cron синтаксис
// предполагаемый диапазон значений и допустимые операторы
//  min       0-59    
//  hrs       0-23    
//  day       1-31    *,-/
//  month     0-11    *,-/
//  weekday   1-7     *,-/
//
//  */n - каждые n интервалов, начиная с repeatStart
//  m/n - каждые n интервалов, начиная с m

export const plannedTasks = [
  {name: 'ЗП +40020', category: 'earnings', income: 40020, repeat: '0 10 10,25 * *', repeatStart: new Date('2021-11-01')/1000, duration: 0},
  {name: 'работа', category: 'routine', cost: 0, repeat: '0 9 * * 1-5', repeatStart: new Date('2021-11-01 00:00')/1000, duration: 9*60},
  {name: 'дорога на работу', category: 'routine', cost: 0, repeat: '30 8,18 * * 1-5', repeatStart: new Date('2021-11-01')/1000, duration: 60},
  {name: 'праздники', category: 'holydays', priority: 0, cost: 0, start: new Date('2021-12-31 00:00')/1000, end: new Date('2022-01-26 23:59')/1000},
  {name: 'test', category: 'vacation', priority: 0, cost: 0, start: new Date('2022-01-14 00:00')/1000, duration: 24*60-1},
  {name: 'отпуск', category: 'vacation', priority: 0, cost: 0, start: new Date('2022-01-14 00:00')/1000, duration: 12*24*60-1},

]

// Функция сортировки массива планируемых задач
// подготавливает данные для корректной отрисовки задач
// в начало массива поднимаются задачи с самой ранней датой начала start
// при одинаковой дате начала первыми идут задачи с наибольшей длительностью duration или (end-start)
// повторяемые задачи размещаются ниже всех остальных 
export function sortPlannedTasks() {
  plannedTasks.sort((a,b)=>{
    if(a.start) {
      if(!b.start) return -1
      const d = a.start-b.start
      if(d != 0) return d
      return daysDifference(b.start,b.end,b.duration*60)-daysDifference(a.start,a.end,a.duration*60)
    }
    if(b.start) return 1
    return 0
  })
}

export function actualBalance(timestamp) {
  const prevTasks = actualTasks.filter(a=>a.date<timestamp)
  if(prevTasks.length == 0) return 0
  return prevTasks.slice(-1)[0].balance
}

// Функция создания списка событий за день, определяемый timestamp
// list - массив, в который добавляются элементы списка
// stack - стэк элементов {id, endTimestamp} многодневных задач, для которых нужно подставлять плэйсхолдеры 
// cutTimestamp - метка времени, ограничивающая многодневные задачи
// {id, name, days, hours, minutes, income, cost}
// id - идентификатор/индекс задачи
// name - наименование
// days - длительность задачи в днях с учетом ограничения cutTimestamp
export function dayPlannedTasks(list, timestamp, stack = [], cutTimestamp = timestamp+86399) {
  // очистка стека и добавление плейсхолдеров
  while(stack.length>0) {
    if(timestamp < endDayTS(stack[stack.length-1].end)) break
    stack.pop()
  } 
  stack.forEach(v=>{list.push({id: -1})})
  // проход по планируемым задачам
  const tasks = plannedTasks.reduce( (a,t,id)=>{
    if(t.repeatStart && timestamp>=t.repeatStart) {
      // Повторяемые задачи
      if(!t.repeatEnd || timestamp<t.repeatEnd) {
        if(isScheduledDay(timestamp,t.repeat)) {
          const [minutes, hours] = t.repeat.split(' ')
          a.push({id, name: t.name, days: 1, hours, minutes, income: t.income || 0, cost: t.cost || 0})
        }
      }
    }
    else {
      // Одиночные задачи
      if(t.start && timestamp >= beginDayTS(t.start)) {
        const end = endDayTS(t.end ?? (t.duration?t.start+t.duration*60:t.start))
        if(timestamp < end) {
          const days = daysDifference(t.start,end)
          if(days>0) {
            if(stack.filter(v=>id==v.id).length>0) return a
              stack.push({id,end})
          }
          a.push({id, name: t.name, days: daysDifference(timestamp,Math.min(end,cutTimestamp))+1, hours:0, minutes:0, income: t.income || 0, cost: t.cost || 0})
        }
      }
    }
    return a
  }, list)
  // проход по завершенным задачам
  actualTasks.reduce( (a,t,id) => {
    if(t.date && t.date<=timestamp && (t.date+86400)>timestamp) {
      a.push({id, name: 'ВЫП '+t.name, days: 1, hours:0, minutes:0, income: t.income || 0, cost: t.cost || 0})
    }
    return a
  }, tasks)
  return tasks
}


export function plannedBalance(timestamp) {
  const lastActualBalanceDate = actualTasks[actualTasks.length-1].date
  const lastActualBalance = actualTasks[actualTasks.length-1].balance

  const prevTasks = plannedTasks.filter(a=>a.date<timestamp)
}
