import EventList from './eventList.js'

// ASANA svg format
// Task ID, Created At, Completed At, Last Modified, 
// Name, Section/Column, Assignee, Assignee Email, 
// Start Date, Due Date, Tags, Notes, Projects, Parent Task
const projects = [
  {name: 'Общий', background: 'blue', color: 'white'},
  {name: 'Доход', background: 'red', color: 'white'},
  {name: 'Машина', background: 'violet', color: 'white'},
  {name: 'Дача', background: 'yellow', color: 'black'},
  {name: 'Рутина', background: 'gray', color: 'white'},

]

const actualTasks = [
  {name: 'НО +30000', project:'Доход', credit:52683, comment: 'начальный остаток', start: '2022-01-01'},
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
  {name: 'ЗП +40020', project: 'Доход', credit:40020, repeat: '10,25 * *', start: '2021-12-01', time: '10:00', duration: '0:20'},
  {name: 'пенсия мамы', project: 'Доход', credit:31000, repeat: '17', start: '2021-12-01', time: '9:00', duration: '0:20'},

  {name: 'заправка', project: 'Машина', debit:2500, repeat: '/6', start: '2022-01-12', time: '8:00', duration: '0:30'},
  {name: 'купить продукты', project: 'Общий', debit:8000, repeat: '* * 0', start: '2022-01-04', time: '19:00', duration: '0:80'},
  {name: 'маму на укол', debit:40000, start: '2022-02-05', time: '10:00', duration: '1:20'},
  {name: 'тест2', start: '2022-02-05', duration: '0:80'},


  {name: 'четные', repeat: '2/2', repeatEnd:'2022-01-16', start:'2021-11-01'},
  {name: 'комплексные', repeat: '1/3,20-25', start: '2021-11-01'},
  {name: 'дорога на работу', cost: 0, repeat: '* * 1-5', start: '2021-11-01', time: '8:00', duration: '1:00'},
  {name: 'работа', project: 'Рутина', cost: 0, repeat: '* * 1-5', start: '2021-11-01', time: '9:00', duration: '9:00'},
  {name: 'праздники', cost: 0, start: '2021-12-31', end: '2022-01-19'},
  {name: 'test', cost: 0, start: '2022-01-14', duration: '34:00'},
  {name: 'отпуск', cost: 0, start:'2022-01-07', duration: '14d'},

]

export const eventList = new EventList(actualTasks,plannedTasks,projects)




