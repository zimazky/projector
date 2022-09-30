import DateTime from './datetime'

/**
 * Функция для замыкания аргументов внутри функции без аргументов
 * @param f функция для вызова
 * @param args аргументы, передаваемые в функцию f
 * @returns функция без аргументов
 */
function callf(f: (...args: any[])=>void, ...args:any[]) {
  return ()=>{ f(...args) }
}

function test(f: (ts:number, tz: number, sw: number)=>void, timestamp: number, timezone: number = 0, startweek: number = 1) {
  it(
    `test timestamp=${timestamp} (${DateTime.getUTCYYYYMMDDTHHMM(timestamp)}), timezone=${timezone.toFixed(1)}, startweek=${startweek}`, 
    callf (f, timestamp, timezone, startweek)
  )
}

function test2(f: (ts1:number, ts2: number, tz: number, sw: number)=>void, timestamp1: number, timestamp2: number, timezone: number = 0, startweek: number = 1) {
  it(
    `test timestamp1=${timestamp1} (${DateTime.getUTCYYYYMMDDTHHMM(timestamp1)}), timestamp2=${timestamp1} (${DateTime.getUTCYYYYMMDDTHHMM(timestamp2)}), timezone=${timezone.toFixed(1)}, startweek=${startweek}`, 
    callf (f, timestamp1, timestamp2, timezone, startweek)
  )
}

function testYMD(f: (s: string, tz: number)=>void, str: string, timezone: number = 0) {
  it(
    `test YYYY-MM-DD = ${str}, timezone=${timezone.toFixed(1)}`, 
    callf (f, str, timezone)
  )
}

/******************************************************************************
 * getYearMonthDay
 ******************************************************************************/
describe('DateTime getYearMonthDay set of predefinded timestamps', ()=>{
  const timestamps = [
    0,
    -4294967296*1024, 
    4294967296*1024, 
    726766572397, 
    673124972686, 
    -1359946849946, 
    -1456732051942, 
    -2258373247017
  ]
  const timezone = 0
  for(let i=0; i<timestamps.length; i++) {
    const timestamp = timestamps[i]
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const re = DateTime.getYearMonthDay(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = {year: d.getUTCFullYear(), month:d.getUTCMonth(), day: d.getUTCDate()}
      expect(re).toEqual(ex)
    },timestamp, timezone)
  }
})

describe('DateTime getYearMonthDay short test of set random positive timestamps in range less then 2100 year', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const re = DateTime.getYearMonthDay(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = {year: d.getUTCFullYear(), month:d.getUTCMonth(), day: d.getUTCDate()}
      expect(re).toEqual(ex)
    }, timestamp, timezone)
  }
})
/*
describe('DateTime getYearMonthDay long test of set random negative timestamps', ()=>{
  for(let i = 0; i < 4000; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const re = DateTime.getYearMonthDay(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = {year: d.getUTCFullYear(), month:d.getUTCMonth(), day: d.getUTCDate()}
      expect(re).toEqual(ex)
    }, timestamp, timezone)
  }
})

describe('DateTime getYearMonthDay long test of set random positive timestamps', ()=>{
  for(let i = 0; i < 4000; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const re = DateTime.getYearMonthDay(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = {year: d.getUTCFullYear(), month:d.getUTCMonth(), day: d.getUTCDate()}
      expect(re).toEqual(ex)
    }, timestamp, timezone)
  }
})
*/

/******************************************************************************
 * YYYYMMDDToTimestampUTC
 ******************************************************************************/
 describe('DateTime YYYYMMDDToTimestampUTC', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const s = DateTime.getUTCYYYYMMDD(t)
      const wd = DateTime.YYYYMMDDToTimestampUTC(s)
      const d = new Date(wd*1000)
      const ex = d.setUTCHours(0,0,0,0)/1000
      console.log('DateTime', s, 'Date', new Date(ex*1000))
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const s = DateTime.getUTCYYYYMMDD(t)
      const wd = DateTime.YYYYMMDDToTimestampUTC(s)
      const d = new Date(wd*1000)
      const ex = d.setUTCHours(0,0,0,0)/1000
      console.log('DateTime', s, 'Date', new Date(ex*1000))
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
})


/******************************************************************************
 * YYYYMMDDToTimestamp
 ******************************************************************************/
describe('DateTime YYYYMMDDToTimestamp', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const s = DateTime.getYYYYMMDD(t)
      const wd = DateTime.YYYYMMDDToTimestamp(s)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600
      console.log('DateTime', s, 'Date', new Date(ex*1000))
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const s = DateTime.getYYYYMMDD(t)
      const wd = DateTime.YYYYMMDDToTimestamp(s)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600
      console.log('DateTime', s, 'Date', new Date(ex*1000))
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
})


/******************************************************************************
 * getWeekday
 ******************************************************************************/
describe('DateTime getWeekday', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getWeekday(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = d.getUTCDay()
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getWeekday(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = d.getUTCDay()
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
})

/******************************************************************************
 * getUTCBeginDayTimestamp
******************************************************************************/
describe('DateTime getUTCBeginDayTimestamp', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const re = DateTime.getUTCBeginDayTimestamp(t)
      const d = new Date(t*1000)
      const ex = d.setUTCHours(0,0,0,0)/1000
      expect(re).toEqual(ex)
    }, timestamp, timezone)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const re = DateTime.getUTCBeginDayTimestamp(t)
      const d = new Date(t*1000)
      const ex = d.setUTCHours(0,0,0,0)/1000
      expect(re).toEqual(ex)
    }, timestamp, timezone)
  }
})

/******************************************************************************
 * getBeginDayTimestamp
******************************************************************************/
describe('DateTime getBeginDayTimestamp', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const re = DateTime.getBeginDayTimestamp(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600
      expect(re).toEqual(ex)
    }, timestamp, timezone)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const re = DateTime.getBeginDayTimestamp(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600
      expect(re).toEqual(ex)
    }, timestamp, timezone)
  }
})

/******************************************************************************
 * getEndDayTimestamp
******************************************************************************/
describe('DateTime getEndDayTimestamp', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const re = DateTime.getEndDayTimestamp(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600 + 86399
      expect(re).toEqual(ex)
    }, timestamp, timezone)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const re = DateTime.getEndDayTimestamp(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600 + 86399
      expect(re).toEqual(ex)
    }, timestamp, timezone)
  }
})

/******************************************************************************
 * getBeginWeekTimestamp
******************************************************************************/
describe('DateTime getBeginWeekTimestamp', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    const startweek = Math.floor(Math.random()*10)
    test((t,tz,sw)=>{
      DateTime.initLocale(tz,sw)
      const re = DateTime.getBegintWeekTimestamp(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      let ws = d.getUTCDay() - (DateTime.startWeek%7)
      if(ws<0) ws+=7
      const ex = d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600 - ws*86400
      expect(re).toEqual(ex)
    }, timestamp, timezone, startweek)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    const startweek = 7 //Math.round(Math.random()*7)
    test((t,tz,sw)=>{
      DateTime.initLocale(tz,sw)
      const re = DateTime.getBegintWeekTimestamp(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      let ws = d.getUTCDay() - (DateTime.startWeek%7)
      if(ws<0) ws+=7
      const ex = d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600 - ws*86400
      expect(re).toEqual(ex)
    }, timestamp, timezone, startweek)
  }
})


/******************************************************************************
 * getDayMonthWeekday
******************************************************************************/
describe('DateTime getDayMonthWeekday', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getDayMonthWeekday(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = {day: d.getUTCDate(), month:d.getUTCMonth(), weekday: d.getUTCDay()}
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getDayMonthWeekday(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = {day: d.getUTCDate(), month:d.getUTCMonth(), weekday: d.getUTCDay()}
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
})

/******************************************************************************
 * getTime
******************************************************************************/
describe('DateTime getTime', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getTime(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = t - Math.floor(d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600)
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getTime(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = t - Math.floor(d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600)
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
})

/******************************************************************************
 * getTimeToEndDay
******************************************************************************/
describe('DateTime getTimeToEndDay', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getTimeToEndDay(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = 86399 - t + Math.floor(d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600)
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getTimeToEndDay(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = 86399 - t + Math.floor(d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600)
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
})

/******************************************************************************
 * getDifferenceInDays
******************************************************************************/
describe('DateTime getDifferenceInDays', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp1 = - Math.floor(Math.random()*4294967296*1024)
    const timestamp2 = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test2((t1,t2,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getDifferenceInDays(t1,t2)
      const d1 = new Date((t1+DateTime.timezone*3600)*1000)
      const d2 = new Date((t2+DateTime.timezone*3600)*1000)
      const ex = Math.floor((d2.setUTCHours(0,0,0,0)/1000 - d1.setUTCHours(0,0,0,0)/1000)/86400)
      expect(wd).toEqual(ex)
    }, timestamp1, timestamp2, timezone)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp1 = Math.floor(Math.random()*4294967296*1024)
    const timestamp2 = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test2((t1,t2,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getDifferenceInDays(t1,t2)
      const d1 = new Date((t1+DateTime.timezone*3600)*1000)
      const d2 = new Date((t2+DateTime.timezone*3600)*1000)
      const ex = Math.floor((d2.setUTCHours(0,0,0,0)/1000 - d1.setUTCHours(0,0,0,0)/1000)/86400)
      expect(wd).toEqual(ex)
    }, timestamp1, timestamp2, timezone)
  }
})

/******************************************************************************
 * getYYYYMMDD
******************************************************************************/
describe('DateTime getYYYYMMDD', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getYYYYMMDD(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const Y = d.getUTCFullYear()
      const M = d.getUTCMonth() + 1
      const D = d.getUTCDate()
      const ex =  Y + (M>9?'.':'.0') + M + (D>9?'.':'.0') + D
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getYYYYMMDD(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const Y = d.getUTCFullYear()
      const M = d.getUTCMonth() + 1
      const D = d.getUTCDate()
      const ex =  Y + (M>9?'.':'.0') + M + (D>9?'.':'.0') + D
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
})

/******************************************************************************
 * getHoursMinutes
******************************************************************************/
describe('DateTime getHoursMinutes', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getHoursMinutes(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const hours = d.getUTCHours()
      const minutes = d.getUTCMinutes()
      const ex =  {hours, minutes}
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getHoursMinutes(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const hours = d.getUTCHours()
      const minutes = d.getUTCMinutes()
      const ex =  {hours, minutes}
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
})

/******************************************************************************
 * getHHMM
******************************************************************************/
describe('DateTime getHHMM', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getHHMM(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const hours = d.getUTCHours()
      const minutes = d.getUTCMinutes()
      const ex = (hours>9?'':'0') + hours + (minutes>9?':':':0') + minutes
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getHHMM(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const hours = d.getUTCHours()
      const minutes = d.getUTCMinutes()
      const ex = (hours>9?'':'0') + hours + (minutes>9?':':':0') + minutes
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
})

/******************************************************************************
 * getYYYYMMDDTHHMM
******************************************************************************/
describe('DateTime getYYYYMMDDTHHMM', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getYYYYMMDDTHHMM(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const Y = d.getUTCFullYear()
      const M = d.getUTCMonth() + 1
      const D = d.getUTCDate()
      const h = d.getUTCHours()
      const m = d.getUTCMinutes()
      const ex = Y + (M>9?'-':'-0') + M + (D>9?'-':'-0') + D + (h>9?'T':'T0') + h + (m>9?':':':0') + m
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    test((t,tz)=>{
      DateTime.initLocale(tz)
      const wd = DateTime.getYYYYMMDDTHHMM(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const Y = d.getUTCFullYear()
      const M = d.getUTCMonth() + 1
      const D = d.getUTCDate()
      const h = d.getUTCHours()
      const m = d.getUTCMinutes()
      const ex = Y + (M>9?'-':'-0') + M + (D>9?'-':'-0') + D + (h>9?'T':'T0') + h + (m>9?':':':0') + m
      expect(wd).toEqual(ex)
    }, timestamp, timezone)
  }
})

/******************************************************************************
 * HMMToSeconds
******************************************************************************/
describe('DateTime HMMToSeconds test set predefined strings', ()=>{
  const testset = [
    ['10:38', 38280],
    ['10:38fgjjjjjfj', 0],
    ['10 :38', 38280],
    ['10: 38', 38280],
    [' 10 : 38 ', 38280],
    ['-10:38', -38280],
    ['10:-38', 0],
    ['-10:38fgjjjjjfj', 0],
    ['', 0],
    ['10', 0],
    ['*', 0],
    ['10h', 0],
    ['10:38:34', 38280],
    ['10:38:ww', 38280],
    ['ww:10:38', 0],
  ]
  for(let i=0;i<testset.length;i++) {
    it(`test string='${testset[i][0]}'`, callf( (s,ex)=>{
      const r = DateTime.HMMToSeconds(s)
      //console.log(s,r,ex)
      expect(r).toEqual(ex)
    }, testset[i][0], testset[i][1]))
  }
})


/******************************************************************************
 * secondsToHMM
******************************************************************************/
describe('DateTime secondsToHMM', ()=>{
  const testset = [
    [38280, '10:38'],
    [-38280, '-10:38'],
    [924840, '256:54'],
    [11160, '3:06'],
    [-11160, '-3:06'],
    [-11192, '-3:06'],
    [0, '0:00']
  ]
  for(let i=0;i<testset.length;i++) {
    it(`test seconds='${testset[i][0]}'`, callf( (s,ex)=>{
      const r = DateTime.secondsToHMM(s)
      //console.log(s,r,ex)
      expect(r).toEqual(ex)
    }, testset[i][0], testset[i][1]))
  }
})

/******************************************************************************
 * secondsToDdHMM
******************************************************************************/
describe('DateTime secondsToDdHMM', ()=>{
  const testset = [
    [38280, '10:38'],
    [-38280, '-10:38'],
    [443160, '5d 3:06'],
    [-443160, '-5d 3:06'],
    [443192, '5d 3:06'],
    [-443192, '-5d 3:06'],
    [0, '0:00']
  ]
  for(let i=0;i<testset.length;i++) {
    it(`test seconds='${testset[i][0]}'`, callf( (s,ex)=>{
      const r = DateTime.secondsToDdHMM(s)
      //console.log(s,r,ex)
      expect(r).toEqual(ex)
    }, testset[i][0], testset[i][1]))
  }

})