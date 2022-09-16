import DateTime from "src/utils/datetime"
import { IEvent, IRepeatableEvent, ISingleEvent } from "./ievents"

/** Тип события, сохраняемого во внешнем хранилище */
export type rawEvent = {
  /** наименование события (обязательное поле) */
  name: string
  /** комментарий */
  comment?: string
  /** наименование проекта */
  project?: string
  /** строка шаблона zcrone для повторяемых событий*/
  repeat?: string
  /** дата события для одиночных / дата начала расписания для повторяемых событий ('YYYY.MM.DD') */
  start: string
  /** время начала события ('H:MM') */
  time?: string
  /** 
   * Длительность события для одиночных событий ('Dd H:MM').
   * Дата завершения события считается как end = начало_след_дня(start+time+duration).
   * Для повторяемых - событие не должно выходить за пределы дня, иначе игнорируется.
   * */
  duration?: string
  /** 
   * Дата завершения события для одиночных событий ('YYYY.MM.DD').
   * Событие длится до указанной даты, исключая саму дату. 
   * Указанная дата игнорируется, если задана длительность события duration.
   * Для повторяемых событий - конец расписания.
   * */
  end?: string
  /** поступление на счет */
  credit?: number
  /** списание со счета */
  debit?: number
}

/** Функция преобразования сырых данных (rawEvent) из хранилища, в структуру baseEvent */
export function rawToEvent(e: rawEvent): IEvent {

  const start = DateTime.YYYYMMDDToTimestamp(e.start)
  const time = e.time? DateTime.HMMToSeconds(e.time) : null
  const duration = e.duration? DateTime.DdHMMToSeconds(e.duration) : 0

  if(e.repeat) {
    return {
      name: e.name,
      comment: e.comment ?? '',
      project: e.project ?? '',
      repeat: e.repeat,
      start, time, duration,
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

/** Функция преобразования одиночного события в формат rawEvent для сохранения в хранилище */
export function singleEventToRaw(e: ISingleEvent): rawEvent {
  const raw: rawEvent = {name: e.name, start: DateTime.getYYYYMMDD(e.start)}
  if(e.comment) raw.comment = e.comment
  if(e.project) raw.project = e.project
  if(e.time!==null) raw.time = DateTime.secondsToHMM(e.time)
  if(e.duration) raw.duration = DateTime.secondsToDdHMM(e.duration)
  else if(e.end && (e.end-e.start)!==86400) raw.end = DateTime.getYYYYMMDD(e.end)
  if(e.credit) raw.credit = e.credit
  if(e.debit) raw.debit = e.debit
  return raw
}

/** Функция преобразования повторяемого события в формат rawEvent для сохранения в хранилище */
export function repeatableEventToRaw(e: IRepeatableEvent): rawEvent {
  const raw: rawEvent = {name: e.name, start: DateTime.getYYYYMMDD(e.start)}
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
