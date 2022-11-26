/** 
 * Приоритеты операторов.
 * Если приоритет последнего оператора в стеке меньше приоритета текущего, то текущий оператор помещается в стек.
 * Иначе можно выполнить операции в стеке до
 * */
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
  '(': 10,
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
  const i = s.search(/[-\+\*\/\(\)]/)
  if(i === -1) return <nextresult> {number: +s, rest: '', operation: 'e'}
  if(i === 0) return <nextresult> {operation: <operators> s.slice(0,1), rest: s.slice(1)}
  return <nextresult> {number: +s.slice(0,i), operation: <operators> s.slice(i,i+1), rest: s.slice(i+1)}
}

/** Выполнение бинарной операции */
function doOp(nl: number, nr: number, op: string): number {
  if(nl===undefined || nr===undefined) throw Error('Операнды не определены ' + op)
  switch(op) {
    case '+': return nl + nr
    case '-': return nl - nr
    case '*': return nl * nr
    case '/': return nl / nr
    case 'n': return -nr
    default: throw Error('Неизвестная опреация ' + op)
  }
}

/** Вычисление выражения, заданного строкой */
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
      if((o1==='(' || o1==='b') && (o==='*' || o==="/")) return NaN //throw Error(`Непредвиденный оператор '${o}'`)
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
  return numstack.pop()
}

