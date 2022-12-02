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
  /** унарный минус */
  'n': 3,
  /** начало подвыражения */
  '(': 0,
  /** конец подвыражения */
  ')': 0
}

type operators = keyof typeof priority

type term = {
  operand?: number
  operator?: operators
}

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
  const i = s.search(/[-\+\*\/\(\)]/)
  if(i === -1) return <nextresult> {number: +s, rest: '', operation: 'e'}
  if(i === 0) return <nextresult> {operation: <operators> s.slice(0,1), rest: s.slice(1)}
  return <nextresult> {number: +s.slice(0,i), operation: <operators> s.slice(i,i+1), rest: s.slice(i+1)}
}

function getRPN(s: string): term[] {
  const rpn: term[] = []

  let next: nextresult = {operation: 'b', rest: s.replace(/,/g,'.').replace(/\s/g,'')}
  const opstack: operators[] = []
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
    if(!twinops) rpn.push({operand: next.number})
    else if(o_prev!==')') {
      // унарные операторы
      switch(o) {
      case '-':
        o = 'n'
        opstack.push(o)
      case '+':
        continue
      }
    }

    // начало подвыражения
    if(o === '(') {
      if(!twinops) return [] //throw Error('Отсутствует оператор перед открывающей скобкой')
      opstack.push(o)
      continue
    }

    // конец подвыражения
    o_top = opstack.pop()
    if(o === ')') {
      if(twinops && o_prev!==')') return [] //throw Error('Отсутствует операнд перед закрывающей скобкой')
      while(o_top !== '(') {
        if(o_top === 'b') return [] //throw Error('Непредвиденное закрытие скобки')
        rpn.push({operator: o_top})
        o_top = opstack.pop()
      }
      continue
    }

    // обработка операторов с высшим приоритетом
    while(o_top!=='b' && priority[o]<=priority[o_top]) {
      rpn.push({operator: o_top})
      o_top = opstack.pop()
    }
    opstack.push(o_top)
    opstack.push(o)
  }
  if(o_top!=='b') throw Error(`Некорректное выражение, остался необработанный оператор '${o_top}'`)
  return rpn
}

function execRPN(r: term[]): number {
  const numstack: number[] = []
  while(r.length > 0) {
    const t = r.shift()
    if(t.operand !== undefined) numstack.push(t.operand)
    else {
      if(t.operator === 'n') {
        numstack.push(-numstack.pop())
        continue
      }
      const nr = numstack.pop()
      const nl = numstack.pop()
      numstack.push(doOp(nl, nr, t.operator))
    }
  }
  return numstack.pop() ?? NaN
}

export default function calculate(s: string): number {
  const rpn = getRPN(s)
  let res = ''
  rpn.forEach(t => res += ' ' + (t.operand ?? t.operator))
  console.log(s)
  console.log(res)
  return execRPN(rpn)
}


/** Выполнение бинарной операции */
function doOp(nl: number, nr: number, op: string): number {
  if(nl===undefined || nr===undefined) return NaN //throw Error('Операнды не определены ' + op)
  switch(op) {
    case '+': return nl + nr
    case '-': return nl - nr
    case '*': return nl * nr
    case '/': return nl / nr
    default: return NaN //throw Error('Неизвестная опреация ' + op)
  }
}


/** Вычисление выражения, заданного строкой */

/*
export default function calculate(s: string): number {
  let next: nextresult = {operation: 'b', rest: s.replace(/,/g,'.').replace(/\s/g,'')}
  const numstack: number[] = []
  const opstack: operators[] = []
  opstack.push('b') // начало выражения
  let o = next.operation
  let o1 = o
  top:
  do {
    console.log('numbers',numstack.join(','))
    console.log('operations',opstack.join(','))
    console.log('next op', next)
    next = readnext(next.rest)
    console.log('next op', next)

    o = next.operation
    o1 = opstack[opstack.length-1]

    if(o === '(') {
      if(next.number !== undefined) return NaN //throw Error('Не определен оператор перед подвыражением')
      opstack.push(o)
      continue
    }
    if(o===')' && o1==='b') return NaN //throw Error('Непредвиденное закрытие скобки')


    if(next.number !== undefined) numstack.push(next.number)
    else { 
      // подряд два оператора
      // проверка на возможность унарной операции
      //if((o1==='(' || o1==='b') && (o==='*' || o==="/")) return NaN //throw Error(`Непредвиденный оператор '${o}'`)
      if(o1==='n' && !(o==='e' || o===')' || o==='+')) return NaN //throw Error('После унарного минуса должен быть операнд')
      switch(o) {
        case '-': 
          // унарный минус
          o = 'n'
          numstack.push(0)
          break
        case '+': continue
      }
    }

    while(o1!=='b' && priority[o]<=priority[o1]) {
      if(o1==='(') {
        if(o===')') {
          opstack.pop()
          continue top
        }
        opstack.push(o)
        continue top
      }
      const nr = numstack.pop()
      const nl = numstack.pop()
      const n = doOp(nl, nr, o1)
      console.log(`doOp: ${nl} ${o1} ${nr} = ${n}`)
      numstack.push(n)
      opstack.pop()
      o1 = opstack[opstack.length-1]
    }

    opstack.push(o)

  } while (o!=='e')

  if(o1!=='b') return NaN //throw Error(`Некорректное выражение, остался необработанный оператор '${o1}'`)
  return numstack.pop() ?? NaN
}
*/
