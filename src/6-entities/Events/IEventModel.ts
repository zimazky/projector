import { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

/** Базовый интерфейс модели события, общий для одиночных и повторяемых событий */
export interface IEventModel {
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
