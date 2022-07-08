
//Библиотека методов для работы с timestamp
export default class DateTime {

  static WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  static MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  static MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  static startWeek = 1
  static timezone = 3

  static initLocale(timezone=3, startWeek=1) {
    DateTime.timezone = timezone
    DateTime.startWeek = startWeek
  }

  // Фунция возвращает день месяца, месяц (0-11), день недели (0-6)
  static getDayMonthWeekday(timestamp) {
    const d = new Date(timestamp*1000)
    const day = d.getDate()
    const month = d.getMonth()
    const weekday = d.getDay()
    return {day, month, weekday}
  }

  static getWeekday(timestamp) {
    return new Date(timestamp*1000).getDay()
  }

  // 0,1,2,3,4,5,6      5,6,0,1,2,3,4,5,6
  //       |w                     |w
  //   |s               |             |s
  //   d = d-(w-s)      d = d-(w-s+7)  
  static getBegintWeekTimestamp(timestamp) {
    const d = new Date(timestamp*1000)
    d.setHours(0,0,0,0)
    const currentDay = d.getDate()
    let ws = d.getDay()-DateTime.startWeek
    if(ws<0) ws+=7
    return d.setDate(currentDay - ws)/1000
  }

  static getBeginDayTimestamp = timestamp => {
    const d = new Date(timestamp*1000)
    return d.setHours(0,0,0,0)/1000
    //(~~((timestamp+DateTime.timezone*3600)/86400))*86400-DateTime.timezone*3600
  }
  static getEndDayTimestamp = timestamp => (~~((timestamp+DateTime.timezone*3600)/86400))*86400-DateTime.timezone*3600+86399
  static getTime = timestamp =>  {
    return timestamp - DateTime.getBeginDayTimestamp(timestamp)
    //(timestamp+DateTime.timezone*3600)%86400-DateTime.timezone*3600
  }
  static getTimeToEndDay = timestamp => DateTime.getBeginDayTimestamp(timestamp)+86399-timestamp
  static getDifferenceInDays = (ts1,ts2) => (DateTime.getBeginDayTimestamp(ts2)-DateTime.getBeginDayTimestamp(ts1))/86400

  static getTimeString(timestamp) {
    const d = new Date(timestamp*1000)
    const h = d.getUTCHours()
    const m = d.getUTCMinutes()
    return h + (m>9?':':':0') + m
  }
    
  static getYYYYMMDD(timestamp) {
    const d = new Date(timestamp*1000)
    const Y = d.getFullYear()
    const M = d.getMonth()+1
    const D = d.getDate()
    return Y + (M>9?'-':'-0') + M + (D>9?'-':'-0') + D
  }

  static getHHMM(timestamp) {
    const d = new Date(timestamp*1000)
    const h = d.getHours()
    const m = d.getMinutes()
    return (h>9?'':'0') + h + (m>9?':':':0') + m
  }

  static getYYYYMMDDTHHMM(timestamp) {
    const d = new Date(timestamp*1000)
    const Y = d.getFullYear()
    const M = d.getMonth()+1
    const D = d.getDate()
    const h = d.getHours()
    const m = d.getMinutes()
    return Y + (M>9?'-':'-0') + M + (D>9?'-':'-0') + D + (h>9?'T':'T0') + h + (m>9?':':':0') + m
  }

  static HHMMToSeconds(s) {
    if(!s) return 0
    const [h, m] = s.split(':',2)
    return (h*60 + (+m)) * 60
  }
  // DDd HH:MM
  static DDHHMMToSeconds(s) {
    const [d, t] = s.split('d',2)
    if(t === undefined) return DateTime.HHMMToSeconds(d)
    return d*86400 + DateTime.HHMMToSeconds(t)
  }

  static HHMMFromSeconds(s) {
    if(s===null) return ''
    const h = ~~(s/3600)
    const m = ~~((s%3600)/60)
    return h + (m>9?':':':0') + m
  }

  static DDHHMMFromSeconds(s) {
    if(s<0) return ''
    const d = ~~(s/86400)
    const t = s%86400
    if(t) return (d<1?'':d+'d ') + DateTime.HHMMFromSeconds(t)
    return d<1?'':d+'d'
  }

  static isToday(timestamp) {
    return DateTime.getBeginDayTimestamp(Date.now()/1000)==timestamp
  }
}

