// =============================================================================
// Тесты для RelativeScheduleHandler (относительный режим /d)
// =============================================================================

import { RelativeScheduleHandler } from './RelativeSchedule'
import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

function ts(date: string): timestamp {
	return DateTime.YYYYMMDDToTimestamp(date)
}

function formatTs(t: timestamp | null): string {
	if (t === null) return 'null'
	return DateTime.getYYYYMMDD(t)
}

// =============================================================================
// Тесты для метода parse
// =============================================================================
describe('RelativeScheduleHandler parse', () => {
	it('should parse valid interval', () => {
		const result = RelativeScheduleHandler.parse('4')
		expect(result.mode).toBe('relative')
		expect(result.intervalDays).toBe(4)
	})

	it('should parse interval of 1', () => {
		const result = RelativeScheduleHandler.parse('1')
		expect(result.mode).toBe('relative')
		expect(result.intervalDays).toBe(1)
	})

	it('should parse large interval', () => {
		const result = RelativeScheduleHandler.parse('365')
		expect(result.mode).toBe('relative')
		expect(result.intervalDays).toBe(365)
	})
})

// =============================================================================
// Тесты для метода validate
// =============================================================================
describe('RelativeScheduleHandler validate', () => {
	it('should accept valid intervals', () => {
		expect(RelativeScheduleHandler.validate('1').ok).toBe(true)
		expect(RelativeScheduleHandler.validate('4').ok).toBe(true)
		expect(RelativeScheduleHandler.validate('7').ok).toBe(true)
		expect(RelativeScheduleHandler.validate('30').ok).toBe(true)
	})

	it('should reject empty string', () => {
		const result = RelativeScheduleHandler.validate('')
		expect(result.ok).toBe(false)
		expect(result.error?.message).toContain('not specified')
	})

	it('should reject zero interval', () => {
		const result = RelativeScheduleHandler.validate('0')
		expect(result.ok).toBe(false)
		expect(result.error?.message).toContain('at least 1')
	})

	it('should reject non-numeric interval', () => {
		const result = RelativeScheduleHandler.validate('abc')
		expect(result.ok).toBe(false)
		expect(result.error?.message).toContain('positive integer')
	})

	it('should reject negative interval', () => {
		const result = RelativeScheduleHandler.validate('-5')
		expect(result.ok).toBe(false)
	})

	it('should reject decimal interval', () => {
		const result = RelativeScheduleHandler.validate('1.5')
		expect(result.ok).toBe(false)
	})
})

// =============================================================================
// Тесты для метода match
// =============================================================================
describe('RelativeScheduleHandler match', () => {
	it('should match on start day', () => {
		const schedule = RelativeScheduleHandler.parse('4')
		const start = ts('2024.01.01')

		expect(RelativeScheduleHandler.match(schedule, start, start)).toBe(true)
	})

	it('should match on interval multiples', () => {
		const schedule = RelativeScheduleHandler.parse('4')
		const start = ts('2024.01.01')

		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.01.05'))).toBe(true) // 4 days
		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.01.09'))).toBe(true) // 8 days
		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.01.13'))).toBe(true) // 12 days
	})

	it('should not match between intervals', () => {
		const schedule = RelativeScheduleHandler.parse('4')
		const start = ts('2024.01.01')

		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.01.02'))).toBe(false)
		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.01.03'))).toBe(false)
		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.01.04'))).toBe(false)
		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.01.06'))).toBe(false)
	})

	it('should not match dates before start', () => {
		const schedule = RelativeScheduleHandler.parse('3')
		const start = ts('2024.01.10')

		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.01.05'))).toBe(false)
		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.01.09'))).toBe(false)
	})

	it('should work with interval of 1 (every day)', () => {
		const schedule = RelativeScheduleHandler.parse('1')
		const start = ts('2024.01.01')

		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.01.01'))).toBe(true)
		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.01.02'))).toBe(true)
		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.01.15'))).toBe(true)
		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.02.01'))).toBe(true)
	})

	it('should work with large intervals', () => {
		const schedule = RelativeScheduleHandler.parse('30')
		const start = ts('2024.01.01')

		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.01.31'))).toBe(true) // 30 days
		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.03.01'))).toBe(true) // 60 days
		expect(RelativeScheduleHandler.match(schedule, start, ts('2024.01.15'))).toBe(false)
	})
})

// =============================================================================
// Тесты для метода nextAfter (O(1) algorithm)
// =============================================================================
describe('RelativeScheduleHandler nextAfter', () => {
	it('should return start day when after is before start', () => {
		const schedule = RelativeScheduleHandler.parse('4')
		const start = ts('2024.01.10')
		const after = ts('2024.01.05')

		const result = RelativeScheduleHandler.nextAfter(schedule, start, after)
		expect(formatTs(result)).toBe('2024.01.10')
	})

	it('should return next interval when after equals start', () => {
		const schedule = RelativeScheduleHandler.parse('4')
		const start = ts('2024.01.10')

		const result = RelativeScheduleHandler.nextAfter(schedule, start, start)
		expect(formatTs(result)).toBe('2024.01.14') // start + 4 days
	})

	it('should calculate next occurrence correctly', () => {
		const schedule = RelativeScheduleHandler.parse('4')
		const start = ts('2024.01.01')

		// After 2024.01.01 next is 2024.01.05
		expect(formatTs(RelativeScheduleHandler.nextAfter(schedule, start, ts('2024.01.01')))).toBe('2024.01.05')

		// After 2024.01.02 next is 2024.01.05
		expect(formatTs(RelativeScheduleHandler.nextAfter(schedule, start, ts('2024.01.02')))).toBe('2024.01.05')

		// After 2024.01.05 next is 2024.01.09
		expect(formatTs(RelativeScheduleHandler.nextAfter(schedule, start, ts('2024.01.05')))).toBe('2024.01.09')

		// After 2024.01.06 next is 2024.01.09
		expect(formatTs(RelativeScheduleHandler.nextAfter(schedule, start, ts('2024.01.06')))).toBe('2024.01.09')
	})

	it('should handle large intervals', () => {
		const schedule = RelativeScheduleHandler.parse('30')
		const start = ts('2024.01.01')

		const result = RelativeScheduleHandler.nextAfter(schedule, start, ts('2024.02.15'))
		expect(formatTs(result)).toBe('2024.03.01') // 60 days from start
	})

	it('should work with interval of 1 day', () => {
		const schedule = RelativeScheduleHandler.parse('1')
		const start = ts('2024.01.01')

		expect(formatTs(RelativeScheduleHandler.nextAfter(schedule, start, ts('2024.01.15')))).toBe('2024.01.16')
		expect(formatTs(RelativeScheduleHandler.nextAfter(schedule, start, ts('2024.12.31')))).toBe('2025.01.01')
	})

	it('should handle large date ranges', () => {
		const schedule = RelativeScheduleHandler.parse('7')
		const start = ts('2024.01.01')

		// 100 days after start = day 100, next occurrence at day 105
		const result = RelativeScheduleHandler.nextAfter(schedule, start, ts('2024.04.10'))
		expect(formatTs(result)).toBe('2024.04.15') // 105 days from start (15*7 = 105)
	})

	it('should be O(1) - constant time for any date range', () => {
		const schedule = RelativeScheduleHandler.parse('7')
		const start = ts('2020.01.01')

		// Even 10 years later should be instant
		const result = RelativeScheduleHandler.nextAfter(schedule, start, ts('2030.06.15'))
		expect(result).not.toBeNull()
	})
})
