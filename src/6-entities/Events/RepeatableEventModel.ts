import { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

/** Модель повторяемого события для хранения в классе хранилища */
export type RepeatableEventModel = {
  /** Идентификатор события */
  id: number
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

  /** Индекс записи проекта */
  projectId: number
}
