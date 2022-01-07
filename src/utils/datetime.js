
//Библиотека методов для работы с timestamp
export default class DateTime {

  static WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  static MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
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

  static getBeginDayTimestamp = timestamp => (~~((timestamp+DateTime.timezone*3600)/86400))*86400-DateTime.timezone*3600
  static getEndDayTimestamp = timestamp => (~~((timestamp+DateTime.timezone*3600)/86400))*86400-DateTime.timezone*3600+86400
  static getTime = timestamp =>  (timestamp+DateTime.timezone*3600)%86400-DateTime.timezone*3600
  static getTimeToEndDay = timestamp => 86400-DateTime.getTime(timestamp)
  static getDifferenceInDays = (ts1,ts2) => (DateTime.getBeginDayTimestamp(ts2)-DateTime.getBeginDayTimestamp(ts1))/86400

  static getTimeString(timestamp) {
    const d = new Date(timestamp*1000)
    const h = d.getHours()
    const m = d.getMinutes()
    return h + (m>9?':':':0') + m
  }
    
}

