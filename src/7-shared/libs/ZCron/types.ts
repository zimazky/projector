// =============================================================================
// Типы данных для библиотеки ZCron
// =============================================================================

/** Режим расписания: абсолютный (cron), относительный (/d) или пустой */
export type ScheduleMode = 'absolute' | 'relative' | 'empty'

/** Скомпилированное абсолютное расписание (cron-подобное) */
export interface AbsoluteSchedule {
	mode: 'absolute'
	/** Дни месяца (1-31), отсортированы, без дубликатов */
	days: number[]
	/** Месяцы (1-12), отсортированы, без дубликатов */
	months: number[]
	/** Дни недели (0-6), отсортированы, без дубликатов */
	weekdays: number[]
}

/** Скомпилированное относительное расписание (/d) */
export interface RelativeSchedule {
	mode: 'relative'
	/** Интервал в днях от startTimestamp */
	intervalDays: number
}

/** Пустое расписание (неповторяемое событие) */
export interface EmptySchedule {
	mode: 'empty'
}

/** Скомпилированное расписание */
export type ParsedSchedule = AbsoluteSchedule | RelativeSchedule | EmptySchedule

/** Поле расписания для валидации */
export type ScheduleField = 'days' | 'months' | 'weekdays' | 'general'

/** Ошибка валидации */
export interface ValidationError {
	/** Поле, в котором найдена ошибка */
	field: ScheduleField
	/** Токен, вызвавший ошибку */
	token: string
	/** Сообщение об ошибке для пользователя */
	message: string
}

/** Результат детальной валидации */
export interface ValidationResult {
	ok: boolean
	error?: ValidationError
}
