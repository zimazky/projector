// =============================================================================
// Тесты для AbsoluteScheduleHandler (абсолютный режим - cron-подобный синтаксис)
// =============================================================================

import { AbsoluteScheduleHandler } from './AbsoluteSchedule'
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
describe('AbsoluteScheduleHandler parse', () => {

  describe('basic parsing', () => {
    it('should parse star for all fields', () => {
      const result = AbsoluteScheduleHandler.parse('*', '*', '*')
      expect(result.mode).toBe('absolute')
      expect(result.days.length).toBe(31)
      expect(result.months.length).toBe(12)
      expect(result.weekdays.length).toBe(7)
    })

    it('should parse specific days', () => {
      const result = AbsoluteScheduleHandler.parse('1,5,10', '*', '*')
      expect(result.days).toEqual([1, 5, 10])
    })

    it('should parse day ranges', () => {
      const result = AbsoluteScheduleHandler.parse('1-5', '*', '*')
      expect(result.days).toEqual([1, 2, 3, 4, 5])
    })

    it('should parse step patterns', () => {
      const result = AbsoluteScheduleHandler.parse('*/4', '*', '*')
      expect(result.days).toEqual([1, 5, 9, 13, 17, 21, 25, 29])
    })

    it('should parse step with start', () => {
      const result = AbsoluteScheduleHandler.parse('5/4', '*', '*')
      expect(result.days).toEqual([5, 9, 13, 17, 21, 25, 29])
    })
  })

  describe('normalization', () => {
    it('should remove duplicates', () => {
      const result = AbsoluteScheduleHandler.parse('1,1,5,5,10', '*', '*')
      expect(result.days).toEqual([1, 5, 10])
    })

    it('should sort values', () => {
      const result = AbsoluteScheduleHandler.parse('10,1,5', '*', '*')
      expect(result.days).toEqual([1, 5, 10])
    })

    it('should combine different formats', () => {
      const result = AbsoluteScheduleHandler.parse('1,5-7,10', '*', '*')
      expect(result.days).toEqual([1, 5, 6, 7, 10])
    })
  })

  describe('months parsing', () => {
    it('should parse specific months', () => {
      const result = AbsoluteScheduleHandler.parse('*', '1,6,12', '*')
      expect(result.months).toEqual([1, 6, 12])
    })

    it('should parse month ranges', () => {
      const result = AbsoluteScheduleHandler.parse('*', '1-3', '*')
      expect(result.months).toEqual([1, 2, 3])
    })

    it('should parse month steps', () => {
      const result = AbsoluteScheduleHandler.parse('*', '*/3', '*')
      expect(result.months).toEqual([1, 4, 7, 10])
    })
  })

  describe('weekdays parsing', () => {
    it('should parse specific weekdays', () => {
      const result = AbsoluteScheduleHandler.parse('*', '*', '0,6')
      expect(result.weekdays).toEqual([0, 6])  // Sun, Sat
    })

    it('should parse weekday ranges', () => {
      const result = AbsoluteScheduleHandler.parse('*', '*', '1-5')
      expect(result.weekdays).toEqual([1, 2, 3, 4, 5])  // Mon-Fri
    })

    it('should parse weekday steps', () => {
      const result = AbsoluteScheduleHandler.parse('*', '*', '*/2')
      expect(result.weekdays).toEqual([0, 2, 4, 6])
    })
  })

  describe('boundary values', () => {
    it('should handle day boundaries (1-31)', () => {
      const result = AbsoluteScheduleHandler.parse('31', '*', '*')
      expect(result.days).toEqual([31])
    })

    it('should handle month boundaries (1-12)', () => {
      const result = AbsoluteScheduleHandler.parse('*', '12', '*')
      expect(result.months).toEqual([12])
    })

    it('should handle weekday boundaries (0-6)', () => {
      const result = AbsoluteScheduleHandler.parse('*', '*', '0')
      expect(result.weekdays).toEqual([0])
      
      const result2 = AbsoluteScheduleHandler.parse('*', '*', '6')
      expect(result2.weekdays).toEqual([6])
    })
  })
})


// =============================================================================
// Тесты для метода validate
// =============================================================================
describe('AbsoluteScheduleHandler validate', () => {

  describe('valid inputs', () => {
    it('should accept star values', () => {
      expect(AbsoluteScheduleHandler.validate('*', '*', '*').ok).toBe(true)
    })

    it('should accept valid days', () => {
      expect(AbsoluteScheduleHandler.validate('1', '*', '*').ok).toBe(true)
      expect(AbsoluteScheduleHandler.validate('31', '*', '*').ok).toBe(true)
      expect(AbsoluteScheduleHandler.validate('1-10', '*', '*').ok).toBe(true)
      expect(AbsoluteScheduleHandler.validate('*/4', '*', '*').ok).toBe(true)
    })

    it('should accept valid months', () => {
      expect(AbsoluteScheduleHandler.validate('*', '1', '*').ok).toBe(true)
      expect(AbsoluteScheduleHandler.validate('*', '12', '*').ok).toBe(true)
      expect(AbsoluteScheduleHandler.validate('*', '1-6', '*').ok).toBe(true)
    })

    it('should accept valid weekdays', () => {
      expect(AbsoluteScheduleHandler.validate('*', '*', '0').ok).toBe(true)
      expect(AbsoluteScheduleHandler.validate('*', '*', '6').ok).toBe(true)
      expect(AbsoluteScheduleHandler.validate('*', '*', '1-5').ok).toBe(true)
    })
  })

  describe('invalid days', () => {
    it('should reject day 0', () => {
      const result = AbsoluteScheduleHandler.validate('0', '*', '*')
      expect(result.ok).toBe(false)
      expect(result.error?.field).toBe('days')
    })

    it('should reject day 32', () => {
      const result = AbsoluteScheduleHandler.validate('32', '*', '*')
      expect(result.ok).toBe(false)
    })

    it('should reject non-numeric day', () => {
      const result = AbsoluteScheduleHandler.validate('abc', '*', '*')
      expect(result.ok).toBe(false)
    })

    it('should reject invalid step', () => {
      const result = AbsoluteScheduleHandler.validate('1/-2', '*', '*')
      expect(result.ok).toBe(false)
    })
  })

  describe('invalid months', () => {
    it('should reject month 0', () => {
      const result = AbsoluteScheduleHandler.validate('*', '0', '*')
      expect(result.ok).toBe(false)
      expect(result.error?.field).toBe('months')
    })

    it('should reject month 13', () => {
      const result = AbsoluteScheduleHandler.validate('*', '13', '*')
      expect(result.ok).toBe(false)
    })
  })

  describe('invalid weekdays', () => {
    it('should reject weekday 7', () => {
      const result = AbsoluteScheduleHandler.validate('*', '*', '7')
      expect(result.ok).toBe(false)
      expect(result.error?.field).toBe('weekdays')
    })
  })

  describe('invalid formats', () => {
    it('should reject invalid token format', () => {
      const result = AbsoluteScheduleHandler.validate('abc', '*', '*')
      expect(result.ok).toBe(false)
      expect(result.error?.token).toBe('abc')
    })

    it('should provide descriptive error message', () => {
      const result = AbsoluteScheduleHandler.validate('32', '*', '*')
      expect(result.ok).toBe(false)
      expect(result.error?.message).toContain('32')
    })
  })
})


// =============================================================================
// Тесты для метода match
// =============================================================================
describe('AbsoluteScheduleHandler match', () => {

  it('should match any day with star values', () => {
    const schedule = AbsoluteScheduleHandler.parse('*', '*', '*')
    
    expect(AbsoluteScheduleHandler.match(schedule, ts('2024.01.01'))).toBe(true)
    expect(AbsoluteScheduleHandler.match(schedule, ts('2024.06.15'))).toBe(true)
    expect(AbsoluteScheduleHandler.match(schedule, ts('2024.12.31'))).toBe(true)
  })

  describe('day matching', () => {
    it('should match specific day', () => {
      const schedule = AbsoluteScheduleHandler.parse('15', '*', '*')
      
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.01.15'))).toBe(true)
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.02.15'))).toBe(true)
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.01.16'))).toBe(false)
    })

    it('should match day range', () => {
      const schedule = AbsoluteScheduleHandler.parse('1-10', '*', '*')
      
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.01.05'))).toBe(true)
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.01.10'))).toBe(true)
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.01.11'))).toBe(false)
    })
  })

  describe('month matching', () => {
    it('should match specific month', () => {
      const schedule = AbsoluteScheduleHandler.parse('*', '3', '*')
      
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.03.15'))).toBe(true)
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.02.15'))).toBe(false)
    })

    it('should match month list', () => {
      const schedule = AbsoluteScheduleHandler.parse('*', '2,3', '*')
      
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.02.25'))).toBe(true)
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.03.25'))).toBe(true)
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.04.25'))).toBe(false)
    })
  })

  describe('weekday matching', () => {
    it('should match weekdays Mon-Fri', () => {
      const schedule = AbsoluteScheduleHandler.parse('*', '*', '1-5')
      
      // 2024.01.08 = Monday, 2024.01.12 = Friday
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.01.08'))).toBe(true)
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.01.12'))).toBe(true)
      
      // 2024.01.06 = Saturday, 2024.01.07 = Sunday
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.01.06'))).toBe(false)
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.01.07'))).toBe(false)
    })

    it('should match weekends', () => {
      const schedule = AbsoluteScheduleHandler.parse('*', '*', '0,6')
      
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.01.06'))).toBe(true)  // Sat
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.01.07'))).toBe(true)  // Sun
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.01.08'))).toBe(false) // Mon
    })
  })

  describe('combined conditions', () => {
    it('should match day AND month', () => {
      const schedule = AbsoluteScheduleHandler.parse('15', '3', '*')
      
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.03.15'))).toBe(true)
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.03.16'))).toBe(false)
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.04.15'))).toBe(false)
    })

    it('should match all three conditions', () => {
      const schedule = AbsoluteScheduleHandler.parse('1', '1', '1')  // Jan 1st, Monday
      
      // 2024.01.01 = Monday
      expect(AbsoluteScheduleHandler.match(schedule, ts('2024.01.01'))).toBe(true)
      expect(AbsoluteScheduleHandler.match(schedule, ts('2025.01.01'))).toBe(false)  // Wednesday
    })
  })
})


// =============================================================================
// Тесты для метода nextAfter
// =============================================================================
describe('AbsoluteScheduleHandler nextAfter', () => {

  describe('star schedule (every day)', () => {
    it('should return next day', () => {
      const schedule = AbsoluteScheduleHandler.parse('*', '*', '*')
      
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.15'), 1000)
      expect(formatTs(result)).toBe('2024.01.16')
    })

    it('should return start day when after is before start', () => {
      const schedule = AbsoluteScheduleHandler.parse('*', '*', '*')
      const start = ts('2024.01.10')
      
      const result = AbsoluteScheduleHandler.nextAfter(schedule, start, ts('2024.01.05'), 1000)
      expect(formatTs(result)).toBe('2024.01.10')
    })
  })

  describe('weekday only', () => {
    it('should find next weekday (Mon-Fri)', () => {
      const schedule = AbsoluteScheduleHandler.parse('*', '*', '1-5')
      
      // 2024.01.06 = Saturday, next should be Monday 2024.01.08
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.06'), 1000)
      expect(formatTs(result)).toBe('2024.01.08')
    })

    it('should return same day if it matches weekday', () => {
      const schedule = AbsoluteScheduleHandler.parse('*', '*', '1-5')
      
      // 2024.01.09 = Tuesday, next after 01.08 should be 01.09
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.08'), 1000)
      expect(formatTs(result)).toBe('2024.01.09')
    })

    it('should handle weekends', () => {
      const schedule = AbsoluteScheduleHandler.parse('*', '*', '0,6')
      
      // 2024.01.11 = Thursday, next should be Saturday 2024.01.13
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.11'), 1000)
      expect(formatTs(result)).toBe('2024.01.13')
    })
  })

  describe('day of month only', () => {
    it('should find next day in current month', () => {
      const schedule = AbsoluteScheduleHandler.parse('15', '*', '*')
      
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.10'), 1000)
      expect(formatTs(result)).toBe('2024.01.15')
    })

    it('should jump to next month if day passed', () => {
      const schedule = AbsoluteScheduleHandler.parse('15', '*', '*')
      
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.15'), 1000)
      expect(formatTs(result)).toBe('2024.02.15')
    })

    it('should handle day 31 (skip months without it)', () => {
      const schedule = AbsoluteScheduleHandler.parse('31', '*', '*')
      
      // February doesn't have 31st, should jump to March
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.02.01'), 1000)
      expect(formatTs(result)).toBe('2024.03.31')
    })

    it('should handle day list', () => {
      const schedule = AbsoluteScheduleHandler.parse('5,10,20', '*', '*')
      
      expect(formatTs(AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.05'), 1000))).toBe('2024.01.10')
      expect(formatTs(AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.12'), 1000))).toBe('2024.01.20')
    })
  })

  describe('month only', () => {
    it('should find next month', () => {
      const schedule = AbsoluteScheduleHandler.parse('*', '3', '*')
      
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.15'), 1000)
      expect(formatTs(result)).toBe('2024.03.01')
    })

    it('should jump to next year if month passed', () => {
      const schedule = AbsoluteScheduleHandler.parse('*', '3', '*')
      
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.04.01'), 1000)
      expect(formatTs(result)).toBe('2025.03.01')
    })

    it('should handle month list', () => {
      const schedule = AbsoluteScheduleHandler.parse('*', '3,6,9', '*')
      
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.04.01'), 1000)
      expect(formatTs(result)).toBe('2024.06.01')
    })
  })

  describe('combined conditions', () => {
    it('should match day AND month', () => {
      const schedule = AbsoluteScheduleHandler.parse('15', '3', '*')
      
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.01'), 1000)
      expect(formatTs(result)).toBe('2024.03.15')
    })

    it('should find next when conditions change', () => {
      const schedule = AbsoluteScheduleHandler.parse('15', '3,6', '*')
      
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.03.15'), 1000)
      expect(formatTs(result)).toBe('2024.06.15')
    })

    it('should match day AND weekday', () => {
      const schedule = AbsoluteScheduleHandler.parse('15', '*', '5')  // 15th that is Friday
      
      // Find nearest Friday 15th - 2024.03.15 = Friday
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.01'), 1000)
      expect(formatTs(result)).toBe('2024.03.15')
    })

    it('should match all three conditions', () => {
      const schedule = AbsoluteScheduleHandler.parse('1', '1', '1')  // Jan 1st, Monday
      
      // 2024.01.01 = Monday
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2023.12.01'), 1000)
      expect(formatTs(result)).toBe('2024.01.01')
      
      // After 2024.01.01, next Jan 1st on Monday is 2029.01.01
      const result2 = AbsoluteScheduleHandler.nextAfter(schedule, ts('2024.01.01'), ts('2024.01.01'), 1000)
      expect(result2).toBe(ts('2029.01.01'))
    })
  })

  describe('performance', () => {
    it('should handle large date ranges efficiently', () => {
      const schedule = AbsoluteScheduleHandler.parse('29', '2', '*')  // Feb 29
      
      // Search across multiple years
      const result = AbsoluteScheduleHandler.nextAfter(schedule, ts('2020.01.01'), ts('2020.01.01'), 1000)
      expect(formatTs(result)).toBe('2020.02.29')
      
      // After 2020, next leap year is 2024
      const result2 = AbsoluteScheduleHandler.nextAfter(schedule, ts('2020.01.01'), ts('2020.02.29'), 1000)
      expect(formatTs(result2)).toBe('2024.02.29')
    })
  })
})
