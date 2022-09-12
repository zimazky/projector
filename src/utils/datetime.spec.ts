import {DateTime} from './datetime'

function callf(f: (...args: any[])=>void, ...args:any[]) {
  return ()=>{ f(...args) }
}

describe('DateTime getWeekday', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    it(`test random negative timestamp = ${timestamp} & random timezone = ${timezone}`, callf( (t,tz)=>{
      DateTime.timezone = tz
      const wd = DateTime.getWeekday(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = d.getUTCDay()
      expect(wd).toEqual(ex)
    }, timestamp, timezone))
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    it(`test random positive timestamp = ${timestamp} & random timezone = ${timezone}`, callf( (t,tz)=>{
      DateTime.timezone = tz
      const wd = DateTime.getWeekday(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = d.getUTCDay()
      expect(wd).toEqual(ex)
    }, timestamp, timezone))
  }
})

describe('DateTime getBeginDayTimestamp', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    it(`test random negative timestamp = ${timestamp} & random timesone = ${timezone}`, callf ( (t,tz)=>{
      DateTime.timezone = tz
      const re = DateTime.getBeginDayTimestamp(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600
      expect(re).toEqual(ex)
    }, timestamp, timezone))
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    it(`test random positive timestamp = ${timestamp} & random timesone = ${timezone}`, callf( (t,tz)=>{
      DateTime.timezone = tz
      const re = DateTime.getBeginDayTimestamp(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600
      expect(re).toEqual(ex)
    }, timestamp, timezone))
  }
})

describe('DateTime getEndDayTimestamp', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    it(`test random negative timestamp = ${timestamp} & random timesone = ${timezone}`, callf ( (t,tz)=>{
      DateTime.timezone = tz
      const re = DateTime.getEndDayTimestamp(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600 + 86399
      expect(re).toEqual(ex)
    }, timestamp, timezone))
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    it(`test random positive timestamp = ${timestamp} & random timesone = ${timezone}`, callf( (t,tz)=>{
      DateTime.timezone = tz
      const re = DateTime.getEndDayTimestamp(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600 + 86399
      expect(re).toEqual(ex)
    }, timestamp, timezone))
  }
})

describe('DateTime getBeginWeekTimestamp', ()=>{
  for(let i = 0; i < 100; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    const startweek = Math.floor(Math.random()*10)
    it(`test random negative timestamp = ${timestamp} & random timesone = ${timezone} & random startweek = ${startweek}`, callf ( (t,tz,sw)=>{
      DateTime.initLocale(tz,sw)
      const re = DateTime.getBegintWeekTimestamp(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      let ws = d.getUTCDay() - (DateTime.startWeek%7)
      if(ws<0) ws+=7
      const ex = d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600 - ws*86400
      expect(re).toEqual(ex)
    }, timestamp, timezone, startweek))
  }
  for(let i = 0; i < 100; i++) {
    const timestamp = Math.floor(Math.random()*4294967296*1024)
    const timezone = Math.round(Math.random()*240)/10 - 12
    const startweek = 7 //Math.round(Math.random()*7)
    it(`test random positive timestamp = ${timestamp} & random timesone = ${timezone} & random startweek = ${startweek}`, callf( (t,tz,sw)=>{
      DateTime.initLocale(tz,sw)
      const re = DateTime.getBegintWeekTimestamp(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      let ws = d.getUTCDay() - (DateTime.startWeek%7)
      if(ws<0) ws+=7
      const ex = d.setUTCHours(0,0,0,0)/1000 - DateTime.timezone*3600 - ws*86400
      expect(re).toEqual(ex)
    }, timestamp, timezone, startweek))
  }
})

describe('DateTime getYearMonthDay', ()=>{
  let timestamp = 726766572397
  let timezone = 0
  xit(`test random positive timestamp = ${timestamp} & random timesone = ${timezone}`, callf ( (t,tz)=>{
    DateTime.initLocale(tz)
    const re = DateTime.getYearMonthDay(t)
    const d = new Date((t+DateTime.timezone*3600)*1000)
    const ex = {year: d.getUTCFullYear(), month:d.getUTCMonth(), day: d.getUTCDate()}
    expect(re).toEqual(ex)
  }, timestamp, timezone))
  timestamp = 673124972686
  timezone = 0
  xit(`test random positive timestamp = ${timestamp} & random timesone = ${timezone}`, callf ( (t,tz)=>{
    DateTime.initLocale(tz)
    const re = DateTime.getYearMonthDay(t)
    const d = new Date((t+DateTime.timezone*3600)*1000)
    const ex = {year: d.getUTCFullYear(), month:d.getUTCMonth(), day: d.getUTCDate()}
    expect(re).toEqual(ex)
  }, timestamp, timezone))

  for(let i = 0; i < 1000; i++) {
    const timestamp = - Math.floor(Math.random()*4294967296*1024)
    const timezone = 0 //Math.round(Math.random()*240)/10 - 12
    it(`test random positive timestamp = ${timestamp} & random timesone = ${timezone}`, callf ( (t,tz)=>{
      DateTime.initLocale(tz)
      const re = DateTime.getYearMonthDay(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = {year: d.getUTCFullYear(), month:d.getUTCMonth(), day: d.getUTCDate()}
      expect(re).toEqual(ex)
    }, timestamp, timezone))
  }

/*   
  for(let i = 726766572397-365*86400; i <= 726766572397; i+=86400) {
    const timestamp = i //Math.floor(Math.random()*4294967296*1024)
    const timezone = 0 //Math.round(Math.random()*240)/10 - 12
    it(`test random positive timestamp = ${timestamp} & random timesone = ${timezone}`, callf ( (t,tz)=>{
      DateTime.initLocale(tz)
      const re = DateTime.getYearMonthDay(t)
      const d = new Date((t+DateTime.timezone*3600)*1000)
      const ex = {year: d.getUTCFullYear(), month:d.getUTCMonth(), day: d.getUTCDate()}
      expect(re).toEqual(ex)
    }, timestamp, timezone))
  }
 */

})
