import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import { parseDecimal } from 'src/7-shared/libs/Decimal/Decimal'
import { ProjectsStore } from '../Projects/ProjectsStore'
import { EventsStore, EventsStoreData } from './EventsStore'
import { EventDto } from './EventDto'
import * as identity from './EventIdentity'
import { eventDtoToIEventModel, singleEventModelToEventDto } from './EventMappers'
import { repeatableEventToEventCache, singleEventToEventCache } from '../EventsCache/EventCacheStructure'
import ZCron from 'src/7-shared/libs/ZCron/ZCron'

const day = (value = '2026.11.01') => DateTime.YYYYMMDDToTimestamp(value)
const amount = parseDecimal('-100.25')
const plan = (): EventDto => ({
	name: 'Purchase',
	start: '2026.11.01',
	credit: 0,
	debit: 100.25,
	plannedOperation: {
		kind: 'expense',
		movements: [
			{
				id: 'payment',
				resourceId: 'RUB',
				quantity: amount,
				role: 'principal',
				target: { kind: 'account-category', categoryId: 'cards' }
			}
		],
		pricing: [
			{
				pricedMovementId: 'payment',
				quoteResourceId: 'RUB',
				pricePerUnit: parseDecimal('1'),
				updateResourcePrice: false
			}
		],
		cashback: { categoryId: 'food', paymentMovementIds: ['payment'] }
	}
})

function setup() {
	const projects = new ProjectsStore()
	const events = new EventsStore(projects, true)
	events.init({ completedList: [], plannedList: [] })
	return { events, projects }
}

function reload(events: EventsStore) {
	const data: EventsStoreData = JSON.parse(JSON.stringify(events.prepareToSave()))
	const next = setup()
	next.events.init(data)
	return next.events
}

function series(events: EventsStore, repeat = '/1') {
	events.addPlannedEventDto({ ...plan(), repeat, end: '2026.11.06' })
	return events.plannedRepeatable[0]
}

function plannedCount(events: EventsStore, date: number) {
	return (
		events.planned.filter(event => event.start === date).length +
		events.plannedRepeatable.filter(
			event => date >= event.start && (!event.end || date < event.end) && ZCron.isMatch(event.repeat, event.start, date)
		).length
	)
}

function assertUnique(events: EventsStore) {
	const data = events.prepareToSave()
	expect(() => identity.validateEventIdentities([...data.completedList, ...data.plannedList])).not.toThrow()
}

describe('R02: stable event and occurrence identity (internal path)', () => {
	afterEach(() => jest.restoreAllMocks())

	it('generates identity only during creation and keeps equal-content events distinct', () => {
		const { events } = setup()
		events.addPlannedEventDto({ name: 'Same', start: '2026.11.01' })
		events.addPlannedEventDto({ name: 'Same', start: '2026.11.01' })
		expect(events.planned[0].eventUid).toBeTruthy()
		expect(events.planned[1].eventUid).not.toBe(events.planned[0].eventUid)
		const generate = jest.spyOn(identity, 'newEventUid').mockImplementation(() => {
			throw new Error('read generated ID')
		})
		const json = JSON.stringify(events.prepareToSave())
		events.getEventDto(events.planned[0].id)
		eventDtoToIEventModel(JSON.parse(json).plannedList[0])
		expect(reload(events).prepareToSave()).toEqual(events.prepareToSave())
		expect(generate).not.toHaveBeenCalled()
	})

	it('preserves event/movement IDs on edit, move, complete, reload and cancellation', () => {
		let { events } = setup()
		events.addPlannedEventDto(plan())
		const uid = events.planned[0].eventUid
		events.updateEvent(events.planned[0].id, {
			name: 'Edited',
			start: '2026.11.01',
			eventUid: 'spoofed',
			seriesUid: 'spoofed-series',
			occurrence: { seriesUid: 'spoofed-series', occurrenceDate: '2020.01.01' },
			originalPlan: { name: 'Spoofed plan', start: '2020.01.01' }
		})
		expect(events.planned[0].eventUid).toBe(uid)
		expect(events.planned[0].seriesUid).toBeUndefined()
		expect(events.planned[0].occurrence).toBeUndefined()
		expect(events.planned[0].originalPlan).toBeUndefined()
		expect(events.planned[0].plannedOperation!.movements[0].id).toBe('payment')
		events.shiftToDate(events.planned[0].id, day('2026.11.02'), day())
		const before = events.getEventDto(events.planned[0].id)!
		const id = events.planned[0].id
		events.completeEvent(id, day('2026.11.02'), {
			...before,
			name: 'Actual purchase',
			start: '2026.11.03',
			actualOperation: {
				kind: 'expense',
				effectiveDate: '2026.11.03',
				movements: [
					{
						id: 'actual-payment',
						resourceId: 'RUB',
						quantity: parseDecimal('-95'),
						accountId: 'card',
						role: 'principal'
					}
				]
			}
		})
		events.completeEvent(id, day('2026.11.02'), before)
		expect(events.completed).toHaveLength(1)
		expect(events.completed[0]).toMatchObject({ eventUid: uid, originalPlan: before })
		expect(events.completed[0].plannedOperation).toBeUndefined()
		events = reload(events)
		expect(events.completed[0].actualOperation!.movements[0].id).toBe('actual-payment')
		events.uncompleteEvent(events.completed[0].id, { name: 'Ignored old form', start: '2020.01.01' })
		expect(events.completed).toHaveLength(0)
		expect(events.prepareToSave().plannedList).toEqual([before])
		expect(reload(events).prepareToSave().plannedList).toEqual([before])
	})

	it.each([false, true])('copies a %s-completed event as a new plan and remaps movement references', completed => {
		const { events } = setup()
		events.addPlannedEventDto(plan())
		if (completed) events.completeEvent(events.planned[0].id, day(), events.getEventDto(events.planned[0].id)!)
		const source = completed ? events.completed[0] : events.planned[0]
		const json = JSON.stringify(events.getEventDto(source.id))
		events.copyToDate(source.id, day('2026.11.02'))
		const copy = events.planned.find(event => event.start === day('2026.11.02'))!
		expect(copy.eventUid).not.toBe(source.eventUid)
		expect(copy.actualOperation).toBeUndefined()
		expect(copy.originalPlan).toBeUndefined()
		expect(copy.occurrence).toBeUndefined()
		const movementId = copy.plannedOperation!.movements[0].id
		expect(movementId).not.toBe('payment')
		expect(copy.plannedOperation!.pricing![0].pricedMovementId).toBe(movementId)
		expect(copy.plannedOperation!.cashback!.paymentMovementIds).toEqual([movementId])
		expect(JSON.stringify(events.getEventDto(source.id))).toBe(json)
		assertUnique(events)
	})

	it('copies a direct fact using its actual quantities and accounts without cashback payout links', () => {
		const { events } = setup()
		events.addCompletedEventDto({
			name: 'Direct fact',
			start: '2026.11.01',
			actualOperation: {
				kind: 'income',
				effectiveDate: '2026.11.01',
				movements: [
					{
						id: 'reward',
						resourceId: 'bonus',
						quantity: parseDecimal('200'),
						accountId: 'bonus-account',
						role: 'principal'
					}
				],
				cashbackPayout: {
					sourcePurchases: [{ eventUid: 'purchase', movementId: 'payment' }],
					purchaseMonth: '2026-11',
					rewardResourceId: 'bonus'
				}
			}
		})
		events.copyToDate(events.completed[0].id, day('2026.11.02'))
		expect(events.completed).toHaveLength(1)
		expect(events.planned[0].plannedOperation).toMatchObject({
			movements: [{ quantity: '200', target: { kind: 'account', accountId: 'bonus-account' } }]
		})
		expect(events.planned[0].plannedOperation!.cashbackPayout).toBeUndefined()
		events.uncompleteEvent(events.completed[0].id, events.getEventDto(events.completed[0].id)!)
		expect(events.planned.find(event => event.start === day())!.plannedOperation!.movements[0].quantity).toBe('200')
		assertUnique(events)
	})

	it.each(['/1', '* * *', '/2'])('splits %s with distinct segment IDs and one stable series', repeat => {
		const { events, projects } = setup()
		const original = series(events, repeat)
		const uid = original.eventUid
		const seriesUid = original.seriesUid
		const dto = events.getEventDto(original.id)!
		events.completeEvent(original.id, day('2026.11.03'), dto)
		expect(events.plannedRepeatable).toHaveLength(2)
		expect(new Set(events.plannedRepeatable.map(event => event.eventUid)).size).toBe(2)
		expect(events.plannedRepeatable.some(event => event.eventUid === uid)).toBe(true)
		expect(events.plannedRepeatable.every(event => event.seriesUid === seriesUid)).toBe(true)
		expect(events.completed[0].occurrence).toEqual({ seriesUid, occurrenceDate: '2026.11.03' })
		expect(events.completed[0].start).toBe(day('2026.11.03'))
		expect(plannedCount(events, day('2026.11.03'))).toBe(0)
		expect(projects.list.reduce((total, project) => total + project.events, 0)).toBe(3)
		assertUnique(reload(events))
	})

	it.each(['complete', 'detach', 'delete'] as const)(
		'ignores stale/non-occurring requests for %s without notifications',
		command => {
			const { events } = setup()
			const original = series(events, '/2')
			const dto = events.getEventDto(original.id)!
			const perform = (date: number) => {
				if (command === 'complete') events.completeEvent(original.id, date, dto)
				if (command === 'detach') events.saveAsSingleEvent(original.id, date, dto)
				if (command === 'delete') events.deleteCurrentRepeatableEvent(original.id, date)
			}
			const notify = jest.fn()
			events.onChangeList = notify
			const before = events.prepareToSave()
			perform(day('2026.10.31'))
			perform(day('2026.11.02'))
			perform(day('2026.11.06'))
			expect(events.prepareToSave()).toEqual(before)
			expect(notify).not.toHaveBeenCalled()
			perform(day('2026.11.03'))
			const after = events.prepareToSave()
			perform(day('2026.11.03'))
			expect(events.prepareToSave()).toEqual(after)
			expect(notify).toHaveBeenCalledTimes(1)
			assertUnique(events)
		}
	)

	it('restores only the cancelled occurrence after reload and editing the remaining series', () => {
		let { events } = setup()
		const original = series(events)
		const dto = events.getEventDto(original.id)!
		events.completeEvent(original.id, day('2026.11.02'), dto)
		events.completeEvent(original.id, day('2026.11.03'), dto)
		events = reload(events)
		const remaining = events.plannedRepeatable.find(event => event.start === day('2026.11.04'))!
		events.updateEvent(remaining.id, {
			...events.getEventDto(remaining.id)!,
			name: 'Edited series',
			start: '2026.11.02'
		})
		expect(plannedCount(events, day('2026.11.02'))).toBe(0)
		expect(plannedCount(events, day('2026.11.03'))).toBe(0)
		const completed = events.completed.find(event => event.occurrence!.occurrenceDate === '2026.11.02')!
		events.uncompleteEvent(completed.id, events.getEventDto(completed.id)!)
		events.uncompleteEvent(completed.id, dto)
		events = reload(events)
		expect(plannedCount(events, day('2026.11.02'))).toBe(1)
		expect(plannedCount(events, day('2026.11.03'))).toBe(0)
		expect(events.completed).toHaveLength(1)
		expect(events.completed[0].occurrence!.occurrenceDate).toBe('2026.11.03')
		expect(events.plannedRepeatable.every(event => event.name === 'Edited series' || event.start === day())).toBe(true)
		assertUnique(events)
	})

	it('detaches, moves, completes and restores one occurrence with its original date key', () => {
		let { events } = setup()
		const original = series(events)
		events.saveAsSingleEvent(original.id, day('2026.11.02'), events.getEventDto(original.id)!)
		const occurrence = events.planned[0].occurrence
		const uid = events.planned[0].eventUid
		events.shiftToDate(events.planned[0].id, day('2026.11.10'), day('2026.11.02'))
		events.completeEvent(events.planned[0].id, day('2026.11.10'), events.getEventDto(events.planned[0].id)!)
		events = reload(events)
		events.uncompleteEvent(events.completed[0].id, events.getEventDto(events.completed[0].id)!)
		expect(events.planned[0]).toMatchObject({ eventUid: uid, occurrence, start: day('2026.11.10') })
		expect(plannedCount(events, day('2026.11.02'))).toBe(0)
		expect(plannedCount(events, day('2026.11.10'))).toBe(1)
		assertUnique(events)
	})

	it('preserves the source plan when detaching an occurrence with edits', () => {
		const { events } = setup()
		const original = series(events)
		events.saveAsSingleEvent(original.id, day('2026.11.02'), {
			...events.getEventDto(original.id)!,
			name: 'Detached edit',
			debit: 200
		})
		const single = reload(events).planned[0]
		expect(single).toMatchObject({ name: 'Detached edit', start: day('2026.11.02'), debit: 200 })
		expect(single.originalPlan).toMatchObject({ name: 'Purchase', start: '2026.11.02', debit: 100.25 })
		expect(single.originalPlan!.occurrence).toEqual(single.occurrence)
		assertUnique(events)
	})

	it('copies a series occurrence as an independent single plan', () => {
		const { events } = setup()
		const original = series(events)
		events.copyToDate(original.id, day('2026.11.10'))
		expect(events.planned[0].seriesUid).toBeUndefined()
		expect(events.planned[0].occurrence).toBeUndefined()
		expect(events.planned[0].eventUid).not.toBe(original.eventUid)
		expect(events.plannedRepeatable).toHaveLength(1)
		assertUnique(events)
	})

	it('does not alias snapshots, DTOs or copied operations', () => {
		const { events } = setup()
		const input = plan()
		events.addPlannedEventDto(input)
		input.plannedOperation!.movements[0].quantity = parseDecimal('-999')
		expect(events.planned[0].plannedOperation!.movements[0].quantity).toBe(amount)
		events.completeEvent(events.planned[0].id, day(), events.getEventDto(events.planned[0].id)!)
		const output = events.prepareToSave()
		output.completedList[0].originalPlan!.plannedOperation!.movements[0].quantity = parseDecimal('-1')
		expect(events.completed[0].originalPlan!.plannedOperation!.movements[0].quantity).toBe(amount)
	})

	it('passes identities and deterministic occurrence keys into calendar rows without generating IDs', () => {
		const { events } = setup()
		const original = series(events)
		const before = events.prepareToSave()
		const generate = jest.spyOn(identity, 'newEventUid').mockImplementation(() => {
			throw new Error('render generated ID')
		})
		const row = repeatableEventToEventCache(original, day('2026.11.02'), false, 'black', 'white')
		expect(row.occurrenceKey).toBe(
			identity.occurrenceEventUid({ seriesUid: original.seriesUid!, occurrenceDate: '2026.11.02' })
		)
		expect(repeatableEventToEventCache(original, day('2026.11.03'), false, 'black', 'white').occurrenceKey).not.toBe(
			row.occurrenceKey
		)
		expect(events.prepareToSave()).toEqual(before)
		expect(generate).not.toHaveBeenCalled()
		generate.mockRestore()
		events.completeEvent(original.id, day('2026.11.02'), events.getEventDto(original.id)!)
		expect(singleEventToEventCache(events.completed[0], day('2026.11.02'), true, 'black', 'white').occurrenceKey).toBe(
			row.occurrenceKey
		)
	})

	it('rejects missing/duplicate identity before replacing loaded data', () => {
		const { events } = setup()
		events.addPlannedEventDto(plan())
		const before = events.prepareToSave()
		expect(() => events.init({ completedList: [], plannedList: [plan()] })).toThrow('eventUid')
		expect(events.prepareToSave()).toEqual(before)
		expect(() =>
			events.init({ completedList: [], plannedList: [before.plannedList[0], before.plannedList[0]] })
		).toThrow('eventUid')
		expect(events.prepareToSave()).toEqual(before)
		expect(() => events.addPlannedEventDto({ ...plan(), eventUid: 'another' })).toThrow('Движения')
		expect(events.prepareToSave()).toEqual(before)
	})

	it('restores the final occurrence even when no schedule segment survives', () => {
		let { events } = setup()
		events.addPlannedEventDto({ ...plan(), repeat: '/1', end: '2026.11.02' })
		const original = events.plannedRepeatable[0]
		events.completeEvent(original.id, day(), events.getEventDto(original.id)!)
		expect(events.plannedRepeatable).toHaveLength(0)
		events = reload(events)
		const uid = events.completed[0].eventUid
		events.uncompleteEvent(events.completed[0].id, events.getEventDto(events.completed[0].id)!)
		events = reload(events)
		expect(plannedCount(events, day())).toBe(1)
		expect(events.planned[0].eventUid).toBe(uid)
		events.completeEvent(events.planned[0].id, day(), events.getEventDto(events.planned[0].id)!)
		expect(events.completed).toHaveLength(1)
		expect(events.completed[0].eventUid).toBe(uid)
		assertUnique(events)
	})

	it('rejects duplicate movement IDs on edits/completions before changing the store', () => {
		const { events } = setup()
		events.addPlannedEventDto(plan())
		events.addPlannedEventDto({ name: 'Other', start: '2026.11.01' })
		const other = events.planned.find(event => event.name === 'Other')!
		const before = events.prepareToSave()
		expect(() => events.updateEvent(other.id, plan())).toThrow('Движения')
		expect(() =>
			events.completeEvent(other.id, day(), {
				name: 'Other fact',
				start: '2026.11.01',
				actualOperation: {
					kind: 'expense',
					effectiveDate: '2026.11.01',
					movements: [{ id: 'payment', resourceId: 'RUB', quantity: amount, accountId: 'card', role: 'principal' }]
				}
			})
		).toThrow('Движения')
		expect(events.prepareToSave()).toEqual(before)
	})

	it('rejects duplicate occurrence keys even if event UIDs differ', () => {
		const { events } = setup()
		const occurrence = { seriesUid: 'series', occurrenceDate: '2026.11.01' }
		expect(() =>
			events.init({
				completedList: [],
				plannedList: [
					{ name: 'A', start: '2026.11.01', eventUid: 'a', occurrence },
					{ name: 'B', start: '2026.11.02', eventUid: 'b', occurrence }
				]
			})
		).toThrow('ключ')
	})

	it('keeps the public legacy writer and default store on the old format', () => {
		const events = new EventsStore(new ProjectsStore())
		events.init({ completedList: [], plannedList: [{ name: 'Legacy', start: '2026.11.01' }] })
		expect(events.planned[0].eventUid).toBeUndefined()
		expect(events.prepareToSave().plannedList[0].eventUid).toBeUndefined()
		const stable = setup().events
		stable.addPlannedEventDto(plan())
		expect(singleEventModelToEventDto(stable.planned[0]).eventUid).toBeUndefined()
		expect(singleEventModelToEventDto(stable.planned[0], true).eventUid).toBeTruthy()
	})
})
