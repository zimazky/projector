import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import ZCron from 'src/7-shared/libs/ZCron/ZCron'

import { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'

import type { IEventsStoreProvider } from 'src/6-entities/Document/model/DocumentStoreManager.types'

import { BoundedCache } from './BoundedCache'
import { BalanceIndex } from './BalanceIndex'
import { OccurrenceCounter } from './OccurrenceCounter'
import { EventCacheStructure, repeatableEventToEventCache, singleEventToEventCache } from './EventCacheStructure'
import { ResourceBalanceCache } from './ResourceBalanceCache'
import type { ResourceBalanceReport } from './ResourceBalance.types'
import type { ReadonlyJson } from '../Resources/DocumentCatalogStore'

export type DayBalances =
	| {
			resourceBalance: ReadonlyJson<ResourceBalanceReport>
			actualBalance?: never
			plannedBalance?: never
			plannedBalanceChange?: never
	  }
	| { resourceBalance?: undefined; actualBalance: number; plannedBalance: number; plannedBalanceChange: number }

export const CALENDAR_CACHE_CAPACITY = 512
export class ResourceBalanceUnavailableError extends Error {}
export type AggregatedBalanceResult =
	| { available: true; lastActualBalance: number; lastActualBalanceDate: number; firstActualBalanceDate: number }
	| { available: false; reason: string; documentIds: string[] }

/** Класс списка событий, кэширующий данные и представляющий данные для быстрого рендеринга */
export class EventsCache {
	readonly resourceBalances: ResourceBalanceCache
	/** Провайдер сторов документов (для доступа к активным и всем сторам) */
	private provider: IEventsStoreProvider
	private cachedEvents = new BoundedCache<timestamp, EventCacheStructure[]>(CALENDAR_CACHE_CAPACITY)
	private cachedPlannedBalance = new BoundedCache<timestamp, number>(CALENDAR_CACHE_CAPACITY)
	private occurrences = new OccurrenceCounter()
	private balance = new BalanceIndex(null)
	private context: unknown[] | null = null

	/** Границы вычисляются по данным, а не по порядку массивов. */
	get lastActualBalance(): number {
		this.requireLegacyBalance()
		this.ensureCurrent()
		return this.balance.totalActual
	}
	get lastActualBalanceDate(): timestamp {
		this.requireLegacyBalance()
		this.ensureCurrent()
		return this.balance.lastActual ?? 0
	}
	get firstActualBalanceDate(): timestamp {
		this.requireLegacyBalance()
		this.ensureCurrent()
		return this.balance.firstActual ?? 0
	}

	constructor(provider: IEventsStoreProvider) {
		this.provider = provider
		this.resourceBalances = new ResourceBalanceCache(provider)
	}
	start(): void {
		this.resourceBalances.start()
	}
	dispose(): void {
		this.resourceBalances.dispose()
		this.init()
	}
	private isResourceDocument(): boolean {
		const data = this.provider.activeDocument?.data
		return (
			!!(data && 'schemaVersion' in data) ||
			(this.provider.getAllDocumentStores?.() ?? []).some(
				stores => stores.eventsStore === this.provider.activeEventsStore && !!stores.resourceStores
			)
		)
	}
	get resourceDocumentId(): string | undefined {
		if (!this.isResourceDocument()) return undefined
		return (
			this.provider.activeDocument?.id ??
			this.provider.getAllDocumentStores().find(row => row.eventsStore === this.provider.activeEventsStore)?.documentId
		)
	}
	getDayBalances(date: timestamp): DayBalances {
		const id = this.resourceDocumentId
		return id
			? { resourceBalance: this.resourceBalances.get(id, DateTime.getYYYYMMDD(date)) }
			: {
					actualBalance: this.getActualBalance(date),
					plannedBalance: this.getPlannedBalance(date),
					plannedBalanceChange: this.getPlannedBalanceChange(date)
				}
	}
	private requireLegacyBalance(): void {
		if (this.isResourceDocument())
			throw new ResourceBalanceUnavailableError(
				'Ресурсный документ требует расчёта количеств и оценки: используйте resourceBalances, числовой баланс credit/debit недоступен.'
			)
	}

	/** Принудительная инвалидизация для существующих потребителей. Индекс строится лениво. */
	init() {
		this.context = null
		this.cachedEvents.clear()
		this.cachedPlannedBalance.clear()
		this.occurrences.clear()
		this.balance = new BalanceIndex(null)
	}

	private ensureCurrent() {
		// Читать версии нужно и при попадании в кэш: observer/autorun подписывается
		// на доменные изменения, сами LRU-контейнеры остаются ненаблюдаемыми.
		const events = this.provider.activeEventsStore
		const projects = this.provider.activeProjectsStore
		const document = this.provider.activeDocument
		const next = [document, events, events?.version, projects, projects?.version, DateTime.timezone]
		if (this.context && next.every((value, index) => value === this.context![index])) return
		this.init()
		this.context = next
		this.balance = new BalanceIndex(this.isResourceDocument() ? null : events)
	}

	/** Число записей для диагностики границ памяти; исходные события сюда не входят. */
	get cacheSizes() {
		this.ensureCurrent()
		return {
			events: this.cachedEvents.size,
			balances: this.cachedPlannedBalance.size,
			schedules: this.occurrences.size
		}
	}

	/**
	 * Получить список всех событий за день, отсортированных для отрисовки
	 * Данные кэшируются
	 * @param date - временная метка начала дня, unixtime
	 * @returns
	 */
	getEvents(date: timestamp): EventCacheStructure[] {
		this.ensureCurrent()
		date = DateTime.getBeginDayTimestamp(date)
		const cached = this.cachedEvents.get(date)
		if (cached !== undefined) return cached

		const eventsStore = this.provider.activeEventsStore
		const projectsStore = this.provider.activeProjectsStore
		if (!eventsStore || !projectsStore) return []

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
			const onCard = date >= e.start && date < e.end
			const onAccountingDate = e.actualOperation?.effectiveDate === DateTime.getYYYYMMDD(date)
			if (onCard || onAccountingDate) {
				const color = projectsStore.getById(e.projectId)?.color ?? ProjectsStore.defaultProject.color
				const background = projectsStore.getById(e.projectId)?.background ?? ProjectsStore.defaultProject.background
				a.push({
					...singleEventToEventCache(e, date, true, color, background),
					...(!onCard ? { accountingOnly: true, days: 1 } : {})
				})
			}
			return a
		}, events)
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
		this.cachedEvents.set(date, events)
		if (this.isResourceDocument()) {
			const documentId =
				this.provider.activeDocument?.id ??
				this.provider.getAllDocumentStores().find(stores => stores.eventsStore === eventsStore)?.documentId
			for (const event of events) event.sourceDocumentId = documentId
		}
		return events
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
			if (!e.financial && e.end - e.start > 86400) skip.push({ id: e.id, end: e.end })
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
		for (let t = DateTime.getBeginDayTimestamp(begin); t < DateTime.getBeginDayTimestamp(end); t += 86400)
			this.getPlannedEventsFilteredBySkip(t, skip, events)
		return events
	}

	/** Вычисление фактического баланса на момент последнего выполненного события */
	calculateActualBalance(): number {
		this.requireLegacyBalance()
		this.ensureCurrent()
		return this.balance.totalActual
	}

	/** Фактический баланс строго на начало местного дня, O(log N). */
	getActualBalance(date: timestamp): number {
		this.requireLegacyBalance()
		this.ensureCurrent()
		return this.balance.actualBefore(DateTime.getBeginDayTimestamp(date))
	}

	/** Прогноз от последнего дня фактической истории или начала планируемых данных. */
	getPlannedBalance(date: timestamp): number {
		this.requireLegacyBalance()
		this.ensureCurrent()
		date = DateTime.getBeginDayTimestamp(date)
		const cached = this.cachedPlannedBalance.get(date)
		if (cached !== undefined) return cached
		const balance = this.balance.plannedBefore(date, this.occurrences)
		this.cachedPlannedBalance.set(date, balance)
		return balance
	}

	/**
	 * Получить планируемое изменение баланса с учетом завершенных событий
	 * @param date - временная метка начала дня, unixtime
	 * @returns
	 */
	getPlannedBalanceChange(date: timestamp): number {
		this.requireLegacyBalance()
		return this.getEvents(date).reduce((a, e) => a + e.credit - e.debit, 0)
	}

	/** Получить дату первого запланированного события */
	getFirstPlannedEventDate(): timestamp {
		this.requireLegacyBalance()
		this.ensureCurrent()
		return this.balance.firstPlanned ?? 0
	}

	// === Методы агрегации (для общего календаря) ===

	/** Получить агрегированные события за день из всех документов (для общего календаря) */
	getAggregatedEvents(date: timestamp): EventCacheStructure[] {
		date = DateTime.getBeginDayTimestamp(date)
		const allEvents: EventCacheStructure[] = []

		for (const docStores of this.provider.getAllDocumentStores()) {
			const { eventsStore, projectsStore } = docStores

			eventsStore.planned.forEach(e => {
				if (date < e.start || date >= e.end) return
				const color = projectsStore.getById(e.projectId)?.color ?? ProjectsStore.defaultProject.color
				const background = projectsStore.getById(e.projectId)?.background ?? ProjectsStore.defaultProject.background
				allEvents.push({
					...singleEventToEventCache(e, date, false, color, background),
					sourceDocumentId: docStores.documentId
				})
			})

			eventsStore.plannedRepeatable.forEach(e => {
				if (date < e.start) return
				if (e.end && date + (e.time === null ? 0 : e.time) >= e.end) return
				if (ZCron.isMatch(e.repeat, e.start, date)) {
					const color = projectsStore.getById(e.projectId)?.color ?? ProjectsStore.defaultProject.color
					const background = projectsStore.getById(e.projectId)?.background ?? ProjectsStore.defaultProject.background
					allEvents.push({
						...repeatableEventToEventCache(e, date, false, color, background),
						sourceDocumentId: docStores.documentId
					})
				}
			})

			eventsStore.completed.forEach(e => {
				const onCard = date >= e.start && date < e.end
				if (onCard || e.actualOperation?.effectiveDate === DateTime.getYYYYMMDD(date)) {
					const color = projectsStore.getById(e.projectId)?.color ?? ProjectsStore.defaultProject.color
					const background = projectsStore.getById(e.projectId)?.background ?? ProjectsStore.defaultProject.background
					allEvents.push({
						...singleEventToEventCache(e, date, true, color, background),
						...(!onCard ? { accountingOnly: true, days: 1 } : {}),
						sourceDocumentId: docStores.documentId
					})
				}
			})
		}

		allEvents.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || (a.time ?? 0) - (b.time ?? 0))
		return allEvents
	}

	/** Получить агрегированный баланс из всех документов */
	getAggregatedBalance(): { lastActualBalance: number; lastActualBalanceDate: number; firstActualBalanceDate: number } {
		const result = this.getAggregatedBalanceResult()
		if (!result.available) throw new ResourceBalanceUnavailableError(result.reason)
		return {
			lastActualBalance: result.lastActualBalance,
			lastActualBalanceDate: result.lastActualBalanceDate,
			firstActualBalanceDate: result.firstActualBalanceDate
		}
	}

	getAggregatedBalanceResult(): AggregatedBalanceResult {
		const resourceDocuments = this.provider.getAllDocumentStores().filter(stores => stores.resourceStores)
		if (resourceDocuments.length)
			return {
				available: false,
				reason:
					'Общий денежный итог разных документов пока недоступен. Счета и основные валюты документов учитываются отдельно.',
				documentIds: resourceDocuments.map(stores => stores.documentId)
			}
		let totalActual = 0
		let maxDate = -Infinity
		let minDate = Infinity

		for (const docStores of this.provider.getAllDocumentStores()) {
			totalActual += docStores.eventsStore.completed.reduce((b, e) => b + e.credit - e.debit, 0)
			for (const event of docStores.eventsStore.completed) {
				const day = DateTime.getBeginDayTimestamp(event.start)
				maxDate = Math.max(maxDate, day)
				minDate = Math.min(minDate, day)
			}
		}

		return {
			available: true,
			lastActualBalance: totalActual,
			lastActualBalanceDate: maxDate === -Infinity ? 0 : maxDate,
			firstActualBalanceDate: minDate === Infinity ? 0 : minDate
		}
	}
}

export type EventsCacheSkipStructure = { id: number; end: timestamp }
