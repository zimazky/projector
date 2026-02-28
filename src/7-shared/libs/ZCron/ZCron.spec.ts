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

  // Additional validation tests for malformed inputs
  it('должна отклонять слишком много полей', ()=>{
    expect(ZCron.validate('* * * *')).toBe(false)
    expect(ZCron.validate('* * * extra')).toBe(false)
  })

  it('должна отклонять неправильные символы в шаблонах', ()=>{
    expect(ZCron.validate('a * *')).toBe(false)
    expect(ZCron.validate('* b *')).toBe(false)
    expect(ZCron.validate('* * c')).toBe(false)
    expect(ZCron.validate('1.5 * *')).toBe(false) // decimal numbers not allowed
  })

  it('должна отклонять неправильные форматы шагов', ()=>{
    expect(ZCron.validate('1/ * *')).toBe(false) // incomplete step
    expect(ZCron.validate('/ * *')).toBe(false) // incomplete relative
    expect(ZCron.validate('a/2 * *')).toBe(false) // non-numeric base
  })

  it('должна отклонять неправильные форматы диапазонов', ()=>{
    expect(ZCron.validate('1- * *')).toBe(false) // incomplete range
    expect(ZCron.validate('-5 * *')).toBe(false) // negative start
    expect(ZCron.validate('a-b * *')).toBe(false) // non-numeric range
  })

  it('должна отклонять неправильные форматы списков', ()=>{
    expect(ZCron.validate('1, * *')).toBe(false) // incomplete list
    expect(ZCron.validate(',5 * *')).toBe(false) // leading comma
    expect(ZCron.validate('1,,5 * *')).toBe(false) // double comma
    expect(ZCron.validate('a,5 * *')).toBe(false) // non-numeric in list
  })

  it('должна корректно обрабатывать граничные значения', ()=>{
    expect(ZCron.validate('1 * *')).toBe(true)  // minimum day
    expect(ZCron.validate('31 * *')).toBe(true) // maximum day
    expect(ZCron.validate('* 1 *')).toBe(true)  // minimum month
    expect(ZCron.validate('* 12 *')).toBe(true) // maximum month
    expect(ZCron.validate('* * 0')).toBe(true)  // minimum weekday
    expect(ZCron.validate('* * 6')).toBe(true)  // maximum weekday
  })

  it('должна отклонять неправильные относительные интервалы', ()=>{
    expect(ZCron.validate('/')).toBe(false)      // incomplete relative
    expect(ZCron.validate('/-1')).toBe(false)   // negative interval
    expect(ZCron.validate('/0')).toBe(false)    // zero interval
    expect(ZCron.validate('/a')).toBe(false)    // non-numeric interval
  })

  it('должна корректно обрабатывать сокращенные форматы', ()=>{
    expect(ZCron.validate('1')).toBe(true)      // only day
    expect(ZCron.validate('1 3')).toBe(true)    // day and month
    expect(ZCron.validate('1 3 5')).toBe(true)  // all three fields
  })

  it('должна отклонять неправильные шаги в днях недели', ()=>{
    expect(ZCron.validate('* * 7/1')).toBe(false) // weekday out of range
    expect(ZCron.validate('* * 5/2')).toBe(true)  // valid weekday step
  })

  it('должна отклонять отрицательные шаги', ()=>{
    expect(ZCron.validate('1/-2 * *')).toBe(false)
    expect(ZCron.validate('* 1/-2 *')).toBe(false)
    expect(ZCron.validate('* * 1/-2')).toBe(false)
  })

  it('должна отклонять отрицательные диапазоны', ()=>{
    expect(ZCron.validate('-5-10 * *')).toBe(false)
    expect(ZCron.validate('5--10 * *')).toBe(false)
    expect(ZCron.validate('* -5-10 *')).toBe(false)
  })

  it('должна отклонять некорректные комбинации операторов в днях', ()=>{
    expect(ZCron.validate('1-5/2 * *')).toBe(false)  // invalid combination, шаг не может быть применен к диапазону
    expect(ZCron.validate('1/3,1-5/2 * *')).toBe(false)  // invalid combination, шаг не может быть применен к диапазону
    expect(ZCron.validate('1/3,1-5-2 * *')).toBe(false)  // invalid combination, double dash
    expect(ZCron.validate('1,2-5 * *')).toBe(true)   // valid combination
    expect(ZCron.validate('1/2/3 * *')).toBe(false)  // invalid: double slash
    expect(ZCron.validate('1,2/3 * *')).toBe(true)   // valid combination
    expect(ZCron.validate('1-5-10 * *')).toBe(false) // invalid: double dash
  })

  it('должна отклонять некорректные комбинации операторов в месяцах', ()=>{
    expect(ZCron.validate('* 1-5/2 *')).toBe(false)  // invalid combination, шаг не может быть применен к диапазону
    expect(ZCron.validate('* 1/3,1-5/2 *')).toBe(false)  // invalid combination, шаг не может быть применен к диапазону
    expect(ZCron.validate('* 1/3,1-5-2 *')).toBe(false)  // invalid combination, double dash
    expect(ZCron.validate('* 1,2-5 *')).toBe(true)   // valid combination
    expect(ZCron.validate('* 1/2/3 *')).toBe(false)  // invalid: double slash
    expect(ZCron.validate('* 1,2/3 *')).toBe(true)   // valid combination
    expect(ZCron.validate('* 1-5-10 *')).toBe(false) // invalid: double dash
  })

  it('должна отклонять некорректные комбинации операторов в днях недели', ()=>{
    expect(ZCron.validate('* * 1-5/2')).toBe(false)  // invalid combination, шаг не может быть применен к диапазону
    expect(ZCron.validate('* * 1/3,1-2/2')).toBe(false)  // invalid combination, шаг не может быть применен к диапазону
    expect(ZCron.validate('* * 1/3,1-2-2')).toBe(false)  // invalid combination, double dash
    expect(ZCron.validate('* * 1,2-5')).toBe(true)   // valid combination
    expect(ZCron.validate('* * 1/2/3')).toBe(false)  // invalid: double slash
    expect(ZCron.validate('* * 1,2/3')).toBe(true)   // valid combination
    expect(ZCron.validate('* * 1-5-6')).toBe(false) // invalid: double dash
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

  // Tests for reduced forms of templates (with omitted *)
  it('должен работать с частично опущенными полями - только день', ()=>{
    const day = ts('2024.03.01')
    const schedule = '1' // эквивалентно '1 * *'
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  it('должен работать с частично опущенными полями - день и месяц', ()=>{
    const day = ts('2024.03.01')
    const schedule = '1 3' // эквивалентно '1 3 *'
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  it('должен корректно обрабатывать сокращенный формат с опущенным днем', ()=>{
    const day = ts('2024.03.15')
    const schedule = '* 3 *' // должен соответствовать марчу
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  it('должен корректно обрабатывать сокращенный формат с опущенным месяцем', ()=>{
    const day = ts('2024.03.15')
    const schedule = '15 * *' // должен соответствовать 15 числу
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  it('должен корректно обрабатывать сокращенный формат с опущенным днем недели', ()=>{
    const day = ts('2024.03.15')
    const { weekday } = DateTime.getDayMonthWeekday(day)
    const schedule = `15 3` // эквивалентно '15 3 *'
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  it('должен корректно обрабатывать комбинации опущенных полей', ()=>{
    const day = ts('2024.03.15')
    const schedule = '15 3' // эквивалентно '15 3 *'
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  // Tests for various range and step patterns
  it('должен обрабатывать шаги с опущенным первым значением (*/4)', ()=>{
    const day = ts('2024.01.01') // Это 1 число, должно соответствовать */4
    const schedule = '*/4 * *' // каждый 4-й день месяца, начиная с 1
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  it('должен обрабатывать диапазоны с опущенными звездами', ()=>{
    const day = ts('2024.01.05')
    const schedule = '1-10 * *' // дни с 1 по 10
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  it('должен обрабатывать списки значений', ()=>{
    const day = ts('2024.01.05')
    const schedule = '5,10,15 * *' // 5, 10 или 15 число
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  it('должен обрабатывать списки значений с опущенными полями', ()=>{
    const day = ts('2024.01.05')
    const schedule = '5,10,15' // эквивалентно '5,10,15 * *'
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  it('должен корректно обрабатывать шаги в месяцах', ()=>{
    const day = ts('2024.03.01') // 1 марта
    const schedule = '1 */3 *' // каждый 3-й месяц, начиная с января (1, 4, 7, 10)
    expect(ZCron.isMatch(schedule, day, day)).toBe(false) // март (месяц 3) не должен совпадать
    
    const aprDay = ts('2024.04.01') // 1 апреля
    expect(ZCron.isMatch(schedule, aprDay, aprDay)).toBe(true) // апрель (месяц 4) должен совпадать
  })

  it('должен корректно обрабатывать шаги в днях недели', ()=>{
    const day = ts('2024.01.07') // воскресенье (день недели 0)
    const { weekday } = DateTime.getDayMonthWeekday(day)
    const schedule = '* * */2' // каждый 2-й день недели (0, 2, 4, 6)
    expect(ZCron.isMatch(schedule, day, day)).toBe(true) // воскресенье (0) должно совпадать
    
    const monDay = ts('2024.01.08') // понедельник (день недели 1)
    expect(ZCron.isMatch(schedule, monDay, monDay)).toBe(false) // понедельник (1) не должен совпадать
  })

  it('должен обрабатывать комбинации условий', ()=>{
    const day = ts('2024.04.05') // 5 апреля
    const { weekday } = DateTime.getDayMonthWeekday(day)
    const schedule = '5 4 5' // 5 апреля, в пятницу
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  it('должен обрабатывать сложные комбинации с диапазонами', ()=>{
    const day = ts('2024.04.05') // 5 апреля
    const schedule = '1-10 4-6 *' // 1-10 числа, в апреле-июне
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  it('должен обрабатывать сложные комбинации со списками', ()=>{
    const day = ts('2024.04.05') // 5 апреля
    const schedule = '5,10,15 4,5,6 5' // 5, 10 или 15 числа, в апреле, мае или июне, в пятницу
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })

  it('должен не совпадать при несоответствии хотя бы одного условия', ()=>{
    const day = ts('2024.04.05') // 5 апреля, пятница
    const schedule = '6 4 5' // 6 апреля, в апреле, в пятницу
    expect(ZCron.isMatch(schedule, day, day)).toBe(false) // не совпадает по дню месяца
  })

  it('должен корректно обрабатывать сокращенный формат без пробелов', ()=>{
    const day = ts('2024.03.01')
    const schedule = '1/3 * *' // каждый 3-й день, начиная с 1-го
    expect(ZCron.isMatch(schedule, day, day)).toBe(true)
  })
})
