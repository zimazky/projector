
/** Вычисление выражения с операторами "*" */
function mul(s: string): number {
  const [first, ...terms] = s.split('*')
  let p = +first
  terms.forEach(t => p *= +t)
  return p
}

/** Вычисление выражения с операторами "*", "/" */
function muldiv(s: string): number {
  const [first, ...terms] = s.split('/')
  let pmul = mul(first)
  let pdiv = 1.
  terms.forEach(s1=>{
    const [p1, ...t1] = s1.split('*')
    t1.forEach(t => pmul *= +t )
    pdiv *= +p1
  })
  return pmul/pdiv
}

/** Вычисление выражения с операторами "-", "*", "/" */
function minusmuldiv(s: string): number {
  const [first, ...terms] = s.split('-')
  let p = muldiv(first)
  terms.forEach(s => p -= muldiv(s))
  return p
}

/** Вычисление выражения с операторами "+", "-", "*", "/" */
export default function calculate(s: string): number {
  s = s.replace(/,/g,'.')
  const [first,...terms] = s.split('+')
  let p = minusmuldiv(first)
  terms.forEach(s2 => p += minusmuldiv(s2))
  return p
}
  
