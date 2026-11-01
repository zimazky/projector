import React from 'react'
import '@testing-library/jest-dom'
import { act, cleanup, render, screen } from '@testing-library/react'
import { autorun } from 'mobx'
import { createApplication, type Application } from '../root'
import StoreProvider from '../Providers/StoreProvider'
import Calendar from 'src/3-pages/Calendar/Calendar'
import CalendarEventItem from 'src/3-pages/Calendar/CalendarEventItem'
import DayList from 'src/3-pages/DayList/DayList'
import ProjectList from 'src/5-features/ProjectManager/ProjectList/ProjectList'
import { EventsStore } from 'src/6-entities/Events/EventsStore'
import { ProjectsStore } from 'src/6-entities/Projects/ProjectsStore'
import { EventsCache } from 'src/6-entities/EventsCache/EventsCache'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'

const date = '2026.11.01'
const day = () => DateTime.YYYYMMDDToTimestamp(date)
let app: Application

beforeEach(() => {
	localStorage.clear()
	DateTime.initLocale(3)
	jest.useFakeTimers().setSystemTime(new Date('2026-11-01T09:00:00Z'))
	jest.spyOn(console, 'log').mockImplementation(() => {})
	app = createApplication()
	app.stores.documentTabsStore.openNewDocument()
})
afterEach(() => {
	cleanup()
	app.dispose()
	jest.restoreAllMocks()
	jest.useRealTimers()
})

it('прогретый кэш наблюдает доменные изменения без MainStore и версии сессии', () => {
	const projects = new ProjectsStore()
	const events = new EventsStore(projects)
	const cache = new EventsCache({
		activeEventsStore: events,
		activeProjectsStore: projects,
		getAllDocumentStores: () => []
	})
	cache.getEvents(day())
	const values: string[][] = []
	const stop = autorun(() => {
		values.push(cache.getEvents(day()).map(event => event.name))
	})
	try {
		events.addPlannedEventDto({ name: 'Created', start: date })
		expect(values.at(-1)).toEqual(['Created'])
		const id = events.planned[0].id
		events.updateEvent(id, { name: 'Edited', start: date })
		expect(values.at(-1)).toEqual(['Edited'])
		events.deleteEvent(events.planned[0].id)
		expect(values).toEqual([[], ['Created'], ['Edited'], []])
	} finally {
		stop()
	}
})

it('инициализация сохраняет порядок событий исходного снимка', () => {
	const events = new EventsStore(new ProjectsStore())
	const data = {
		completedList: [
			{ name: 'Later', start: '2026.11.02' },
			{ name: 'Earlier', start: date }
		],
		plannedList: []
	}
	events.init(data)
	expect(events.prepareToSave().completedList.map(event => event.name)).toEqual(['Later', 'Earlier'])
})

it('подсветка смонтированного события реагирует на поиск и очистку без перерисовки родителя', () => {
	const { documentTabsStore: tabs, eventsCache: cache, eventSearchStore: search } = app.stores
	tabs.activeEventsStore!.addPlannedEventDto({ name: 'Match', start: date })
	const event = cache.getEvents(day())[0]
	render(
		<StoreProvider {...app.stores}>
			<CalendarEventItem event={event} timestamp={day()} daysInCurrentWeek={1} />
		</StoreProvider>
	)
	const item = screen.getByRole('button', { name: 'Match' })
	expect(item).not.toHaveClass('highlighted')
	act(() => {
		search.search('match')
	})
	expect(item).toHaveClass('highlighted')
	act(() => {
		search.clear()
	})
	expect(item).not.toHaveClass('highlighted')
})

it('повторная навигация к той же неделе снова прокручивает календарь', () => {
	render(
		<StoreProvider {...app.stores}>
			<Calendar />
		</StoreProvider>
	)
	const scroll = jest.mocked(Element.prototype.scrollIntoView)
	scroll.mockClear()
	act(() => {
		app.stores.calendarStore.setWeek(day())
	})
	expect(scroll).toHaveBeenCalledTimes(1)
	act(() => {
		app.stores.calendarStore.setWeek(day())
	})
	expect(scroll).toHaveBeenCalledTimes(2)
})

it.each(['calendar', 'day'])('%s обновляет имя, стиль и баланс при правках без закрытия формы', view => {
	const { documentTabsStore: tabs, eventsCache: cache } = app.stores
	const events = tabs.activeEventsStore!
	const projects = tabs.activeProjectsStore!
	projects.add('Project', 'red', 'white')
	const projectId = projects.getByName('Project')!.id
	cache.getEvents(day())
	const { container } = render(
		<StoreProvider {...app.stores}>
			{view === 'calendar' ? <Calendar /> : <DayList />}
			<ProjectList />
		</StoreProvider>
	)
	const balance = () => container.querySelector(view === 'calendar' ? `[data-date="${date}"] .balance` : '.balance')!
	const card = () => screen.getByText('Project', { exact: true }).parentElement!
	const scroll = jest.mocked(Element.prototype.scrollIntoView)
	scroll.mockClear()
	act(() => {
		events.addPlannedEventDto({ name: 'Created', start: date, credit: 1000, projectId })
	})
	expect(screen.getByText('Created')).toBeVisible()
	expect(balance()).toHaveTextContent('0.0+1.0k 0.0')
	expect(card()).toHaveTextContent('1 event')
	act(() => {
		events.updateEvent(events.planned[0].id, { name: 'Edited', start: date, debit: 2000, projectId })
	})
	expect(screen.queryByText('Created')).toBeNull()
	expect(screen.getByText('Edited')).toBeVisible()
	expect(balance()).toHaveTextContent('0.0-2.0k 0.0')
	expect(card()).toHaveTextContent('1 event')
	act(() => {
		projects.update(projectId, { color: 'blue', background: 'yellow' })
	})
	expect(screen.getByText('Edited').parentElement).toHaveStyle(
		'color: rgb(0, 0, 255); background-color: rgb(255, 255, 0)'
	)
	act(() => {
		events.deleteEvent(events.planned[0].id)
	})
	expect(screen.queryByText('Edited')).toBeNull()
	expect(balance()).toHaveTextContent('0.0k 0.0')
	expect(card()).toHaveTextContent('0 events')
	expect(scroll).not.toHaveBeenCalled()
})

it.each(['calendar', 'day'])(
	'%s реагирует на переключение вкладок, правки неактивной вкладки и применение снимка',
	view => {
		const { documentTabsStore: tabs } = app.stores
		const first = tabs.activeDocumentId!
		tabs.activeEventsStore!.addPlannedEventDto({ name: 'First', start: date })
		tabs.openNewDocument()
		const second = tabs.activeDocumentId!
		tabs.activeEventsStore!.addPlannedEventDto({ name: 'Second', start: date })
		render(<StoreProvider {...app.stores}>{view === 'calendar' ? <Calendar /> : <DayList />}</StoreProvider>)
		expect(screen.getByText('Second')).toBeVisible()
		act(() => {
			tabs.getDocumentStores(first)!.eventsStore.updateEvent(1, { name: 'First edited', start: date })
		})
		expect(screen.getByText('Second')).toBeVisible()
		expect(screen.queryByText('First edited')).toBeNull()
		act(() => {
			tabs.activateDocument(first)
		})
		expect(screen.getByText('First edited')).toBeVisible()
		expect(screen.queryByText('Second')).toBeNull()
		act(() => {
			tabs.applyContentToDocument(first, {
				projectsList: [],
				completedList: [],
				plannedList: [{ name: 'Remote', start: date }]
			})
		})
		expect(screen.getByText('Remote')).toBeVisible()
		expect(screen.queryByText('First edited')).toBeNull()
		act(() => {
			tabs.activateDocument(second)
		})
		expect(screen.getByText('Second')).toBeVisible()
		expect(screen.queryByText('Remote')).toBeNull()
	}
)

it.each(['calendar', 'day'])('%s обновляет повторяемое вхождение при завершении и отмене завершения', view => {
	const { documentTabsStore: tabs } = app.stores
	const events = tabs.activeEventsStore!
	events.addPlannedEventDto({ name: 'Daily', start: date, repeat: '/1', credit: 1000 })
	const id = events.plannedRepeatable[0].id
	render(<StoreProvider {...app.stores}>{view === 'calendar' ? <Calendar /> : <DayList />}</StoreProvider>)
	const row = () =>
		view === 'calendar'
			? screen.getAllByText('Daily').find(element => element.closest(`[data-date="${date}"]`))!.parentElement!
			: screen.getByText('Daily').parentElement!
	expect(row()).toHaveClass('repeatable')
	act(() => {
		events.completeEvent(id, day(), { name: 'Done', start: date, credit: 1000 })
	})
	expect(screen.getByText('Done').parentElement).toHaveClass('completed')
	act(() => {
		events.uncompleteEvent(events.completed[0].id, { name: 'Undone', start: date, credit: 1000 })
	})
	expect(screen.queryByText('Done')).toBeNull()
	expect(screen.getByText('Undone').parentElement).toHaveClass('item')
})
