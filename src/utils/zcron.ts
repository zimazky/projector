import DateTime, { timestamp } from "./DateTime"

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
   * Функция добавляет в массив array последовательность чисел, представленных строкой str: '*', 'a', 'a/b' или 'a-b'.
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
      let inc = +(b ?? 0)
      if(isNaN(start) || isNaN(inc)) return array
      if(b===null && a!=='*') return array.push(+a), array
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
    const days = d.split(',').reduce( (a,s) => ZCron.addSequence(a,s), <number[]> [])
    const months = m.split(',').reduce( (a,s) => ZCron.addSequence(a,s,12), <number[]> [])
    const weekdays = w.split(',').reduce( (a,s) => ZCron.addSequence(a,s,7,0), <number[]> [])
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

  /** Функция определения первого соответствия шаблону на интервале*/
  static firstInInterval(scheduleString:string, startTimestamp: timestamp, begin: timestamp, end: timestamp) {
    for(var t=begin;t<end;t+=86400) {
      if(this.isMatch(scheduleString, startTimestamp, t)) return t
    }
    return 0
  }
  
  /** Функция определения первого соответствия шаблону */
  static first(scheduleString:string, startTimestamp: timestamp, maxinterval = 366) {
    for(let i=0, t=startTimestamp; i<maxinterval; t+=86400, i++) {
      if(this.isMatch(scheduleString, startTimestamp, t)) return t
    }
    return 0
  }

  /** Валидация шаблона */
  static validate(scheduleString: string): boolean {
    if(scheduleString === '') return true
    const arr = scheduleString.split(' ')
    if(arr.length > 3) return false
    const [d, m = '*', w = '*'] = arr
    return validateDaysPattern(d) && validateMonthsPattern(m) && validateWeekdaysPattern(w)
  }
}

/** 
 * Проверка целого значения n в строке по диапазону значений (n>=min, n<=max) и возврат числа
 * Возвращает кортеж из двух значений
 * 1. true если в строке целое число и оно принадлежит диапазону, false в противном случае
 * 2. целое число или NaN если в строке не целое число
 */
function testIntegerInString(s: string, min = 0, max = 0): [boolean, number] {
  if(!/^\d+$/.test(s)) return [false, NaN]
  const n: number = +s
  if(n < min) return [false, n]
  if(max > 0 && n > max) return [false, n]
  return [true, n]
}

/**  
 * Проверка целого значения n в строке по диапазону значений (n>=min, n<=max)
 * Возвращает true если в строке целое число и оно принадлежит диапазону, false в противном случае
 */
function testInt(s: string, min = 0, max = 0): boolean {
  if(!/^\d+$/.test(s)) return false
  const n: number = +s
  if(n < min) false
  if(max > 0 && n > max) return false
  return true
}

/**
 * Проверка части шаблона, отвечающей дням месяца
 */
function validateDaysPattern(s: string): boolean {
  if(s === '*') return true
  if(s[0] === '/') { // '/3213'
    if(!testInt(s.substring(1), 1)) return false
    return true
  }
  // '2/180', '*/24'
  const d = s.split('/')
  if(d.length === 2) {
    const [m1, m2] = d
    if(!testInt(m2, 1)) return false
    if(m1 !== '*' && !testInt(m1, 1, 31)) return false
    return true
  }
  // '20,25,27-31'
  const p = s.split(',')
  return p.every(s=>{
    const d = s.split('-')
    if(d.length > 2) return false
    if(d.length === 2) {    // '20-31'
      const [m1, m2] = d
      if(!testInt(m2, 1, 31)) return false
      if(!testInt(m1, 1, 31)) return false
      return true
    }
    // 24
    return testInt(d[0], 1, 31)
  })
}

/**
 * Проверка части шаблона, отвечающей месяцам
 */
function validateMonthsPattern(s: string): boolean {
  if(s === '*') return true
  // '2/2', '*/5'
  const d = s.split('/')
  if(d.length === 2) {
    const [m1, m2] = d
    if(!testInt(m2, 1)) return false
    if(m1 !== '*' && !testInt(m1, 1, 12)) return false
    return true
  }
  // '1,3,7-10'
  const p = s.split(',')
  return p.every(s=>{
    const d = s.split('-')
    if(d.length > 2) return false
    if(d.length === 2) {    // '7-10'
      const [m1, m2] = d
      if(!testInt(m2, 1, 12)) return false
      if(!testInt(m1, 1, 12)) return false
      return true
    }
    // 3
    return testInt(d[0], 1, 12)
  })
}

/**
 * Проверка части шаблона, отвечающей дням недели
 */
function validateWeekdaysPattern(s: string): boolean {
  if(s === '*') return true
  // '2/2', '*/5'
  const d = s.split('/')
  if(d.length === 2) {
    const [m1, m2] = d
    if(!testInt(m2, 1)) return false
    if(m1 !== '*' && !testInt(m1, 0, 6)) return false
    return true
  }
  // '1,3-5'
  const p = s.split(',')
  return p.every(s=>{
    const d = s.split('-')
    if(d.length > 2) return false
    if(d.length === 2) {    // '3-5'
      const [m1, m2] = d
      if(!testInt(m2, 0, 6)) return false
      if(!testInt(m1, 0, 6)) return false
      return true
    }
    // 3
    return testInt(d[0], 0, 6)
  })
}
