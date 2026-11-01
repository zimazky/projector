import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import { OccurrenceIdentity, occurrenceEventUid } from '../Events/EventIdentity'

import { RepeatableEventModel, SingleEventModel } from 'src/6-entities/Events/EventModel'
import type { DocumentId } from 'src/6-entities/Document/model/DocumentTabsStore.types'

/** Компактная структура события, предназначенная для кэширования и быстрого рендеринга */
export type EventCacheStructure = {
	/** идентификатор */
	id: number
	eventUid?: string
	seriesUid?: string
	occurrence?: OccurrenceIdentity
	occurrenceKey?: string
	/** наименование */
	name: string
	/** цвет фона */
	background: string
	/** цвет текста */
	color: string
	/** начальная дата события / текущая дата для повторяемых событий (unixtime) */
	start: timestamp
	/** время события в секундах с начала дня */
	time: number | null
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
	/** ID документа-источника (для общего календаря) */
	sourceDocumentId?: DocumentId
}

///////////////////////////////////////////////////////////////////////////////
// Функции преобразование типов

/**
 * Функция преобразования одиночного события в компактное представление для отображения и кэширования.
 * Многодневные события представлены отдельными событиями на каждый день.
 */
export function singleEventToEventCache(
	e: SingleEventModel,
	currentDate: timestamp,
	completed: boolean,
	color: string,
	background: string
): EventCacheStructure {
	const c: EventCacheStructure = {
		...(e.eventUid ? { eventUid: e.eventUid } : {}),
		...(e.occurrence ? { occurrence: { ...e.occurrence }, occurrenceKey: occurrenceEventUid(e.occurrence) } : {}),
		id: e.id,
		name: e.name,
		background: background,
		color: color,
		start: e.start,
		time: e.time,
		end: e.end,
		days: Math.ceil((e.end - currentDate) / 86400),
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
export function repeatableEventToEventCache(
	e: RepeatableEventModel,
	currentDate: timestamp,
	completed: boolean,
	color: string,
	background: string
): EventCacheStructure {
	const c: EventCacheStructure = {
		...(e.seriesUid
			? {
					eventUid: e.eventUid,
					seriesUid: e.seriesUid,
					occurrence: { seriesUid: e.seriesUid, occurrenceDate: DateTime.getYYYYMMDD(currentDate) },
					occurrenceKey: occurrenceEventUid({
						seriesUid: e.seriesUid,
						occurrenceDate: DateTime.getYYYYMMDD(currentDate)
					})
				}
			: {}),
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
