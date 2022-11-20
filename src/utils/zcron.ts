import DateTime, { timestamp } from "./datetime"

// Библиотека методов для обработки строк в cron-подобном синтаксисе
//
// используется упрощенный cron синтаксис выражений
// предполагаемый диапазон значений и допустимые операторы
//  day       1-31    *,-/
//  month     1-12    *,-/
//  weekday   0-6     *,-/
//
// Примеры:
//
// '/4   *  *' каждый 4-ый день независимо от месяца и года, начиная с repeatStart (редукция '/4')
// '*/4  *  *' каждый 4-ый день месяца, начиная с 1 числа (редукция '*/4')
// '1/4  *  *' каждый 4-ый день месяца, начиная с 1 числа (эквивалентно предыдущему, редукция '1/4')
// '5/4  *  *' каждый 4-ый день месяца, начиная с 5 числа каждого месяца (редукция '5/4')
// '*  */4  *' каждый день каждого 4-ого месяца, начиная с января (1,5,9)
// '25 2/4  *' 25 число ккаждого четвертого месяца, начиная с февраля (2,6,10)
// '25  2,3 *' каждое 25 февраля и 25 марта
// '*  *  1-5' с понедельника по пятницу каждый месяц


export default class ZCron {

  /** 
   * Функция добавляет в массив array последовательность чисел, представленных строкой str: '\*', 'a', 'a/b' или 'a-b'.
   * При str = '*' последовательность ограничена значениями from (1) и max (31).
   * 
   * Примеры использования str:
   * 
   *  '*'   в массив добавляется последовательность [from, from+1 ... max]
   * 
   *  'a'   в массив добавляется значение a
   * 
   *  'a-b' в массив добавляется последовательность [a, a+1, a+2 ... b]
   * 
   *  'a/b' в массив добавляется последовательность [a, a+b, a+2b ... ] до max
   */
  static addSequence(array: number[], str: string, max: number=31, from: number=1): number[] {
    const [a, b=null] = str.split('-',2)
    if(b === null) {
      const [a, b = null] = str.split('/',2)
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


  /**
   * Функция проверяет соответствует ли указанный день шаблону расписания
   * @param scheduleString Строка-шаблон, задается cron-подобным выражением вида 'days months weekdays'
   * с расширением синтаксиса по периодичности от начала периода действия шаблона startTimestamp.
   * Периодичность указывается в днях от начала, задается в виде '/d'
   * @param startTimestamp Начало действия шаблона
   * @param timestamp День для проверки
   * @returns Возвращает true если указанный день соответствует шаблону, иначе false
   */
  static isMatch(scheduleString: string, startTimestamp: timestamp, timestamp: timestamp): boolean {
    const {day, month, weekday} = DateTime.getDayMonthWeekday(timestamp)
    const [d = null, m = '*', w = '*'] = scheduleString.trim().split(' ',3)
    if(d === null) return false
    if(d[0] === '/') { // расписание повторяется начиная от startTimestamp
      const difference = DateTime.getDifferenceInDays(startTimestamp,timestamp)
      if(difference<0) return false
      const divisor = +d.substring(1)
      if(difference%divisor == 0) return true
      return false
    }
    // обычное расписание подобный cron-шаблонам
    const days = d.split(',').reduce( (a,s) => ZCron.addSequence(a,s), [])
    const months = m.split(',').reduce( (a,s) => ZCron.addSequence(a,s,12), [])
    const weekdays = w.split(',').reduce( (a,s) => ZCron.addSequence(a,s,7,0), [])
    if( months.includes(month+1) && days.includes(day) && weekdays.includes(weekday) ) return true
    return false
  }

  /** Функция проверяет срабатывает ли шаблон расписания в заданном интервале */
  static ariseInInterval(scheduleString:string, startTimestamp: timestamp, begin: timestamp, end: timestamp): boolean {
    for(var t=begin;t<end;t+=86400) {
      if(this.isMatch(scheduleString, startTimestamp, t)) return true
    }
    return false
  }

  /** Функция определения первого соответствия шаблону */
  static first(scheduleString:string, startTimestamp: timestamp, maxinterval = 366) {
    for(let i=0, t=startTimestamp; i<maxinterval; t+=86400, i++) {
      if(this.isMatch(scheduleString, startTimestamp, t)) return t
    }
    return 0
  }
}