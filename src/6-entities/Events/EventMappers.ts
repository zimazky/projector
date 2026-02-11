import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import ZCron from 'src/7-shared/libs/ZCron/ZCron'

import { EventDto } from './EventDto'
import { IEventModel, RepeatableEventModel, SingleEventModel } from './EventModel'

/** Функция преобразования данных EventDto из внешнего хранилища, в структуру IEventModel */
export function eventDtoToIEventModel(e: EventDto): IEventModel {
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

/** Функция преобразования одиночного события в формат EventDto для сохранения во внешнем хранилище */
export function singleEventModelToEventDto(e: SingleEventModel): EventDto {
  const raw: EventDto = {name: e.name, start: DateTime.getYYYYMMDD(e.start)}
  if(e.comment) raw.comment = e.comment
  if(e.project) raw.project = e.project
  if(e.time!==null) raw.time = DateTime.secondsToHMM(e.time)
  if(e.duration) raw.duration = DateTime.secondsToDdHMM(e.duration)
  else if(e.end && (e.end-e.start)!==86400) raw.end = DateTime.getYYYYMMDD(e.end)
  if(e.credit) raw.credit = e.credit
  if(e.debit) raw.debit = e.debit
  return raw
}

/** Функция преобразования повторяемого события в формат EventDto для сохранения во внешнем хранилище */
export function repeatableEventModelToEventDto(e: RepeatableEventModel): EventDto {
  const raw: EventDto = {name: e.name, start: DateTime.getYYYYMMDD(e.start)}
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
