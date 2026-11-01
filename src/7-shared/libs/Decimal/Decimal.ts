import DecimalJs from 'decimal.js'

/** Каноническая JSON-строка: без экспоненты, лишних нулей и отрицательного нуля. */
export type Decimal = string & { readonly __decimal: unique symbol }
export type DecimalRounding = 'half-up' | 'half-even' | 'down'

export const DECIMAL_LIMITS = Object.freeze({
	integerDigits: 30,
	inputScale: 18,
	intermediateScale: 36,
	inputLength: 160,
	maxPower: 100
})

export class DecimalError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'DecimalError'
	}
}

// Отдельный конструктор защищает домен от изменения глобальных настроек библиотеки.
// 140 значащих цифр достаточно для точного произведения двух ограниченных операндов.
const Engine = DecimalJs.clone({ precision: 140, rounding: DecimalJs.ROUND_HALF_UP })
const roundingModes = {
	'half-up': DecimalJs.ROUND_HALF_UP,
	'half-even': DecimalJs.ROUND_HALF_EVEN,
	down: DecimalJs.ROUND_DOWN
} as const

function checkScale(scale: number, maximum: number = DECIMAL_LIMITS.intermediateScale): void {
	if (!Number.isInteger(scale) || scale < 0 || scale > maximum)
		throw new DecimalError(`Точность должна быть целым числом от 0 до ${maximum}`)
}

function canonical(value: DecimalJs): Decimal {
	if (!value.isFinite() || value.abs().gte('1e30'))
		throw new DecimalError('Число превышает допустимые 30 целых разрядов')
	return (value.isZero() ? '0' : value.toFixed()) as Decimal
}

/** Числа JS намеренно не принимаются: точность могла потеряться до вызова. */
export function parseDecimal(input: unknown, scale: number = DECIMAL_LIMITS.intermediateScale): Decimal {
	checkScale(scale)
	if (typeof input !== 'string' || input.length > DECIMAL_LIMITS.inputLength)
		throw new DecimalError('Ожидается десятичное число в виде строки')
	const text = input.trim()
	if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw new DecimalError('Введите десятичное число без экспоненты')
	const value = new Engine(text)
	if (value.decimalPlaces() > scale) throw new DecimalError(`Допустимо не более ${scale} знаков после запятой`)
	return canonical(value)
}

export function parseQuantity(input: unknown, unitScale: number): Decimal {
	checkScale(unitScale, DECIMAL_LIMITS.inputScale)
	return parseDecimal(input, unitScale)
}

export function parsePrice(input: unknown): Decimal {
	const price = parseDecimal(input, DECIMAL_LIMITS.inputScale)
	if (new Engine(price).isNegative()) throw new DecimalError('Цена не может быть отрицательной')
	return price
}

/** Только для миграции старого JSON number; не используется новым денежным вводом. */
export function legacyNumberToDecimal(input: number): Decimal {
	if (!Number.isFinite(input)) throw new DecimalError('Старая сумма должна быть конечным числом')
	return parseDecimal(new Engine(String(input)).toFixed(), DECIMAL_LIMITS.inputScale)
}

function value(input: Decimal): DecimalJs {
	return new Engine(parseDecimal(input))
}

function result(input: DecimalJs): Decimal {
	return canonical(input.toDecimalPlaces(DECIMAL_LIMITS.intermediateScale))
}

/** Только этот интерфейс используется доменом; DecimalJs наружу не передаётся. */
export const decimal = {
	add: (left: Decimal, right: Decimal): Decimal => result(value(left).plus(value(right))),
	subtract: (left: Decimal, right: Decimal): Decimal => result(value(left).minus(value(right))),
	multiply: (left: Decimal, right: Decimal): Decimal => result(value(left).times(value(right))),
	divide(left: Decimal, right: Decimal): Decimal {
		const divisor = value(right)
		if (divisor.isZero()) throw new DecimalError('Деление на ноль недопустимо')
		return result(value(left).dividedBy(divisor))
	},
	negate: (input: Decimal): Decimal => canonical(value(input).negated()),
	abs: (input: Decimal): Decimal => canonical(value(input).abs()),
	compare: (left: Decimal, right: Decimal): -1 | 0 | 1 => value(left).comparedTo(value(right)) as -1 | 0 | 1,
	power(base: Decimal, exponent: Decimal): Decimal {
		const power = value(exponent)
		if (!power.isInteger() || power.abs().gt(DECIMAL_LIMITS.maxPower))
			throw new DecimalError('Поддерживаются только целые степени от −100 до 100')
		const operand = value(base)
		if (operand.isZero() && power.lte(0)) throw new DecimalError('Нулевая база требует положительной степени')
		return result(operand.pow(power))
	},
	round(input: Decimal, scale: number, rounding: DecimalRounding = 'half-up'): Decimal {
		checkScale(scale)
		return canonical(value(input).toDecimalPlaces(scale, roundingModes[rounding]))
	}
}

/** Округление оценки производится на границе денежного результата, не количества. */
export function roundMoney(input: Decimal, currencyScale: number): Decimal {
	checkScale(currencyScale, DECIMAL_LIMITS.inputScale)
	return decimal.round(input, currencyScale, 'half-up')
}
