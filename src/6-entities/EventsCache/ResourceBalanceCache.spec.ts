import { autorun } from 'mobx'
import { DocumentTabsStore } from '../Document/model/DocumentTabsStore'
import { ResourceDocumentPersistence } from '../Document/model/ResourceDocumentPersistence'
import { createResourceDocumentRuntime } from '../Document/model/ResourceDocumentRuntime'
import type { ResourceDocumentData } from '../Document/model/ResourceDocument.types'
import {
	resourceBalanceDocument,
	balanceActual as actual,
	balancePlan as plan
} from 'src/test-utils/resourceBalanceDocument'
import { parseDecimal as d } from 'src/7-shared/libs/Decimal/Decimal'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import {
	ResourceBalanceCache,
	RESOURCE_BALANCE_CACHE_CAPACITY,
	RESOURCE_DOCUMENT_CACHE_CAPACITY
} from './ResourceBalanceCache'
import { ResourceBalanceClock } from './ResourceBalanceClock'
import { EventsCache, ResourceBalanceUnavailableError } from './EventsCache'

const runtime = createResourceDocumentRuntime({
	id: 'balances',
	currency: { code: 'RUB', scale: 2 },
	currencyConfirmed: true,
	asOf: '2026.11.01',
	timezone: 'Europe/Moscow'
})
function setup(data = resourceBalanceDocument()) {
	const persistence = new ResourceDocumentPersistence(
		undefined,
		() => localStorage,
		() => undefined
	)
	const tabs = new DocumentTabsStore({} as any, persistence, runtime)
	tabs.openNewDocument('Остатки')
	const id = tabs.activeDocumentId!
	tabs.applyContentToDocument(id, data)
	const clock = new ResourceBalanceClock(() => Date.parse('2026-11-03T09:00:00Z'))
	const cache = new ResourceBalanceCache(tabs, clock)
	const edit = (change: (draft: ResourceDocumentData) => void) =>
		tabs.editDocument(id, draft => change(draft as ResourceDocumentData))
	return { tabs, id, cache, clock, edit, get: (date = '2026.11.04') => cache.get(id, date) }
}

describe('R06 document balances and projection cache', () => {
	beforeEach(() => {
		localStorage.clear()
		DateTime.initLocale(3)
	})
	afterEach(() => {
		jest.restoreAllMocks()
		jest.useRealTimers()
		DateTime.initLocale(3)
	})

	it('uses all past facts, today facts and future facts on their own dates while overdue plans stay separate', () => {
		const data = resourceBalanceDocument()
		data.completedList = [
			actual('opening', '2026.11.01', 'card', 'RUB', '100'),
			actual('today', '2026.11.03', 'card', 'RUB', '-10'),
			actual('future', '2026.11.07', 'card', 'RUB', '50', { start: '2026.11.01' })
		]
		data.plannedList = [
			plan('late', '2026.11.02', 'RUB', '-70'),
			plan('today-plan', '2026.11.03', 'RUB', '-5', { kind: 'account', accountId: 'card' }),
			plan('tomorrow', '2026.11.04', 'RUB', '-7')
		]
		const { get } = setup(data)
		expect(get('2026.11.02').grandTotal.amount).toBe('100')
		expect(get('2026.11.03').grandTotal.amount).toBe('100')
		expect(get('2026.11.04').grandTotal.amount).toBe('85')
		expect(get('2026.11.05').grandTotal.amount).toBe('78')
		expect(get('2026.11.07').grandTotal.amount).toBe('78')
		expect(get('2026.11.08').grandTotal.amount).toBe('128')
		expect(get().overdue).toMatchObject([{ eventUid: 'late', occurrenceCount: 1, positions: [{ quantity: '-70' }] }])
	})

	it('preserves the category and grand totals when a category plan is assigned to an account in that category', () => {
		const data = resourceBalanceDocument()
		data.completedList = [
			actual('a', '2026.11.01', 'card', 'RUB', '20000'),
			actual('b', '2026.11.01', 'card-b', 'RUB', '10000')
		]
		data.plannedList = [
			plan('card-plan', '2026.11.03', 'RUB', '-5000', { kind: 'account', accountId: 'card' }),
			plan('group-plan', '2026.11.03', 'RUB', '-7000', { kind: 'account-category', categoryId: 'everyday' })
		]
		const { get, edit } = setup(data)
		const before = get()
		expect(before.grandTotal.amount).toBe('18000')
		expect(before.accounts.find(row => row.accountId === 'card-b')!.resources[0].quantity).toBe('10000')
		edit(draft => {
			draft.plannedList[1].plannedOperation!.movements[0].target = { kind: 'account', accountId: 'card-b' }
		})
		const after = get()
		expect(after.grandTotal).toEqual(before.grandTotal)
		expect(after.accountCategories).toEqual(before.accountCategories)
		expect(after.accounts.find(row => row.accountId === 'card-b')!.resources[0].quantity).toBe('3000')
	})

	it('includes the intersection of account/resource categories and includes unassigned plans only once', () => {
		const data = resourceBalanceDocument()
		data.balanceCategories.push({
			id: 'excluded',
			dimension: 'account',
			name: 'Скрытый капитал',
			includeInGrandTotal: false,
			showInSummary: true
		})
		data.accounts.find(row => row.id === 'broker')!.categoryId = 'excluded'
		data.completedList = [
			actual('r', '2026.11.01', 'card', 'RUB', '100'),
			actual('u', '2026.11.01', 'broker', 'USD', '10'),
			actual('f', '2026.11.01', 'tank', 'fuel', '5')
		]
		data.plannedList = [
			plan('unassigned', '2026.11.03', 'USD', '-1'),
			plan('group', '2026.11.03', 'RUB', '-7', { kind: 'account-category', categoryId: 'everyday' })
		]
		const { get } = setup(data)
		expect(get().grandTotal.amount).toBe('3') // 100 - 90 - 7; excluded broker USD and material fuel are not added.
		expect(get().unassigned).toHaveLength(1)
		expect(
			get()
				.resourceCategories.find(row => row.categoryId === 'money')!
				.resources.find(row => row.resourceId === 'USD')!.quantity
		).toBe('9')
	})

	it('changes summary visibility without changing grand total or rebuilding quantities', () => {
		const data = resourceBalanceDocument()
		data.completedList = [actual('r', '2026.11.01', 'card', 'RUB', '100')]
		const { get, cache, id, edit } = setup(data)
		const before = get()
		const stats = cache.diagnostics(id)
		edit(draft => {
			draft.balanceCategories.find(row => row.id === 'money')!.showInSummary = false
			draft.balanceCategories.find(row => row.id === 'everyday')!.showInSummary = false
		})
		const after = get()
		expect(after.grandTotal).toEqual(before.grandTotal)
		expect(after.resourceCategories.some(row => row.categoryId === 'money')).toBe(false)
		expect(after.accountCategories).toEqual([])
		expect(after.accounts.find(row => row.accountId === 'card')!.showInSummary).toBe(false)
		expect(cache.diagnostics(id).indexBuilds).toBe(stats.indexBuilds)
	})

	it('reprojects warm quantities when an account moves between categories', () => {
		const data = resourceBalanceDocument()
		data.balanceCategories.push({
			id: 'excluded',
			name: 'Вне итога',
			dimension: 'account',
			includeInGrandTotal: false,
			showInSummary: true
		})
		data.completedList = [actual('r', '2026.11.01', 'card', 'RUB', '100')]
		const { get, cache, id, edit } = setup(data)
		expect(get().grandTotal.amount).toBe('100')
		const stats = cache.diagnostics(id)
		edit(draft => {
			draft.accounts.find(row => row.id === 'card')!.categoryId = 'excluded'
		})
		expect(get().grandTotal.amount).toBe('0')
		expect(get().positions[0].quantity).toBe('100')
		expect(cache.diagnostics(id).indexBuilds).toBe(stats.indexBuilds)
		expect(cache.diagnostics(id).quantityReads).toBe(stats.quantityReads)
	})

	it('reprices a warm result without scanning movements or rebuilding quantity indexes', () => {
		const data = resourceBalanceDocument()
		data.completedList = [actual('u', '2026.11.01', 'broker', 'USD', '100')]
		const { get, cache, tabs, id } = setup(data)
		const before = get()
		const stats = cache.diagnostics(id)
		expect(get()).toBe(before)
		tabs.resourceCommands.setPrice(id, 'USD', { amountPerUnit: d('95'), quoteResourceId: 'RUB', asOf: '2026.11.01' })
		const after = get()
		expect(before.grandTotal.amount).toBe('9000')
		expect(after.grandTotal.amount).toBe('9500')
		expect(after.positions).toBe(before.positions)
		expect(after.priceSnapshot.version).toBe(before.priceSnapshot.version + 1)
		expect(cache.diagnostics(id)).toMatchObject({ indexBuilds: stats.indexBuilds, quantityReads: stats.quantityReads })
		expect(Object.isFrozen(after.positions[0].actual)).toBe(true)
	})

	it('keeps one immutable price snapshot for the whole calendar range', () => {
		const { cache, id } = setup()
		const rows = cache.range(id, '2026.11.01', '2026.11.08')
		expect(rows).toHaveLength(7)
		expect(rows.every(row => row.priceSnapshot === rows[0].priceSnapshot)).toBe(true)
		expect(Object.isFrozen(rows)).toBe(true)
	})

	it('exposes a partial valuation only for included nonzero positions', () => {
		const data = resourceBalanceDocument()
		delete data.resources.find(row => row.id === 'USD')!.price
		delete data.resources.find(row => row.id === 'fuel')!.price
		data.completedList = [
			actual('r', '2026.11.01', 'card', 'RUB', '100'),
			actual('u', '2026.11.01', 'broker', 'USD', '10'),
			actual('f', '2026.11.01', 'tank', 'fuel', '10')
		]
		const { get, edit } = setup(data)
		expect(get().grandTotal).toMatchObject({
			amount: '100',
			complete: false,
			unvaluedPositions: [{ resourceId: 'USD', quantity: '10' }]
		})
		edit(draft => {
			draft.balanceCategories.find(row => row.id === 'materials')!.includeInGrandTotal = true
		})
		expect(get().grandTotal.unvaluedPositions.map(row => row.resourceId)).toEqual(['USD', 'fuel'])
	})

	it('shows archived quantities and historical dates in current catalog prices', () => {
		const data = resourceBalanceDocument()
		data.completedList = [actual('u', '2020.01.01', 'broker', 'USD', '10')]
		const { get, tabs, id } = setup(data)
		tabs.resourceCommands.archive(id, 'account', 'broker')
		tabs.resourceCommands.archive(id, 'resource', 'USD')
		tabs.resourceCommands.setPrice(id, 'USD', { amountPerUnit: d('95'), quoteResourceId: 'RUB', asOf: '2026.11.01' })
		expect(get('2020.01.02')).toMatchObject({
			valuationBasis: 'current-prices',
			grandTotal: { amount: '950' },
			positions: [{ quantity: '10' }]
		})
	})

	it('refreshes the default forecast day after midnight without rebuilding quantities', () => {
		const data = resourceBalanceDocument()
		data.plannedList = [plan('p', '2026.11.03', 'RUB', '-5')]
		const { cache, clock, id } = setup(data)
		const observed: string[] = []
		const stop = autorun(() => observed.push(cache.get(id, '2026.11.05').grandTotal.amount))
		const stats = cache.diagnostics(id)
		clock.refresh(Date.parse('2026-11-04T00:00:00Z'))
		expect(observed).toEqual(['-5', '0'])
		expect(cache.get(id).forecastFrom).toBe('2026.11.04')
		expect(cache.get(id).overdue[0].eventUid).toBe('p')
		expect(cache.diagnostics(id).indexBuilds).toBe(stats.indexBuilds)
		stop()
	})

	it('reacts to the document timezone without mutating the global DateTime timezone or civil quantities', () => {
		const data = resourceBalanceDocument()
		data.completedList = [actual('r', '2026.11.01', 'card', 'RUB', '100')]
		data.plannedList = [plan('p', '2026.11.01', 'RUB', '-10')]
		const { cache, clock, id, edit } = setup(data)
		clock.refresh(Date.parse('2026-11-01T22:30:00Z'))
		expect(cache.get(id).date).toBe('2026.11.02')
		edit(draft => {
			draft.timezone = 'America/New_York'
		})
		expect(cache.get(id).date).toBe('2026.11.01')
		expect(cache.get(id, '2026.11.03').grandTotal.amount).toBe('90')
		DateTime.initLocale(-8)
		expect(cache.get(id, '2026.11.03').grandTotal.amount).toBe('90')
	})

	it('updates warm observer results after movement edits and does not re-read another active document', () => {
		const data = resourceBalanceDocument()
		data.completedList = [actual('r', '2026.11.01', 'card', 'RUB', '100')]
		const { cache, tabs, id, edit } = setup(data)
		const values: string[] = []
		const stop = autorun(() => values.push(cache.get(id, '2026.11.04').grandTotal.amount))
		tabs.openNewDocument('Вторая')
		edit(draft => {
			draft.completedList[0].actualOperation!.movements[0].quantity = d('120')
		})
		expect(values.at(-1)).toBe('120')
		expect(cache.get(tabs.activeDocumentId!, '2026.11.04').grandTotal.amount).toBe('0')
		stop()
	})

	it('bounds date, schedule and document caches and rejects accidental expansion of a huge calendar', () => {
		const { cache, id, tabs } = setup()
		for (let i = 0; i < 600; i++) cache.get(id, new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10))
		expect(cache.diagnostics(id).reports).toBe(RESOURCE_BALANCE_CACHE_CAPACITY)
		expect(cache.diagnostics(id).quantities).toBe(RESOURCE_BALANCE_CACHE_CAPACITY)
		expect(() => cache.range(id, '0001.01.01', '9999.12.31')).toThrow('512')
		for (let i = 0; i < RESOURCE_DOCUMENT_CACHE_CAPACITY + 2; i++) {
			tabs.openNewDocument()
			cache.get(tabs.activeDocumentId!)
		}
		expect(cache.diagnostics(tabs.activeDocumentId!).documents).toBe(RESOURCE_DOCUMENT_CACHE_CAPACITY)
	})

	it('does not return stale data after a document is closed', () => {
		const { cache, id, tabs } = setup()
		cache.get(id)
		tabs.closeDocument(id)
		expect(() => cache.get(id)).toThrow('открытый ресурсный документ')
	})

	it('keeps resource quantities and incomplete valuation in calendar event DTOs and blocks legacy scalar totals', () => {
		const data = resourceBalanceDocument()
		data.completedList = [actual('r', '2026.11.01', 'card', 'RUB', '100')]
		const { tabs, id } = setup(data)
		const events = new EventsCache(tabs)
		const row = events.getEvents(DateTime.YYYYMMDDToTimestamp('2026.11.01'))[0]
		expect(row.sourceDocumentId).toBe(id)
		expect(row.financial!.actualOperation!.movements[0].quantity).toBe('100')
		expect(Object.isFrozen(row.financial!.actualOperation!.movements)).toBe(true)
		expect(() => events.getActualBalance(0)).toThrow(ResourceBalanceUnavailableError)
		expect(events.getAggregatedBalanceResult()).toMatchObject({ available: false, documentIds: [id] })
		expect(() => events.getAggregatedBalance()).toThrow('Общий денежный итог')
	})

	it('starts one clock timer and stops it on disposal', () => {
		jest.useFakeTimers()
		const clock = new ResourceBalanceClock(() => Date.now())
		clock.start()
		clock.start()
		expect(jest.getTimerCount()).toBe(1)
		jest.advanceTimersByTime(30000)
		expect(clock.now).toBe(Date.now())
		clock.dispose()
		expect(jest.getTimerCount()).toBe(0)
	})

	it('invalidates cached grouping when a resource changes category without rebuilding quantities', () => {
		const data = resourceBalanceDocument()
		data.completedList = [actual('u', '2026.11.01', 'broker', 'USD', '10')]
		const { cache, id, get, edit } = setup(data)
		expect(get().grandTotal.amount).toBe('900')
		const stats = cache.diagnostics(id)
		edit(draft => {
			draft.resources.find(row => row.id === 'USD')!.categoryId = 'materials'
		})
		expect(get().grandTotal.amount).toBe('0')
		expect(get().resourceCategories.find(row => row.categoryId === 'materials')!.resources[0].quantity).toBe('10')
		expect(cache.diagnostics(id)).toMatchObject({ indexBuilds: stats.indexBuilds, quantityReads: stats.quantityReads })
	})

	it('supports an explicit forecast boundary and an actual-only report independently', () => {
		const data = resourceBalanceDocument()
		data.completedList = [actual('r', '2026.11.01', 'card', 'RUB', '100')]
		data.plannedList = [plan('p', '2026.11.02', 'RUB', '-10')]
		const { cache, id } = setup(data)
		expect(cache.get(id, '2026.11.04').grandTotal.amount).toBe('100')
		expect(cache.get(id, '2026.11.04', { forecastFrom: '2026.11.01' }).grandTotal.amount).toBe('90')
		expect(cache.get(id, '2026.11.04', { forecastFrom: '2026.11.01', mode: 'actual' }).grandTotal.amount).toBe('100')
	})

	it('replaces a recurring plan with its actual movement once and restores it once after cancellation', () => {
		const data = resourceBalanceDocument()
		data.completedList = [actual('r', '2026.11.01', 'card', 'RUB', '100')]
		data.plannedList = [
			plan('series', '2026.11.01', 'RUB', '-5', { kind: 'unassigned' }, { repeat: '/1', end: '2026.11.05' })
		]
		const { cache, id, tabs } = setup(data)
		expect(cache.get(id, '2026.11.05').grandTotal.amount).toBe('90')
		const reference = { seriesUid: 'series:series', occurrenceDate: '2026.11.03' }
		const operation = {
			kind: 'expense' as const,
			effectiveDate: '2026.11.03',
			movements: [{ accountId: 'card', resourceId: 'RUB', quantity: d('-6'), role: 'principal' as const }]
		}
		tabs.resourceCommands.complete(id, reference, operation)
		expect(cache.get(id, '2026.11.05').grandTotal.amount).toBe('89')
		tabs.resourceCommands.complete(id, reference, operation)
		expect(cache.get(id, '2026.11.05').grandTotal.amount).toBe('89')
		tabs.resourceCommands.cancel(id, reference)
		expect(cache.get(id, '2026.11.05').grandTotal.amount).toBe('90')
	})
})
