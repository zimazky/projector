import { Decimal, DecimalError, decimal, parseDecimal } from './Decimal'

const MAX_LENGTH = 4096
const MAX_TOKENS = 512
const MAX_DEPTH = 64

/** Десятичный ввод: + − * / ^, скобки и запятая. Степень правоассоциативна;
 * −2^2 = −4. Функции, экспоненциальная запись и дробные степени запрещены.
 */
export function calculateDecimal(expression: string): Decimal {
	if (expression.length > MAX_LENGTH) throw new DecimalError('Выражение слишком длинное')
	const source = expression.replace(/,/g, '.')
	const tokens: string[] = []
	const pattern = /\s*(\d+(?:\.\d*)?|\.\d+|[+\-*/^()])/y
	let offset = 0
	while (offset < source.length) {
		if (source.slice(offset).trim() === '') break
		pattern.lastIndex = offset
		const match = pattern.exec(source)
		if (!match) throw new DecimalError(`Недопустимый символ в позиции ${offset + 1}`)
		tokens.push(match[1])
		offset = pattern.lastIndex
		if (tokens.length > MAX_TOKENS) throw new DecimalError('В выражении слишком много операций')
	}
	let position = 0
	const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 }

	function read(minimum: number, depth: number): Decimal {
		if (depth > MAX_DEPTH) throw new DecimalError('Слишком глубокая вложенность выражения')
		const token = tokens[position++]
		let left: Decimal
		if (token === '+' || token === '-') {
			const operand = read(3, depth + 1)
			left = token === '-' ? decimal.negate(operand) : operand
		} else if (token === '(') {
			left = read(0, depth + 1)
			if (tokens[position++] !== ')') throw new DecimalError('Не закрыта скобка')
		} else {
			if (!token || !/^[\d.]/.test(token)) throw new DecimalError('Ожидается число или открывающая скобка')
			left = parseDecimal(token)
		}
		while (position < tokens.length) {
			const operator = tokens[position]
			const priority = precedence[operator]
			if (priority === undefined || priority < minimum) break
			position++
			const right = read(operator === '^' ? priority : priority + 1, depth + 1)
			switch (operator) {
				case '+':
					left = decimal.add(left, right)
					break
				case '-':
					left = decimal.subtract(left, right)
					break
				case '*':
					left = decimal.multiply(left, right)
					break
				case '/':
					left = decimal.divide(left, right)
					break
				case '^':
					left = decimal.power(left, right)
					break
			}
		}
		return left
	}
	const answer = read(0, 0)
	if (position !== tokens.length) throw new DecimalError('Ожидается оператор между числами или скобками')
	return answer
}
