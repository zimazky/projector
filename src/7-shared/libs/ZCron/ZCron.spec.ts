// =============================================================================
// Интеграционные тесты для фасада ZCron
// =============================================================================
// Тесты проверяют публичный API класса ZCron
// Юнитные тесты для отдельных компонентов находятся в:
// - RelativeSchedule.spec.ts (относительный режим /d)
// - AbsoluteSchedule.spec.ts (абсолютный режим cron)
// =============================================================================

import ZCron from './ZCron'
import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

function ts(date: string): timestamp {
	return DateTime.YYYYMMDDToTimestamp(date)
}

function formatTs(t: timestamp | null): string {
	if (t === null) return 'null'
	return DateTime.getYYYYMMDD(t)
}

// =============================================================================
// Вспомогательные функции для параметризованных тестов
// =============================================================================
function callf(f: (...args: any[]) => void, ...args: any[]) {
	return () => {
		f(...args)
	}
}

function seq(a: number, b: number): number[] {
	const r = []
	for (let i = a; i <= b; i++) r.push(i)
	return r
}

function seqD(a: number, b: number, max: number = 31): number[] {
	const r = []
	for (let i = a; i <= max; i += b) r.push(i)
	return r
}

// =============================================================================
// Тесты для addSequence (legacy-метод для обратной совместимости)
// =============================================================================
describe('ZCron addSequence (legacy)', () => {
	const testset = [
		['1-10', seq(1, 10)],
		['-5-5', []],
		['3-7', seq(3, 7)],
		['a-5', []],
		['5-b', []],
		['1-5-10', seq(1, 5)],
		['1-5-', seq(1, 5)],
		['5,10', []],
		['9', [9]],
		['-10', []],
		['2b', []],
		['*', seq(1, 31)],
		['3/2', seqD(3, 2)],
		['3/-2', []],
		['-3/2', []],
		['3-/2', []]
	]
	for (let i = 0; i < testset.length; i++) {
		it(
			`test string='${testset[i][0]}', `,
			callf(
				(s, ex) => {
					const r = ZCron.addSequence([], s)
					expect(r).toEqual(ex)
				},
				testset[i][0],
				testset[i][1]
			)
		)
	}
})

// =============================================================================
// Тесты для публичного метода validate
// =============================================================================
describe('ZCron validate (facade)', () => {
	it('должна считать пустую строку валидной (неповторяемое событие)', () => {
		expect(ZCron.validate('')).toBe(true)
		expect(ZCron.validate('   ')).toBe(true)
	})

	it('должна обрабатывать несколько пробелов между полями', () => {
		expect(ZCron.validate('25  2,3 *')).toBe(true)
	})

	it('должна отклонять дни вне диапазона 1-31', () => {
		expect(ZCron.validate('0 * *')).toBe(false)
		expect(ZCron.validate('32 * *')).toBe(false)
	})

	it('должна отклонять месяцы вне диапазона 1-12', () => {
		expect(ZCron.validate('* 0 *')).toBe(false)
		expect(ZCron.validate('* 13 *')).toBe(false)
	})

	it('должна отклонять дни недели вне диапазона 0-6', () => {
		expect(ZCron.validate('* * 7')).toBe(false)
	})

	it('должна отклонять относительные интервалы с нулевым шагом', () => {
		expect(ZCron.validate('/0')).toBe(false)
	})

	it('должна принимать корректные шаблоны', () => {
		expect(ZCron.validate('* * *')).toBe(true)
		expect(ZCron.validate('*/4 * *')).toBe(true)
		expect(ZCron.validate('/4')).toBe(true)
		expect(ZCron.validate('25 2,3 *')).toBe(true)
	})

	it('должна отклонять слишком много полей', () => {
		expect(ZCron.validate('* * * *')).toBe(false)
		expect(ZCron.validate('* * * extra')).toBe(false)
	})

	it('должна отклонять неправильные символы в шаблонах', () => {
		expect(ZCron.validate('a * *')).toBe(false)
		expect(ZCron.validate('* b *')).toBe(false)
		expect(ZCron.validate('* * c')).toBe(false)
		expect(ZCron.validate('1.5 * *')).toBe(false)
	})

	it('должна отклонять неправильные форматы шагов', () => {
		expect(ZCron.validate('1/ * *')).toBe(false)
		expect(ZCron.validate('/ * *')).toBe(false)
		expect(ZCron.validate('a/2 * *')).toBe(false)
	})

	it('должна отклонять неправильные форматы диапазонов', () => {
		expect(ZCron.validate('1- * *')).toBe(false)
		expect(ZCron.validate('-5 * *')).toBe(false)
		expect(ZCron.validate('a-b * *')).toBe(false)
	})

	it('должна отклонять неправильные форматы списков', () => {
		expect(ZCron.validate('1, * *')).toBe(false)
		expect(ZCron.validate(',5 * *')).toBe(false)
		expect(ZCron.validate('1,,5 * *')).toBe(false)
		expect(ZCron.validate('a,5 * *')).toBe(false)
	})

	it('должна корректно обрабатывать граничные значения', () => {
		expect(ZCron.validate('1 * *')).toBe(true)
		expect(ZCron.validate('31 * *')).toBe(true)
		expect(ZCron.validate('* 1 *')).toBe(true)
		expect(ZCron.validate('* 12 *')).toBe(true)
		expect(ZCron.validate('* * 0')).toBe(true)
		expect(ZCron.validate('* * 6')).toBe(true)
	})

	it('должна отклонять неправильные относительные интервалы', () => {
		expect(ZCron.validate('/')).toBe(false)
		expect(ZCron.validate('/-1')).toBe(false)
		expect(ZCron.validate('/0')).toBe(false)
		expect(ZCron.validate('/a')).toBe(false)
	})

	it('должна корректно обрабатывать сокращенные форматы', () => {
		expect(ZCron.validate('1')).toBe(true)
		expect(ZCron.validate('1 3')).toBe(true)
		expect(ZCron.validate('1 3 5')).toBe(true)
	})
})

// =============================================================================
// Тесты для публичного метода isMatch
// =============================================================================
describe('ZCron isMatch (facade)', () => {
	it('не должен считать пустой шаблон совпадающим ни с каким днём', () => {
		const start = ts('2024.01.01')
		const day = ts('2024.01.10')
		expect(ZCron.isMatch('', start, day)).toBe(false)
		expect(ZCron.isMatch('   ', start, day)).toBe(false)
	})

	it('должен совпадать при шаблоне * * * для любого дня', () => {
		const day = ts('2024.02.15')
		expect(ZCron.isMatch('* * *', day, day)).toBe(true)
	})

	it('должен учитывать день месяца', () => {
		const d1 = ts('2024.03.01')
		const d2 = ts('2024.03.02')
		const schedule = '1 * *'
		expect(ZCron.isMatch(schedule, d1, d1)).toBe(true)
		expect(ZCron.isMatch(schedule, d1, d2)).toBe(false)
	})

	it('должен учитывать месяц', () => {
		const feb = ts('2024.02.10')
		const mar = ts('2024.03.10')
		const schedule = '* 2 *'
		expect(ZCron.isMatch(schedule, feb, feb)).toBe(true)
		expect(ZCron.isMatch(schedule, feb, mar)).toBe(false)
	})

	it('должен учитывать день недели', () => {
		const day = ts('2024.04.05')
		const { weekday } = DateTime.getDayMonthWeekday(day)
		const schedule = `* * ${weekday}`
		expect(ZCron.isMatch(schedule, day, day)).toBe(true)
	})

	it('режим /d: совпадение каждые d дней начиная со startTimestamp', () => {
		const start = ts('2024.01.01')
		const d0 = start
		const d2 = start + 2 * 86400
		const d4 = start + 4 * 86400
		const schedule = '/4'

		expect(ZCron.isMatch(schedule, start, d0)).toBe(true)
		expect(ZCron.isMatch(schedule, start, d4)).toBe(true)
		expect(ZCron.isMatch(schedule, start, d2)).toBe(false)
	})

	it('режим /d: не совпадает для дат до начала периода', () => {
		const start = ts('2024.01.10')
		const before = ts('2024.01.05')
		const schedule = '/3'
		expect(ZCron.isMatch(schedule, start, before)).toBe(false)
	})

	it('должен работать с частично опущенными полями', () => {
		const day = ts('2024.03.01')
		expect(ZCron.isMatch('1', day, day)).toBe(true)
		expect(ZCron.isMatch('1 3', day, day)).toBe(true)
	})

	it('должен обрабатывать сложные комбинации', () => {
		const day = ts('2024.04.05')
		expect(ZCron.isMatch('5 4 5', day, day)).toBe(true)
		expect(ZCron.isMatch('1-10 4-6 *', day, day)).toBe(true)
		expect(ZCron.isMatch('6 4 5', day, day)).toBe(false)
	})
})

// =============================================================================
// Тесты для публичного метода parse
// =============================================================================
describe('ZCron parse (facade)', () => {
	it('should return empty schedule for empty string', () => {
		const result = ZCron.parse('')
		expect(result.mode).toBe('empty')
	})

	it('should return relative schedule for /d format', () => {
		const result = ZCron.parse('/4')
		expect(result.mode).toBe('relative')
		if (result.mode === 'relative') {
			expect(result.intervalDays).toBe(4)
		}
	})

	it('should return absolute schedule for cron format', () => {
		const result = ZCron.parse('* * *')
		expect(result.mode).toBe('absolute')
		if (result.mode === 'absolute') {
			expect(result.days.length).toBe(31)
			expect(result.months.length).toBe(12)
			expect(result.weekdays.length).toBe(7)
		}
	})

	it('should parse specific days', () => {
		const result = ZCron.parse('1,5,10 * *')
		expect(result.mode).toBe('absolute')
		if (result.mode === 'absolute') {
			expect(result.days).toEqual([1, 5, 10])
		}
	})

	it('should normalize and sort values', () => {
		const result = ZCron.parse('10,1,5,1,5 * *')
		expect(result.mode).toBe('absolute')
		if (result.mode === 'absolute') {
			expect(result.days).toEqual([1, 5, 10])
		}
	})
})

// =============================================================================
// Тесты для публичного метода match
// =============================================================================
describe('ZCron match (facade)', () => {
	it('should return false for empty schedule', () => {
		const schedule = ZCron.parse('')
		expect(ZCron.match(schedule, 0, ts('2024.01.01'))).toBe(false)
	})

	it('should match relative schedule correctly', () => {
		const schedule = ZCron.parse('/4')
		const start = ts('2024.01.01')

		expect(ZCron.match(schedule, start, start)).toBe(true)
		expect(ZCron.match(schedule, start, ts('2024.01.04'))).toBe(false)
		expect(ZCron.match(schedule, start, ts('2024.01.05'))).toBe(true)
	})

	it('should match absolute schedule correctly', () => {
		const schedule = ZCron.parse('15 3 *')
		const day = ts('2024.03.15')

		expect(ZCron.match(schedule, day, day)).toBe(true)
		expect(ZCron.match(schedule, day, ts('2024.03.16'))).toBe(false)
	})

	it('should match all days with * * *', () => {
		const schedule = ZCron.parse('* * *')

		expect(ZCron.match(schedule, 0, ts('2024.01.01'))).toBe(true)
		expect(ZCron.match(schedule, 0, ts('2024.06.15'))).toBe(true)
		expect(ZCron.match(schedule, 0, ts('2024.12.31'))).toBe(true)
	})
})

// =============================================================================
// Тесты для кэширования
// =============================================================================
describe('ZCron parseWithCache', () => {
	it('should return same object for same input', () => {
		const result1 = ZCron.parseWithCache('* * *')
		const result2 = ZCron.parseWithCache('* * *')

		expect(result1).toBe(result2)
	})

	it('should return different objects for different inputs', () => {
		const result1 = ZCron.parseWithCache('* * *')
		const result2 = ZCron.parseWithCache('/4')

		expect(result1).not.toBe(result2)
	})

	it('should clear cache with clearCache()', () => {
		const result1 = ZCron.parseWithCache('* * *')
		ZCron.clearCache()
		const result2 = ZCron.parseWithCache('* * *')

		expect(result1).not.toBe(result2)
	})
})

// =============================================================================
// Тесты для validateDetailed
// =============================================================================
describe('ZCron validateDetailed (facade)', () => {
	it('should return ok:true for valid schedule', () => {
		const result = ZCron.validateDetailed('* * *')
		expect(result.ok).toBe(true)
		expect(result.error).toBeUndefined()
	})

	it('should return ok:true for empty string', () => {
		const result = ZCron.validateDetailed('')
		expect(result.ok).toBe(true)
	})

	it('should return ok:false for too many fields', () => {
		const result = ZCron.validateDetailed('* * * *')
		expect(result.ok).toBe(false)
		expect(result.error?.field).toBe('general')
	})

	it('should return error for day out of range', () => {
		const result = ZCron.validateDetailed('0 * *')
		expect(result.ok).toBe(false)
		expect(result.error?.field).toBe('days')
		expect(result.error?.token).toBe('0')
	})

	it('should return error for month out of range', () => {
		const result = ZCron.validateDetailed('* 13 *')
		expect(result.ok).toBe(false)
		expect(result.error?.field).toBe('months')
	})

	it('should return error for weekday out of range', () => {
		const result = ZCron.validateDetailed('* * 7')
		expect(result.ok).toBe(false)
		expect(result.error?.field).toBe('weekdays')
	})

	it('should return error for invalid relative schedule', () => {
		const result = ZCron.validateDetailed('/0')
		expect(result.ok).toBe(false)
		expect(result.error?.field).toBe('general')
	})

	it('should include descriptive error message', () => {
		const result = ZCron.validateDetailed('32 * *')
		expect(result.ok).toBe(false)
		expect(result.error?.message).toContain('32')
	})
})

// =============================================================================
// Интеграционные тесты для nextAfter
// =============================================================================
describe('ZCron nextAfter (integration)', () => {
	describe('empty schedule', () => {
		it('should return null for empty schedule', () => {
			const schedule = ZCron.parse('')
			const result = ZCron.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.01'))
			expect(result).toBeNull()
		})
	})

	describe('relative schedule /d', () => {
		it('should calculate next occurrence correctly', () => {
			const schedule = ZCron.parse('/4')
			const start = ts('2024.01.01')

			expect(formatTs(ZCron.nextAfter(schedule, start, ts('2024.01.01')))).toBe('2024.01.05')
			expect(formatTs(ZCron.nextAfter(schedule, start, ts('2024.01.05')))).toBe('2024.01.09')
		})

		it('should return start day when after is before start', () => {
			const schedule = ZCron.parse('/4')
			const start = ts('2024.01.10')

			const result = ZCron.nextAfter(schedule, start, ts('2024.01.05'))
			expect(formatTs(result)).toBe('2024.01.10')
		})
	})

	describe('absolute schedule', () => {
		it('should return next day for * * *', () => {
			const schedule = ZCron.parse('* * *')

			const result = ZCron.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.15'))
			expect(formatTs(result)).toBe('2024.01.16')
		})

		it('should find next weekday', () => {
			const schedule = ZCron.parse('* * 1-5') // Mon-Fri

			// 2024.01.06 = Saturday
			const result = ZCron.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.06'))
			expect(formatTs(result)).toBe('2024.01.08') // Monday
		})

		it('should find next day of month', () => {
			const schedule = ZCron.parse('15 * *')

			const result = ZCron.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.10'))
			expect(formatTs(result)).toBe('2024.01.15')
		})

		it('should find combined conditions', () => {
			const schedule = ZCron.parse('15 3 *')

			const result = ZCron.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.01'))
			expect(formatTs(result)).toBe('2024.03.15')
		})
	})

	describe('nextAfterString wrapper', () => {
		it('should work with string schedule', () => {
			const result = ZCron.nextAfterString('/4', ts('2024.01.01'), ts('2024.01.01'))
			expect(formatTs(result)).toBe('2024.01.05')
		})

		it('should return null for empty schedule', () => {
			const result = ZCron.nextAfterString('', ts('2024.01.01'), ts('2024.01.01'))
			expect(result).toBeNull()
		})
	})
})

// =============================================================================
// Интеграционные тесты для ariseInInterval и firstInInterval
// =============================================================================
describe('ZCron ariseInInterval and firstInInterval (integration)', () => {
	describe('ariseInInterval', () => {
		it('should return true when match exists in interval', () => {
			const schedule = '/4'
			const start = ts('2024.01.01')

			expect(ZCron.ariseInInterval(schedule, start, ts('2024.01.03'), ts('2024.01.07'))).toBe(true)
		})

		it('should return false when no match in interval', () => {
			const schedule = '/4'
			const start = ts('2024.01.01')

			expect(ZCron.ariseInInterval(schedule, start, ts('2024.01.02'), ts('2024.01.04'))).toBe(false)
		})

		it('should return false for empty schedule', () => {
			expect(ZCron.ariseInInterval('', ts('2024.01.01'), ts('2024.01.01'), ts('2024.01.10'))).toBe(false)
		})

		it('should work with absolute schedule', () => {
			const schedule = '* * 1-5' // Mon-Fri
			const start = ts('2024.01.01')

			// Sat-Sun
			expect(ZCron.ariseInInterval(schedule, start, ts('2024.01.06'), ts('2024.01.08'))).toBe(false)
			// Mon-Fri
			expect(ZCron.ariseInInterval(schedule, start, ts('2024.01.08'), ts('2024.01.13'))).toBe(true)
		})
	})

	describe('firstInInterval', () => {
		it('should return first match in interval', () => {
			const schedule = '/4'
			const start = ts('2024.01.01')

			const result = ZCron.firstInInterval(schedule, start, ts('2024.01.03'), ts('2024.01.10'))
			expect(DateTime.getYYYYMMDD(result)).toBe('2024.01.05')
		})

		it('should return 0 when no match in interval', () => {
			const schedule = '/4'
			const start = ts('2024.01.01')

			const result = ZCron.firstInInterval(schedule, start, ts('2024.01.02'), ts('2024.01.04'))
			expect(result).toBe(0)
		})

		it('should return 0 for empty schedule', () => {
			const result = ZCron.firstInInterval('', ts('2024.01.01'), ts('2024.01.01'), ts('2024.01.10'))
			expect(result).toBe(0)
		})
	})

	describe('first', () => {
		it('should find first occurrence from start', () => {
			const schedule = '/4'
			const start = ts('2024.01.01')

			const result = ZCron.first(schedule, start)
			expect(DateTime.getYYYYMMDD(result)).toBe('2024.01.01')
		})

		it('should respect maxinterval parameter', () => {
			const schedule = '15 3 *' // March 15
			const start = ts('2024.01.01')

			const result = ZCron.first(schedule, start, 30)
			expect(result).toBe(0) // not found within 30 days

			const result2 = ZCron.first(schedule, start, 80)
			expect(DateTime.getYYYYMMDD(result2)).toBe('2024.03.15')
		})

		it('should return 0 for empty schedule', () => {
			const result = ZCron.first('', ts('2024.01.01'))
			expect(result).toBe(0)
		})
	})

	describe('Parsed versions (for cached schedules)', () => {
		it('ariseInIntervalParsed should work with cached schedule', () => {
			const schedule = ZCron.parse('/4')
			const start = ts('2024.01.01')

			expect(ZCron.ariseInIntervalParsed(schedule, start, ts('2024.01.03'), ts('2024.01.07'))).toBe(true)
			expect(ZCron.ariseInIntervalParsed(schedule, start, ts('2024.01.02'), ts('2024.01.04'))).toBe(false)
		})

		it('firstInIntervalParsed should work with cached schedule', () => {
			const schedule = ZCron.parse('/4')
			const start = ts('2024.01.01')

			const result = ZCron.firstInIntervalParsed(schedule, start, ts('2024.01.03'), ts('2024.01.10'))
			expect(DateTime.getYYYYMMDD(result)).toBe('2024.01.05')
		})

		it('firstParsed should work with cached schedule', () => {
			const schedule = ZCron.parse('/4')
			const start = ts('2024.01.01')

			const result = ZCron.firstParsed(schedule, start)
			expect(DateTime.getYYYYMMDD(result)).toBe('2024.01.01')
		})
	})
})

// =============================================================================
// Интеграционные тесты для prevBefore
// =============================================================================
describe('ZCron prevBefore (integration)', () => {
	describe('empty schedule', () => {
		it('should return null for empty schedule', () => {
			const schedule = ZCron.parse('')
			const result = ZCron.prevBefore(schedule, ts('2024.01.01'), ts('2024.01.10'))
			expect(result).toBeNull()
		})
	})

	describe('relative schedule /d', () => {
		it('should calculate previous occurrence correctly', () => {
			const schedule = ZCron.parse('/4')
			const start = ts('2024.01.01')

			// 2024.01.09 is an occurrence (day 8 from start), prev before it is 2024.01.05
			expect(formatTs(ZCron.prevBefore(schedule, start, ts('2024.01.09')))).toBe('2024.01.05')
			expect(formatTs(ZCron.prevBefore(schedule, start, ts('2024.01.05')))).toBe('2024.01.01')
			expect(formatTs(ZCron.prevBefore(schedule, start, ts('2024.01.04')))).toBe('2024.01.01')
		})

		it('should return null when before is at or before start', () => {
			const schedule = ZCron.parse('/4')
			const start = ts('2024.01.10')

			expect(ZCron.prevBefore(schedule, start, ts('2024.01.10'))).toBeNull()
			expect(ZCron.prevBefore(schedule, start, ts('2024.01.05'))).toBeNull()
		})

		it('should handle intervals correctly', () => {
			const schedule = ZCron.parse('/7')
			const start = ts('2024.01.01')

			// Occurrences: 01, 08, 15, 22, 29
			expect(formatTs(ZCron.prevBefore(schedule, start, ts('2024.01.30')))).toBe('2024.01.29')
			expect(formatTs(ZCron.prevBefore(schedule, start, ts('2024.01.29')))).toBe('2024.01.22')
			expect(formatTs(ZCron.prevBefore(schedule, start, ts('2024.01.23')))).toBe('2024.01.22')
		})
	})

	describe('absolute schedule', () => {
		it('should return previous day for * * *', () => {
			const schedule = ZCron.parse('* * *')

			const result = ZCron.prevBefore(schedule, ts('2024.01.01'), ts('2024.01.15'))
			expect(formatTs(result)).toBe('2024.01.14')
		})

		it('should find previous weekday', () => {
			const schedule = ZCron.parse('* * 1-5') // Mon-Fri

			// 2024.01.08 = Monday, prev before should be Friday 2024.01.05
			const result = ZCron.prevBefore(schedule, ts('2024.01.01'), ts('2024.01.08'))
			expect(formatTs(result)).toBe('2024.01.05')
		})

		it('should find previous day of month', () => {
			const schedule = ZCron.parse('15 * *')

			const result = ZCron.prevBefore(schedule, ts('2024.01.01'), ts('2024.02.20'))
			expect(formatTs(result)).toBe('2024.02.15')
		})

		it('should find combined conditions going back', () => {
			const schedule = ZCron.parse('15 3 *')

			// Find prev before April 1st -> should be March 15
			const result = ZCron.prevBefore(schedule, ts('2024.01.01'), ts('2024.04.01'))
			expect(formatTs(result)).toBe('2024.03.15')
		})

		it('should return start when before is one day after start and start matches', () => {
			const schedule = ZCron.parse('15 3 *')

			// Start is March 15, before March 16 -> prev is March 15 (the start)
			const result = ZCron.prevBefore(schedule, ts('2024.03.15'), ts('2024.03.16'))
			expect(formatTs(result)).toBe('2024.03.15')
		})

		it('should return null when before is at start', () => {
			const schedule = ZCron.parse('15 3 *')

			// Before is exactly at start -> no prev (can't be strictly before start)
			const result = ZCron.prevBefore(schedule, ts('2024.03.15'), ts('2024.03.15'))
			expect(result).toBeNull()
		})

		it('should handle year boundaries', () => {
			const schedule = ZCron.parse('15 3 *') // March 15

			// Find prev before March 15 2025 -> should be March 15 2024
			const result = ZCron.prevBefore(schedule, ts('2024.03.15'), ts('2025.03.15'))
			expect(formatTs(result)).toBe('2024.03.15')
		})
	})

	describe('prevBeforeString wrapper', () => {
		it('should work with string schedule', () => {
			const result = ZCron.prevBeforeString('/4', ts('2024.01.01'), ts('2024.01.09'))
			expect(formatTs(result)).toBe('2024.01.05')
		})

		it('should return null for empty schedule', () => {
			const result = ZCron.prevBeforeString('', ts('2024.01.01'), ts('2024.01.10'))
			expect(result).toBeNull()
		})
	})

	describe('symmetry with nextAfter', () => {
		it('nextAfter then prevBefore should return original', () => {
			const schedule = ZCron.parse('/4')
			const start = ts('2024.01.01')
			const original = ts('2024.01.09')

			const next = ZCron.nextAfter(schedule, start, original)
			expect(formatTs(next)).toBe('2024.01.13')

			const prev = ZCron.prevBefore(schedule, start, next as timestamp)
			expect(formatTs(prev)).toBe('2024.01.09')
		})

		it('prevBefore then nextAfter should return original for absolute', () => {
			const schedule = ZCron.parse('* * 1-5') // Mon-Fri
			const start = ts('2024.01.01')
			const original = ts('2024.01.15') // Monday

			const prev = ZCron.prevBefore(schedule, start, original)
			expect(formatTs(prev)).toBe('2024.01.12') // Friday

			const next = ZCron.nextAfter(schedule, start, prev as timestamp)
			expect(formatTs(next)).toBe('2024.01.15')
		})
	})
})
