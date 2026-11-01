import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import ZCron, { type ParsedSchedule } from 'src/7-shared/libs/ZCron/ZCron'
import type { AbsoluteSchedule } from 'src/7-shared/libs/ZCron/types'
import { BoundedCache } from './BoundedCache'
import { documentDate } from '../Document/model/DocumentFormat'

const DAY = 86400
const mod = (value: number, base: number) => ((value % base) + base) % base
type Compiled = { schedule: ParsedSchedule; years?: Uint32Array }

/** Считает вхождения в [begin, end), не создавая календарные события за всю историю. */
export class OccurrenceCounter {
	private compiled = new BoundedCache<string, Compiled>(128)
	get size(): number {
		return this.compiled.size
	}
	clear(): void {
		this.compiled.clear()
	}

	/** Календарные даты документа не зависят от глобального смещения DateTime. */
	countDates(repeat: string, start: string, begin: string, end: string): number {
		return this.count(
			repeat,
			DateTime.YYYYMMDDToTimestampUTC(documentDate(start)),
			DateTime.YYYYMMDDToTimestampUTC(documentDate(begin)),
			DateTime.YYYYMMDDToTimestampUTC(documentDate(end)),
			0
		)
	}

	count(repeat: string, start: timestamp, begin: timestamp, end: timestamp, timezone = DateTime.timezone): number {
		begin = Math.max(begin, start)
		if (begin >= end) return 0
		let entry = this.compiled.get(repeat)
		if (!entry) {
			entry = { schedule: ZCron.parse(repeat) }
			this.compiled.set(repeat, entry)
		}
		const schedule = entry.schedule
		if (schedule.mode === 'empty') return start >= begin && start < end ? 1 : 0
		if (schedule.mode === 'relative') {
			const step = schedule.intervalDays * DAY
			return Math.max(0, Math.ceil((end - start) / step) - Math.ceil((begin - start) / step))
		}
		if (schedule.days.length === 31 && schedule.months.length === 12) {
			// Ежедневные/еженедельные операции: полные недели и остаток до семи дней.
			const days = Math.round((end - begin) / DAY)
			const weekday = mod(Math.floor((begin + timezone * 3600) / DAY) + 4, 7)
			return schedule.weekdays.reduce((n, w) => n + Math.floor(days / 7) + (mod(w - weekday, 7) < days % 7 ? 1 : 0), 0)
		}
		if (!entry.years) {
			// Григорианские даты и дни недели повторяются каждые 400 лет.
			// 401 число вместо таблицы всех дней или неограниченной истории вхождений.
			entry.years = new Uint32Array(401)
			for (let i = 0; i < 400; i++) entry.years[i + 1] = entry.years[i] + this.inYear(schedule, 2000 + i, 12, 1)
		}
		const before = (date: timestamp) => {
			const { year, month, day } = DateTime.getUTCYearMonthDay(date + timezone * 3600)
			const cycles = Math.floor((year - 2000) / 400)
			return (
				cycles * entry!.years![400] + entry!.years![mod(year - 2000, 400)] + this.inYear(schedule, year, month, day)
			)
		}
		return before(end) - before(begin)
	}

	private inYear(schedule: AbsoluteSchedule, year: number, month: number, day: number): number {
		let total = 0
		for (const m of schedule.months) {
			if (m - 1 > month) break
			const first = DateTime.YearMonthDayToTimestampUTC(year, m - 1, 1)
			const weekday = mod(Math.floor(first / DAY) + 4, 7)
			const limit = m - 1 === month ? day - 1 : DateTime.getDaysInMonth(year, m - 1)
			for (const d of schedule.days) {
				if (d > limit) break
				if (schedule.weekdays.includes((weekday + d - 1) % 7)) total++
			}
		}
		return total
	}
}
