import { DecimalError, parseQuantity } from './Decimal'
import { calculateDecimal } from './DecimalExpression'

describe('calculateDecimal', () => {
	it.each([
		['0.1 + 0.2', '0.3'],
		['(10,5 - 0,5) * 3 / 4', '7.5'],
		['9007199254740993.01 - 9007199254740993', '0.01'],
		['1 / 8', '0.125'],
		['-2^2', '-4'],
		['(-2)^2', '4'],
		['2^3^2', '512'],
		['2^-3', '0.125'],
		['8 / 4 / 2', '1'],
		['10 - 3 - 2', '5'],
		['2 * -3 + +4', '-2'],
		['.1 + .2', '0.3']
	])('evaluates %s as %s', (input, expected) => {
		expect(calculateDecimal(input)).toBe(expected)
	})

	it.each([
		'',
		' ',
		'1/0',
		'4^0.5',
		'2^101',
		'0^-1',
		'0^0',
		'1e3',
		'sqrt(4)',
		'1 2',
		'2(3)',
		'(2)3',
		'()',
		'(1+2',
		'1+2)',
		'1+',
		'*1',
		'1..2',
		'1;alert(1)'
	])('rejects %s with a domain error', input => expect(() => calculateDecimal(input)).toThrow(DecimalError))

	it('checks excessive expression length, token count and recursion before evaluation exhausts resources', () => {
		expect(() => calculateDecimal('1'.repeat(4097))).toThrow(DecimalError)
		expect(() => calculateDecimal('1+'.repeat(256) + '1')).toThrow(DecimalError)
		expect(() => calculateDecimal('('.repeat(65) + '1' + ')'.repeat(65))).toThrow(DecimalError)
	})

	it('keeps calculation precision until the unit input boundary', () => {
		expect(parseQuantity(calculateDecimal('0.1 * 3'), 2)).toBe('0.3')
		expect(() => parseQuantity(calculateDecimal('1 / 3'), 2)).toThrow(DecimalError)
	})
})
