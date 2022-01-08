import EventList from './eventList.js'

// ASANA svg format
// Task ID, Created At, Completed At, Last Modified, 
// Name, Section/Column, Assignee, Assignee Email, 
// Start Date, Due Date, Tags, Notes, Projects, Parent Task
const projects = [
  {id: 0, name: 'general', color: '#CCC'},
  {id: 1, name: 'routine', color: '#C20'}
]

const actualTasks = [
  {name: 'НО +30000', credit:52683, comment: 'начальный остаток', start: new Date('2022-01-01 00:00')/1000},
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

const plannedTasks = [
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

export const eventList = new EventList(actualTasks,plannedTasks)




