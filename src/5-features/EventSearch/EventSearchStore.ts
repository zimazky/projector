import { comparer, makeAutoObservable, reaction, type IReactionDisposer } from 'mobx'
import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import ZCron, { ParsedSchedule } from 'src/7-shared/libs/ZCron/ZCron'
import { EventsStore } from 'src/6-entities/Events/EventsStore'
import { RepeatableEventModel } from 'src/6-entities/Events/RepeatableEventModel'
import { SingleEventModel } from 'src/6-entities/Events/SingleEventModel'
import type { DocumentTabsStore } from 'src/6-entities/Document/model'

export interface SearchResult {
	documentId: string | null
	documentVersion: number
	eventId: number
	timestamp: timestamp
	name: string
	completed: boolean
	repeatable: boolean
}

/** Количество событий до сегодняшнего дня */
const COUNT_BEFORE = 4
/** Количество событий после сегодняшнего дня */
const COUNT_AFTER = 4
/** Количество событий для загрузки при приближении к границе */
const COUNT_LOAD = 4

export class EventSearchStore {
	/** Поисковый запрос */
	query: string = ''
	/** Результаты поиска (отсортированы по дате) */
	results: SearchResult[] = []
	/** Индекс текущего выбранного результата */
	currentIndex: number = -1
	/** Признак активности поиска */
	isActive: boolean = false

	/** Флаги достижения границ (нет больше событий) */
	hasMoreBefore: boolean = true
	hasMoreAfter: boolean = true

	private documentTabsStore: DocumentTabsStore
	private stopWatchingDocument: IReactionDisposer | null = null
	private requestSequence = 0
	/** Ввод изменился, поиск ещё ожидает debounce или Enter. */
	isSearchPending = false
	/** Кэш скомпилированных расписаний */
	private scheduleCache: Map<string, ParsedSchedule> = new Map()

	constructor(documentTabsStore: DocumentTabsStore) {
		this.documentTabsStore = documentTabsStore
		makeAutoObservable<this, 'stopWatchingDocument' | 'requestSequence'>(this, {
			stopWatchingDocument: false,
			requestSequence: false
		})
	}

	private get eventsStore(): EventsStore | null {
		return this.documentTabsStore.activeEventsStore
	}

	/** Смена сессии/сторов или локальной версии отменяет поиск, включая debounce. */
	private watchDocument() {
		this.stopWatchingDocument?.()
		this.stopWatchingDocument = reaction(
			() => [
				this.documentTabsStore.activeDocument,
				this.documentTabsStore.activeDocument?.sync.localVersion,
				this.eventsStore
			],
			() => this.clear(),
			{ equals: comparer.shallow }
		)
	}

	/** Обновить поле ввода и выдать номер запроса для отложенного поиска. */
	setQuery(query: string): number {
		this.performClear(false)
		this.query = query.trim().toLowerCase()
		this.isSearchPending = !!this.query
		if (this.query) this.watchDocument()
		return this.requestSequence
	}

	/** Устаревший отложенный запрос не должен запускаться в другой вкладке. */
	search(query: string, request?: number): boolean {
		if (request !== undefined && request !== this.requestSequence) return false
		this.performClear(false)
		this.query = query.trim().toLowerCase()
		if (!this.query) return true
		this.watchDocument()
		this.performSearch()
		return true
	}

	/** Фактическое выполнение поиска (без debounce) */
	private performSearch() {
		this.currentIndex = -1
		this.results = []
		this.scheduleCache.clear()

		if (!this.query) {
			this.hasMoreBefore = false
			this.hasMoreAfter = false
			return
		}

		const today = DateTime.getBeginDayTimestamp(Date.now() / 1000)

		// Ищем события до и после сегодня ИНКРЕМЕНТАЛЬНО (без сбора всех событий)
		// Запрашиваем на 1 больше, чтобы узнать, есть ли ещё
		const beforeResults = this.findNearestBefore(today, COUNT_BEFORE + 1)
		const afterResults = this.findNearestAfter(today, COUNT_AFTER + 1)

		// Определяем, есть ли ещё события за границами
		this.hasMoreBefore = beforeResults.length > COUNT_BEFORE
		this.hasMoreAfter = afterResults.length > COUNT_AFTER

		// Берём только нужное количество
		const selectedBefore = beforeResults.slice(0, COUNT_BEFORE)
		const selectedAfter = afterResults.slice(0, COUNT_AFTER)

		this.results = [...selectedBefore.reverse(), ...selectedAfter]

		if (this.results.length === 0) {
			this.hasMoreBefore = false
			this.hasMoreAfter = false
			return
		}

		// Устанавливаем индекс на первое событие сегодня или позже
		const todayIndex = this.results.findIndex(r => r.timestamp >= today)
		this.currentIndex = todayIndex >= 0 ? todayIndex : Math.max(0, this.results.length - 1)
	}

	/** Полный порядок вхождений внутри одной версии документа. */
	private compareResults(a: SearchResult, b: SearchResult): number {
		return (
			a.timestamp - b.timestamp ||
			a.eventId - b.eventId ||
			Number(a.repeatable) - Number(b.repeatable) ||
			Number(a.completed) - Number(b.completed)
		)
	}

	private findNearestAfter(from: timestamp | SearchResult, limit: number): SearchResult[] {
		return this.findNearest(from, limit, 1)
	}

	private findNearestBefore(from: timestamp | SearchResult, limit: number): SearchResult[] {
		return this.findNearest(from, limit, -1)
	}

	/** Дата задаёт начальное окно; результат задаёт исключающий составной курсор. */
	private findNearest(from: timestamp | SearchResult, limit: number, direction: 1 | -1): SearchResult[] {
		const events = this.eventsStore
		if (!events) return []
		const ts = typeof from === 'number' ? from : from.timestamp
		const accepts = (result: SearchResult) => {
			if (typeof from !== 'number') return this.compareResults(result, from) * direction > 0
			return direction === 1 ? result.timestamp >= ts : result.timestamp < ts
		}
		const candidates: SearchResult[] = []
		for (const [list, completed] of [
			[events.planned, false],
			[events.completed, true]
		] as const) {
			for (const event of list) {
				if (!this.matchesEvent(event)) continue
				const result = this.singleEventToResult(event, completed)
				if (accepts(result)) candidates.push(result)
			}
		}
		for (const event of events.plannedRepeatable) {
			if (!this.matchesEvent(event)) continue
			// Включаем день курсора, затем отсекаем показанные вхождения по полному порядку.
			// Дополнительный кандидат компенсирует отсечение самой серии на границе.
			const occurrences =
				direction === 1
					? this.getOccurrencesAfter(event, DateTime.getBeginDayTimestamp(ts) - 86400, limit + 1)
					: this.getOccurrencesBefore(event, typeof from === 'number' ? ts : ts + 86400, limit + 1)
			candidates.push(...occurrences.filter(accepts))
		}
		return candidates.sort((a, b) => this.compareResults(a, b) * direction).slice(0, limit)
	}

	/** Получить N вхождений повторяемого события ПОСЛЕ указанной даты */
	private getOccurrencesAfter(event: RepeatableEventModel, fromTimestamp: timestamp, limit: number): SearchResult[] {
		const schedule = this.getSchedule(event.repeat)

		// Неповторяемое событие
		if (schedule.mode === 'empty') {
			if (event.start > fromTimestamp) {
				return [this.repeatableEventToResult(event, event.start)]
			}
			return []
		}

		const results: SearchResult[] = []

		// Находим первое вхождение после fromTimestamp
		let current = ZCron.nextAfter(schedule, event.start, fromTimestamp)

		while (current !== null && results.length < limit) {
			// Проверяем, не закончилось ли событие
			if (event.end && current >= event.end) {
				break
			}

			results.push(this.repeatableEventToResult(event, current))
			current = ZCron.nextAfter(schedule, event.start, current)
		}

		return results
	}

	/** Получить N вхождений повторяемого события ДО указанной даты */
	private getOccurrencesBefore(event: RepeatableEventModel, beforeTimestamp: timestamp, limit: number): SearchResult[] {
		const schedule = this.getSchedule(event.repeat)

		// Неповторяемое событие
		if (schedule.mode === 'empty') {
			if (event.start < beforeTimestamp) {
				return [this.repeatableEventToResult(event, event.start)]
			}
			return []
		}

		const results: SearchResult[] = []
		let current: timestamp | null = event.end ? Math.min(beforeTimestamp, event.end) : beforeTimestamp

		// Находим вхождения, идя назад от beforeTimestamp
		while (current !== null && results.length < limit) {
			current = ZCron.prevBefore(schedule, event.start, current)

			if (current === null) break
			if (event.end && current >= event.end) continue

			results.push(this.repeatableEventToResult(event, current))
		}

		return results
	}

	/** Получить скомпилированное расписание из кэша */
	private getSchedule(repeat: string): ParsedSchedule {
		let schedule = this.scheduleCache.get(repeat)
		if (!schedule) {
			schedule = ZCron.parse(repeat)
			this.scheduleCache.set(repeat, schedule)
		}
		return schedule
	}

	/** Проверить соответствие события запросу */
	private matchesEvent(event: { name: string; comment?: string }): boolean {
		return this.matchesQuery(event.name) || this.matchesQuery(event.comment)
	}

	/** Проверить соответствие текста запросу */
	private matchesQuery(text: string | undefined): boolean {
		if (!text) return false
		return text.toLowerCase().includes(this.query)
	}

	/** Преобразовать одиночное событие в результат поиска */
	private singleEventToResult(event: SingleEventModel, completed: boolean): SearchResult {
		return {
			documentId: this.documentTabsStore.activeDocumentId ?? null,
			documentVersion: this.documentTabsStore.activeDocument?.sync.localVersion ?? 0,
			eventId: event.id,
			timestamp: event.start,
			name: event.name,
			completed,
			repeatable: false
		}
	}

	/** Преобразовать повторяемое событие в результат поиска */
	private repeatableEventToResult(event: RepeatableEventModel, timestamp: timestamp): SearchResult {
		return {
			documentId: this.documentTabsStore.activeDocumentId ?? null,
			documentVersion: this.documentTabsStore.activeDocument?.sync.localVersion ?? 0,
			eventId: event.id,
			timestamp,
			name: event.name,
			completed: false,
			repeatable: true
		}
	}

	/** Перейти к следующему результату с ленивой загрузкой */
	nextResult() {
		if (this.results.length === 0) return

		// Проверяем, нужно ли загрузить ещё результаты
		if (this.currentIndex >= this.results.length - 2) {
			this.loadMoreAfter()
		}

		if (this.currentIndex < this.results.length - 1) {
			this.currentIndex++
		}
	}

	/** Перейти к предыдущему результату с ленивой загрузкой */
	prevResult() {
		if (this.results.length === 0) return

		// Проверяем, нужно ли загрузить ещё результаты
		if (this.currentIndex <= 1) {
			this.loadMoreBefore()
		}

		if (this.currentIndex > 0) {
			this.currentIndex--
		}
	}

	/** Строго после полного курсора последнего вхождения. */
	private loadMoreAfter() {
		if (!this.hasMoreAfter || !this.results.length) return
		const found = this.findNearestAfter(this.results[this.results.length - 1], COUNT_LOAD + 1)
		this.hasMoreAfter = found.length > COUNT_LOAD
		this.results.push(...found.slice(0, COUNT_LOAD))
	}

	/** Строго до полного курсора первого вхождения; выбранное событие остаётся прежним. */
	private loadMoreBefore() {
		if (!this.hasMoreBefore || !this.results.length) return
		const found = this.findNearestBefore(this.results[0], COUNT_LOAD + 1)
		this.hasMoreBefore = found.length > COUNT_LOAD
		const toAdd = found.slice(0, COUNT_LOAD).reverse()
		this.results.unshift(...toAdd)
		this.currentIndex += toAdd.length
	}

	/** Получить текущий выбранный результат */
	get currentResult(): SearchResult | null {
		if (this.currentIndex < 0 || this.currentIndex >= this.results.length) return null
		return this.results[this.currentIndex]
	}

	/** Проверить, подсвечено ли событие */
	isHighlighted(eventId: number, ts: timestamp): boolean {
		const current = this.currentResult
		return current !== null && current.eventId === eventId && current.timestamp === ts
	}

	/** Очистить поиск */
	clear() {
		this.performClear()
	}

	/** Внутренняя очистка состояния */
	private performClear(deactivate = true) {
		this.stopWatchingDocument?.()
		this.stopWatchingDocument = null
		this.requestSequence++
		this.isSearchPending = false
		this.query = ''
		this.results = []
		this.currentIndex = -1
		if (deactivate) this.isActive = false
		this.hasMoreBefore = false
		this.hasMoreAfter = false
		this.scheduleCache.clear()
	}

	/** Переключить состояние активности */
	toggleActive() {
		this.isActive = !this.isActive
		if (!this.isActive) {
			this.clear()
		}
	}

	/** Получить текст с количеством результатов */
	get resultText(): string {
		if (this.results.length === 0) return ''
		return `${this.currentIndex + 1} / ${this.results.length}`
	}
}
