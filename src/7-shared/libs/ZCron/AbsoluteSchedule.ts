// =============================================================================
// Обработчик абсолютных расписаний (cron-подобный синтаксис)
// =============================================================================

import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import { type AbsoluteSchedule, type ValidationResult, type ScheduleField } from './types'

/**
 * Обработчик абсолютных расписаний формата "D M W"
 *
 * Абсолютное расписание использует cron-подобный синтаксис:
 * - days: 1-31 (день месяца)
 * - months: 1-12 (месяц)
 * - weekdays: 0-6 (день недели: 0=воскресенье, 6=суббота)
 *
 * Поддерживаемые операторы:
 * - звёздочка - все значения
 * - запятая - список значений (1,5,10)
 * - дефис - диапазон (1-5)
 * - слеш - шаг (звёздочка/4 = каждые 4, 1/4 = каждые 4 начиная с 1)
 *
 * Примеры:
 *   звёздочка звёздочка звёздочка - каждый день
 *   15 звёздочка звёздочка - 15-е число каждого месяца
 *   звёздочка 3 звёздочка - каждый день марта
 *   звёздочка звёздочка 1-5 - понедельник-пятница
 *   15 3 звёздочка - 15 марта
 *   звёздочка/4 звёздочка звёздочка - каждый 4-й день месяца
 */
export class AbsoluteScheduleHandler {
	/**
	 * Парсит поля абсолютного расписания.
	 * @param d - поле дней (1-31)
	 * @param m - поле месяцев (1-12)
	 * @param w - поле дней недели (0-6)
	 * @returns скомпилированное абсолютное расписание
	 */
	static parse(d: string, m: string, w: string): AbsoluteSchedule {
		const days = this.parseField(d, 1, 31)
		const months = this.parseField(m, 1, 12)
		const weekdays = this.parseField(w, 0, 6)

		return {
			mode: 'absolute',
			days,
			months,
			weekdays
		}
	}

	/**
	 * Парсит поле расписания в массив чисел с нормализацией.
	 * Удаляет дубликаты и сортирует результат.
	 */
	private static parseField(fieldStr: string, min: number, max: number): number[] {
		const tokens = fieldStr.split(',')
		const values: number[] = []

		for (const token of tokens) {
			this.parseToken(token, min, max, values)
		}

		return [...new Set(values)].sort((a, b) => a - b)
	}

	/**
	 * Парсит отдельный токен в массив чисел.
	 * Поддерживает форматы: одиночное число, диапазон (1-10), шаг (звёздочка/4, 1/4), звёздочка.
	 */
	private static parseToken(token: string, min: number, max: number, result: number[]): void {
		// Диапазон: 1-10
		const rangeMatch = token.match(/^(\d+)-(\d+)$/)
		if (rangeMatch) {
			const start = parseInt(rangeMatch[1], 10)
			const end = parseInt(rangeMatch[2], 10)
			for (let i = start; i <= end; i++) {
				if (i >= min && i <= max) {
					result.push(i)
				}
			}
			return
		}

		// Шаг: */4 или 1/4
		const stepMatch = token.match(/^(?:(\d+)|\*)\/(\d+)$/)
		if (stepMatch) {
			const start = stepMatch[1] ? parseInt(stepMatch[1], 10) : min
			const step = parseInt(stepMatch[2], 10)
			for (let i = start; i <= max; i += step) {
				if (i >= min && i <= max) {
					result.push(i)
				}
			}
			return
		}

		// Одиночное число
		const singleMatch = token.match(/^\d+$/)
		if (singleMatch) {
			const value = parseInt(token, 10)
			if (value >= min && value <= max) {
				result.push(value)
			}
			return
		}

		// Звёздочка - все значения
		if (token === '*') {
			for (let i = min; i <= max; i++) {
				result.push(i)
			}
		}
	}

	/**
	 * Валидирует поля абсолютного расписания.
	 */
	static validate(d: string, m: string, w: string): ValidationResult {
		const daysResult = this.validateFieldDetailed(d, 'days', 1, 31)
		if (!daysResult.ok) return daysResult

		const monthsResult = this.validateFieldDetailed(m, 'months', 1, 12)
		if (!monthsResult.ok) return monthsResult

		const weekdaysResult = this.validateFieldDetailed(w, 'weekdays', 0, 6)
		if (!weekdaysResult.ok) return weekdaysResult

		return { ok: true }
	}

	/**
	 * Валидирует поле расписания с детальной диагностикой ошибок.
	 */
	private static validateFieldDetailed(
		s: string,
		fieldName: ScheduleField,
		min: number,
		max: number
	): ValidationResult {
		if (s === '*') return { ok: true }

		const tokens = s.split(',')

		for (const token of tokens) {
			// Диапазон
			const rangeMatch = token.match(/^(\d+)-(\d+)$/)
			if (rangeMatch) {
				const start = parseInt(rangeMatch[1], 10)
				const end = parseInt(rangeMatch[2], 10)

				if (start < min || start > max) {
					return {
						ok: false,
						error: {
							field: fieldName,
							token,
							message: 'Value ' + start + ' out of range ' + min + '-' + max
						}
					}
				}
				if (end < min || end > max) {
					return {
						ok: false,
						error: {
							field: fieldName,
							token,
							message: 'Value ' + end + ' out of range ' + min + '-' + max
						}
					}
				}
				continue
			}

			// Шаг
			const stepMatch = token.match(/^(?:(\d+)|\*)\/(\d+)$/)
			if (stepMatch) {
				const start = stepMatch[1] ? parseInt(stepMatch[1], 10) : null
				const step = parseInt(stepMatch[2], 10)

				if (start !== null && (start < min || start > max)) {
					return {
						ok: false,
						error: {
							field: fieldName,
							token,
							message: 'Start value ' + start + ' out of range ' + min + '-' + max
						}
					}
				}
				if (step < 1) {
					return {
						ok: false,
						error: {
							field: fieldName,
							token,
							message: 'Step must be at least 1'
						}
					}
				}
				continue
			}

			// Одиночное число
			const singleMatch = token.match(/^\d+$/)
			if (singleMatch) {
				const value = parseInt(token, 10)
				if (value < min || value > max) {
					return {
						ok: false,
						error: {
							field: fieldName,
							token,
							message: 'Value ' + value + ' out of range ' + min + '-' + max
						}
					}
				}
				continue
			}

			// Неизвестный формат
			return {
				ok: false,
				error: {
					field: fieldName,
					token,
					message: 'Invalid format: ' + token
				}
			}
		}

		return { ok: true }
	}

	/**
	 * Проверяет, соответствует ли дата абсолютному расписанию.
	 * O(1) - три проверки включения в массив.
	 */
	static match(schedule: AbsoluteSchedule, ts: timestamp): boolean {
		const { day, month, weekday } = DateTime.getDayMonthWeekday(ts)
		return schedule.months.includes(month + 1) && schedule.days.includes(day) && schedule.weekdays.includes(weekday)
	}

	/**
	 * Находит следующее срабатывание расписания.
	 * Оптимизированный алгоритм с "перепрыгиванием" вместо линейного перебора.
	 *
	 * @param schedule - скомпилированное расписание
	 * @param startTimestamp - начальная дата события
	 * @param afterTimestamp - искать срабатывание строго после этой даты
	 * @param maxIterations - защита от бесконечного цикла
	 * @returns timestamp следующего срабатывания или null
	 */
	static nextAfter(
		schedule: AbsoluteSchedule,
		startTimestamp: timestamp,
		afterTimestamp: timestamp,
		maxIterations: number
	): timestamp | null {
		// Начинаем поиск со следующего дня после afterTimestamp
		let candidate = DateTime.getBeginDayTimestamp(afterTimestamp) + 86400
		const startDay = DateTime.getBeginDayTimestamp(startTimestamp)

		if (candidate < startDay) {
			candidate = startDay
		}

		const { months, days, weekdays } = schedule
		const monthsSet = new Set(months)
		const daysSet = new Set(days)
		const weekdaysSet = new Set(weekdays)

		// Быстрые проверки: если все поля = "*", то каждый день
		const allMonths = months.length === 12
		const allDays = days.length === 31
		const allWeekdays = weekdays.length === 7

		if (allMonths && allDays && allWeekdays) {
			return candidate
		}

		// Если только weekdays ограничен - прыгаем по дням недели
		if (allMonths && allDays && !allWeekdays) {
			return this.findNextWeekday(candidate, weekdays, weekdaysSet)
		}

		// Общий случай - итеративный поиск с перепрыгиванием
		for (let i = 0; i < maxIterations; i++) {
			const { year, month, day } = DateTime.getYearMonthDay(candidate)
			const month1based = month + 1

			// 1. Проверка месяца
			if (!monthsSet.has(month1based)) {
				candidate = this.jumpToNextMonth(year, month, months)
				continue
			}

			// 2. Проверка дня месяца
			if (!daysSet.has(day)) {
				const daysInMonth = DateTime.getDaysInMonth(year, month)
				const nextDay = this.findNextInSorted(days, day, daysInMonth)

				if (nextDay !== null) {
					candidate = DateTime.YearMonthDayToTimestamp(year, month, nextDay)
				} else {
					candidate = this.jumpToNextMonth(year, month, months)
				}
				continue
			}

			// 3. Проверка дня недели
			const weekday = DateTime.getWeekday(candidate)
			if (!weekdaysSet.has(weekday)) {
				const daysToAdd = this.daysToNextWeekday(weekday, weekdays)
				candidate += daysToAdd * 86400
				continue
			}

			// Все условия выполнены
			return candidate
		}

		return null // Превышен лимит итераций
	}

	/**
	 * Находит количество дней до ближайшего подходящего дня недели.
	 */
	private static daysToNextWeekday(currentWeekday: number, weekdays: number[]): number {
		let minDays = 7
		for (const wd of weekdays) {
			let diff = wd - currentWeekday
			if (diff <= 0) diff += 7
			if (diff < minDays) minDays = diff
		}
		return minDays
	}

	/**
	 * Находит ближайший подходящий день недели и возвращает timestamp.
	 */
	private static findNextWeekday(candidate: timestamp, weekdays: number[], weekdaysSet: Set<number>): timestamp | null {
		const weekday = DateTime.getWeekday(candidate)
		if (weekdaysSet.has(weekday)) {
			return candidate
		}
		const daysToAdd = this.daysToNextWeekday(weekday, weekdays)
		return candidate + daysToAdd * 86400
	}

	/**
	 * Переходит к первому дню следующего подходящего месяца.
	 */
	private static jumpToNextMonth(year: number, month: number, months: number[]): timestamp {
		const month1based = month + 1
		const nextMonth = this.findNextInSorted(months, month1based, 12)

		if (nextMonth !== null) {
			return DateTime.YearMonthDayToTimestamp(year, nextMonth - 1, 1)
		} else {
			return DateTime.YearMonthDayToTimestamp(year + 1, months[0] - 1, 1)
		}
	}

	/**
	 * Находит следующее значение в отсортированном массиве после текущего.
	 */
	private static findNextInSorted(sorted: number[], current: number, max: number): number | null {
		for (const val of sorted) {
			if (val > current && val <= max) {
				return val
			}
		}
		return null
	}

	/**
	 * Находит предыдущее срабатывание расписания.
	 * Оптимизированный алгоритм с "перепрыгиванием" назад вместо линейного перебора.
	 *
	 * @param schedule - скомпилированное расписание
	 * @param startTimestamp - начальная дата события
	 * @param beforeTimestamp - искать срабатывание строго до этой даты
	 * @param maxIterations - защита от бесконечного цикла
	 * @returns timestamp предыдущего срабатывания или null
	 */
	static prevBefore(
		schedule: AbsoluteSchedule,
		startTimestamp: timestamp,
		beforeTimestamp: timestamp,
		maxIterations: number
	): timestamp | null {
		// Начинаем поиск с дня перед beforeTimestamp
		let candidate = DateTime.getBeginDayTimestamp(beforeTimestamp) - 86400
		const startDay = DateTime.getBeginDayTimestamp(startTimestamp)

		// Не можем найти срабатывание раньше startTimestamp
		if (candidate < startDay) {
			return null
		}

		const { months, days, weekdays } = schedule
		const monthsSet = new Set(months)
		const daysSet = new Set(days)
		const weekdaysSet = new Set(weekdays)

		// Быстрые проверки: если все поля = "*", то каждый день
		const allMonths = months.length === 12
		const allDays = days.length === 31
		const allWeekdays = weekdays.length === 7

		if (allMonths && allDays && allWeekdays) {
			return candidate
		}

		// Если только weekdays ограничен - прыгаем по дням недели назад
		if (allMonths && allDays && !allWeekdays) {
			return this.findPrevWeekday(candidate, weekdays, weekdaysSet)
		}

		// Общий случай - итеративный поиск с перепрыгиванием назад
		for (let i = 0; i < maxIterations; i++) {
			const { year, month, day } = DateTime.getYearMonthDay(candidate)
			const month1based = month + 1

			// 1. Проверка месяца
			if (!monthsSet.has(month1based)) {
				candidate = this.jumpToPrevMonth(year, month, months)
				if (candidate < startDay) return null
				continue
			}

			// 2. Проверка дня месяца
			if (!daysSet.has(day)) {
				const prevDay = this.findPrevInSorted(days, day, 1)

				if (prevDay !== null) {
					candidate = DateTime.YearMonthDayToTimestamp(year, month, prevDay)
				} else {
					candidate = this.jumpToPrevMonth(year, month, months)
					if (candidate < startDay) return null
				}
				continue
			}

			// 3. Проверка дня недели
			const weekday = DateTime.getWeekday(candidate)
			if (!weekdaysSet.has(weekday)) {
				const daysToSub = this.daysToPrevWeekday(weekday, weekdays)
				candidate -= daysToSub * 86400
				if (candidate < startDay) return null
				continue
			}

			// Все условия выполнены
			return candidate
		}

		return null // Превышен лимит итераций
	}

	/**
	 * Находит количество дней до ближайшего подходящего дня недели (назад).
	 */
	private static daysToPrevWeekday(currentWeekday: number, weekdays: number[]): number {
		let minDays = 7
		for (const wd of weekdays) {
			let diff = currentWeekday - wd
			if (diff <= 0) diff += 7
			if (diff < minDays) minDays = diff
		}
		return minDays
	}

	/**
	 * Находит ближайший подходящий день недели назад и возвращает timestamp.
	 */
	private static findPrevWeekday(candidate: timestamp, weekdays: number[], weekdaysSet: Set<number>): timestamp | null {
		const weekday = DateTime.getWeekday(candidate)
		if (weekdaysSet.has(weekday)) {
			return candidate
		}
		const daysToSub = this.daysToPrevWeekday(weekday, weekdays)
		return candidate - daysToSub * 86400
	}

	/**
	 * Переходит к последнему дню предыдущего подходящего месяца.
	 */
	private static jumpToPrevMonth(year: number, month: number, months: number[]): timestamp {
		const month1based = month + 1
		const prevMonth = this.findPrevInSorted(months, month1based, 1)

		if (prevMonth !== null) {
			const daysInMonth = DateTime.getDaysInMonth(year, prevMonth - 1)
			return DateTime.YearMonthDayToTimestamp(year, prevMonth - 1, daysInMonth)
		} else {
			// Переход к декабрю предыдущего года
			const lastMonth = months[months.length - 1]
			const daysInMonth = DateTime.getDaysInMonth(year - 1, lastMonth - 1)
			return DateTime.YearMonthDayToTimestamp(year - 1, lastMonth - 1, daysInMonth)
		}
	}

	/**
	 * Находит предыдущее значение в отсортированном массиве перед текущим.
	 */
	private static findPrevInSorted(sorted: number[], current: number, min: number): number | null {
		for (let i = sorted.length - 1; i >= 0; i--) {
			if (sorted[i] < current && sorted[i] >= min) {
				return sorted[i]
			}
		}
		return null
	}
}
