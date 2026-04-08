import { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

import { EventsStore } from 'src/6-entities/Events/EventsStore'
import { EventDto } from 'src/6-entities/Events/EventDto'
import { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'
import { AggregatedEventResolver } from 'src/6-entities/Document/model/AggregatedEventResolver'

/**
 * Обёртка над EventsStore для обработки событий из агрегированного документа.
 * Перехватывает операции с составными ID и направляет их в правильный документ.
 * 
 * Когда пользователь работает с общим календарём (виртуальным документом),
 * события имеют составной ID вида "docPrefix_hash". Эта обёртка автоматически:
 * 1. Определяет документ-источник по ID
 * 2. Активирует исходный документ
 * 3. Выполняет операцию в оригинальном документе
 */
export class EventsStoreWithAggregation {
	constructor(
		private eventsStore: EventsStore,
		private documentTabsStore: DocumentTabsStore
	) {}

	/**
	 * Обновить событие с обработкой составных ID.
	 * Если событие из агрегированного документа — активирует исходный документ.
	 */
	updateEvent(id: number | string, e: EventDto) {
		const parsed = this.parseAndResolve(id)
		
		if (parsed) {
			// Это событие из агрегированного документа
			this.documentTabsStore.activateDocument(parsed.documentId)
			
			// Обновляем событие в оригинальном документе
			// ID остаётся составным — EventsStore разберётся
			this.eventsStore.updateEvent(Number(parsed.originalId), e)
			return
		}

		// Обычное событие — обновляем как обычно
		this.eventsStore.updateEvent(typeof id === 'string' ? parseInt(id, 10) : id, e)
	}

	/**
	 * Удалить событие с обработкой составных ID.
	 */
	deleteEvent(id: number | string | null, isFinal: boolean = true) {
		if (id === null) {
			this.eventsStore.deleteEvent(id, isFinal)
			return
		}

		const parsed = this.parseAndResolve(id)
		
		if (parsed) {
			this.documentTabsStore.activateDocument(parsed.documentId)
			this.eventsStore.deleteEvent(Number(parsed.originalId), isFinal)
			return
		}

		this.eventsStore.deleteEvent(typeof id === 'string' ? parseInt(id, 10) : id, isFinal)
	}

	/**
	 * Завершить событие с обработкой составных ID.
	 */
	completeEvent(id: number | string | null, currentdate: timestamp, e: EventDto) {
		if (id === null) {
			this.eventsStore.completeEvent(id, currentdate, e)
			return
		}

		const parsed = this.parseAndResolve(id)
		
		if (parsed) {
			this.documentTabsStore.activateDocument(parsed.documentId)
			this.eventsStore.completeEvent(Number(parsed.originalId), currentdate, e)
			return
		}

		this.eventsStore.completeEvent(typeof id === 'string' ? parseInt(id, 10) : id, currentdate, e)
	}

	/**
	 * Отменить завершение события с обработкой составных ID.
	 */
	uncompleteEvent(id: number | string | null, raw: EventDto) {
		if (id === null) {
			this.eventsStore.uncompleteEvent(id, raw)
			return
		}

		const parsed = this.parseAndResolve(id)
		
		if (parsed) {
			this.documentTabsStore.activateDocument(parsed.documentId)
			this.eventsStore.uncompleteEvent(Number(parsed.originalId), raw)
			return
		}

		this.eventsStore.uncompleteEvent(typeof id === 'string' ? parseInt(id, 10) : id, raw)
	}

	/**
	 * Сдвинуть событие с обработкой составных ID.
	 */
	shiftToDate(id: number | string, todate: timestamp, currentdate: timestamp) {
		const parsed = this.parseAndResolve(id)
		
		if (parsed) {
			this.documentTabsStore.activateDocument(parsed.documentId)
			this.eventsStore.shiftToDate(Number(parsed.originalId), todate, currentdate)
			return
		}

		this.eventsStore.shiftToDate(typeof id === 'string' ? parseInt(id, 10) : id, todate, currentdate)
	}

	/**
	 * Копировать событие с обработкой составных ID.
	 */
	copyToDate(id: number | string, todate: timestamp) {
		const parsed = this.parseAndResolve(id)
		
		if (parsed) {
			this.documentTabsStore.activateDocument(parsed.documentId)
			this.eventsStore.copyToDate(Number(parsed.originalId), todate)
			return
		}

		this.eventsStore.copyToDate(typeof id === 'string' ? parseInt(id, 10) : id, todate)
	}

	/**
	 * Превращение повторяемого события в одиночное.
	 */
	saveAsSingleEvent(id: number | string, currentdate: timestamp, e: EventDto) {
		const parsed = this.parseAndResolve(id)
		
		if (parsed) {
			this.documentTabsStore.activateDocument(parsed.documentId)
			this.eventsStore.saveAsSingleEvent(Number(parsed.originalId), currentdate, e)
			return
		}

		this.eventsStore.saveAsSingleEvent(typeof id === 'string' ? parseInt(id, 10) : id, currentdate, e)
	}

	/**
	 * Удалить текущее повторяемое событие.
	 */
	deleteCurrentRepeatableEvent(id: number | string | null, currentdate: timestamp) {
		if (id === null) {
			this.eventsStore.deleteCurrentRepeatableEvent(id, currentdate)
			return
		}

		const parsed = this.parseAndResolve(id)
		
		if (parsed) {
			this.documentTabsStore.activateDocument(parsed.documentId)
			this.eventsStore.deleteCurrentRepeatableEvent(Number(parsed.originalId), currentdate)
			return
		}

		this.eventsStore.deleteCurrentRepeatableEvent(typeof id === 'string' ? parseInt(id, 10) : id, currentdate)
	}

	/**
	 * Прокси для геттеров.
	 */
	get completed() {
		return this.eventsStore.completed
	}

	get planned() {
		return this.eventsStore.planned
	}

	get plannedRepeatable() {
		return this.eventsStore.plannedRepeatable
	}

	/**
	 * Прокси для onChangeList.
	 */
	set onChangeList(fn: () => void) {
		this.eventsStore.onChangeList = fn
	}

	get onChangeList() {
		return this.eventsStore.onChangeList
	}

	/**
	 * Распарсить составной ID и найти документ-источник.
	 * @returns объект с documentId и originalId, или null если это обычное событие
	 */
	private parseAndResolve(id: number | string): {
		documentId: string
		originalId: string
	} | null {
		const parsed = AggregatedEventResolver.parseAggregatedId(id)
		if (!parsed) return null

		return {
			documentId: parsed.documentId,
			originalId: parsed.eventHash // Для агрегированных событий ID — это хеш
		}
	}
}
