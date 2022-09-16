import { timestamp } from "src/utils/datetime"
import { IRepeatableEvent, ISingleEvent } from "./ievents"

export type compact = {
  /** идентификатор */
  id: number
  /** наименование */
  name: string
  /** цвет фона */
  background: string
  /** цвет текста */
  color: string
  /** начальная дата события / текущая дата для повторяемых событий (unixtime) */
  start: timestamp
  /** время события в секундах с начала дня */
  time: number
  /** дата завершения события */
  end: timestamp
  /** длительность в днях, начиная с текущей даты / 1 для повторяемых событий */
  days: number
  /** поступление средств */
  credit: number
  /** списание средств */
  debit: number
  /** Признак завершенности события */
  completed: boolean
  /** Признак повторяемого события */
  repeatable: boolean
}

/** 
 * Функция преобразования одиночного события в компактное представление для отображения и кэширования. 
 * Многодневные события представлены отдельными событиями на каждый день.
 */
export function singleToCompact(e: ISingleEvent & {id: number}, currentDate: timestamp, completed: boolean, color: string, background: string): compact {
  const c: compact = {
    id: e.id,
    name: e.name,
    background: background,
    color: color,
    start: e.start,
    time: e.time,
    end: e.end,
    days: Math.ceil((e.end-currentDate)/86400),
    credit: e.credit,
    debit: e.debit,
    completed: completed,
    repeatable: false
  }
  return c
}

/** 
 * Функция преобразования повторяемого события в компактное представление для отображения и кэширования. 
 * Повторяемых событий нет, они представляются одиночными.
 */
export function repeatableToCompact(e: IRepeatableEvent & {id: number}, currentDate: timestamp, completed: boolean, color: string, background: string): compact {
  const c: compact = {
    id: e.id,
    name: e.name,
    background: background,
    color: color,
    start: currentDate,
    time: e.time,
    end: currentDate + 86400,
    days: 1,
    credit: e.credit,
    debit: e.debit,
    completed: completed,
    repeatable: true
  }
  return c
}

