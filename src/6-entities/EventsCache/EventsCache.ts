import { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import ZCron from 'src/7-shared/libs/ZCron/ZCron'

import { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'
import { ProjectsStore } from 'src/3-pages/Projects/ProjectsStore'

import { EventCacheStructure, repeatableEventToEventCache, singleEventToEventCache } from './EventCacheStructure'

/**
 * Класс списка событий, кэширующий данные и представляющий данные для быстрого рендеринга.
 * Работает через DocumentTabsStore, получая сторы активного документа.
 */
export class EventsCache {
	/** Ссылка на менеджер документов */
	private documentTabsStore: DocumentTabsStore

	/** Кэш событий (хэш-таблица по временным меткам) */
	private cachedEvents: EventCacheStructure[][] = []
	/** Кэш фактического баланса (хэш-таблица по временным меткам) */
	private cachedActualBalance: number[] = []
	/** Кэш планируемого баланса (хэш-таблица по временным меткам) */
	private cachedPlannedBalance: number[] = []

	/** Фактический баланс на момент после всех завершенных событий */
	lastActualBalance = 0
	/** Временная метка последнего завершенного события */
	lastActualBalanceDate = 0
	/** Временная метка первого завершенного события */
	firstActualBalanceDate = 0

	constructor(documentTabsStore: DocumentTabsStore) {
		this.documentTabsStore = documentTabsStore
	}

	/**
	 * Инициализация кэша событий (очищение кэша и пересчёт баланса).
	 * Использует сторы активного документа.
	 */
	init() {
		this.cachedEvents = []
		this.cachedActualBalance = []
		this.cachedPlannedBalance = []

		// Проверяем что сторы существуют (могут быть ещё не созданы)
		const stores = this.documentTabsStore.getActiveDocumentStores()
		if (!stores || !stores.isInitialized) {
			this.lastActualBalance = 0
			this.lastActualBalanceDate = 0
			this.firstActualBalanceDate = 0
			return
		}

		// Вычисляем баланс из сторов активного документа
		this.lastActualBalance = stores.eventsStore.completed.reduce((balance, e) => balance + e.credit - e.debit, 0)
		this.lastActualBalanceDate = stores.eventsStore.completed.length
			? stores.eventsStore.completed[stores.eventsStore.completed.length - 1].start
			: 0
		this.firstActualBalanceDate = stores.eventsStore.completed.length ? stores.eventsStore.completed[0].start : 0
	}

	/**
	 * Получить список всех событий за день, отсортированных для отрисовки.
	 * Данные кэшируются.
	 * @param date - временная метка начала дня, unixtime
	 * @returns отсортированный список событий
	 */
	getEvents(date: timestamp): EventCacheStructure[] {
		if (this.cachedEvents[date] !== undefined) return this.cachedEvents[date]

		const stores = this.documentTabsStore.getActiveDocumentStores()
		if (!stores) return []

		const { eventsStore, projectsStore } = stores

		// Собираем события из активного документа
		const events: EventCacheStructure[] = eventsStore.planned.reduce((a, e) => {
			if (date < e.start || date >= e.end) return a
			const color = projectsStore.getById(e.projectId)?.color ?? ProjectsStore.defaultProject.color
			const background = projectsStore.getById(e.projectId)?.background ?? ProjectsStore.defaultProject.background
			a.push(singleEventToEventCache(e, date, false, color, background))
			return a
		}, [] as EventCacheStructure[])

		eventsStore.plannedRepeatable.reduce((a, e) => {
			if (date < e.start) return a
			if (e.end && date + (e.time === null ? 0 : e.time) >= e.end) return a
			if (ZCron.isMatch(e.repeat, e.start, date)) {
				const color = projectsStore.getById(e.projectId)?.color ?? ProjectsStore.defaultProject.color
				const background = projectsStore.getById(e.projectId)?.background ?? ProjectsStore.defaultProject.background
				a.push(repeatableEventToEventCache(e, date, false, color, background))
			}
			return a
		}, events)

		eventsStore.completed.reduce((a, e) => {
			if (date >= e.start && date < e.end) {
				const color = projectsStore.getById(e.projectId)?.color ?? ProjectsStore.defaultProject.color
				const background = projectsStore.getById(e.projectId)?.background ?? ProjectsStore.defaultProject.background
				a.push(singleEventToEventCache(e, date, true, color, background))
			}
			return a
		}, events)

		// Сортировка для отрисовки
		events.sort((a, b) => {
			// сначала с более ранней датой начала start (многодневные наверху)
			// при одинаковой дате начала, первыми будут с наибольшей длительностью end-start
			// при одинаковой длительности, по времени события time
			var d = a.start - b.start
			if (d) return d
			d = b.end - b.start - (a.end - a.start)
			if (d) return d
			return (a.time === null ? 0 : a.time) - (b.time === null ? 0 : b.time)
		})

		this.cachedEvents[date] = events
		return events
	}

	/**
	 * Получить агрегированные события из ВСЕХ открытых документов (для общего календаря).
	 * В отличие от getEvents(), собирает события из всех документов и добавляет sourceDocumentId.
	 * @param date - временная метка начала дня, unixtime
	 * @returns агрегированный отсортированный список событий со всеми документами
	 */
	getAggregatedEvents(date: timestamp): EventCacheStructure[] {
		const allStores = this.documentTabsStore.getAllDocumentStores()
		if (allStores.length === 0) return []

		const allEvents: EventCacheStructure[] = []

		for (const docStores of allStores) {
			const { eventsStore, projectsStore, documentId } = docStores

			// Планируемые одиночные события
			eventsStore.planned.forEach(e => {
				if (date < e.start || date >= e.end) return
				const color = projectsStore.getById(e.projectId)?.color ?? ProjectsStore.defaultProject.color
				const background = projectsStore.getById(e.projectId)?.background ?? ProjectsStore.defaultProject.background
				const event = singleEventToEventCache(e, date, false, color, background)
				event.sourceDocumentId = documentId
				allEvents.push(event)
			})

			// Планируемые повторяемые события
			eventsStore.plannedRepeatable.forEach(e => {
				if (date < e.start) return
				if (e.end && date + (e.time === null ? 0 : e.time) >= e.end) return
				if (ZCron.isMatch(e.repeat, e.start, date)) {
					const color = projectsStore.getById(e.projectId)?.color ?? ProjectsStore.defaultProject.color
					const background = projectsStore.getById(e.projectId)?.background ?? ProjectsStore.defaultProject.background
					const event = repeatableEventToEventCache(e, date, false, color, background)
					event.sourceDocumentId = documentId
					allEvents.push(event)
				}
			})

			// Завершённые события
			eventsStore.completed.forEach(e => {
				if (date >= e.start && date < e.end) {
					const color = projectsStore.getById(e.projectId)?.color ?? ProjectsStore.defaultProject.color
					const background = projectsStore.getById(e.projectId)?.background ?? ProjectsStore.defaultProject.background
					const event = singleEventToEventCache(e, date, true, color, background)
					event.sourceDocumentId = documentId
					allEvents.push(event)
				}
			})
		}

		// Сортировка для отрисовки
		allEvents.sort((a, b) => {
			var d = a.start - b.start
			if (d) return d
			d = b.end - b.start - (a.end - a.start)
			if (d) return d
			return (a.time === null ? 0 : a.time) - (b.time === null ? 0 : b.time)
		})

		return allEvents
	}

	/**
	 * Получить агрегированный баланс из ВСЕХ открытых документов.
	 * Суммирует фактический баланс всех документов.
	 * @returns объект с aggregated балансом
	 */
	getAggregatedBalance(): {
		lastActualBalance: number
		lastActualBalanceDate: number
		firstActualBalanceDate: number
	} {
		const allStores = this.documentTabsStore.getAllDocumentStores()

		let totalActual = 0
		let maxDate = 0
		let minDate = Infinity

		for (const docStores of allStores) {
			const { eventsStore } = docStores
			totalActual += eventsStore.completed.reduce((balance, e) => balance + e.credit - e.debit, 0)
			if (eventsStore.completed.length) {
				maxDate = Math.max(maxDate, eventsStore.completed[eventsStore.completed.length - 1].start)
				minDate = Math.min(minDate, eventsStore.completed[0].start)
			}
		}

		return {
			lastActualBalance: totalActual,
			lastActualBalanceDate: maxDate,
			firstActualBalanceDate: minDate === Infinity ? 0 : minDate
		}
	}

	/** Экземпляр плейсхолдера для представления пустого события на месте многодневного события стартовавшего ранее */
	static readonly placeholder: EventCacheStructure = {
		id: -1,
		name: '',
		background: '',
		color: '',
		start: 0,
		time: null,
		end: 0,
		days: 1,
		credit: 0,
		debit: 0,
		completed: false,
		repeatable: false
	}

	/**
	 * Получить список событий за день с плейсхолдерами ({id:-1}), за исключением соответствующих id из стека skip
	 * Может использоваться для создания структуры для рендеринга в календаре с многодневными событиями
	 * Стек skip обновляется для возможности использования в цепочке обработок
	 * @param date - временная метка начала дня, unixtime
	 * @param skip - стек ранее стартовавших событий, вместо которых подставляются плейсхолдеры
	 * @param events - начальный список событий для возможности получения сквозного списка в цепочке вызовов за несколько дней
	 * @returns
	 */
	getEventsWithPlaceholders(
		date: timestamp,
		skip: EventsCacheSkipStructure[] = [],
		events: EventCacheStructure[] = []
	): EventCacheStructure[] {
		// очистка стека
		while (skip.length > 0) {
			// в стеке skip последний элемент может блокировать очищение стека если его действие не завершено
			// очищаем если последний элемент завершил действие
			if (date < skip[skip.length - 1].end) break
			skip.pop()
		}
		// добавление плейсхолдеров
		skip.forEach(() => events.push(EventsCache.placeholder))

		this.getEvents(date).reduce((a, e) => {
			if (skip.some(s => e.id === s.id)) return a
			if (e.end - e.start > 86400) skip.push({ id: e.id, end: e.end })
			return (a.push(e), a)
		}, events)
		return events
	}

	/**
	 * Получить список планируемых событий, за исключением id из стека skip
	 * Может использоваться для создания списка, исключая повторы многодневных событий
	 * Стек skip обновляется для возможности использования в цепочке обработок
	 * @param date - временная метка начала дня, unixtime
	 * @param skip - стек ранее стартовавших событий
	 * @param events - начальный список событий для возможности получения сквозного списка в цепочке вызовов за несколько дней
	 */
	getPlannedEventsFilteredBySkip(
		date: timestamp,
		skip: EventsCacheSkipStructure[] = [],
		events: EventCacheStructure[] = []
	): EventCacheStructure[] {
		while (skip.length > 0) {
			if (date < skip[skip.length - 1].end) break
			skip.pop()
		}
		this.getEvents(date).reduce((a, e) => {
			if (skip.some(s => e.id === s.id) || e.completed) return a
			if (e.days > 1) skip.push({ id: e.id, end: e.end })
			return (a.push(e), a)
		}, events)
		return events
	}

	/**
	 * Получить список планируемых событий за интервал времени (begin, end)
	 * @param begin - метка времени начала интервала, unixtime
	 * @param end - метка времени конца интервала, unixtime
	 * @returns
	 */
	getPlannedEventsInInterval(begin: timestamp, end: timestamp): EventCacheStructure[] {
		const skip: { id: number; end: timestamp }[] = []
		const events: EventCacheStructure[] = []
		for (let t = begin; t < end; t += 86400) this.getPlannedEventsFilteredBySkip(t, skip, events)
		return events
	}

	/** Вычисление фактического баланса на момент последнего выполненного события */
	calculateActualBalance(): number {
		const stores = this.documentTabsStore.getActiveDocumentStores()
		if (!stores) return 0
		return stores.eventsStore.completed.reduce((balance, e) => balance + e.credit - e.debit, 0)
	}

	/**
	 * Получить фактический баланс на начало дня
	 * Данные кэшируются
	 * @param date - временная метка начала дня, unixtime
	 * @returns
	 */
	getActualBalance(date: timestamp): number {
		if (date < this.firstActualBalanceDate) return 0
		if (date > this.lastActualBalanceDate) return this.lastActualBalance
		if (this.cachedActualBalance[date] !== undefined) return this.cachedActualBalance[date]

		const stores = this.documentTabsStore.getActiveDocumentStores()
		if (!stores) return 0

		const balance = stores.eventsStore.completed.reduce((a, e) => {
			if (date > e.start + (e.time === null ? 0 : e.time)) a += e.credit - e.debit
			return a
		}, 0)
		this.cachedActualBalance[date] = balance
		return balance
	}

	/**
	 * Получить планируемый баланс на начало дня
	 * @param date - временная метка начала дня, unixtime
	 * @returns
	 */
	getPlannedBalance(date: timestamp): number {
		if (date < this.firstActualBalanceDate) return 0
		if (date <= this.lastActualBalanceDate) return this.getActualBalance(date)
		if (this.cachedPlannedBalance[date] !== undefined) return this.cachedPlannedBalance[date]
		const prevEvents = this.getPlannedEventsInInterval(this.lastActualBalanceDate, date)
		const balance = prevEvents.reduce((a, e) => a + e.credit - e.debit, this.lastActualBalance)
		this.cachedPlannedBalance[date] = balance
		return balance
	}

	/**
	 * Получить планируемое изменение баланса с учетом завершенных событий
	 * @param date - временная метка начала дня, unixtime
	 * @returns
	 */
	getPlannedBalanceChange(date: timestamp): number {
		return this.getEvents(date).reduce((a, e) => a + e.credit - e.debit, 0)
	}

	/** Получить дату первого запланированного события */
	getFirstPlannedEventDate(): timestamp {
		const stores = this.documentTabsStore.getActiveDocumentStores()
		if (!stores) return 0

		let first = stores.eventsStore.planned[0]?.start ?? 0
		stores.eventsStore.plannedRepeatable.forEach(e => {
			if (e.start < first) first = e.start
		})
		return first
	}
}

export type EventsCacheSkipStructure = { id: number; end: timestamp }
