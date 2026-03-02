import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import { type ParsedSchedule, type ValidationResult } from './types'
import { RelativeScheduleHandler } from './RelativeSchedule'
import { AbsoluteScheduleHandler } from './AbsoluteSchedule'

// Re-export types for backward compatibility
export {
	type ParsedSchedule,
	type AbsoluteSchedule,
	type RelativeSchedule,
	type EmptySchedule,
	type ScheduleMode,
	type ScheduleField,
	type ValidationError,
	type ValidationResult
} from './types'

// =============================================================================
// Библиотека для обработки строк с cron-подобным синтаксисом
// =============================================================================
// Упрощенный синтаксис cron-выражений
// Допустимые диапазоны значений и операторы:
//  day       1-31    *,-/    (день месяца)
//  month     1-12    *,-/    (месяц)
//  weekday   0-6     *,-/    (день недели: 0-воскресенье, 6-суббота)
//
// Примеры:
// '/4   *  *' - каждый 4-й день относительно startTimestamp
// '*/4  *  *' - каждый 4-й день месяца, начиная с 1-го
// '1/4  *  *' - каждый 4-й день месяца, начиная с 1-го
// '5/4  *  *' - каждый 4-й день месяца, начиная с 5-го
// '*  */4  *' - каждый день каждого 4-го месяца (янв, май, сен...)
// '25 2/4  *' - 25-е число каждого 4-го месяца, начиная с февраля
// '25  2,3 *' - каждое 25-е февраля и марта
// '*  *  1-5' - понедельник по пятницу каждую неделю
// =============================================================================

// =============================================================================
// Класс ZCron - основная библиотека работы с расписаниями
// =============================================================================

export default class ZCron {
	/** Кэш скомпилированных расписаний для повторного использования */
	private static parseCache: Map<string, ParsedSchedule> = new Map()

	/**
	 * Добавляет последовательность чисел в массив, разбирая строку str.
	 * Поддерживает форматы: одиночное число, диапазон (1-10), шаг (звездочка/4, 1/4)
	 * @param array - массив для добавления чисел
	 * @param str - строка с описанием последовательности
	 * @param max - максимальное значение
	 * @param from - начальное значение для шага
	 * @returns массив с добавленными числами
	 */
	static addSequence(array: number[], str: string, max: number = 31, from: number = 1): number[] {
		const [a, b = null] = str.split('-', 2)
		if (b === null) {
			const [a, b = null] = str.split('/', 2)
			if (a === '' || b === '') return array
			const start = a === '*' ? from : +a
			let inc = +(b ?? 0)
			if (isNaN(start) || isNaN(inc)) return array
			if (b === null && a !== '*') return (array.push(+a), array)
			if (inc === 0) inc = 1
			for (let i = start; i <= max; i += inc) array.push(i)
			return array
		}
		if (a === '' || b === '') return array
		for (let i = +a; i <= +b; i++) array.push(i)
		return array
	}

	/**
	 * Проверяет, соответствует ли указанная дата шаблону расписания.
	 * @param scheduleString - строка с шаблоном расписания
	 * @param startTimestamp - начальная дата (для относительных расписаний)
	 * @param ts - проверяемая дата
	 * @returns true если дата соответствует шаблону
	 */
	static isMatch(scheduleString: string, startTimestamp: timestamp, ts: timestamp): boolean {
		const schedule = this.parseWithCache(scheduleString)
		return this.match(schedule, startTimestamp, ts)
	}

	/**
	 * Проверяет, срабатывает ли шаблон расписания в указанном интервале дат.
	 * Оптимизированная версия - использует nextAfter вместо линейного перебора.
	 * @param scheduleString - строка с шаблоном расписания
	 * @param startTimestamp - начальная дата события
	 * @param begin - начало интервала
	 * @param end - конец интервала
	 * @returns true если есть совпадение в интервале
	 */
	static ariseInInterval(scheduleString: string, startTimestamp: timestamp, begin: timestamp, end: timestamp): boolean {
		const schedule = this.parseWithCache(scheduleString)
		return this.ariseInIntervalParsed(schedule, startTimestamp, begin, end)
	}

	/**
	 * Оптимизированная проверка для скомпилированного расписания.
	 */
	static ariseInIntervalParsed(
		schedule: ParsedSchedule,
		startTimestamp: timestamp,
		begin: timestamp,
		end: timestamp
	): boolean {
		// Ищем первое совпадение строго перед началом интервала,
		// чтобы nextAfter нашёл первое совпадение >= begin
		const beforeBegin = DateTime.getBeginDayTimestamp(begin) - 86400
		const nextMatch = this.nextAfter(schedule, startTimestamp, beforeBegin)
		return nextMatch !== null && nextMatch < end
	}

	/**
	 * Находит первое совпадение шаблона в указанном интервале.
	 * Оптимизированная версия - использует nextAfter вместо линейного перебора.
	 * @returns timestamp первого совпадения или 0 если не найдено
	 */
	static firstInInterval(
		scheduleString: string,
		startTimestamp: timestamp,
		begin: timestamp,
		end: timestamp
	): timestamp {
		const schedule = this.parseWithCache(scheduleString)
		return this.firstInIntervalParsed(schedule, startTimestamp, begin, end)
	}

	/**
	 * Оптимизированный поиск для скомпилированного расписания.
	 */
	static firstInIntervalParsed(
		schedule: ParsedSchedule,
		startTimestamp: timestamp,
		begin: timestamp,
		end: timestamp
	): timestamp {
		const beforeBegin = DateTime.getBeginDayTimestamp(begin) - 86400
		const nextMatch = this.nextAfter(schedule, startTimestamp, beforeBegin)
		if (nextMatch !== null && nextMatch < end) {
			return nextMatch
		}
		return 0 as timestamp
	}

	/**
	 * Находит первое совпадение шаблона начиная с startTimestamp.
	 * Оптимизированная версия - использует nextAfter.
	 * @param maxinterval - максимальное количество дней для поиска (защита от бесконечного поиска)
	 * @returns timestamp первого совпадения или 0 если не найдено
	 */
	static first(scheduleString: string, startTimestamp: timestamp, maxinterval = 366): timestamp {
		const schedule = this.parseWithCache(scheduleString)
		return this.firstParsed(schedule, startTimestamp, maxinterval)
	}

	/**
	 * Оптимизированный поиск для скомпилированного расписания.
	 */
	static firstParsed(schedule: ParsedSchedule, startTimestamp: timestamp, maxinterval = 366): timestamp {
		// Для поиска от startTimestamp, передаём день перед startTimestamp
		const beforeStart = DateTime.getBeginDayTimestamp(startTimestamp) - 86400
		// maxIterations для nextAfter - это лимит итераций алгоритма, не дней
		// Увеличиваем лимит для сложных случаев
		const nextMatch = this.nextAfter(schedule, startTimestamp, beforeStart, maxinterval * 2)

		if (nextMatch === null) {
			return 0 as timestamp
		}

		// Проверяем, что найденное совпадение в пределах maxinterval дней от startTimestamp
		const maxTimestamp = DateTime.getBeginDayTimestamp(startTimestamp) + maxinterval * 86400
		if (nextMatch >= maxTimestamp) {
			return 0 as timestamp
		}

		return nextMatch
	}

	/**
	 * Валидирует строку шаблона расписания
	 * @param scheduleString - строка для проверки
	 * @returns true если шаблон корректен
	 */
	static validate(scheduleString: string = ''): boolean {
		return ZCron.validateDetailed(scheduleString).ok
	}

	// =============================================================================
	// Новое API - методы для работы со скомпилированными расписаниями
	// =============================================================================

	/**
	 * Компилирует строку расписания в структуру для быстрого повторного использования.
	 * Разбирает строки формата:
	 * - "" (пустая) - неповторяемое событие
	 * - "/N" - относительное расписание (каждые N дней)
	 * - "D M W" - абсолютное расписание (день месяц день_недели)
	 * @param scheduleString - строка с шаблоном расписания
	 * @returns скомпилированное расписание (AbsoluteSchedule, RelativeSchedule или EmptySchedule)
	 */
	static parse(scheduleString: string): ParsedSchedule {
		const trimmed = scheduleString.trim()

		if (trimmed === '') {
			return { mode: 'empty' }
		}

		if (trimmed[0] === '/') {
			return RelativeScheduleHandler.parse(trimmed.substring(1))
		}

		const [d = '*', m = '*', w = '*'] = trimmed.split(/\s+/, 3)

		return AbsoluteScheduleHandler.parse(d, m, w)
	}

	/**
	 * Проверяет, соответствует ли дата скомпилированному расписанию.
	 * @param schedule - скомпилированное расписание
	 * @param startTimestamp - начальная дата (для относительных расписаний)
	 * @param ts - проверяемая дата
	 * @returns true если дата соответствует расписанию
	 */
	static match(schedule: ParsedSchedule, startTimestamp: timestamp, ts: timestamp): boolean {
		switch (schedule.mode) {
			case 'empty':
				return false

			case 'relative':
				return RelativeScheduleHandler.match(schedule, startTimestamp, ts)

			case 'absolute':
				return AbsoluteScheduleHandler.match(schedule, ts)
		}
	}

	/**
	 * Gets compiled schedule from cache or compiles and caches it.
	 */
	static parseWithCache(scheduleString: string): ParsedSchedule {
		const trimmed = scheduleString.trim()
		const cached = this.parseCache.get(trimmed)
		if (cached) return cached

		const parsed = this.parse(trimmed)
		this.parseCache.set(trimmed, parsed)
		return parsed
	}

	/** Clears compiled schedule cache */
	static clearCache(): void {
		this.parseCache.clear()
	}

	// =============================================================================
	// Оптимизированные методы поиска следующего срабатывания
	// =============================================================================

	/**
	 * Находит следующее срабатывание расписания после указанного timestamp.
	 * Оптимизированная версия без линейного перебора дней.
	 *
	 * @param schedule - скомпилированное расписание
	 * @param startTimestamp - начальная дата события (для относительных расписаний)
	 * @param afterTimestamp - искать срабатывание строго после этой даты
	 * @param maxIterations - максимальное количество итераций (защита от бесконечного цикла)
	 * @returns timestamp следующего срабатывания или null если не найдено
	 */
	static nextAfter(
		schedule: ParsedSchedule,
		startTimestamp: timestamp,
		afterTimestamp: timestamp,
		maxIterations = 1000
	): timestamp | null {
		switch (schedule.mode) {
			case 'empty':
				return null

			case 'relative':
				return RelativeScheduleHandler.nextAfter(schedule, startTimestamp, afterTimestamp)

			case 'absolute':
				return AbsoluteScheduleHandler.nextAfter(schedule, startTimestamp, afterTimestamp, maxIterations)
		}
	}

	/**
	 * Упрощённый метод для поиска следующего срабатывания по строке расписания.
	 * @param scheduleString - строка расписания
	 * @param startTimestamp - начальная дата события
	 * @param afterTimestamp - искать после этой даты
	 * @returns timestamp следующего срабатывания или null
	 */
	static nextAfterString(
		scheduleString: string,
		startTimestamp: timestamp,
		afterTimestamp: timestamp
	): timestamp | null {
		const schedule = this.parseWithCache(scheduleString)
		return this.nextAfter(schedule, startTimestamp, afterTimestamp)
	}

	/**
	 * Находит предыдущее срабатывание расписания до указанного timestamp.
	 * Оптимизированная версия без линейного перебора дней.
	 *
	 * @param schedule - скомпилированное расписание
	 * @param startTimestamp - начальная дата события (для относительных расписаний)
	 * @param beforeTimestamp - искать срабатывание строго до этой даты
	 * @param maxIterations - максимальное количество итераций (защита от бесконечного цикла)
	 * @returns timestamp предыдущего срабатывания или null если не найдено
	 */
	static prevBefore(
		schedule: ParsedSchedule,
		startTimestamp: timestamp,
		beforeTimestamp: timestamp,
		maxIterations = 1000
	): timestamp | null {
		switch (schedule.mode) {
			case 'empty':
				return null

			case 'relative':
				return RelativeScheduleHandler.prevBefore(schedule, startTimestamp, beforeTimestamp)

			case 'absolute':
				return AbsoluteScheduleHandler.prevBefore(schedule, startTimestamp, beforeTimestamp, maxIterations)
		}
	}

	/**
	 * Упрощённый метод для поиска предыдущего срабатывания по строке расписания.
	 * @param scheduleString - строка расписания
	 * @param startTimestamp - начальная дата события
	 * @param beforeTimestamp - искать до этой даты
	 * @returns timestamp предыдущего срабатывания или null
	 */
	static prevBeforeString(
		scheduleString: string,
		startTimestamp: timestamp,
		beforeTimestamp: timestamp
	): timestamp | null {
		const schedule = this.parseWithCache(scheduleString)
		return this.prevBefore(schedule, startTimestamp, beforeTimestamp)
	}

	/**
	 * Validates schedule string with detailed error diagnostics.
	 */
	static validateDetailed(scheduleString: string): ValidationResult {
		const trimmed = scheduleString.trim()

		if (trimmed === '') {
			return { ok: true }
		}

		if (trimmed[0] === '/') {
			return RelativeScheduleHandler.validate(trimmed.substring(1))
		}

		const arr = trimmed.split(/\s+/)
		if (arr.length > 3) {
			return {
				ok: false,
				error: {
					field: 'general',
					token: trimmed,
					message: 'Expected at most 3 fields: days months weekdays'
				}
			}
		}

		const [d, m = '*', w = '*'] = arr
		return AbsoluteScheduleHandler.validate(d, m, w)
	}
}
