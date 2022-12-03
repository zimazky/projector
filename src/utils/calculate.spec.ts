import calculate from './calculate'

/**
 * Функция для замыкания аргументов внутри функции без аргументов
 * @param f функция для вызова
 * @param args аргументы, передаваемые в функцию f
 * @returns функция без аргументов
 */
 function callf(f: (...args: any[])=>void, ...args:any[]) {
  return ()=>{ f(...args) }
}

function ev(s: string): number {
  try {
    if(s.includes('**')) return NaN
    let t = s.replace(/,/g,'.')
    t = t.replace(/\-(?<num>\-\d*\.*\d+)/g,'-($<num>)') // двойной минус
    t = t.replace(/(?<pow>\d*\.*\d+\-\d*\.*\d+)\^/g,'$<pow>**') // степень после бинарного минуса
    t = t.replace(/(?<pow>\-+\d*\.*\d+)\^/g,'($<pow>)**') // степень после унарного минуса
    t = t.replace(/\^/g,'**') // остальные степени
    t = t.replace(/--/g,'+')
    t = t.replace(/\*\*\++/g,'**')
    t = t.replace(/^\++/,'')
    t = t.replace(/^-\(-/,'(')
    t = t.replace(/\++/,'+')

    console.log(s,t)
    return eval(t)
  }
  catch(e) {
    return NaN
  }
}
/******************************************************************************
 * ZCrone addSequence
 ******************************************************************************/
describe('ZCrone addSequence', ()=>{
  const testset = [
    '1000+2*777-25/5*12',
    '255*2-14/7*23/2+123',
    '255+2-14-7*23-2+123',
    '4567,35*34.36+326/233,37-234.12*56.15',
    '4567,35*34.36/12*134/123/65*23*4+326/233,37-234.12*56.15-123.4-32-54+12+654+123',
    '4567,35 * 34.36/ 12*134/123/65* 23*4+326 / 233,37-234.12 *56.15-123.4-32 -54+12+654+123',
    '2+2+-2-+2+-2+2',
    '-200',
    '+200',
    '25+3+(42-15)/(3+1)',
    '(25+1+(56+2*(10-5))/(3+2))',
    '-(-(1))',
    '500*(/67)',
    '(678))',
    '--1',
    '-+23',
    '-*45',
    '-/56',
    '/-456',
    '456/-2',
    '2*(-2)/-5,6',
    '+-+-2',
    '',
    '()',
    '-(34+56/45*4*3/4-(34)+((((23-12)/3)*23)+(54-4*34/2)))',
    '(1)+(1)',
    '23(45+56)',
    '-----',
    '-',
    '3**4',
    's*3',
    '2^4',
    '2^-4',
    '-2^4',
    '50-2^4',
    '50*-2^4',
    '567+(',
    '---1',
    '----1',
    '2^*3',
    '-2^3',
    '(-2)^3',
    '30--2^4',
    '50---2',
    '2^---3',
    '----2^--+-3',
    '-----2^---3',
    '----------2^-------3',
    '++(--+(+(3-2)))^(-4+3)',
    '2*-4'


  ]  
  for(let i=0;i<testset.length;i++) {
    it(`test string='${testset[i]}', `, callf( (s)=>{
      const r = calculate(s)
      expect(r).toEqual(ev(s))
    }, testset[i])
    )
  }

})