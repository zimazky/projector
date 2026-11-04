import { createApplication, type Application } from 'src/1-app/root'
import { createResourceDocumentRuntime } from 'src/6-entities/Document/model/ResourceDocumentRuntime'
import { resourceBalanceDocument, balanceActual, balancePlan } from 'src/test-utils/resourceBalanceDocument'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import { ResourceDocumentPersistence } from 'src/6-entities/Document/model/ResourceDocumentPersistence'
import { actualFromDraft, buildOperation, movementDrafts } from './ResourceOperationDraft'
import { formatDecimalAmount } from 'src/6-entities/Resources/ResourcePresentation'

let app: Application
it('formats decimal amounts without converting large values to JS numbers', () => {
	expect(formatDecimalAmount('9007199254740993.01')).toBe('9\u202f007\u202f199\u202f254\u202f740\u202f993,01')
	expect(formatDecimalAmount('-10000.05')).toBe('-10\u202f000,05')
})
const date = (label: string) => DateTime.YYYYMMDDToTimestamp(label)
const runtime = createResourceDocumentRuntime({
	id: 'r08-test',
	currency: { code: 'RUB', scale: 2 },
	currencyConfirmed: true,
	asOf: '2026.11.01',
	timezone: 'Europe/Moscow'
})
beforeEach(() => {
	localStorage.clear()
	DateTime.initLocale(3)
	jest.spyOn(console, 'log').mockImplementation(() => {})
	app = createApplication({
		documentRuntime: runtime,
		persistence: new ResourceDocumentPersistence(
			undefined,
			() => localStorage,
			() => undefined
		)
	})
	const tabs = app.stores.documentTabsStore
	tabs.openNewDocument('A')
	const data = resourceBalanceDocument()
	data.plannedList = [
		balancePlan('plan', '2026.11.04', 'RUB', '-7000', { kind: 'account-category', categoryId: 'everyday' })
	]
	tabs.applyContentToDocument(tabs.activeDocumentId!, data)
})
afterEach(() => {
	app.dispose()
	jest.restoreAllMocks()
})

it('captures source session, UID and detached form fields when active tab changes', () => {
	const { eventFormStore: store, documentTabsStore: tabs, eventsCache } = app.stores
	store.openEvent(eventsCache.getEvents(date('2026.11.04'))[0])
	const id = store.sourceDocumentId,
		details = JSON.stringify(store.eventData)
	tabs.openNewDocument('B')
	store.assertSource()
	expect(store.sourceDocumentId).toBe(id)
	expect(store.reference()).toEqual({ eventUid: 'plan' })
	expect(JSON.stringify(store.eventData)).toBe(details)
})

it.each(['closed', 'replaced', 'edited'] as const)('blocks stale form after source is %s', mode => {
	const { eventFormStore: store, documentTabsStore: tabs, eventsCache } = app.stores
	store.openEvent(eventsCache.getEvents(date('2026.11.04'))[0])
	const id = tabs.activeDocumentId!
	if (mode === 'closed') tabs.closeDocument(id)
	else if (mode === 'replaced') tabs.applyContentToDocument(id, tabs.getDocumentDataForSave(id))
	else
		tabs.getDocumentStores(id)!.resourceStores!.resourcesStore.upsert({
			...tabs.getDocumentStores(id)!.resourceStores!.resourcesStore.list[0],
			name: 'Переименовано'
		})
	expect(() => store.assertSource()).toThrow('Откройте карточку заново')
})

it('uses the selected occurrence key and a distinct whole-series reference', () => {
	const { documentTabsStore: tabs, eventFormStore: store, eventsCache } = app.stores
	const data = resourceBalanceDocument()
	data.plannedList = [balancePlan('series', '2026.11.01', 'RUB', '-10', undefined, { repeat: '/1' })]
	tabs.applyContentToDocument(tabs.activeDocumentId!, data)
	store.openEvent(eventsCache.getEvents(date('2026.11.04'))[0])
	expect(store.reference()).toEqual({ seriesUid: 'series:series', occurrenceDate: '2026.11.04' })
	expect(store.reference(true)).toEqual({ eventUid: 'series' })
})

it('resource drag moves the source A and leaves active B unchanged', () => {
	const { eventFormStore: store, documentTabsStore: tabs, eventsCache } = app.stores
	const id = tabs.activeDocumentId!
	const token = store.beginDrag(eventsCache.getEvents(date('2026.11.04'))[0])
	tabs.openNewDocument('B')
	const before = tabs.getDocumentDataForSave()
	store.dropResource(token, date('2026.11.05'), false)
	expect(tabs.getDocumentDataForSave(id)!.plannedList[0]).toMatchObject({ eventUid: 'plan', start: '2026.11.05' })
	expect(tabs.getDocumentDataForSave()).toEqual(before)
	expect(() => store.dropResource(token, date('2026.11.06'), false)).toThrow('Перенос устарел')
})

it('drag rejects a replaced source snapshot without altering it', () => {
	const { eventFormStore: store, documentTabsStore: tabs, eventsCache } = app.stores
	const token = store.beginDrag(eventsCache.getEvents(date('2026.11.04'))[0]),
		before = tabs.getDocumentDataForSave()
	tabs.applyContentToDocument(tabs.activeDocumentId!, before)
	expect(() => store.dropResource(token, date('2026.11.05'), true)).toThrow('Откройте карточку заново')
	expect(tabs.getDocumentDataForSave()).toEqual(before)
})

it('expression input stays exact and keeps the movement ID and category target', () => {
	const { documentTabsStore: tabs } = app.stores
	const source = tabs.getDocumentDataForSave()!.plannedList[0].plannedOperation!
	const rows = movementDrafts(source, 'RUB')
	rows[0].quantity = '9007199254740993 + 0,01'
	const operation = buildOperation('expense', rows, tabs.getActiveDocumentStores()!.resourceStores!, source)
	expect(operation.movements[0]).toMatchObject({
		id: source.movements[0].id,
		quantity: '-9007199254740993.01',
		target: { kind: 'account-category', categoryId: 'everyday' }
	})
})

it.each(['0', '-1', '0.001', '1/0', '2^0.5'])('rejects invalid RUB quantity %s', input => {
	const tabs = app.stores.documentTabsStore,
		source = tabs.getDocumentDataForSave()!.plannedList[0].plannedOperation!
	const rows = movementDrafts(source, 'RUB')
	rows[0].quantity = input
	expect(() => buildOperation('expense', rows, tabs.getActiveDocumentStores()!.resourceStores!, source)).toThrow()
})

it('execution requires concrete accounts; assigning one preserves the source plan', () => {
	const tabs = app.stores.documentTabsStore,
		source = tabs.getDocumentDataForSave()!.plannedList[0].plannedOperation!
	const rows = movementDrafts(source, 'RUB'),
		plan = buildOperation('expense', rows, tabs.getActiveDocumentStores()!.resourceStores!, source)
	expect(() => actualFromDraft(plan, rows, '2026.11.04')).toThrow('конкретный счёт')
	rows[0].accountId = 'card'
	expect(actualFromDraft(plan, rows, '2026.11.04').movements[0]).toMatchObject({ accountId: 'card', quantity: '-7000' })
	expect(source.movements[0].target).toEqual({ kind: 'account-category', categoryId: 'everyday' })
})

it('does not hide resource movements behind multi-day placeholders and exposes an independent accounting date', () => {
	const { documentTabsStore: tabs, eventsCache } = app.stores
	const data = resourceBalanceDocument()
	data.completedList = [
		balanceActual('actual', '2026.11.07', 'card', 'RUB', '100', { start: '2026.11.04', end: '2026.11.06' })
	]
	tabs.applyContentToDocument(tabs.activeDocumentId!, data)
	const skip: { id: number; end: number }[] = []
	expect(eventsCache.getEventsWithPlaceholders(date('2026.11.04'), skip)[0].eventUid).toBe('actual')
	expect(eventsCache.getEventsWithPlaceholders(date('2026.11.05'), skip)[0].eventUid).toBe('actual')
	expect(eventsCache.getEvents(date('2026.11.07'))[0]).toMatchObject({
		eventUid: 'actual',
		accountingOnly: true,
		days: 1
	})
	expect(eventsCache.getDayBalances(date('2026.11.07')).resourceBalance!.grandTotal.amount).toBe('0')
	expect(eventsCache.getDayBalances(date('2026.11.08')).resourceBalance!.grandTotal.amount).toBe('100')
})

it.each(['Рубли', 'Повседневные', '7000'])('search includes financial field %s', query => {
	const { eventSearchStore: search } = app.stores
	search.search(query)
	expect(search.results.map(row => row.name)).toEqual(['plan'])
})

it('resource calendar and day list read valuation reports without invoking legacy balances', () => {
	const { eventsCache, calendarStore, dayListStore } = app.stores
	const legacy = jest.spyOn(eventsCache, 'getActualBalance').mockImplementation(() => {
		throw new Error('legacy')
	})
	dayListStore.setDate(date('2026.11.04'))
	expect(dayListStore.getDayListStructure().resourceBalance).toBeDefined()
	expect(calendarStore.getCalendarDataStructure(date('2026.11.04'))[0].list[0].resourceBalance).toBeDefined()
	expect(legacy).not.toHaveBeenCalled()
})
