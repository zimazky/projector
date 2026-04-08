import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import ZCron from 'src/7-shared/libs/ZCron/ZCron'

import type { DocumentId } from 'src/6-entities/Document/model/DocumentTabsStore.types'
import { EventDto } from './EventDto'
import { IEventModel, RepeatableEventModel, SingleEventModel } from './EventModel'

/** Расширенный EventDto с метаданными документа (для агрегированных данных) */
type ExtendedEventDto = EventDto & {
	documentId?: DocumentId
	documentColor?: string
}

/** Функция преобразования данных EventDto из внешнего хранилища, в структуру IEventModel */
export function eventDtoToIEventModel(e: EventDto): IEventModel {
	const ext = e as ExtendedEventDto
	const start = DateTime.YYYYMMDDToTimestamp(ext.start)
	const time = ext.time ? DateTime.HMMToSeconds(ext.time) : null
	const duration = ext.duration ? DateTime.DdHMMToSeconds(ext.duration) : 0

	if (ext.repeat) {
		return {
			name: ext.name,
			comment: ext.comment ?? '',
			project: ext.project ?? '',
			repeat: ext.repeat,
			// Находим первое совпадение расписания от даты начала (start - 1 день для nextAfter)
			start: ZCron.nextAfterString(ext.repeat, start, start - 86400) ?? start,
			time,
			duration,
			end: ext.end ? DateTime.YYYYMMDDToTimestamp(ext.end) : 0,
			credit: ext.credit ? +ext.credit : 0,
			debit: ext.debit ? +ext.debit : 0,
			documentId: ext.documentId,
			documentColor: ext.documentColor
		}
	}

	const startdatetime = time !== null ? start + time : start
	// end = начало следующего дня от окончания события
	const end = duration
		? DateTime.getBeginDayTimestamp(startdatetime + duration + 86399)
		: ext.end
			? DateTime.YYYYMMDDToTimestamp(ext.end)
			: start + 86400

	return {
		name: ext.name,
		comment: ext.comment ?? '',
		project: ext.project ?? '',
		start,
		time,
		duration,
		end,
		credit: ext.credit ? +ext.credit : 0,
		debit: ext.debit ? +ext.debit : 0,
		documentId: ext.documentId,
		documentColor: ext.documentColor
	}
}

/** Функция преобразования одиночного события в формат EventDto для сохранения во внешнем хранилище */
export function singleEventModelToEventDto(e: SingleEventModel): EventDto {
	const raw: EventDto = { name: e.name, start: DateTime.getYYYYMMDD(e.start) }
	if (e.comment) raw.comment = e.comment
	if (e.project) raw.project = e.project
	if (e.time !== null) raw.time = DateTime.secondsToHMM(e.time)
	if (e.duration) raw.duration = DateTime.secondsToDdHMM(e.duration)
	else if (e.end && e.end - e.start !== 86400) raw.end = DateTime.getYYYYMMDD(e.end)
	if (e.credit) raw.credit = e.credit
	if (e.debit) raw.debit = e.debit
	// documentId и documentColor НЕ сохраняются во внешнее хранилище
	return raw
}

/** Функция преобразования повторяемого события в формат EventDto для сохранения во внешнем хранилище */
export function repeatableEventModelToEventDto(e: RepeatableEventModel): EventDto {
	const raw: EventDto = { name: e.name, start: DateTime.getYYYYMMDD(e.start) }
	if (e.comment) raw.comment = e.comment
	if (e.project) raw.project = e.project
	if (e.time !== null) raw.time = DateTime.secondsToHMM(e.time)
	raw.repeat = e.repeat
	if (e.duration) raw.duration = DateTime.secondsToDdHMM(e.duration)
	if (e.end) raw.end = DateTime.getYYYYMMDD(e.end)
	if (e.credit) raw.credit = e.credit
	if (e.debit) raw.debit = e.debit
	// documentId и documentColor НЕ сохраняются во внешнее хранилище
	return raw
}
