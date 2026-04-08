import { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import type { DocumentId } from 'src/6-entities/Document/model/DocumentTabsStore.types'

/** Модель одиночного события для хранения в классе хранилища */
export type SingleEventModel = {
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
	
	/** ID документа-источника (для общего календаря) */
	documentId?: DocumentId
	/** Цвет документа-источника (для общего календаря) */
	documentColor?: string
}
