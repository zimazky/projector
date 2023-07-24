import {Flavor} from './typehelper'

export type timestamp = Flavor<number, 'timestamp'>

/** Представление числа со стартовым нулем */
function NN(n: number): string { return (n<10 ? '0' : '') + n }
/** Представление числа со стартовой точкой и нулем */
function dNN(n: number): string { return (n<10 ? '.0' : '.') + n }
/** Представление числа со стартовым двоеточием и нулем */
function cNN(n: number): string { return (n<10 ? ':0' : ':') + n }
/** Представление числа со стартовым тире и нулем */
function mNN(n: number): string { return (n<10 ? '-0' : '-') + n }
/** Представление числа со стартовым T и нулем */
function TNN(n: number): string { return (n<10 ? 'T0' : 'T') + n }

/** 
 * Класс статических методов для работы с timestamp в формате unixtime в секундах с 01.01.1970.
 * timestamp может использоваться в диапазоне -2^42...+2^42 (±4398046511104) (диапазон дат -16.06.137399...19.07.141338)
 * Конвертация к датам производится по Григорианскому календарю с учетом временной зоны, заданной в поле timezone.
 * В отличие от класса Date, исторические изменения временной зоны не учитываются.
 * Начало недели задается в поле startWeek.
*/
export default class DateTime {

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

  /** Функция определения года, месяца, дня месяца таймстемпа (unixtime) по времени UTC [tested]*/
  static getUTCYearMonthDay(t: timestamp): {year:number, month:number, day:number} {
    const days = Math.floor(t/86400)                // количество дней с 01.01.1970
    const years = Math.floor((days*400+200)/146097) // количество лет с 01.01.1970 (365*400+97)=146097
                                                    // В Григорианском календаре за 400 лет добавляется 97 високосных дней 
    let year = 1970 + years
    const y2k = year - 2000 - 1                     // разница в годах от 2001 года
    let yday = days - Math.floor((1461*years+1)/4)  // день года без учета високосных годов при переходе столетий
    yday += Math.floor(y2k/100)-Math.floor(y2k/400) // коррекция високосных дней при переходе столетий
    const leap = ((!(year%4) && (year%100)) || !(year%400)) ? 1 : 0   // определение високосного года
    // високосный год тот который делится на 4 (это Юлианский принцип, он работает с 1901 по 2099 годы)
    // для Григорианского календаря требуется проверять делится ли год на 100 и на 400. 
    // 1700,1800,1900,2100,2200,2300 - не високосные т.к. не делятся на 400, 2000 - високосный, т.к делится и на 100, и на 400)

    //console.log(`timestamp: ${t}, locale: ${locale} locale/86400=${locale/86400}`)
    //console.log(`days: ${days}, years: ${years}, year: ${year}, yday: ${yday}, leap: ${leap}`)

    if(yday > 58 + leap) yday += 2 - leap           // приводим к системе с 30-дневным февралем
    let month = Math.floor(((yday * 12) + 6)/367)   // определение месяца исходя из количества дней с начала года (0-11)
    const mday = yday - Math.floor(((month*367) + 5)/12)  // определение дня в месяце (0-30)
    
    //console.log(`yday2: ${yday}, month: ${month}, mday: ${mday}`)
    if(month<0) { year--; month += 12 }
    if(month>11) { year++; month -= 12 }
    return {year, month, day: mday+1}  
  }

  /** Функция определения года, месяца, дня месяца таймстемпа (unixtime) по локальному времени [tested]*/
  static getYearMonthDay(t: timestamp): {year:number, month:number, day:number} {
    return DateTime.getUTCYearMonthDay(t + 3600*DateTime.timezone)
  }
  
  /** Преобразовать строку даты формата YYYY.MM.DD в таймстемп по времени UTC [tested]*/
  static YYYYMMDDToTimestampUTC(s: string): timestamp {
    let [y, m, d] = s.split('.',3)
    if(m === undefined) [y, m, d] = s.split('-',3)                  // добавлено чтение формата YYYY-MM-DD
    const year = +y
    const month = +m - 1
    const leap = ((!(year%4) && (year%100)) || !(year%400)) ? 1 : 0 // Определение високосного года
    let yday = Math.floor(((month*367) + 5)/12) + +d - 1            // Количество дней с начала года 
                                                                    // (февраль считается 30-дневным)
    if(yday > 59 + leap) yday -= 2 - leap                           // Корректировка количества дней по високосному году
    const years = year - 1970
    const y2k = year - 2000 - 1
    let days = Math.floor((1461*years+1)/4)                         // Количество дней от 01-01-1970 до начала года
                                                                    // По Юлианскому принципу
    days -= Math.floor(y2k/100)-Math.floor(y2k/400)                 // Корректировка по Григорианскому принципу
                                                                    // (с учетом переходов через столетия)
    days += yday
    if(isNaN(days)) {
      console.log(`Ошибка преобразования строки '${s}' формата 'YYYY.MM.DD' к unixtime`)
      return 0
    }
    return days*86400
  }
  
  /** Преобразовать строку даты формата YYYY.MM.DD в таймстемп по локальному времени [tested]*/
  static YYYYMMDDToTimestamp(s: string): timestamp {
    return DateTime.YYYYMMDDToTimestampUTC(s) - DateTime.timezone*3600
  }
  
  /** Получить день недели по таймстемпу (unixtime) [tested]*/
  static getWeekday(t: timestamp): number {
    const a = (4 + Math.floor((t + DateTime.timezone*3600)/86400))%7
    return t < 0 ? (a == 0 ? 0 : a + 7) : a
  }
  
  /** Получить день, месяц (0-11), день недели (0-6) по таймстемпу (unixtime) [tested]*/
  static getDayMonthWeekday(t: timestamp): {day:number, month:number, weekday:number} {
    const {month, day} = DateTime.getYearMonthDay(t)
    const weekday = DateTime.getWeekday(t)
    return {day, month, weekday}
  }

  // 0,1,2,3,4,5,6      5,6,0,1,2,3,4,5,6
  //       |w                     |w
  //   |s               |             |s
  //   d = d-(w-s)      d = d-(w-s+7)  

  /** Получить таймстемп (unixtime) начала недели по локальному времени [tested]*/
  static getBegintWeekTimestamp(t: timestamp): timestamp {
    const ts = DateTime.getBeginDayTimestamp(t)
    let ws = DateTime.getWeekday(t) - DateTime.startWeek
    if(ws<0) ws+=7
    return ts - ws*86400
  }

  /** Получить таймстемп (unixtime) на начало дня по времени UTC [tested]*/
  static getUTCBeginDayTimestamp(t: timestamp): timestamp {
    return Math.floor(t/86400)*86400
  }
  
  /** Получить таймстемп (unixtime) на начало дня по локальному времени [tested]*/
  static getBeginDayTimestamp(t: timestamp): timestamp {
    return Math.floor((t+DateTime.timezone*3600)/86400)*86400-DateTime.timezone*3600
  }
  /** Получить таймстемп (unixtime) на конец дня по локальному времени (последняя секунда дня 23:59:59) [tested]*/
  static getEndDayTimestamp(t: timestamp): timestamp {
    return DateTime.getBeginDayTimestamp(t) + 86399
  }
  /** Получить время в секундах от начала дня по времени UTC */
  static getUTCTime(t: timestamp): number {
    return t<0? t%86400 + 86400 : t%86400
  }
  /** Получить время в секундах от начала дня по локальному времени [tested]*/
  static getTime(t: timestamp): number {
    return DateTime.getUTCTime(t+DateTime.timezone*3600)
  }
  /** Получить время в секуднах до конца дня по локальному времени [tested]*/
  static getTimeToEndDay(t: timestamp): number {
    return DateTime.getEndDayTimestamp(t) - t
  }
  /** Получить разницу t2-t1 в целых днях по локальному времени между датами, заданными unixtime [tested]*/
  static getDifferenceInDays(t1: timestamp, t2: timestamp): number {
    return Math.floor((t2-DateTime.getBeginDayTimestamp(t1))/86400)
  }
  /** Получить строку даты в формате YYYY.MM.DD по времени UTC */
  static getUTCYYYYMMDD(t: timestamp): string {
    const {year, month, day} = DateTime.getUTCYearMonthDay(t)
    return year + dNN(month + 1) + dNN(day)
  }
  /** Получить строку даты в формате YYYY.MM.DD по локальному времени [tested]*/
  static getYYYYMMDD(t: timestamp): string {
    const {year, month, day} = DateTime.getYearMonthDay(t)
    return year + dNN(month + 1) + dNN(day)
  }
  /** Получить время в виде количества часов и минут с начала дня таймстемпа по времени UTC */
  static getUTCHoursMinutes(t: timestamp): {hours: number, minutes: number} {
    const time = DateTime.getUTCTime(t)
    const hours = Math.floor(time/3600)
    const minutes = Math.floor((time%3600)/60)
    return {hours, minutes}
  }
  /** Получить время в виде количества часов и минут с начала дня таймстемпа по времени UTC */
  static getUTCHoursMinutesSeconds(t: timestamp): {hours: number, minutes: number, seconds: number} {
    const time = DateTime.getUTCTime(t)
    const hours = Math.floor(time/3600)
    const minutes = Math.floor((time%3600)/60)
    const seconds = Math.floor(time%60)
    return {hours, minutes, seconds}
  }
  /** Получить время в виде количества часов и минут с начала дня по локальному времени [tested]*/
  static getHoursMinutes(t: timestamp): {hours: number, minutes: number} {
    const time = DateTime.getTime(t)
    const hours = Math.floor(time/3600)
    const minutes = Math.floor((time%3600)/60)
    return {hours, minutes}
  }
  /** Получить время в виде количества часов, минут и секунд с начала дня по локальному времени*/
  static getHoursMinutesSeconds(t: timestamp): {hours: number, minutes: number, seconds: number} {
    const time = DateTime.getTime(t)
    const hours = Math.floor(time/3600)
    const minutes = Math.floor((time%3600)/60)
    const seconds = Math.floor(time%60)
    return {hours, minutes, seconds}
  }
  /** Получить строку времени таймстемпа в формате HH:MM по времени UTC*/
  static getUTCHHMM(t: timestamp): string {
    const {hours, minutes} = DateTime.getUTCHoursMinutes(t)
    return NN(hours) + cNN(minutes)
  }
  /** Получить строку времени таймстемпа в формате HH:MM:SS по времени UTC*/
  static getUTCHHMMSS(t: timestamp): string {
    const {hours, minutes, seconds} = DateTime.getUTCHoursMinutesSeconds(t)
    return NN(hours) + cNN(minutes) + cNN(seconds)
  }
  /** Получить строку времени таймстемпа в формате HH:MM по локальному времени [tested]*/
  static getHHMM(t: timestamp): string {
    const {hours, minutes} = DateTime.getHoursMinutes(t)
    return NN(hours) + cNN(minutes)
  }
  /** Получить строку времени таймстемпа в формате HH:MM:SS по локальному времени*/
  static getHHMMSS(t: timestamp): string {
    const {hours, minutes, seconds} = DateTime.getHoursMinutesSeconds(t)
    return NN(hours) + cNN(minutes) + cNN(seconds)
  }
  /** Получить строку времени таймстемпа в формате YYYY-MM-DDTHH:MM по времени UTC */
  static getUTCYYYYMMDDTHHMM(t: timestamp): string {
    const {year, month, day} = DateTime.getUTCYearMonthDay(t)
    const {hours, minutes} = DateTime.getUTCHoursMinutes(t)
    return year + mNN(month + 1) + mNN(day) + TNN(hours) + cNN(minutes)
  }
  /** Получить строку времени таймстемпа в формате YYYY-MM-DDTHH:MM [tested]*/
  static getYYYYMMDDTHHMM(t: timestamp): string {
    const {year, month, day} = DateTime.getYearMonthDay(t)
    const {hours, minutes} = DateTime.getHoursMinutes(t)
    const M = month + 1
    return year + mNN(month + 1) + mNN(day) + TNN(hours) + cNN(minutes)
  }
  /** Преобразование интервала времени в секундах к строке времени в формате "H:MM" [tested]*/
  static secondsToHMM(sec: number) {
    const h = ~~(sec/3600) // Округляется так для возможности работы с отрицательными значениями
    const m = Math.abs(~~((sec%3600)/60))
    return h + cNN(m)
  }

  /** Преобразование строки времени в формате "H:MM" к интервалу времени в секундах [tested]*/
  static HMMToSeconds(s: string): number {
    if(!s) return 0
    const [h, m] = s.split(':',2)
    //console.log(`h=${h}, m=${m}`)
    const ih = +h*3600
    const im = +m*60
    const res = ih<0 ?  ih - im : ih + im
    if(isNaN(res) || im<0) { 
      console.log(`Ошибка преобразования строки '${s}' формата 'H:MM' к интервалу времени`)
      return 0
    }
    return res
  }

  /** Преобразование интервала времени в секундах к строке времени в формате "Dd H:MM" [tested]*/
  static secondsToDdHMM(sec: number): string {
    const d = ~~(sec/86400) // Округляется так для возможности работы с отрицательными значениями
    const t = (sec%86400)
    if(d >= 1 || d <= -1) return d + 'd ' + DateTime.secondsToHMM(Math.abs(t))
    return DateTime.secondsToHMM(t)
  }

  /** Преобразование строки времени в формате "Dd H:MM" к интервалу времени в секундах*/
  static DdHMMToSeconds(s: string): number {
    const [d, t] = s.split('d',2)
    if(t === undefined) return DateTime.HMMToSeconds(d)
    return +d*86400 + DateTime.HMMToSeconds(t)
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

