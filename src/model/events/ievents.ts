import { timestamp } from "src/utils/datetime"

/** Базовый интерфейс одиночного события*/
export interface ISingleEvent {
  /** Наименование */
  name: string
  /** Комментарий */
  comment: string
  /** Наименование проекта */
  project: string
  /** Дата события, указывает на начало дня по местному времени */
  start: timestamp
  /** Время начала события, количество секунд с начала дня. null - неопределено */
  time: number | null
  /** Длительность события в секундах. 0 - неопределено. Если определено, end = начало_след_дня(start + time + duration) */
  duration: number
  /** Дата завершения. Игнорируется, если задана длительность. 0 - неопределено */
  end: timestamp
  /** Поступление средств на счет */
  credit: number
  /** Списание средств со счета */
  debit: number
}

/** Базовый интерфейс повторяемого события */
export interface IRepeatableEvent {
  /** Наименование */
  name: string
  /** Шаблон расписания в формате zcron "D M W" */
  repeat: string
  /** Комментарий */
  comment: string
  /** Наименование проекта */
  project: string
  /** Дата начала расписания, указывает на начало дня по местному времени */
  start: timestamp
  /** Время начала события, количество секунд с начала дня, null-неопределен */
  time: number | null
  /** Длительность события в секундах. Игнорируется, если событие выходит за пределы дня. */
  duration: number
  /** Дата завершения действия расписания. 0 - неопределено */
  end: timestamp
  /** Поступление средств на счет */
  credit: number
  /** Списание средств со счета */
  debit: number
}

/** Базовый интерфейс события */
export interface IEvent {
  name: string
  repeat?: string
  comment: string
  project: string
  start: timestamp
  time: number | null
  duration: number
  end: timestamp
  credit: number
  debit: number
}