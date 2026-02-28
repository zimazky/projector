import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

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
// Типы данных
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
  static addSequence(array: number[], str: string, max: number=31, from: number=1): number[] {
    const [a, b=null] = str.split('-',2)
    if(b === null) {
      const [a, b = null] = str.split('/',2)
      if(a === '' || b === '') return array
      const start = (a === '*') ? from : +a
      let inc = +(b ?? 0)
      if(isNaN(start) || isNaN(inc)) return array
      if(b===null && a!=='*') return array.push(+a), array
      if(inc === 0) inc = 1
      for(let i=start; i<=max; i+=inc) array.push(i)
      return array
    }
    if(a === '' || b === '') return array
    for(let i=+a;i<=+b;i++) array.push(i)
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
   * Проверяет, срабатывает ли шаблон расписания в указанном интервале дат
   * @param scheduleString - строка с шаблоном расписания
   * @param startTimestamp - начальная дата
   * @param begin - начало интервала
   * @param end - конец интервала
   * @returns true если есть совпадение в интервале
   */
  static ariseInInterval(scheduleString:string, startTimestamp: timestamp, begin: timestamp, end: timestamp): boolean {
    for(var t=begin;t<end;t+=86400) {
      if(this.isMatch(scheduleString, startTimestamp, t)) return true
    }
    return false
  }

  /** 
   * Находит первое совпадение шаблона в указанном интервале
   * @returns timestamp первого совпадения или 0 если не найдено
   */
  static firstInInterval(scheduleString:string, startTimestamp: timestamp, begin: timestamp, end: timestamp) {
    for(var t=begin;t<end;t+=86400) {
      if(this.isMatch(scheduleString, startTimestamp, t)) return t
    }
    return 0
  }

  /** 
   * Находит первое совпадение шаблона начиная с startTimestamp
   * @param maxinterval - максимальное количество дней для поиска
   * @returns timestamp первого совпадения или 0 если не найдено
   */
  static first(scheduleString:string, startTimestamp: timestamp, maxinterval = 366) {
    for(let i=0, t=startTimestamp; i<maxinterval; t+=86400, i++) {
      if(this.isMatch(scheduleString, startTimestamp, t)) return t
    }
    return 0
  }

  /** 
   * Валидирует строку шаблона расписания
   * @param scheduleString - строка для проверки
   * @returns true если шаблон корректен
   */
  static validate(scheduleString: string = ''): boolean {
    return this.validateDetailed(scheduleString).ok
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
      const intervalDays = parseInt(trimmed.substring(1), 10)
      return { mode: 'relative', intervalDays }
    }

    const [d = '*', m = '*', w = '*'] = trimmed.split(/\s+/, 3)

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
   * Parses schedule field into array of numbers with normalization.
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
   * Parses a single token into array of numbers.
   */
  private static parseToken(token: string, min: number, max: number, result: number[]): void {
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

    const singleMatch = token.match(/^\d+$/)
    if (singleMatch) {
      const value = parseInt(token, 10)
      if (value >= min && value <= max) {
        result.push(value)
      }
      return
    }

    if (token === '*') {
      for (let i = min; i <= max; i++) {
        result.push(i)
      }
    }
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
        const diff = DateTime.getDifferenceInDays(startTimestamp, ts)
        if (diff < 0) return false
        return diff % schedule.intervalDays === 0

      case 'absolute':
        const { day, month, weekday } = DateTime.getDayMonthWeekday(ts)
        return schedule.months.includes(month + 1)
            && schedule.days.includes(day)
            && schedule.weekdays.includes(weekday)
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

  /**
   * Validates schedule string with detailed error diagnostics.
   */
  static validateDetailed(scheduleString: string): ValidationResult {
    const trimmed = scheduleString.trim()

    if (trimmed === '') {
      return { ok: true }
    }

    if (trimmed[0] === '/') {
      return this.validateRelativeSchedule(trimmed.substring(1))
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

    const daysResult = this.validateFieldDetailed(d, 'days', 1, 31)
    if (!daysResult.ok) return daysResult

    const monthsResult = this.validateFieldDetailed(m, 'months', 1, 12)
    if (!monthsResult.ok) return monthsResult

    const weekdaysResult = this.validateFieldDetailed(w, 'weekdays', 0, 6)
    if (!weekdaysResult.ok) return weekdaysResult

    return { ok: true }
  }

  private static validateRelativeSchedule(s: string): ValidationResult {
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

  private static validateFieldDetailed(
    s: string,
    fieldName: ScheduleField,
    min: number,
    max: number
  ): ValidationResult {
    if (s === '*') return { ok: true }

    const tokens = s.split(',')

    for (const token of tokens) {
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
}

/** 
 * Проверка целого значения n в строке по диапазону значений (n>=min, n<=max) и возврат числа
 * Возвращает кортеж из двух значений
 * 1. true если в строке целое число и оно принадлежит диапазону, false в противном случае
 * 2. целое число или NaN если в строке не целое число
 */
function testIntegerInString(s: string, min = 0, max = 0): [boolean, number] {
  if(!/^\d+$/.test(s)) return [false, NaN]
  const n: number = +s
  if(n < min) return [false, n]
  if(max > 0 && n > max) return [false, n]
  return [true, n]
}

/**  
 * Проверка целого значения n в строке по диапазону значений (n>=min, n<=max)
 * Возвращает true если в строке целое число и оно принадлежит диапазону, false в противном случае
 */
function testInt(s: string, min = 0, max = 0): boolean {
  if(!/^\d+$/.test(s)) return false
  const n: number = +s
  if(n < min) return false
  if(max > 0 && n > max) return false
  return true
}

/**
 * Проверка части шаблона, отвечающей дням месяца
 */
function validateDaysPattern(s: string): boolean {
  if(s === '*') return true
  if(s[0] === '/') { // '/3213'
    if(!testInt(s.substring(1), 1)) return false
    return true
  }

  // '3/4,20,25,27-31'
  const p = s.split(',')
  return p.every(s=>{
    // '2/180', '*/24'
    const ds = s.split('/')
    if(ds.length === 2) {
      const [m1, m2] = ds
      if(!testInt(m2, 1)) return false
      if(m1 !== '*' && !testInt(m1, 1, 31)) return false
      return true
    }

    const d = s.split('-')
    if(d.length > 2) return false
    if(d.length === 2) {    // '20-31'
      const [m1, m2] = d
      if(!testInt(m2, 1, 31)) return false
      if(!testInt(m1, 1, 31)) return false
      return true
    }
    // 24
    return testInt(d[0], 1, 31)
  })
}

/**
 * Проверка части шаблона, отвечающей месяцам
 */
function validateMonthsPattern(s: string): boolean {
  if(s === '*') return true
  // '2/5,1,3,7-10'
  const p = s.split(',')
  return p.every(s=>{
    // '2/2', '*/5'
    const ds = s.split('/')
    if(ds.length === 2) {
      const [m1, m2] = ds
      if(!testInt(m2, 1)) return false
      if(m1 !== '*' && !testInt(m1, 1, 12)) return false
      return true
    }
    const d = s.split('-')
    if(d.length > 2) return false
    if(d.length === 2) {    // '7-10'
      const [m1, m2] = d
      if(!testInt(m2, 1, 12)) return false
      if(!testInt(m1, 1, 12)) return false
      return true
    }
    // 3
    return testInt(d[0], 1, 12)
  })
}

/**
 * Проверка части шаблона, отвечающей дням недели
 */
function validateWeekdaysPattern(s: string): boolean {
  if(s === '*') return true
  // '1,3-5,1/2'
  const p = s.split(',')
  return p.every(s=>{
    // '2/2', '*/5'
    const ds = s.split('/')
    if(ds.length === 2) {
      const [m1, m2] = ds
      if(!testInt(m2, 1)) return false
      if(m1 !== '*' && !testInt(m1, 0, 6)) return false
      return true
    }
    const d = s.split('-')
    if(d.length > 2) return false
    if(d.length === 2) {    // '3-5'
      const [m1, m2] = d
      if(!testInt(m2, 0, 6)) return false
      if(!testInt(m1, 0, 6)) return false
      return true
    }
    // 3
    return testInt(d[0], 0, 6)
  })
}
