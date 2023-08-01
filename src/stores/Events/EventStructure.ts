import DateTime, { timestamp } from "src/utils/DateTime"
import { EventData } from "./EventData"
import ZCron from "src/utils/ZCron"

/** Базовый интерфейс структуры события, общий для одиночных и повторяемых событий */
export interface IEventStructure {
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

/** Структура одиночного события для хранения в классе хранилища */
export type SingleEventStructure = {
  /** Идентификатор события */
  id: number
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

  /** Индекс записи проекта */
  projectId: number
  /** Длительность события в днях */
  days: number
}

/** Структура повторяемого события для хранения в классе хранилища */
export type RepeatableEventStructure = {
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

///////////////////////////////////////////////////////////////////////////////
// Функции преобразования типов

/** Функция преобразования данных EventData из внешнего хранилища, в структуру IEvent */
export function eventDataToIEventStructure(e: EventData): IEventStructure {
  const start = DateTime.YYYYMMDDToTimestamp(e.start)
  const time = e.time? DateTime.HMMToSeconds(e.time) : null
  const duration = e.duration? DateTime.DdHMMToSeconds(e.duration) : 0

  if(e.repeat) {
    return {
      name: e.name,
      comment: e.comment ?? '',
      project: e.project ?? '',
      repeat: e.repeat,
      start: ZCron.first(e.repeat,start),
      time, duration,
      end: e.end? DateTime.YYYYMMDDToTimestamp(e.end) : 0,
      credit: e.credit? +e.credit : 0, debit: e.debit? +e.debit : 0
    }
  }

  const startdatetime = time!==null? start + time : start
  // end = начало следующего дня от окончания события  
  const end = duration? DateTime.getBeginDayTimestamp(startdatetime+duration+86399) : 
    e.end? DateTime.YYYYMMDDToTimestamp(e.end) : start+86400

  return { 
    name: e.name, comment: e.comment ?? '', project: e.project ?? '',
    start, time, duration, end, credit: e.credit?+e.credit:0, debit: e.debit?+e.debit:0
  }
}

/** Функция преобразования одиночного события в формат EventData для сохранения во внешнем хранилище */
export function singleEventStructureToEventData(e: SingleEventStructure): EventData {
  const raw: EventData = {name: e.name, start: DateTime.getYYYYMMDD(e.start)}
  if(e.comment) raw.comment = e.comment
  if(e.project) raw.project = e.project
  if(e.time!==null) raw.time = DateTime.secondsToHMM(e.time)
  if(e.duration) raw.duration = DateTime.secondsToDdHMM(e.duration)
  else if(e.end && (e.end-e.start)!==86400) raw.end = DateTime.getYYYYMMDD(e.end)
  if(e.credit) raw.credit = e.credit
  if(e.debit) raw.debit = e.debit
  return raw
}

/** Функция преобразования повторяемого события в формат EventData для сохранения во внешнем хранилище */
export function repeatableEventStructureToEventData(e: RepeatableEventStructure): EventData {
  const raw: EventData = {name: e.name, start: DateTime.getYYYYMMDD(e.start)}
  if(e.comment) raw.comment = e.comment
  if(e.project) raw.project = e.project
  if(e.time!==null) raw.time = DateTime.secondsToHMM(e.time)
  raw.repeat = e.repeat
  if(e.duration) raw.duration = DateTime.secondsToDdHMM(e.duration)
  if(e.end) raw.end = DateTime.getYYYYMMDD(e.end)
  if(e.credit) raw.credit = e.credit
  if(e.debit) raw.debit = e.debit
  return raw
}