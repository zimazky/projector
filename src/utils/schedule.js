import DateTime from './datetime.js'
import ZCron from './zcron.js'


// ASANA svg format
// Task ID, Created At, Completed At, Last Modified, 
// Name, Section/Column, Assignee, Assignee Email, 
// Start Date, Due Date, Tags, Notes, Projects, Parent Task
const projects = [
  {id: 0, name: 'general', color: '#CCC'},
  {id: 1, name: 'routine', color: '#C20'}
]

export const actualTasks = [
  {name: 'НО +30000', value: 30000, comment: 'начальный остаток', start: new Date('2021-11-15 10:00')/1000, balance: 30000},
  {name: 'Дорога на дачу', value: 450+2000, start: new Date('2021-11-05 09:00')/1000, duration: 2.5*60, balance: 29000 }
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
  {name: 'ЗП +40020', income: 40020, repeat: '10,25 * *', start: new Date('2021-11-01 10:00')/1000, duration: 0},
  {name: 'заправка', repeat: '/6', start: new Date('2021-11-01 15:00')/1000, duration: 0},
  {name: 'четные', repeat: '2/2', start: new Date('2021-11-01 01:00')/1000, duration: 0},
  {name: 'комплексные', repeat: '1/3,20-25', start: new Date('2021-11-01 01:00')/1000, duration: 0},
  {name: 'дорога на работу', cost: 0, repeat: '* * 1-5', start: new Date('2021-11-01 08:00')/1000, duration: 60},
  {name: 'работа', cost: 0, repeat: '* * 1-5', start: new Date('2021-11-01 09:00')/1000, duration: 9*60},
  {name: 'праздники', cost: 0, start: new Date('2021-12-31 00:00')/1000, end: new Date('2022-01-26 23:59')/1000},
  {name: 'test', cost: 0, start: new Date('2022-01-14 14:00')/1000, duration: 24*60-1},
  {name: 'отпуск', cost: 0, start: new Date('2022-01-14 00:00')/1000, duration: 14*24*60-1},

]

function daysDifference(ts1, ts2, duration = 86400) {
  const end = ts2 ?? ts1+duration
  return (DateTime.getBeginDayTimestamp(end)-DateTime.getBeginDayTimestamp(ts1))/86400
}

// Функция сортировки массива планируемых задач
// подготавливает данные для корректной отрисовки задач
// в начало массива поднимаются задачи с самой ранней датой начала start
// при одинаковой дате начала первыми идут задачи с наибольшей длительностью duration или (end-start)
// повторяемые задачи размещаются ниже всех остальных 
export function sortPlannedTasks() {
  plannedTasks.sort((a,b)=>{
    if(a.repeat) {
      if(b.repeat) return DateTime.getTime(a.start)-DateTime.getTime(b.start)
      else return 1
    }
    if(b.repeat) return -1
    const d = DateTime.getBeginDayTimestamp(a.start)-DateTime.getBeginDayTimestamp(b.start)
    if(d != 0) return d
    return daysDifference(b.start,b.end,b.duration*60)-daysDifference(a.start,a.end,a.duration*60)
  })
}

export function actualBalance(timestamp) {
  const prevTasks = actualTasks.filter(a=>a.start<timestamp)
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
    if(timestamp < DateTime.getEndDayTimestamp(stack[stack.length-1].end)) break
    stack.pop()
  } 
  stack.forEach(v=>{list.push({id: -1})})
  // проход по планируемым задачам
  const tasks = plannedTasks.reduce( (a,t,id)=>{
    if(t.repeat && timestamp>=t.start) {
      // Повторяемые задачи
      if(!t.repeatEnd || timestamp<t.repeatEnd) {
        if(ZCron.isMatch(t.repeat, t.start, timestamp)) {
          a.push({id, name: t.name, time: DateTime.getTime(t.start), days: 1, income: t.income || 0, cost: t.cost || 0})
        }
      }
    }
    else {
      // Одиночные задачи
      if(t.start && timestamp >= DateTime.getBeginDayTimestamp(t.start)) {
        const end = DateTime.getEndDayTimestamp(t.end ?? (t.duration?t.start+t.duration*60:t.start))
        if(timestamp < end) {
          const days = daysDifference(t.start,end)
          if(days>0) {
            if(stack.filter(v=>id==v.id).length>0) return a
              stack.push({id,end})
          }
          a.push({id, name: t.name, time: DateTime.getTime(t.start), days: daysDifference(timestamp,Math.min(end,cutTimestamp))+1, income: t.income || 0, cost: t.cost || 0})
        }
      }
    }
    return a
  }, list)
  // проход по завершенным задачам
  actualTasks.reduce( (a,t,id) => {
    if(t.start && DateTime.getBeginDayTimestamp(t.start)<=timestamp && DateTime.getEndDayTimestamp(t.start)>timestamp) {
      a.push({id, name: 'ВЫП '+t.name, time: DateTime.getTime(t.start), days: 1, income: t.income || 0, cost: t.cost || 0})
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
