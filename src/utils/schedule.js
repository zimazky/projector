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


  {name: 'четные', repeat: '2/2', end:'2022-01-16', start:'2021-11-01'},
  {name: 'комплексные', repeat: '1/3,20-25', start: '2021-11-01'},
  {name: 'дорога на работу', cost: 0, repeat: '* * 1-5', start: '2021-11-01', time: '8:00', duration: '1:00'},
  {name: 'работа', project: 'Рутина', cost: 0, repeat: '* * 1-5', start: '2021-11-01', time: '9:00', duration: '9:00'},
  {name: 'праздники', cost: 0, start: '2021-12-31', end: '2022-01-19'},
  {name: 'test', cost: 0, start: '2022-01-14', duration: '34:00'},
  {name: 'отпуск', cost: 0, start:'2022-01-07', duration: '14d'},

]

const json = '{"projectsList":[{"name":"Общий","background":"#4178bc","color":"white"},{"name":"Доход","background":"red","color":"white"},{"name":"Машина","background":"#aa71ff","color":"black"},{"name":"Медицина","background":"#fca7e4","color":"black"},{"name":"Дача","background":"#eecc16","color":"black"},{"name":"Рутина","background":"gray","color":"white"},{"name":"Квартира","background":"#8d9f9b","color":"white"},{"name":"Программирование","background":"#c95816","color":"white"},{"name":"Отдых","background":"#fd817d","color":"black"},{"name":"Участок","background":"#37a862","color":"white"},{"name":"Водопровод","background":"#66b8c8","color":"black"}],"completedList":[{"name":"Праздники","start":"2021-12-31","end":"2022-01-10"},{"name":"Нач остаток","project":"Доход","start":"2022-01-01","credit":"52683"},{"name":"Продукты","project":"Общий","start":"2022-01-04","debit":"3595.81"},{"name":"Продукты","project":"Общий","start":"2022-01-10","debit":"7981.27"},{"name":"ЗП +40020","project":"Доход","start":"2022-01-10","time":"10:00","credit":"40020"},{"name":"Купить лекарства","project":"Общий","start":"2022-01-10","debit":"1418"},{"name":"Заправить машину","project":"Машина","start":"2022-01-12","debit":"2732.46"},{"name":"Оплата электричества на даче","project":"Дача","start":"2022-01-15","debit":"0"},{"name":"Оплата телефона в машине","project":"Машина","start":"2022-01-15","debit":"100"},{"name":"Оплата электроэнергии","project":"Квартира","start":"2022-01-15","debit":"1716.08"},{"name":"Оплата интернета и телефона","project":"Квартира","start":"2022-01-15","debit":"858"},{"name":"Оплата капремонта","project":"Квартира","start":"2022-01-15","debit":"625.74"},{"name":"Продукты","project":"Общий","start":"2022-01-16","debit":"8022.22"},{"name":"Дистанционка","start":"2022-01-17","duration":"3d 0:00"},{"name":"пенсия мамы","project":"Доход","start":"2022-01-17","time":"9:00","credit":"32700"},{"name":"Сдал машину в ремонт","comment":"стоимость такси","project":"Машина","start":"2022-01-17","debit":"458.85"},{"name":"Дорога до сервиса","comment":"такси","project":"Машина","start":"2022-01-19","debit":"438.9"},{"name":"Ремонт электрики","project":"Машина","start":"2022-01-19","debit":"15500"},{"name":"Ремонт машины","comment":"омыватель, гофра выхлопной трубы, крепление глушителя, герметизация клапанной крышки, герметизация КПП","project":"Машина","start":"2022-01-22","debit":"35006"},{"name":"Продукты","project":"Общий","start":"2022-01-24","debit":"9377.18"},{"name":"Заправить машину","project":"Машина","start":"2022-01-24","debit":"2517.22"},{"name":"Оплата парковки","project":"Машина","start":"2022-01-24","debit":"2525"},{"name":"Оплата интернета на даче","project":"Дача","start":"2022-01-24","debit":"600"},{"name":"Оплата мобильного телефона","project":"Общий","start":"2022-01-24","debit":"270"},{"name":"Оплата квартплаты","project":"Квартира","start":"2022-01-24","debit":"5831.12"},{"name":"ЗП +25012","project":"Доход","start":"2022-01-25","time":"10:00","credit":"25012"},{"name":"Сохранение событий в localStorage","project":"Программирование","start":"2022-01-29"}],"plannedList":[{"name":"Продукты","project":"Общий","start":"2022-01-24","repeat":"* * 0","debit":"9000"},{"name":"Заправить машину","project":"Машина","start":"2022-01-30","repeat":"/6","debit":"2500"},{"name":"Оплата электроэнергии","project":"Общий","start":"2022-01-16","repeat":"15 * *","debit":"1500"},{"name":"Оплата капремонта","project":"Общий","start":"2022-01-16","repeat":"15 * *","debit":"625.74"},{"name":"Оплата интернета и телефона","project":"Общий","start":"2022-01-16","repeat":"15 * *","debit":"858"},{"name":"Оплата электричества на даче","project":"Дача","start":"2022-01-16","repeat":"15 * *","debit":"290"},{"name":"Оплата квартплаты","project":"Общий","start":"2022-01-26","repeat":"25 * *","debit":"5500"},{"name":"Оплата парковки","project":"Машина","start":"2022-01-26","repeat":"25 * *","debit":"2525"},{"name":"Оплата интернета на даче","project":"Дача","start":"2022-01-26","repeat":"25 * *","debit":"600"},{"name":"Купить лекарства","project":"Общий","start":"2022-01-11","repeat":"10 * *","debit":"2500"},{"name":"Оплата мобильного телефона","project":"Общий","start":"2022-01-26","repeat":"25 * *","debit":"300"},{"name":"Заказать фильтры для системы очистки воды","project":"Общий","start":"2022-05-01","repeat":"/180","debit":"5500"},{"name":"Выезд на дачу","project":"Дача","start":"2022-08-21","time":"8:00","repeat":"* * 6","end":"2022-10-01","debit":"3400"},{"name":"Выезд на дачу","project":"Дача","start":"2022-04-02","time":"8:00","repeat":"* * 6","end":"2022-05-28","debit":"3400"},{"name":"Выезд на дачу","project":"Дача","start":"2022-05-29","time":"8:00","repeat":"* * 6","end":"2022-07-09","debit":"3400"},{"name":"Выезд на дачу","project":"Дача","start":"2022-07-17","time":"8:00","repeat":"* * 6","end":"2022-08-20","debit":"3400"},{"name":"пенсия мамы","project":"Доход","start":"2022-01-18","time":"9:00","repeat":"17","duration":"0:20","credit":31000},{"name":"ЗП +40020","project":"Доход","start":"2022-01-26","time":"10:00","repeat":"10,25 * *","duration":"0:20","credit":40020},{"name":"Выезд в город","project":"Дача","start":"2022-08-15","time":"17:00","repeat":"* * 0","end":"2022-10-01","debit":"1800"},{"name":"Выезд в город","project":"Дача","start":"2022-05-09","time":"17:00","repeat":"* * 0","end":"2022-05-22","debit":"1800"},{"name":"Выезд в город","project":"Дача","start":"2022-06-13","time":"17:00","repeat":"* * 0","end":"2022-07-03","debit":"1800"},{"name":"Выезд в город","project":"Дача","start":"2022-07-11","time":"17:00","repeat":"* * 0","end":"2022-08-14","debit":"1800"},{"name":"Выезд в город","project":"Дача","start":"2022-04-03","time":"17:00","repeat":"* * 0","end":"2022-05-01","debit":"1800"},{"name":"Выезд в город","project":"Дача","start":"2022-05-23","time":"17:00","repeat":"* * 0","end":"2022-06-12","debit":"1800"},{"name":"Дистанционка, заболел","start":"2022-01-27","end":"2022-01-31"},{"name":"Перенос старых событий из Asana","project":"Программирование","start":"2022-01-30"},{"name":"Метод изменения параметров событий","project":"Программирование","start":"2022-01-30"},{"name":"Выходной","start":"2022-02-23"},{"name":"Выходной","start":"2022-03-06","duration":"3d 0:00"},{"name":"Выходные","start":"2022-04-30","end":"2022-05-04"},{"name":"Выезд в город","project":"Дача","start":"2022-05-03","time":"17:00","debit":"1800"},{"name":"Выходные","start":"2022-05-07","end":"2022-05-11"},{"name":"Выезд в город","project":"Дача","start":"2022-05-10","time":"17:00","debit":"1800"},{"name":"Ремонт кондиционера","project":"Машина","start":"2022-05-14","debit":"16000"},{"name":"Отпуск","start":"2022-05-21","end":"2022-05-30"},{"name":"Выходные","start":"2022-06-11","end":"2022-06-14"},{"name":"Выезд в город","project":"Дача","start":"2022-06-13","time":"17:00","debit":"1800"},{"name":"Отпуск","start":"2022-07-02","end":"2022-07-18"},{"name":"Отпуск","start":"2022-08-13","end":"2022-08-22"}]}'



//const json = localStorage.getItem('data')
console.log('localStorage',json)
const obj = JSON.parse(json)
export const eventList = new EventList(obj?.completedList, obj?.plannedList, obj?.projectsList)

//export const eventList = new EventList(actualTasks,plannedTasks,projects)




