import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import ZCron from 'src/7-shared/libs/ZCron/ZCron'
import { EventsStore, type EventsStoreData } from 'src/6-entities/Events/EventsStore'
import { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'
import { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'
import { CalendarStore } from 'src/3-pages/Calendar/CalendarStore'
import { DayListStore } from 'src/3-pages/DayList/DayListStore'
import { EventsCache, CALENDAR_CACHE_CAPACITY } from './EventsCache'
import { OccurrenceCounter } from './OccurrenceCounter'
import { BoundedCache } from './BoundedCache'

const DAY = 86400
const day = (date: string) => DateTime.YYYYMMDDToTimestamp(date)
function setup(data: EventsStoreData = { completedList: [], plannedList: [] }) {
	const projects = new ProjectsStore()
	const events = new EventsStore(projects)
	events.init(data)
	const cache = new EventsCache({
		activeEventsStore: events,
		activeProjectsStore: projects,
		getAllDocumentStores: () => [
			{ documentId: 'test', eventsStore: events, projectsStore: projects, isInitialized: true }
		]
	})
	return { events, projects, cache }
}

/** Небольшой прямой эталон: дневной обход только тестового диапазона. */
function reference(events: EventsStore, date: number): { actual: number; planned: number } {
	date = DateTime.getBeginDayTimestamp(date)
	const actual = events.completed.filter(e => e.start < date).reduce((sum, e) => sum + e.credit - e.debit, 0)
	const last = events.completed.length ? Math.max(...events.completed.map(e => e.start)) : null
	if (last !== null && date <= last) return { actual, planned: actual }
	let planned = events.completed.reduce((sum, e) => sum + e.credit - e.debit, 0)
	for (const e of events.planned) if (e.start < date && (last === null || e.end > last)) planned += e.credit - e.debit
	for (const e of events.plannedRepeatable) {
		for (let t = Math.max(e.start, last ?? e.start); t < Math.min(date, e.end || date); t += DAY) {
			if (ZCron.isMatch(e.repeat, e.start, t)) planned += e.credit - e.debit
		}
	}
	return { actual, planned }
}

describe('F12: баланс и ограниченный кэш', () => {
	beforeEach(() => {
		localStorage.clear()
		DateTime.initLocale(3)
	})
	afterEach(() => {
		jest.restoreAllMocks()
		jest.useRealTimers()
		DateTime.initLocale(3)
	})

	it('пустая история не вызывает обход дней с epoch при построении 21 недели', () => {
		const { cache } = setup()
		const interval = jest.spyOn(cache, 'getPlannedEventsInInterval').mockImplementation(() => {
			throw new Error('History scan')
		})
		jest.spyOn(console, 'log').mockImplementation(() => {})
		const calendar = new CalendarStore(cache, { state: 'idle' } as any)
		const weeks = calendar.getCalendarDataStructure(day('2026.10.31'))
		expect(weeks).toHaveLength(21)
		expect(weeks.every(week => week.list.every(d => d.actualBalance === 0 && d.plannedBalance === 0))).toBe(true)
		expect(interval).not.toHaveBeenCalled()
		expect(cache.cacheSizes.events).toBe(147)
		expect(cache.cacheSizes.schedules).toBe(0)
	})

	it.each([0, 3, -8, 5.5])('считает начало местного дня и несортированные операции: UTC%+f', timezone => {
		DateTime.initLocale(timezone)
		const { cache, events } = setup({
			completedList: [
				{ name: 'Last', start: '2026.11.03', time: '23:59', credit: 20 },
				{ name: 'First', start: '2026.11.01', time: '0:00', credit: 100 },
				{ name: 'Middle', start: '2026.11.02', debit: 10 }
			],
			plannedList: [
				{ name: 'Future', start: '2026.11.08', debit: 3 },
				{ name: 'Span cutoff', start: '2026.10.30', end: '2026.11.05', credit: 5 },
				{ name: 'Ended', start: '2026.10.28', end: '2026.11.03', credit: 500 },
				{ name: 'Daily', start: '2026.10.29', repeat: '* * *', end: '2026.11.07', debit: 2 }
			]
		})
		expect(cache.firstActualBalanceDate).toBe(day('2026.11.01'))
		expect(cache.lastActualBalanceDate).toBe(day('2026.11.03'))
		for (let t = day('2026.10.27'); t <= day('2026.11.10'); t += DAY) {
			const expected = reference(events, t)
			expect(cache.getActualBalance(t + 12 * 3600)).toBe(expected.actual)
			expect(cache.getPlannedBalance(t + 12 * 3600)).toBe(expected.planned)
		}
		expect(cache.getActualBalance(day('2026.11.03') + 12 * 3600)).toBe(90)
		expect(cache.getAggregatedBalance()).toEqual({
			lastActualBalance: 110,
			firstActualBalanceDate: day('2026.11.01'),
			lastActualBalanceDate: day('2026.11.03')
		})
	})

	it('учитывает только повторяемые данные, исключающий конец и разбиение серии', () => {
		const { events, cache } = setup({
			completedList: [],
			plannedList: [{ name: 'Daily', start: '2026.10.29', repeat: '/1', end: '2026.11.04', credit: 10 }]
		})
		expect(cache.getFirstPlannedEventDate()).toBe(day('2026.10.29'))
		expect(cache.getPlannedBalance(day('2026.11.04'))).toBe(60)
		expect(cache.getPlannedBalance(day('2026.11.05'))).toBe(60)
		events.deleteCurrentRepeatableEvent(events.plannedRepeatable[0].id, day('2026.11.01'))
		expect(cache.getPlannedBalance(day('2026.11.05'))).toBe(50)
		for (let t = day('2026.10.28'); t <= day('2026.11.06'); t += DAY)
			expect(cache.getPlannedBalance(t)).toBe(reference(events, t).planned)
	})

	it('не предполагает порядок одиночных планов и не использует 0 как внутреннее начало истории', () => {
		const { cache } = setup({
			completedList: [],
			plannedList: [
				{ name: 'Later', start: '1970.01.03', credit: 20 },
				{ name: 'Earlier', start: '1969.12.30', credit: 10 }
			]
		})
		expect(cache.getFirstPlannedEventDate()).toBe(day('1969.12.30'))
		expect(cache.getPlannedBalance(day('1969.12.31'))).toBe(10)
		expect(cache.getPlannedBalance(day('1970.01.04'))).toBe(30)
	})

	it('строит накопленные суммы один раз для тысячи запросов той же версии', () => {
		const { cache, events } = setup({
			completedList: [{ name: 'Income', start: '2026.01.01', credit: 5 }],
			plannedList: []
		})
		const read = jest.spyOn(events, 'completed', 'get')
		for (let i = 0; i < 1000; i++) expect(cache.getActualBalance(day('2026.01.02') + i * DAY)).toBe(5)
		expect(read).toHaveBeenCalledTimes(1)
	})

	it.each([-8, 0, 3])('расписание согласовано с календарём по обе стороны epoch: UTC %i', timezone => {
		DateTime.initLocale(timezone)
		const start = day('1969.12.29'),
			end = day('1970.01.08')
		const { cache } = setup({
			completedList: [],
			plannedList: [{ name: 'Weekdays', start: '1969.12.29', repeat: '* * 1-5', credit: 1 }]
		})
		let expected = 0
		for (let t = start; t < end; t += DAY) {
			const weekday = new Date((t + timezone * 3600) * 1000).getUTCDay()
			expect(DateTime.getWeekday(t)).toBe(weekday)
			expect(cache.getEvents(t).length).toBe(weekday >= 1 && weekday <= 5 ? 1 : 0)
			if (weekday >= 1 && weekday <= 5) expected++
			expect(cache.getPlannedBalance(t + DAY)).toBe(expected)
		}
	})

	it('смена версии, состава сторов и оформления инвалидирует кэш без MainStore', () => {
		const tabs = new DocumentTabsStore({} as any)
		tabs.openNewDocument('A')
		const a = tabs.activeDocument!
		tabs.activeProjectsStore!.add('Project', 'red', 'blue')
		const project = tabs.activeProjectsStore!.getByName('Project')!
		tabs.activeEventsStore!.addPlannedEventDto({ name: 'A', start: '2026.11.01', projectId: project.id, credit: 10 })
		const cache = new EventsCache(tabs)
		expect(cache.getPlannedBalance(day('2026.11.02'))).toBe(10)
		expect(cache.getEvents(day('2026.11.01'))[0].color).toBe('red')
		tabs.activeProjectsStore!.update(project.id, { color: 'green' })
		expect(cache.getEvents(day('2026.11.01'))[0].color).toBe('green')
		tabs.activeEventsStore!.deleteEvent(tabs.activeEventsStore!.planned[0].id)
		expect(cache.getPlannedBalance(day('2026.11.02'))).toBe(0)
		tabs.openNewDocument('B')
		tabs.activeEventsStore!.addCompletedEventDto({ name: 'B', start: '2026.11.01', credit: 200 })
		expect(cache.getActualBalance(day('2026.11.02'))).toBe(200)
		tabs.activateDocument(a.id)
		expect(cache.getActualBalance(day('2026.11.02'))).toBe(0)
		tabs.applyContentToActiveDocument({
			projectsList: [],
			completedList: [],
			plannedList: [{ name: 'Replaced', start: '2026.11.01', credit: 30 }]
		})
		expect(cache.getPlannedBalance(day('2026.11.02'))).toBe(30)
		tabs.closeDocument(a.id)
		expect(cache.getEvents(day('2026.11.01'))[0].name).toBe('B')
	})

	it('не растёт при прокрутке и возвращает верный результат после вытеснения LRU', () => {
		const { cache } = setup({
			completedList: [],
			plannedList: [{ name: 'Daily', start: '2026.01.01', repeat: '/1', credit: 2 }]
		})
		const start = day('2026.01.01')
		const first = cache.getEvents(start)
		expect(cache.getEvents(start + 3600)).toBe(first)
		for (let i = 1; i <= CALENDAR_CACHE_CAPACITY + 20; i++) {
			cache.getEvents(start + i * DAY)
			expect(cache.getPlannedBalance(start + i * DAY)).toBe(i * 2)
		}
		expect(cache.cacheSizes.events).toBe(CALENDAR_CACHE_CAPACITY)
		expect(cache.cacheSizes.balances).toBe(CALENDAR_CACHE_CAPACITY)
		expect(cache.getEvents(start)).not.toBe(first)
		expect(cache.getEvents(start)).toEqual(first)
		expect(cache.getPlannedBalance(start)).toBe(0)
	})

	it('LRU учитывает чтение и корректно кэширует нулевой баланс', () => {
		const cache = new BoundedCache<number, number>(2)
		cache.set(1, 0)
		cache.set(2, 20)
		expect(cache.get(1)).toBe(0)
		cache.set(3, 30)
		expect(cache.get(2)).toBeUndefined()
		expect(cache.get(1)).toBe(0)
		expect(cache.size).toBe(2)
	})

	it('DayList нормализует текущее время и выбор дня до местной полуночи', () => {
		jest.useFakeTimers().setSystemTime(new Date('2026-11-01T12:34:56Z'))
		const { cache } = setup()
		const calendar = new CalendarStore(cache, { state: 'idle' } as any)
		const list = new DayListStore(cache, { state: 'idle' } as any, calendar)
		expect(list.date).toBe(day('2026.11.01'))
		list.setDate(day('2026.11.03') + 12345)
		expect(list.getDayListStructure().timestamp).toBe(day('2026.11.03'))
	})
})

describe('Счётчик вхождений без обхода истории', () => {
	afterEach(() => {
		jest.restoreAllMocks()
		DateTime.initLocale(3)
	})
	it.each(['/1', '/4', '* * *', '* * 1-5', '15 * *', '29 2 *', '31 1,3,5,7,8,10,12 0,6', '*/4 */2 1-6', '31 2 *'])(
		'%s совпадает с прямым эталоном на границах лет и месяцев',
		repeat => {
			DateTime.initLocale(3)
			const start = day('2023.12.29'),
				end = day('2025.03.05')
			const counter = new OccurrenceCounter()
			let count = 0
			for (let t = start; t < end; t += DAY) {
				if (ZCron.isMatch(repeat, start, t)) count++
				expect(counter.count(repeat, start, start, t + DAY)).toBe(count)
			}
		}
	)

	it('ежедневные и относительные серии за тысячелетия не вызывают nextAfter', () => {
		const next = jest.spyOn(ZCron, 'nextAfter').mockImplementation(() => {
			throw new Error('Occurrence scan')
		})
		const counter = new OccurrenceCounter()
		const start = day('0001.01.01'),
			end = day('9999.01.01')
		expect(counter.count('/1', start, start, end)).toBe((end - start) / DAY)
		expect(counter.count('* * *', start, start, end)).toBe((end - start) / DAY)
		expect(next).not.toHaveBeenCalled()
	})

	it('месячные серии используют повторение григорианского цикла, включая 1900/2000/2100', () => {
		const counter = new OccurrenceCounter()
		expect(counter.count('29 2 *', day('1600.01.01'), day('1600.01.01'), day('2400.01.01'))).toBe(194)
		expect(counter.count('29 2 *', day('1900.01.01'), day('1900.01.01'), day('2101.01.01'))).toBe(49)
		expect(counter.count('31 2 *', day('0001.01.01'), day('0001.01.01'), day('9999.01.01'))).toBe(0)
	})

	it('кэш скомпилированных расписаний ограничен независимо от числа шаблонов', () => {
		const counter = new OccurrenceCounter()
		for (let i = 1; i < 150; i++) counter.count('/' + i, day('2026.01.01'), day('2026.01.01'), day('2026.11.01'))
		expect(counter.size).toBe(128)
		expect(counter.count('/1', day('2026.01.01'), day('2026.01.01'), day('2026.01.02'))).toBe(1)
	})

	it('месячный счётчик не перечитывает тысячелетия при соседних запросах', () => {
		const months = jest.spyOn(DateTime, 'getDaysInMonth')
		const counter = new OccurrenceCounter(),
			start = day('0001.01.01'),
			end = day('9999.01.01')
		for (let i = 0; i < 147; i++) {
			const date = DateTime.getYearMonthDay(end + i * DAY)
			expect(counter.count('15 * *', start, start, end + i * DAY)).toBe(
				(date.year - 1) * 12 + date.month + (date.day > 15 ? 1 : 0)
			)
		}
		expect(months.mock.calls.length).toBeLessThan(7000)
	})
})
