import ZCron from './zcron'

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