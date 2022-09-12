export type timestamp = number

//Библиотека методов для работы с timestamp
export class DateTime {

  static WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  static MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  static MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  static startWeek = 1
  static timezone = 3

  /** Инициализация параметров локальной таймзоны */
  static initLocale(timezone=3, startWeek=1) {
    DateTime.timezone = timezone
    DateTime.startWeek = startWeek%7
  }

/** Функция определения года, месяца, дня месяца по таймстемпу (unixtime) 
 * unixtime содержит число секунд прошедших с 01.01.1970 00:00:00GMT
 * функция работает на интервале времени от 01.01.1970 (unixtime=0x00000000) до 19.01.2038 03:14:07GMT (unixtime=0x7FFFFFFF)
 * если расширить определение unixtime как беззнакового целого, то теоретически можно определять время до 07.02.2106 06:28:15GMT (unixtime=0xFFFFFFFF)
 * алгоритм не учитывает правила високосных лет Григорианского календаря при переходе через столетия, поэтому корректно функция будет работать до 28.02.2100
*/
static getYearMonthDay(t: timestamp): {year:number, month:number, day:number} {
  const locale = t + 3600*DateTime.timezone             // приведение к местному времени
  const days = Math.floor(locale/86400)                 // количество дней с 01.01.1970
  // В Григорианском календаре за 400 лет добавляется 97 високосных дней 
  const years = Math.floor((days*400+200)/146097)       // количество лет с 01.01.1970 (365*400+97)=146097

  const year = 1970 + years
  const y2k = year - 2000 - 1                           // разница в годах от 1999 года
  const gr_leaps = Math.floor(y2k/100)-Math.floor(y2k/400)  // коррекция високосных дней при переходе через столетия
  let yday = days - Math.floor((1461*years+1)/4) + gr_leaps // день в году с учетом переходов через столетия

  const leap = ((!(year%4) && (year%100)) || !(year%400)) ? 1 : 0       // определение високосного года
                          // високосный год тот который делится на 4 (это Юлианский принцип, он работает с 1901 по 2099 годы)
                          // для Григорианского календаря требуется проверять делится ли год на 100 и на 400. 
                          // 1700,1800,1900,2100,2200,2300 - не високосные т.к. не делятся на 400, 2000 - високосный, т.к делится и на 100, и на 400)
  
  console.log(`timestamp: ${t}`)
  console.log(`year: ${year}, yday: ${yday}, leap: ${leap}, gregorian_leaps: ${gr_leaps}`)

  if(yday > 58 + leap) yday += 2 - leap     // приводим к системе с 30-дневным февралем
  const month = Math.floor(((yday * 12) + 6)/367)       // определение месяца исходя из количества дней с начала года (0-11)
  const mday = yday - Math.floor(((month*367) + 5)/12)  // определение дня в месяце (0-30)
  
  console.log(`yday2: ${yday}, month: ${month}, mday: ${mday}`)
  return {year, month, day: mday+1}  
}

  /** Получить день, месяц (0-11), день недели (0-6) по таймстемпу (unixtime) */
  static getDayMonthWeekday(t: timestamp): {day:number, month:number, weekday:number} {
    const d = new Date(t*1000)
    const day = d.getDate()
    const month = d.getMonth()
    const weekday = d.getDay()
    return {day, month, weekday}
  }

  /** Получить день недели по таймстемпу (unixtime) */
  static getWeekday(t: timestamp): number {
    const a = (4 + Math.floor((t + DateTime.timezone*3600)/86400))%7
    return t < 0 ? (a == 0 ? 0 : a + 7) : a
  }

  // 0,1,2,3,4,5,6      5,6,0,1,2,3,4,5,6
  //       |w                     |w
  //   |s               |             |s
  //   d = d-(w-s)      d = d-(w-s+7)  

  /** Получить таймстемп (unixtime) начала недели по локальному времени */
  static getBegintWeekTimestamp(t: timestamp): timestamp {
    const ts = DateTime.getBeginDayTimestamp(t)
    let ws = DateTime.getWeekday(t) - DateTime.startWeek
    if(ws<0) ws+=7
    return ts - ws*86400
  }

  /** Получить таймстемп (unixtime) на начало дня по локальному времени */
  static getBeginDayTimestamp(t: timestamp): timestamp {
    return Math.floor((t+DateTime.timezone*3600)/86400)*86400-DateTime.timezone*3600
  }
  /** Получить таймстемп (unixtime) на конец дня по локальному времени (последняя секунда дня 23:59:59)*/
  static getEndDayTimestamp(t: timestamp): timestamp {
    return DateTime.getBeginDayTimestamp(t) + 86399
  }
  /** Получить время в секундах от начала дня по локальному времени */
  static getTime(t: timestamp): number {
    return t - DateTime.getBeginDayTimestamp(t)
  }
  /** Получить время в секуднах до конца дня по локальному времени */
  static getTimeToEndDay(t: timestamp): number {
    return DateTime.getEndDayTimestamp(t) - t
  }
  /** Получить разницу в целых днях по локальному времени между датами, заданными unixtime */
  static getDifferenceInDays(t1: timestamp, t2: timestamp): number {
    return (DateTime.getBeginDayTimestamp(t2)-DateTime.getBeginDayTimestamp(t1))/86400
  }
  /** Получить строку даты в формате YYYY-MM-DD по локальному времени */
  static getYYYYMMDD(t: timestamp): string {
    const d = new Date(t*1000)
    const Y = d.getFullYear()
    const M = d.getMonth() + 1
    const D = d.getDate()
    return Y + (M>9?'-':'-0') + M + (D>9?'-':'-0') + D
  }
  /** Получить строку времени в формате HH:MM (локальное время) таймстемпа (unixtime) */
  static getHHMM(t: timestamp): string {
    const d = new Date(t*1000)
    const h = d.getHours()
    const m = d.getMinutes()
    return (h>9?'':'0') + h + (m>9?':':':0') + m
  }
  /** Получить строку времени в формате YYYY-MM-DDTHH:00 таймстемпа (unixtime) */
  static getYYYYMMDDTHHMM(t: timestamp): string {
    const d = new Date(t*1000)
    const Y = d.getFullYear()
    const M = d.getMonth() + 1
    const D = d.getDate()
    const h = d.getHours()
    const m = d.getMinutes()
    return Y + (M>9?'-':'-0') + M + (D>9?'-':'-0') + D + (h>9?'T':'T0') + h + (m>9?':':':0') + m
  }
  
  /** Преобразование интервала времени в секундах к строке времени в формате "H:MM" */
  static secToHHMM(sec: number) {
    const h = ~~(sec/3600)
    const m = ~~((sec%3600)/60) 
    return h + (m>9?':':':0') + m
  }
  /** Преобразование строки времени в формате "H:MM" к интервалу времени в секундах */
  static HHMMToSeconds(s: string): number {
    if(!s) return 0
    const [h, m] = s.split(':',2)
    const res = (+h*60 + (+m)) * 60
    if(isNaN(res)) { 
      console.log(`Ошибка преобразования строки '${s}' к интервалу времени`)
      return 0
    }
    return res
  }
  /** Преобразование интервала времени в секундах к строке времени в формате "Dd H:MM" */
  static secToDDHHMM(sec: number): string {
    if(sec<0) return ''
    const d = ~~(sec/86400)
    const t = sec%86400
    if(t) return (d<1?'':d+'d ') + DateTime.secToHHMM(t)
    return d<1?'':d+'d'
  }
  /** Преобразование строки времени в формате "Dd H:MM" к интервалу времени в секундах*/
  static DDHHMMToSeconds(s: string): number {
    const [d, t] = s.split('d',2)
    if(t === undefined) return DateTime.HHMMToSeconds(d)
    return +d*86400 + DateTime.HHMMToSeconds(t)
  }

  /** Проверка на соответствие дат, заданных таймстемпами (unixtime), по локальному времени */
  static isSameDay(t1: timestamp, t2: timestamp): boolean {
    return DateTime.getBeginDayTimestamp(t1) === DateTime.getBeginDayTimestamp(t2)
  }
  /** Проверка на соответствие даты сегодняшнему дню по локальному времени*/
  static isToday(t: timestamp): boolean {
    return DateTime.isSameDay(t, Date.now()/1000)
  }
}

