import ZCron from './ZCron'
import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

/**
 * Функция для замыкания аргументов внутри функции без аргументов
 * @param f функция для вызова
 * @param args аргументы, передаваемые в функцию f
 * @returns функция без аргументов
 */
 function callf(f: (...args: any[])=>void, ...args:any[]) {
  return ()=>{ f(...args) }
}
/** Возвращает массив с последовательностью чисел от a до b */
function seq(a: number, b: number): number[] {
  const r = []
  for(let i=a;i<=b;i++) r.push(i)
  return r
}
/** Возвращает массив с последовательностью чисел от a до max с шагом b */
function seqD(a: number, b: number, max:number = 31): number[] {
  const r = []
  for(let i=a;i<=max;i+=b) r.push(i)
  return r
}


/******************************************************************************
 * ZCrone addSequence
 ******************************************************************************/
describe('ZCrone addSequence', ()=>{
  const testset = [
    ['1-10', seq(1,10)],
    ['-5-5', []],
    ['3-7', seq(3,7)],
    ['a-5', []],
    ['5-b', []],
    ['1-5-10', seq(1,5)],
    ['1-5-', seq(1,5)],
    ['5,10', []],
    ['9', [9]],
    ['-10', []],
    ['2b', []],
    ['*', seq(1,31)],
    ['3/2', seqD(3,2)],
    ['3/-2', []],
    ['-3/2', []],
    ['3-/2', []]
  ]  
  for(let i=0;i<testset.length;i++) {
    it(`test string='${testset[i][0]}', `, callf( (s,ex)=>{
      const r = ZCron.addSequence([], s)
      expect(r).toEqual(ex)
    }, testset[i][0], testset[i][1]))
  }

})


/******************************************************************************
 * ZCron validate
 ******************************************************************************/
describe('ZCron validate', ()=>{

  it('должна считать пустую строку валидной (неповторяемое событие)', ()=>{
    expect(ZCron.validate('')).toBe(true)
    expect(ZCron.validate('   ')).toBe(true)
  })

  it('должна обрабатывать несколько пробелов между полями', ()=>{
    expect(ZCron.validate('25  2,3 *')).toBe(true)
  })

  it('должна отклонять дни вне диапазона 1-31', ()=>{
    expect(ZCron.validate('0 * *')).toBe(false)
    expect(ZCron.validate('32 * *')).toBe(false)
  })

  it('должна отклонять месяцы вне диапазона 1-12', ()=>{
    expect(ZCron.validate('* 0 *')).toBe(false)
    expect(ZCron.validate('* 13 *')).toBe(false)
  })

  it('должна отклонять дни недели вне диапазона 0-6', ()=>{
    expect(ZCron.validate('* * 7')).toBe(false)
  })

  it('должна отклонять относительные интервалы с нулевым шагом', ()=>{
    expect(ZCron.validate('/0')).toBe(false)
  })

  it('должна принимать корректные шаблоны', ()=>{
    expect(ZCron.validate('* * *')).toBe(true)
    expect(ZCron.validate('*/4 * *')).toBe(true)
    expect(ZCron.validate('/4')).toBe(true)
    expect(ZCron.validate('25 2,3 *')).toBe(true)
  })
})


/******************************************************************************
 * ZCron isMatch
 ******************************************************************************/
describe('ZCron isMatch', ()=>{

  function ts(date: string): timestamp {
    return DateTime.YYYYMMDDToTimestamp(date)
  }

  it('не должен считать пустой шаблон совпадающим ни с каким днём', ()=>{
    const start = ts('2024.01.01')
    const day = ts('2024.01.10')
    expect(ZCron.isMatch('', start, day)).toBe(false)
    expect(ZCron.isMatch('   ', start, day)).toBe(false)
  })

  it('должен совпадать при шаблоне * * * для любого дня', ()=>{
    const day = ts('2024.02.15')
    expect(ZCron.isMatch('* * *', day, day)).toBe(true)
  })

  it('должен учитывать день месяца', ()=>{
    const d1 = ts('2024.03.01')
    const d2 = ts('2024.03.02')
    const schedule = '1 * *'
    expect(ZCron.isMatch(schedule, d1, d1)).toBe(true)
    expect(ZCron.isMatch(schedule, d1, d2)).toBe(false)
  })

  it('должен учитывать месяц', ()=>{
    const feb = ts('2024.02.10')
    const mar = ts('2024.03.10')
    const schedule = '* 2 *'
    expect(ZCron.isMatch(schedule, feb, feb)).toBe(true)
    expect(ZCron.isMatch(schedule, feb, mar)).toBe(false)
  })

  it('должен учитывать день недели', ()=>{
    const day = ts('2024.04.05')
    const { weekday } = DateTime.getDayMonthWeekday(day)
    const schedule = `* * ${weekday}`
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  it('должен корректно обрабатывать несколько пробелов между полями', ()=>{
    const day = ts('2024.02.25') // 25 февраля (подходит по дню и месяцу)
    const schedule = '25  2,3 *'
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  it('режим /d: совпадение каждые d дней начиная со startTimestamp', ()=>{
    const start = ts('2024.01.01')
    const d0 = start
    const d2 = start + 2*86400
    const d4 = start + 4*86400
    const schedule = '/4'

    expect(ZCron.isMatch(schedule, start, d0)).toBe(true)
    expect(ZCron.isMatch(schedule, start, d4)).toBe(true)
    expect(ZCron.isMatch(schedule, start, d2)).toBe(false)
  })

  it('режим /d: не совпадает для дат до начала периода', ()=>{
    const start = ts('2024.01.10')
    const before = ts('2024.01.05')
    const schedule = '/3'
    expect(ZCron.isMatch(schedule, start, before)).toBe(false)
  })
})