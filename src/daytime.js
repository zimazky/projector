export const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Фунция возвращает день месяца, месяц (0-11), день недели (0-6)
export function getDayMonthWeekday(timestamp) {
  const d = new Date(timestamp*1000)
  const day = d.getDate()
  const month = d.getMonth()
  const weekday = d.getDay()
  return {day, month, weekday}
}

export function getWeekday(timestamp) {
  return new Date(timestamp*1000).getDay()
}

export function getStartWeekTimestamp(timestamp) {
  const d = new Date(timestamp*1000)
  d.setHours(0,0,0,0)
  const currentDay = d.getDate()
  let m = d.getDay()
  m = m==0?7:m
  return d.setDate(currentDay - m + 1)/1000
}

export function getTimeString(timestamp) {
  const d = new Date(timestamp*1000)
  const h = d.getHours()
  const m = d.getMinutes()
  return (h>9?'':'0') + h + (m>9?':':':0') + m
}

// Функция добавляет в массив array последовательность чисел, представленных строкой 'a-b', 
// где a - начальное число последовательности
//     b - конечное число
function addSequence(array, str) {
  const d = str.split('-')
  if(d[0] === '*') return array
  if(d.length == 1) array.push(+d[0])
  else for(let i=+d[0];i<=d[1];i++) array.push(i)
  return array
}

// Функция проверяет соответствует ли указанный день шаблону расписания
// Шаблон задается строкой вида:
// 'm h d M w' 
// m minutes; h hours; d days; M months; w weekdays
// если соответствует возвращает true, иначе false
export function isScheduledDay(timestamp, scheduleString) {
  const {day,month,weekday} = getDayMonthWeekday(timestamp)
  const schedule = scheduleString.split(' ')
  // 0 minutes; 1 hours; 2 days; 3 months; 4 weekdays; 5 holydays
  const days = schedule[2].split(',').reduce( (a,s) => addSequence(a,s), [])
  const months = schedule[3].split(',').reduce( (a,s) => addSequence(a,s), [])
  const weekdays = schedule[4].split(',').reduce( (a,s) => addSequence(a,s), [])
  const lwd = weekday==0?7:weekday
  if( (months.length==0 || months.includes(month)) && 
      (days.length==0 || days.includes(day)) &&
      (weekdays.length==0 || weekdays.includes(lwd))
    ) return true
  return false
}

export function beginDayTS(timestamp) {
  const d = new Date(timestamp*1000)
  return d.setHours(0,0,0,0)/1000
}

export function endDayTS(timestamp) {
  const d = new Date(timestamp*1000)
  return d.setHours(0,0,0,0)/1000+86399
}

export function daysDifference(ts1, ts2, duration = 86400) {
  const end = ts2 ?? ts1+duration
  return (beginDayTS(end)-beginDayTS(ts1))/86400
}

