/**
 * Модуль для вычисления строкового алгебраического выражения
 * Возможны скобочные подвыражения и следующие операторы:
 * + сложение
 * - вычитание
 * - унарный минус
 * * умножение
 * / деление
 * ^ возведение в степень
 */


/** Приоритеты операторов */
const priority = {
  /** начало выражения */
  'b': 0,
  /** конец выражения */
  'e': 0,
  /** сложение */
  '+': 1,
  /** вычитание */
  '-': 1,
  /** умножение */
  '*': 2,
  /** деление */
  '/': 2,
  /** возведение в степень */
  '^': 3,
  /** унарный минус */
  'n': 4,
  /** начало подвыражения */
  '(': 0,
  /** конец подвыражения */
  ')': 0
}

type operators = keyof typeof priority

type nextresult = {
  /** операнд (может не быть при унарных операторах или скобках, когда два оператора встречаются подряд)*/
  number? : number
  /** операция (должна быть обязательно)*/
  operation : keyof typeof priority
  /** оставшаяся часть строки */
  rest: string
}

/** Чтение первого операнда и оператора из заданной строки */
function readnext(s: string): nextresult {
  if(s.length === 0) return <nextresult> {rest: '', operation: 'e'}
  const i = s.search(/[-\+\*\/\(\)\^]/)
  if(i === -1) return <nextresult> {number: +s, rest: '', operation: 'e'}
  if(i === 0) return <nextresult> {operation: <operators> s.slice(0,1), rest: s.slice(1)}
  return <nextresult> {number: +s.slice(0,i), operation: <operators> s.slice(i,i+1), rest: s.slice(i+1)}
}

/** Выполнение бинарной операции */
function doOp(right: number, left: number, operand: string): number {
  if(left===undefined || right===undefined) return NaN //throw Error('Операнды не определены ' + op)
  switch(operand) {
    case '+': return left + right
    case '-': return left - right
    case '*': return left * right
    case '/': return left / right
    case '^': return Math.pow(left,right)
    default: return NaN //throw Error('Неизвестная опреация ' + op)
  }
}

/** Вычисление алгебраического выражения, заданного строкой */
export default function calculate(s: string): number | undefined {

  let next: nextresult = {operation: 'b', rest: s.replace(/,/g,'.').replace(/\s/g,'')}
  const opstack: operators[] = []
  const numstack: number[] = []
  opstack.push('b') // начало выражения
  let o = next.operation
  let o_top = o

  while(o !== 'e') {
    next = readnext(next.rest)
    const o_prev = o
    o = next.operation
    // признак двух подряд операторов
    const twinops = next.number === undefined
    // операнд или унарный оператор
    if(next.number !== undefined) numstack.push(next.number)
    else if(o_prev!==')') switch(o) {
      // унарные операторы
      case '-': opstack.push(o = 'n')
      case '+': continue
    }
    // начало подвыражения
    if(o === '(') {
      if(!twinops) {
        console.log(s)
        console.log('Отсутствует оператор перед открывающей скобкой')
        return NaN //throw Error('Отсутствует оператор перед открывающей скобкой')
      }
      opstack.push(o)
      continue
    }
    // конец подвыражения и его вычисление
    o_top = opstack.pop() ?? 'b'
    if(o === ')') {
      if(twinops && o_prev!==')') {
        console.log(s)
        console.log('Отсутствует операнд перед закрывающей скобкой')
        return NaN //throw Error('Отсутствует операнд перед закрывающей скобкой')
      }
      while(o_top !== '(') {
        if(o_top === 'b') {
          console.log(s)
          console.log('Непредвиденное закрытие скобки')
          return NaN //throw Error('Непредвиденное закрытие скобки')
        }
        if(o_top === 'n') numstack.push(-(numstack.pop() ?? NaN))
        else numstack.push(doOp(numstack.pop() ?? NaN, numstack.pop() ?? NaN, o_top))
        o_top = opstack.pop() ?? 'b'
      }
      continue
    }
    // обработка предыдущих операторов с высшим или равным приоритетом
    while(o_top!=='b' && priority[o]<=priority[o_top]) {
      if(o_top === 'n') numstack.push(-(numstack.pop() ?? NaN))
      else numstack.push(doOp(numstack.pop() ?? NaN, numstack.pop() ?? NaN, o_top))
      o_top = opstack.pop() ?? 'b'
    }
    // сохранение в стек операторов с меньшим приоритетом
    opstack.push(o_top)
    opstack.push(o)
  }
  return numstack.pop()
}
