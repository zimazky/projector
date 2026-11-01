import DecimalJs from 'decimal.js'
import { DecimalError, decimal, parseDecimal, parsePrice, parseQuantity, roundMoney } from './Decimal'

describe('Decimal', () => {
	it.each([
		['+00012.3400', '12.34'],
		['-0.000', '0'],
		['.5', '0.5'],
		[' 1. ', '1'],
		['0.000000000000000001', '0.000000000000000001'],
		['9007199254740993.01', '9007199254740993.01']
	])('normalizes %s and preserves JSON round trips', (input, expected) => {
		const value = parseDecimal(input)
		expect(value).toBe(expected)
		expect(parseDecimal(JSON.parse(JSON.stringify(value)))).toBe(value)
	})

	it.each(['', 'NaN', 'Infinity', '1e3', '0xff', '1,5', '1 2', '1_000', '1..2', '--1', '9'.repeat(161)])(
		'rejects invalid decimal %s',
		input => expect(() => parseDecimal(input)).toThrow(DecimalError)
	)

	it('rejects JS numbers and excessive precision or magnitude without silent rounding', () => {
		expect(() => parseDecimal(0.1)).toThrow(DecimalError)
		expect(() => parseDecimal('1' + '0'.repeat(30))).toThrow(DecimalError)
		expect(() => parseDecimal('0.' + '0'.repeat(36) + '1')).toThrow(DecimalError)
		expect(() => parseDecimal('1', -1)).toThrow(DecimalError)
		expect(() => parseDecimal('1', 1.5)).toThrow(DecimalError)
	})

	it('adds fractional money and subtracts quantities beyond Number precision exactly', () => {
		expect(decimal.add(parseDecimal('0.1'), parseDecimal('0.2'))).toBe('0.3')
		expect(decimal.subtract(parseDecimal('9007199254740993.01'), parseDecimal('9007199254740993'))).toBe('0.01')
		expect(decimal.multiply(parseDecimal('40.125'), parseDecimal('75.13'))).toBe('3014.59125')
	})

	it('checks the scale of fractional litres and whole securities', () => {
		expect(parseQuantity('40.125', 3)).toBe('40.125')
		expect(parseQuantity('2.000', 0)).toBe('2')
		expect(parseQuantity('-2', 0)).toBe('-2')
		expect(() => parseQuantity('2.1', 0)).toThrow(DecimalError)
		expect(() => parseQuantity('40.1251', 3)).toThrow(DecimalError)
		expect(() => parseQuantity('1', 19)).toThrow(DecimalError)
	})

	it('distinguishes an explicit zero price from an absent or invalid price', () => {
		expect(parsePrice('0')).toBe('0')
		expect(() => parsePrice(undefined)).toThrow(DecimalError)
		expect(() => parsePrice('-0.01')).toThrow(DecimalError)
		expect(() => parsePrice('0.' + '0'.repeat(18) + '1')).toThrow(DecimalError)
	})

	it('retains 36 fractional places for division and rounds money only at its boundary', () => {
		const third = decimal.divide(parseDecimal('1'), parseDecimal('3'))
		expect(third).toBe('0.' + '3'.repeat(36))
		expect(decimal.divide(parseDecimal('2'), parseDecimal('3'))).toBe('0.' + '6'.repeat(35) + '7')
		expect(roundMoney(decimal.multiply(third, parseDecimal('3')), 2)).toBe('1')
		const quantity = parseQuantity('1.005', 3)
		expect(roundMoney(quantity, 2)).toBe('1.01')
		expect(roundMoney(decimal.negate(quantity), 2)).toBe('-1.01')
		expect(quantity).toBe('1.005')
		expect(decimal.round(quantity, 2, 'half-even')).toBe('1')
		expect(decimal.round(parseDecimal('-1.999'), 2, 'down')).toBe('-1.99')
	})

	it('rejects division by zero, excessive results and unsupported powers', () => {
		expect(() => decimal.divide(parseDecimal('1'), parseDecimal('0'))).toThrow('Деление на ноль')
		expect(() => decimal.multiply(parseDecimal('1' + '0'.repeat(29)), parseDecimal('10'))).toThrow(DecimalError)
		expect(decimal.power(parseDecimal('2'), parseDecimal('-3'))).toBe('0.125')
		expect(() => decimal.power(parseDecimal('4'), parseDecimal('0.5'))).toThrow(DecimalError)
		expect(() => decimal.power(parseDecimal('2'), parseDecimal('101'))).toThrow(DecimalError)
		expect(() => decimal.power(parseDecimal('0'), parseDecimal('0'))).toThrow(DecimalError)
	})

	it('uses its own arithmetic configuration', () => {
		const previousPrecision = DecimalJs.precision
		try {
			DecimalJs.set({ precision: 2 })
			expect(decimal.add(parseDecimal('123.45'), parseDecimal('0.01'))).toBe('123.46')
		} finally {
			DecimalJs.set({ precision: previousPrecision })
		}
	})
})
