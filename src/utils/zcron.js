import DateTime from "./datetime.js"

// Библиотека методов для обработки строк в cron-подобном синтаксисе
//
// используется упрощенный cron синтаксис
//           day  month weekday
// repeat: '10,25  *       *'  каждый месяц 10-ого и 25-ого в 10:00
//
// используется упрощенный cron синтаксис
// предполагаемый диапазон значений и допустимые операторы
//  day       1-31    *,-/?
//  month     0-11    *,-?
//  weekday   0-6     *,-?
//
//  /n - каждые n интервалов, начиная с repeatStart
//  m/n - каждые n интервалов, начиная с m

// Примеры
//
// '/4   ?  ?' каждый 4-ый день независимо от месяца и года, начиная с repeatStart (редукция '/4')
// '/4   *  ?' некорректно, не указан начальный день каждого месяца
// '*/4  *  ?' каждый 4-ый день месяца, начиная с 1 числа (редукция '*/4')
// '1/4  *  ?' каждый 4-ый день месяца, начиная с 1 числа (эквивалентно предыдущему, редукция '1/4')
// '5/4  *  ?' каждый 4-ый день месяца, начиная с 5 числа каждого месяца (редукция '5/4')
// '5/4  ?  ?' некорректно, указан первый день без привязки к месяцу
// '/4  2,3 ?' некорректно, не указан начальный день каждого месяца

// '/4  /4  ?' некорректно, оператор / может использоваться только для дней
// '*   /4  ?' некорректно
// '25  /4  ?' некорректно

// '25  2,3  ?' каждое 25 февраля и 25 марта
// '?   *  1-5' с понедельника по пятницу каждый месяц




// Функция добавляет в массив array последовательность чисел, представленных строкой 'a', 'a/b' или 'a-b'.
// Последовательность ограничена значением max
//  '*'   в массив добавляется последовательность [1,2,3...max]
//  'a'   в массив добавляется значение a
//  'a-b' в массив добавляется последовательность [a,a+1,a+2...b] до b
//  'a/b' в массив добавляется последовательность [a,a+b,a+2b...] до max
function addSequence(array, str, max=31, from=1) {
  const [a, b=null] = str.split('-',2)
  if(b === null) {
    const [a, b=null] = str.split('/',2)
    if(a === '' || b === '') return array
    const start = (a === '*') ? from : +a
    let inc = +b
    if(isNaN(start) || isNaN(inc)) return array
    if(b===null && a!=='*') return array.push(+a),array
    if(inc === 0) inc = 1
    for(let i=start; i<=max; i+=inc) array.push(i)
    return array
  }
  if(a === '' || b === '') return array
  for(let i=+a;i<=+b;i++) array.push(i)
  return array
}

export default class ZCron { 
  // Функция проверяет соответствует ли указанный день шаблону расписания
  // Шаблон задается строкой вида:
  // 'd m w' 
  // d days; m months; w weekdays
  // если соответствует возвращает true, иначе false
  static isMatch(scheduleString, startTimestamp, timestamp) {
    const {day, month, weekday} = DateTime.getDayMonthWeekday(timestamp)
    const [d = null, m = null, w = null] = scheduleString.trim().split(' ',3)
    if(d === null) return false
    if(d[0] === '/') { // расписание повторяется начиная от startTimestamp
      const difference = ~~((timestamp-startTimestamp)/86400)
      if(difference<0) return false
      const divisor = +d.substring(1)
      if(difference%divisor == 0) return true
      return false
    }
    const days = d.split(',').reduce( (a,s) => addSequence(a,s), [])
    const months = m.split(',').reduce( (a,s) => addSequence(a,s,12), [])
    const weekdays = w.split(',').reduce( (a,s) => addSequence(a,s,7,0), [])
    //const lwd = weekday==0?7:weekday
    if( months.includes(month+1) && days.includes(day) && weekdays.includes(weekday) ) return true
    return false
  }

}