// =============================================================================
// Обработчик относительных расписаний (/d - каждые N дней от даты старта)
// =============================================================================

import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import { type RelativeSchedule, type ValidationResult } from './types'

/**
 * Обработчик относительных расписаний формата /N
 *
 * Относительное расписание означает "каждые N дней от даты старта события".
 * Примеры:
 *   '/4' - каждые 4 дня от startTimestamp
 *   '/7' - каждую неделю от startTimestamp
 *
 * Особенности:
 * - O(1) алгоритмы для match и nextAfter
 * - Не зависит от месяцев и дней недели
 */
export class RelativeScheduleHandler {
	/**
	 * Парсит строку относительного расписания.
	 * @param s - строка формата '/N' (без начального слэша уже убранного)
	 * @returns скомпилированное относительное расписание
	 */
	static parse(s: string): RelativeSchedule {
		const intervalDays = parseInt(s, 10)
		return { mode: 'relative', intervalDays }
	}

	/**
	 * Валидирует строку относительного расписания.
	 * @param s - строка после '/' (например, '4' для '/4')
	 * @returns результат валидации
	 */
	static validate(s: string): ValidationResult {
		if (s === '') {
			return {
				ok: false,
				error: {
					field: 'general',
					token: '/',
					message: 'Interval not specified after "/"'
				}
			}
		}

		if (!/^\d+$/.test(s)) {
			return {
				ok: false,
				error: {
					field: 'general',
					token: '/' + s,
					message: 'Interval must be a positive integer'
				}
			}
		}

		const interval = parseInt(s, 10)
		if (interval < 1) {
			return {
				ok: false,
				error: {
					field: 'general',
					token: '/' + s,
					message: 'Interval must be at least 1'
				}
			}
		}

		return { ok: true }
	}

	/**
	 * Проверяет, соответствует ли дата относительному расписанию.
	 * O(1) - простое деление с остатком.
	 *
	 * @param schedule - скомпилированное расписание
	 * @param startTimestamp - начальная дата события
	 * @param ts - проверяемая дата
	 * @returns true если дата соответствует расписанию
	 */
	static match(schedule: RelativeSchedule, startTimestamp: timestamp, ts: timestamp): boolean {
		const diff = DateTime.getDifferenceInDays(startTimestamp, ts)
		if (diff < 0) return false
		return diff % schedule.intervalDays === 0
	}

	/**
	 * Вычисляет следующее срабатывание расписания.
	 * O(1) - прямая формула без итераций.
	 *
	 * Формула: k = ceil(diff / intervalDays), nextTs = startTimestamp + k * intervalDays * 86400
	 *
	 * @param schedule - скомпилированное расписание
	 * @param startTimestamp - начальная дата события
	 * @param afterTimestamp - искать срабатывание строго после этой даты
	 * @returns timestamp следующего срабатывания или null
	 */
	static nextAfter(schedule: RelativeSchedule, startTimestamp: timestamp, afterTimestamp: timestamp): timestamp | null {
		const intervalSec = schedule.intervalDays * 86400
		const startDay = DateTime.getBeginDayTimestamp(startTimestamp)
		const afterDay = DateTime.getBeginDayTimestamp(afterTimestamp)

		// Если afterTimestamp раньше startTimestamp, следующее - это сам startTimestamp
		if (afterDay < startDay) {
			return startDay
		}

		// Вычисляем разницу в днях
		const diffDays = DateTime.getDifferenceInDays(startDay, afterDay)

		// k = количество интервалов от старта (округление вверх для "после afterTimestamp")
		// Если afterTimestamp точно на интервале, нужно следующее срабатывание
		const k = Math.floor(diffDays / schedule.intervalDays) + 1

		return startDay + k * intervalSec
	}

	/**
	 * Вычисляет предыдущее срабатывание расписания.
	 * O(1) - прямая формула без итераций.
	 *
	 * Формула: k = floor((diff - 1) / intervalDays), prevTs = startTimestamp + k * intervalDays * 86400
	 *
	 * @param schedule - скомпилированное расписание
	 * @param startTimestamp - начальная дата события
	 * @param beforeTimestamp - искать срабатывание строго до этой даты
	 * @returns timestamp предыдущего срабатывания или null
	 */
	static prevBefore(
		schedule: RelativeSchedule,
		startTimestamp: timestamp,
		beforeTimestamp: timestamp
	): timestamp | null {
		const intervalSec = schedule.intervalDays * 86400
		const startDay = DateTime.getBeginDayTimestamp(startTimestamp)
		const beforeDay = DateTime.getBeginDayTimestamp(beforeTimestamp)

		// Если beforeTimestamp <= startTimestamp, предыдущего срабатывания нет
		if (beforeDay <= startDay) {
			return null
		}

		// Вычисляем разницу в днях
		const diffDays = DateTime.getDifferenceInDays(startDay, beforeDay)

		// k = количество полных интервалов от старта до beforeTimestamp
		// Вычитаем 1, чтобы получить строго до beforeTimestamp
		const k = Math.floor((diffDays - 1) / schedule.intervalDays)

		// Если k < 0, значит нет срабатываний до beforeTimestamp
		if (k < 0) {
			return null
		}

		return startDay + k * intervalSec
	}
}
