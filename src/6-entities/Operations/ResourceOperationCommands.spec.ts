import { decimal, parseDecimal as d } from 'src/7-shared/libs/Decimal/Decimal'
import { resourceDocument } from 'src/test-utils/resourceDocument'
import { DocumentTabsStore } from '../Document/model/DocumentTabsStore'
import { createResourceDocumentRuntime } from '../Document/model/ResourceDocumentRuntime'
import { ResourceDocumentPersistence } from '../Document/model/ResourceDocumentPersistence'
import type { ResourceDocumentData } from '../Document/model/ResourceDocument.types'
import { parseResourceDocumentData, serializeResourceDocumentData } from '../Document/model/ResourceDocumentFormat'
import type { ActualOperation, PlannedOperation } from './OperationContracts'
import { ResourceOperationCommands, documentToday } from './ResourceOperationCommands'
import { PRICE_HISTORY_PER_RESOURCE } from './OperationPrices'

const context = {
	id: 'commands',
	currency: { code: 'RUB', scale: 2 },
	currencyConfirmed: true,
	asOf: '2026.11.01',
	timezone: 'Europe/Moscow'
}
const runtime = createResourceDocumentRuntime(context)
const persistence = () =>
	new ResourceDocumentPersistence(
		undefined,
		() => localStorage,
		() => undefined
	)
function seed(): ResourceDocumentData {
	const data = resourceDocument()
	data.completedList = []
	data.plannedList = []
	data.priceHistory = []
	for (const resource of data.resources)
		if (resource.price) {
			delete resource.price.sourceEventUid
			delete resource.price.commandId
		}
	data.accounts.push({ ...data.accounts[0], id: 'card-b', name: 'Вторая карта' })
	return data
}
function setup() {
	let today = '2026.11.10'
	let store = new DocumentTabsStore({} as any, persistence(), runtime)
	store.openNewDocument('Команды')
	const id = store.activeDocumentId!
	store.applyContentToDocument(id, seed())
	let commands = new ResourceOperationCommands(store, () => today)
	return {
		id,
		get store() {
			return store
		},
		get commands() {
			return commands
		},
		setToday(value: string) {
			today = value
		},
		saved: () => store.getDocumentDataForSave(id) as ResourceDocumentData,
		async reload() {
			store.dispose()
			store = new DocumentTabsStore({} as any, persistence(), runtime)
			expect(await store.restoreFromLocalStorage()).toBe(true)
			commands = new ResourceOperationCommands(store, () => today)
		}
	}
}
function purchase(price = '80', quantity = '10', date = '2026.11.05'): ActualOperation {
	return {
		kind: 'exchange',
		effectiveDate: date,
		movements: [
			{
				id: 'pay-' + price,
				accountId: 'card',
				resourceId: 'RUB',
				quantity: decimal.negate(decimal.multiply(d(price), d(quantity))),
				role: 'principal'
			},
			{ id: 'fuel-' + price, accountId: 'tank', resourceId: 'fuel', quantity: d(quantity), role: 'principal' },
			{ id: 'fee-' + price, accountId: 'card-b', resourceId: 'RUB', quantity: d('-5'), role: 'fee' }
		],
		pricing: [
			{ pricedMovementId: 'fuel-' + price, quoteResourceId: 'RUB', pricePerUnit: d(price), updateResourcePrice: true }
		]
	}
}
function planned(): PlannedOperation {
	return {
		kind: 'exchange',
		movements: [
			{
				id: 'plan-pay',
				resourceId: 'RUB',
				quantity: d('-800'),
				role: 'principal',
				target: { kind: 'account-category', categoryId: 'everyday' }
			},
			{
				id: 'plan-fuel',
				resourceId: 'fuel',
				quantity: d('10'),
				role: 'principal',
				target: { kind: 'account', accountId: 'tank' }
			}
		],
		pricing: [
			{ pricedMovementId: 'plan-fuel', quoteResourceId: 'RUB', pricePerUnit: d('80'), updateResourcePrice: true }
		]
	}
}
function createPlan(fixture: ReturnType<typeof setup>, repeat?: string) {
	return fixture.commands.createPlanned(fixture.id, {
		name: 'Покупка',
		start: '2026.11.01',
		...(repeat ? { repeat, end: '2026.11.12' } : {}),
		plannedOperation: planned()
	})
}
function fact(fixture: ReturnType<typeof setup>, price = '80', date = '2026.11.05') {
	return fixture.commands.createActual(fixture.id, {
		name: 'Покупка',
		start: date,
		actualOperation: purchase(price, '10', date)
	})
}
const fuel = (fixture: ReturnType<typeof setup>) => fixture.saved().resources.find(item => item.id === 'fuel')!

describe('R05 resource operation commands', () => {
	beforeEach(() => localStorage.clear())
	afterEach(() => jest.restoreAllMocks())

	it('uses the document timezone at the day boundary', () => {
		const now = new Date('2026-11-01T22:30:00Z')
		expect(documentToday('Europe/Moscow', now)).toBe('2026.11.02')
		expect(documentToday('America/New_York', now)).toBe('2026.11.01')
	})

	it('creates a plan with stable identity without changing any catalog price', async () => {
		const fixture = setup()
		const before = fixture.saved().resources
		const result = createPlan(fixture)
		expect(result.status).toBe('changed')
		expect(result.eventUid).toBeTruthy()
		expect(fixture.saved().resources).toEqual(before)
		expect(fixture.saved().priceHistory).toEqual([])
		const plan = fixture.saved().plannedList[0]
		await fixture.reload()
		expect(fixture.saved().plannedList).toEqual([plan])
	})

	it('publishes all actual sides, a third-account fee, original plan and catalog price together', () => {
		const fixture = setup()
		const plan = createPlan(fixture)
		const before = fixture.store.activeDocument!.sync.localVersion
		const published: ResourceDocumentData[] = []
		fixture.store.setOnStoresChanged({ onDocumentChanged: () => published.push(fixture.saved()) })
		const result = fixture.commands.complete(fixture.id, { eventUid: plan.eventUid! }, purchase())
		expect(result.priceWarnings).toEqual([])
		expect(fixture.saved().completedList[0].actualOperation!.movements).toHaveLength(3)
		expect(fixture.saved().completedList[0].originalPlan!.plannedOperation).toEqual(planned())
		expect(fuel(fixture).price).toMatchObject({
			amountPerUnit: '80',
			sourceEventUid: plan.eventUid,
			commandId: result.commandId,
			asOf: '2026.11.05'
		})
		expect(fixture.saved().plannedList).toHaveLength(0)
		expect(fixture.saved().priceHistory[0].previousPrice!.amountPerUnit).toBe('75')
		expect(published).toEqual([fixture.saved()])
		expect(fixture.store.activeDocument!.sync.localVersion).toBe(before + 1)
	})

	it.each(['fee-account', 'fee-sign', 'payment', 'quantity', 'movement-id', 'base-price'])(
		'keeps events, prices and versions intact when the command has invalid %s',
		failure => {
			const fixture = setup()
			const plan = createPlan(fixture)
			const operation = purchase()
			if (failure === 'fee-account') operation.movements[2].accountId = 'tank'
			if (failure === 'fee-sign') operation.movements[2].quantity = d('5')
			if (failure === 'payment') operation.movements[0].quantity = d('-700')
			if (failure === 'quantity') operation.movements[1].quantity = d('10.0001')
			if (failure === 'movement-id') operation.movements[2].id = operation.movements[0].id
			if (failure === 'base-price')
				operation.pricing = [
					{
						pricedMovementId: operation.movements[0].id,
						quoteResourceId: 'USD',
						pricePerUnit: d('0.01'),
						updateResourcePrice: true
					}
				]
			const before = fixture.saved()
			const version = fixture.store.activeDocument!.sync.localVersion
			const eventVersion = fixture.store.activeEventsStore!.version
			expect(() => fixture.commands.complete(fixture.id, { eventUid: plan.eventUid! }, operation)).toThrow()
			expect(fixture.saved()).toEqual(before)
			expect(fixture.store.activeDocument!.sync.localVersion).toBe(version)
			expect(fixture.store.activeEventsStore!.version).toBe(eventVersion)
		}
	)

	it('allocates a split payment across several resources, without assigning the full payment twice', () => {
		const fixture = setup()
		const operation = purchase()
		operation.movements[0].quantity = d('-1800')
		operation.movements.push(
			{ id: 'split-pay', resourceId: 'RUB', accountId: 'broker', quantity: d('-1000'), role: 'principal' },
			{ id: 'bond', resourceId: 'bond', accountId: 'broker', quantity: d('2'), role: 'principal' }
		)
		operation.pricing!.push({
			pricedMovementId: 'bond',
			quoteResourceId: 'RUB',
			pricePerUnit: d('1000'),
			updateResourcePrice: true
		})
		fixture.commands.createActual(fixture.id, { name: 'Два ресурса', start: '2026.11.05', actualOperation: operation })
		expect(fixture.saved().priceHistory).toHaveLength(2)
		expect(fixture.saved().resources.find(item => item.id === 'bond')!.price!.amountPerUnit).toBe('1000')
		const before = fixture.saved()
		operation.movements[1].quantity = d('35') // 2800 + 2000 cannot both consume the 2800 payment.
		for (const movement of operation.movements) movement.id += '-new'
		for (const pricing of operation.pricing!) pricing.pricedMovementId += '-new'
		expect(() =>
			fixture.commands.createActual(fixture.id, { name: 'Ошибка', start: '2026.11.05', actualOperation: operation })
		).toThrow('Оплата')
		expect(fixture.saved()).toEqual(before)
	})

	it('derives a decimal price from principal payment only and rounds the total at the quote currency boundary', () => {
		const fixture = setup()
		const operation = purchase('80', '3')
		operation.movements[0].quantity = d('-100')
		delete operation.pricing
		fixture.commands.createActual(
			fixture.id,
			{ name: 'Дробная цена', start: '2026.11.05', actualOperation: operation },
			{
				derivePricing: { pricedMovementId: 'fuel-80', quoteResourceId: 'RUB', updateResourcePrice: true }
			}
		)
		expect(fuel(fixture).price!.amountPerUnit).toBe('33.333333333333333333')
		expect(fixture.saved().completedList[0].actualOperation!.movements[2].quantity).toBe('-5')
	})

	it.each(['unbalanced', 'different-resource', 'same-account'])('rejects a %s transfer', failure => {
		const fixture = setup()
		const operation: ActualOperation = {
			kind: 'transfer',
			effectiveDate: '2026.11.05',
			movements: [
				{ id: 'out', accountId: 'card', resourceId: 'RUB', quantity: d('-100'), role: 'principal' },
				{
					id: 'in',
					accountId: failure === 'same-account' ? 'card' : failure === 'different-resource' ? 'broker' : 'card-b',
					resourceId: failure === 'different-resource' ? 'USD' : 'RUB',
					quantity: d(failure === 'unbalanced' ? '99' : '100'),
					role: 'principal'
				}
			]
		}
		expect(() =>
			fixture.commands.createActual(fixture.id, { name: 'Перевод', start: '2026.11.05', actualOperation: operation })
		).toThrow()
		expect(fixture.saved().completedList).toEqual([])
	})

	it('balances a transfer in resource units and leaves fees separate from the principal', () => {
		const fixture = setup()
		fixture.commands.createActual(fixture.id, {
			name: 'Перевод',
			start: '2026.11.05',
			actualOperation: {
				kind: 'transfer',
				effectiveDate: '2026.11.05',
				movements: [
					{ id: 'out', accountId: 'card', resourceId: 'RUB', quantity: d('-100'), role: 'principal' },
					{ id: 'in', accountId: 'card-b', resourceId: 'RUB', quantity: d('100'), role: 'principal' },
					{ id: 'fee', accountId: 'broker', resourceId: 'USD', quantity: d('-1'), role: 'fee' }
				]
			}
		})
		expect(fixture.saved().priceHistory).toEqual([])
	})

	it('makes completion idempotent even after Reload', async () => {
		const fixture = setup()
		const plan = createPlan(fixture)
		fixture.commands.complete(fixture.id, { eventUid: plan.eventUid! }, purchase())
		await fixture.reload()
		const before = fixture.saved()
		const version = fixture.store.activeDocument!.sync.localVersion
		expect(fixture.commands.complete(fixture.id, { eventUid: plan.eventUid! }, purchase()).status).toBe('unchanged')
		expect(fixture.saved()).toEqual(before)
		expect(fixture.store.activeDocument!.sync.localVersion).toBe(version)
	})

	it('cancels a completion after Reload and restores exactly its original plan once', async () => {
		const fixture = setup()
		const plan = createPlan(fixture)
		const original = fixture.saved().plannedList[0]
		fixture.commands.complete(fixture.id, { eventUid: plan.eventUid! }, purchase())
		await fixture.reload()
		fixture.commands.cancel(fixture.id, { eventUid: plan.eventUid! })
		expect(fixture.saved().plannedList).toEqual([original])
		expect(fuel(fixture).price!.amountPerUnit).toBe('75')
		expect(fuel(fixture).price!.revision).toBeGreaterThan(2)
		expect(fixture.commands.cancel(fixture.id, { eventUid: plan.eventUid! }).status).toBe('unchanged')
		await fixture.reload()
		expect(fixture.saved().plannedList).toEqual([original])
	})

	it('completes an occurrence on another actual day without losing its original occurrence date', async () => {
		const fixture = setup()
		createPlan(fixture, '/2')
		const seriesUid = fixture.saved().plannedList[0].seriesUid!
		const reference = { seriesUid, occurrenceDate: '2026.11.03' }
		const result = fixture.commands.complete(fixture.id, reference, purchase('80', '10', '2026.11.06'))
		expect(fixture.saved().completedList[0]).toMatchObject({
			eventUid: result.eventUid,
			start: '2026.11.06',
			occurrence: reference,
			originalPlan: { start: '2026.11.03' }
		})
		expect(fixture.commands.complete(fixture.id, reference, purchase()).status).toBe('unchanged')
		await fixture.reload()
		fixture.commands.cancel(fixture.id, reference)
		const singles = fixture.saved().plannedList.filter(item => !item.repeat)
		expect(singles).toHaveLength(1)
		expect(singles[0]).toMatchObject({ start: '2026.11.03', occurrence: reference })
	})

	it('keeps completed neighbours excluded when a remaining series is edited and one completion is cancelled', async () => {
		const fixture = setup()
		createPlan(fixture, '/2')
		const seriesUid = fixture.saved().plannedList[0].seriesUid!
		fixture.commands.complete(fixture.id, { seriesUid, occurrenceDate: '2026.11.03' }, purchase())
		fixture.commands.complete(fixture.id, { seriesUid, occurrenceDate: '2026.11.05' }, purchase('81'))
		const segment = fixture.saved().plannedList.find(item => item.repeat && item.start === '2026.11.07')!
		fixture.commands.edit(
			fixture.id,
			{ eventUid: segment.eventUid! },
			{ name: 'Изменённая серия', start: '2026.11.03' }
		)
		await fixture.reload()
		fixture.commands.cancel(fixture.id, { seriesUid, occurrenceDate: '2026.11.03' })
		expect(fixture.saved().completedList).toHaveLength(1)
		expect(fixture.saved().completedList[0].occurrence!.occurrenceDate).toBe('2026.11.05')
		expect(fixture.saved().plannedList.filter(item => item.occurrence?.occurrenceDate === '2026.11.03')).toHaveLength(1)
		expect(() => parseResourceDocumentData(fixture.saved())).not.toThrow()
	})

	it('moves and edits a single occurrence while keeping its original key and neighbouring schedule', () => {
		const fixture = setup()
		createPlan(fixture, '/2')
		const reference = { seriesUid: fixture.saved().plannedList[0].seriesUid!, occurrenceDate: '2026.11.03' }
		fixture.commands.move(fixture.id, reference, '2026.11.04')
		fixture.commands.edit(fixture.id, reference, { name: 'Перенесено' })
		const detached = fixture.saved().plannedList.find(item => item.occurrence)!
		expect(detached).toMatchObject({ start: '2026.11.04', name: 'Перенесено', occurrence: reference })
		expect(fixture.saved().plannedList.filter(item => item.repeat)).toHaveLength(2)
	})

	it('copies an actual purchase as a new plan with remapped movement references and no price writes', () => {
		const fixture = setup()
		const source = fact(fixture)
		const history = fixture.saved().priceHistory
		const result = fixture.commands.copy(fixture.id, { eventUid: source.eventUid! }, '2026.11.09')
		const copied = fixture.saved().plannedList[0]
		expect(copied.eventUid).toBe(result.eventUid)
		expect(copied.eventUid).not.toBe(source.eventUid)
		expect(copied.actualOperation).toBeUndefined()
		expect(copied.originalPlan).toBeUndefined()
		expect(copied.plannedOperation!.pricing![0].pricedMovementId).toBe(copied.plannedOperation!.movements[1].id)
		expect(copied.plannedOperation!.movements[1].id).not.toBe('fuel-80')
		expect(fixture.saved().priceHistory).toEqual(history)
	})

	it('removes only one occurrence and makes repeated deletion a no-op', () => {
		const fixture = setup()
		createPlan(fixture, '/2')
		const reference = { seriesUid: fixture.saved().plannedList[0].seriesUid!, occurrenceDate: '2026.11.03' }
		fixture.commands.remove(fixture.id, reference)
		const before = fixture.saved()
		expect(fixture.commands.remove(fixture.id, reference).status).toBe('unchanged')
		expect(fixture.saved()).toEqual(before)
		expect(fixture.saved().plannedList.filter(item => item.repeat)).toHaveLength(2)
	})

	it('deletes a priced fact without restoring its plan and keeps valid historical provenance', async () => {
		const fixture = setup()
		const source = fact(fixture)
		fixture.commands.remove(fixture.id, { eventUid: source.eventUid! })
		expect(fixture.saved().completedList).toEqual([])
		expect(fixture.saved().plannedList).toEqual([])
		expect(fuel(fixture).price!.amountPerUnit).toBe('75')
		expect(fixture.saved().priceHistory.some(item => item.undone)).toBe(true)
		expect(() => serializeResourceDocumentData(fixture.saved())).not.toThrow()
		await fixture.reload()
		expect(fuel(fixture).price!.amountPerUnit).toBe('75')
	})

	it('preserves a later independent manual price on cancellation', () => {
		const fixture = setup()
		const source = fact(fixture)
		fixture.commands.setPrice(fixture.id, 'fuel', {
			amountPerUnit: d('99'),
			quoteResourceId: 'RUB',
			asOf: '2026.11.06'
		})
		const independent = fuel(fixture).price
		fixture.commands.cancel(fixture.id, { eventUid: source.eventUid! })
		expect(fuel(fixture).price).toEqual(independent)
	})

	it.each(['old-first', 'new-first'])(
		'does not resurrect an undone trade through a %s cancellation chain',
		async order => {
			const fixture = setup()
			const a = fact(fixture, '80', '2026.11.05')
			const b = fact(fixture, '90', '2026.11.06')
			fixture.commands.cancel(fixture.id, { eventUid: order === 'old-first' ? a.eventUid! : b.eventUid! })
			expect(fuel(fixture).price!.amountPerUnit).toBe(order === 'old-first' ? '90' : '80')
			await fixture.reload()
			fixture.commands.cancel(fixture.id, { eventUid: order === 'old-first' ? b.eventUid! : a.eventUid! })
			expect(fuel(fixture).price!.amountPerUnit).toBe('75')
			await fixture.reload()
			expect(fuel(fixture).price!.amountPerUnit).toBe('75')
		}
	)

	it('edits a fact and its owned price atomically, preserving the original plan', () => {
		const fixture = setup()
		const plan = createPlan(fixture)
		fixture.commands.complete(fixture.id, { eventUid: plan.eventUid! }, purchase())
		const original = fixture.saved().completedList[0].originalPlan
		const version = fixture.store.activeDocument!.sync.localVersion
		fixture.commands.edit(
			fixture.id,
			{ eventUid: plan.eventUid! },
			{ name: 'Уточнённая покупка', actualOperation: purchase('85') }
		)
		expect(fuel(fixture).price!.amountPerUnit).toBe('85')
		expect(fixture.saved().completedList[0].actualOperation!.movements[0].quantity).toBe('-850')
		expect(fixture.saved().completedList[0].originalPlan).toEqual(original)
		expect(fixture.store.activeDocument!.sync.localVersion).toBe(version + 1)
	})

	it('does not overwrite an independent same-day price when an older fact is edited', () => {
		const fixture = setup()
		const source = fact(fixture)
		fixture.commands.setPrice(fixture.id, 'fuel', {
			amountPerUnit: d('99'),
			quoteResourceId: 'RUB',
			asOf: '2026.11.05'
		})
		const price = fuel(fixture).price
		const result = fixture.commands.edit(
			fixture.id,
			{ eventUid: source.eventUid! },
			{ actualOperation: purchase('85') }
		)
		expect(fuel(fixture).price).toEqual(price)
		expect(result.priceWarnings).toContainEqual({ resourceId: 'fuel', reason: 'independent-price-preserved' })
	})

	it('requires explicit choice to replace a newer-dated price with a backdated deal', () => {
		const fixture = setup()
		fixture.commands.setPrice(fixture.id, 'fuel', {
			amountPerUnit: d('99'),
			quoteResourceId: 'RUB',
			asOf: '2026.11.07'
		})
		const result = fact(fixture)
		expect(fuel(fixture).price!.amountPerUnit).toBe('99')
		expect(result.priceWarnings).toContainEqual({ resourceId: 'fuel', reason: 'older-price' })
		fixture.commands.applyPrice(fixture.id, { eventUid: result.eventUid! }, { applyPriceNow: true })
		expect(fuel(fixture).price!.amountPerUnit).toBe('80')
	})

	it('does not apply a future fact price early and applies it explicitly when its day arrives', () => {
		const fixture = setup()
		const operation = purchase('80', '10', '2026.11.11')
		const result = fixture.commands.createActual(
			fixture.id,
			{ name: 'Будущий факт', start: '2026.11.11', actualOperation: operation },
			{ applyPriceNow: true }
		)
		expect(result.priceWarnings).toContainEqual({ resourceId: 'fuel', reason: 'future-price' })
		expect(fuel(fixture).price!.amountPerUnit).toBe('75')
		fixture.setToday('2026.11.11')
		fixture.commands.applyPrice(fixture.id, { eventUid: result.eventUid! }, { commandId: 'apply-future' })
		expect(fuel(fixture).price!.amountPerUnit).toBe('80')
		expect(
			fixture.commands.applyPrice(fixture.id, { eventUid: result.eventUid! }, { commandId: 'apply-future' }).status
		).toBe('unchanged')
	})

	it('keeps same-date writes in revision order and makes a repeated manual command idempotent', () => {
		const fixture = setup()
		fixture.commands.setPrice(
			fixture.id,
			'fuel',
			{ amountPerUnit: d('0'), quoteResourceId: 'RUB', asOf: '2026.11.05' },
			{ commandId: 'zero-price' }
		)
		const first = fuel(fixture).price!.revision
		fixture.commands.setPrice(fixture.id, 'fuel', {
			amountPerUnit: d('99'),
			quoteResourceId: 'RUB',
			asOf: '2026.11.05'
		})
		expect(fuel(fixture).price!.revision).toBe(first + 1)
		expect(
			fixture.commands.setPrice(
				fixture.id,
				'fuel',
				{ amountPerUnit: d('0'), quoteResourceId: 'RUB', asOf: '2026.11.05' },
				{ commandId: 'zero-price' }
			).status
		).toBe('unchanged')
		expect(fuel(fixture).price!.amountPerUnit).toBe('99')
		expect(() =>
			fixture.commands.setPrice(
				fixture.id,
				'fuel',
				{ amountPerUnit: d('1'), quoteResourceId: 'RUB', asOf: '2026.11.05' },
				{ commandId: 'zero-price' }
			)
		).toThrow('Идентификатор')
	})

	it('bounds the journal per resource and reports unavailable undo instead of resurrecting an absent source', () => {
		const fixture = setup()
		const source = fact(fixture)
		for (let i = 0; i < PRICE_HISTORY_PER_RESOURCE + 5; i++)
			fixture.commands.setPrice(fixture.id, 'fuel', {
				amountPerUnit: d(String(90 + i)),
				quoteResourceId: 'RUB',
				asOf: '2026.11.06'
			})
		expect(fixture.saved().priceHistory).toHaveLength(PRICE_HISTORY_PER_RESOURCE)
		const price = fuel(fixture).price
		fixture.commands.cancel(fixture.id, { eventUid: source.eventUid! })
		expect(fuel(fixture).price).toEqual(price)
		expect(() => parseResourceDocumentData(fixture.saved())).not.toThrow()
	})

	it('creates opening and adjustment facts separately from income without updating prices', () => {
		const fixture = setup()
		const details = { name: 'Остаток', start: '2026.11.01' }
		const operation = {
			effectiveDate: '2026.11.01',
			movements: [
				{ id: 'opening', resourceId: 'RUB', accountId: 'card', quantity: d('1000'), role: 'principal' as const }
			]
		}
		fixture.commands.opening(fixture.id, details, operation)
		fixture.commands.adjust(
			fixture.id,
			{ ...details, name: 'Корректировка' },
			{ ...operation, movements: [{ ...operation.movements[0], id: 'adjustment', quantity: d('-10') }] }
		)
		expect(fixture.saved().completedList.map(item => item.actualOperation!.kind)).toEqual(['opening', 'adjustment'])
		expect(fixture.saved().priceHistory).toEqual([])
	})

	it('archives used accounts/resources without deleting balances and prevents destroying their references', () => {
		const fixture = setup()
		fact(fixture)
		const events = fixture.saved().completedList
		fixture.commands.archive(fixture.id, 'account', 'tank')
		fixture.commands.archive(fixture.id, 'resource', 'fuel')
		expect(fixture.saved().completedList).toEqual(events)
		expect(fuel(fixture).archived).toBe(true)
		expect(() => fixture.commands.removeCatalogEntry(fixture.id, 'account', 'tank')).toThrow()
		expect(() => fixture.commands.removeCatalogEntry(fixture.id, 'resource', 'fuel')).toThrow()
		expect(() => fact(fixture, '85')).toThrow('архивному')
	})

	it('rejects an invalid calendar date before model mapping can normalize it', () => {
		const fixture = setup()
		expect(() => fixture.commands.createPlanned(fixture.id, { name: 'Неверно', start: '2026.11.31' })).toThrow()
		expect(fixture.saved().plannedList).toEqual([])
	})

	it('keeps a visible completed operation and its price after local write failure, then persists both on retry', async () => {
		const fixture = setup()
		const plan = createPlan(fixture)
		const stored = localStorage.getItem('documentTabs')
		const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('Quota', 'QuotaExceededError')
		})
		fixture.commands.complete(fixture.id, { eventUid: plan.eventUid! }, purchase())
		expect(await fixture.store.waitForLocalPersistence()).toBe(false)
		expect(fuel(fixture).price!.amountPerUnit).toBe('80')
		expect(fixture.saved().completedList).toHaveLength(1)
		expect(localStorage.getItem('documentTabs')).toBe(stored)
		set.mockRestore()
		fixture.store.retryLocalPersistence()
		expect(await fixture.store.waitForLocalPersistence()).toBe(true)
		await fixture.reload()
		expect(fixture.saved().completedList).toHaveLength(1)
		expect(fuel(fixture).price!.amountPerUnit).toBe('80')
	})

	it('addresses the source document explicitly after switching tabs and refuses the legacy runtime', () => {
		const fixture = setup()
		fixture.store.openNewDocument('Другая')
		const active = fixture.store.captureDocumentSnapshot(fixture.store.activeDocumentId!)!
		fact(fixture)
		expect(fixture.store.captureDocumentSnapshot(active.documentId)!.data).toEqual(active.data)
		expect(fixture.saved().completedList).toHaveLength(1)
		const legacy = new DocumentTabsStore({} as any)
		legacy.openNewDocument()
		expect(() =>
			legacy.resourceCommands.createPlanned(legacy.activeDocumentId!, { name: 'Ресурсный план', start: '2026.11.01' })
		).toThrow('новый режим')
	})

	it('creates omitted movement IDs inside the command and keeps them after Reload', async () => {
		const fixture = setup()
		fixture.commands.createPlanned(fixture.id, {
			name: 'Доход',
			start: '2026.11.01',
			plannedOperation: {
				kind: 'income',
				movements: [
					{ resourceId: 'RUB', quantity: d('100'), role: 'principal', target: { kind: 'unassigned' } },
					{ resourceId: 'USD', quantity: d('10'), role: 'principal', target: { kind: 'unassigned' } }
				]
			}
		})
		const ids = fixture.saved().plannedList[0].plannedOperation!.movements.map(item => item.id)
		expect(new Set(ids).size).toBe(2)
		expect(ids.every(id => id.startsWith('movement:'))).toBe(true)
		await fixture.reload()
		expect(fixture.saved().plannedList[0].plannedOperation!.movements.map(item => item.id)).toEqual(ids)
	})

	it('deduplicates creation by command ID after Reload and after cancellation', async () => {
		const fixture = setup()
		const input = { name: 'Факт', start: '2026.11.05', actualOperation: purchase() }
		const first = fixture.commands.createActual(fixture.id, input, { commandId: 'create-once' })
		await fixture.reload()
		expect(fixture.commands.createActual(fixture.id, input, { commandId: 'create-once' }).status).toBe('unchanged')
		fixture.commands.cancel(fixture.id, { eventUid: first.eventUid! })
		expect(fixture.commands.createActual(fixture.id, input, { commandId: 'create-once' }).status).toBe('unchanged')
		expect(fixture.saved().completedList).toHaveLength(0)
		expect(fixture.saved().plannedList).toHaveLength(1)
	})

	it('does not rewrite the price when only task details or an identical actual operation are saved', () => {
		const fixture = setup()
		const plan = createPlan(fixture)
		fixture.commands.complete(fixture.id, { eventUid: plan.eventUid! }, purchase())
		const price = fuel(fixture).price
		const history = fixture.saved().priceHistory
		fixture.commands.edit(fixture.id, { eventUid: plan.eventUid! }, { name: 'Новое имя' })
		expect(fuel(fixture).price).toEqual(price)
		expect(
			fixture.commands.edit(fixture.id, { eventUid: plan.eventUid! }, { actualOperation: purchase() }).status
		).toBe('unchanged')
		expect(fixture.saved().priceHistory).toEqual(history)
	})

	it('does not infer an unavailable previous price from the remaining facts', async () => {
		const fixture = setup()
		const source = fact(fixture)
		fixture.store.editDocument(fixture.id, draft => {
			;(draft as ResourceDocumentData).priceHistory = []
		})
		const result = fixture.commands.cancel(fixture.id, { eventUid: source.eventUid! })
		expect(result.priceWarnings).toContainEqual({ resourceId: 'fuel', reason: 'previous-price-unavailable' })
		expect(fuel(fixture).price).toBeUndefined()
		await fixture.reload()
		expect(fuel(fixture).price).toBeUndefined()
	})

	it.each(['income', 'expense'] as const)('does not create a price automatically for an ordinary %s', kind => {
		const fixture = setup()
		const before = fixture.saved().resources
		fixture.commands.createActual(fixture.id, {
			name: 'Движение без сделки',
			start: '2026.11.05',
			actualOperation: {
				kind,
				effectiveDate: '2026.11.05',
				movements: [
					{ resourceId: 'fuel', accountId: 'tank', quantity: d(kind === 'income' ? '1' : '-1'), role: 'principal' }
				]
			}
		})
		expect(fixture.saved().resources).toEqual(before)
		expect(fixture.saved().priceHistory).toEqual([])
	})

	it('rejects a forged original plan while editing a completed event', () => {
		const fixture = setup()
		const plan = createPlan(fixture)
		fixture.commands.complete(fixture.id, { eventUid: plan.eventUid! }, purchase())
		const before = fixture.saved()
		expect(() =>
			fixture.commands.edit(
				fixture.id,
				{ eventUid: plan.eventUid! },
				{ actualOperation: { ...purchase('85'), originalPlan: { kind: 'income', movements: [] } } }
			)
		).toThrow('Исходный план')
		expect(fixture.saved()).toEqual(before)
	})

	it('rejects a source deletion that would break a linked cashback payout', () => {
		const fixture = setup()
		fixture.store.applyContentToDocument(fixture.id, resourceDocument())
		const before = fixture.saved()
		expect(() => fixture.commands.remove(fixture.id, { eventUid: 'purchase' })).toThrow()
		expect(fixture.saved()).toEqual(before)
	})

	it('moves an actual task without silently changing its financial effective date or price', () => {
		const fixture = setup()
		const source = fact(fixture)
		const price = fuel(fixture).price
		fixture.commands.move(fixture.id, { eventUid: source.eventUid! }, '2026.11.09')
		expect(fixture.saved().completedList[0].start).toBe('2026.11.09')
		expect(fixture.saved().completedList[0].actualOperation!.effectiveDate).toBe('2026.11.05')
		expect(fuel(fixture).price).toEqual(price)
	})

	it('refuses impossible quotes and future manual prices before any live change', () => {
		const fixture = setup()
		const before = fixture.saved()
		expect(() =>
			fixture.commands.setPrice(fixture.id, 'fuel', {
				amountPerUnit: d('80'),
				quoteResourceId: 'fuel',
				asOf: '2026.11.05'
			})
		).toThrow()
		expect(() =>
			fixture.commands.setPrice(fixture.id, 'fuel', {
				amountPerUnit: d('80'),
				quoteResourceId: 'RUB',
				asOf: '2026.11.11'
			})
		).toThrow('будущим')
		expect(fixture.saved()).toEqual(before)
	})

	it('records an explicitly priced sale without treating quantities of different resources as one balance', () => {
		const fixture = setup()
		const operation = purchase()
		operation.movements[0].quantity = d('800')
		operation.movements[1].quantity = d('-10')
		fixture.commands.createActual(fixture.id, {
			name: 'Продажа топлива',
			start: '2026.11.05',
			actualOperation: operation
		})
		expect(fuel(fixture).price!.amountPerUnit).toBe('80')
		expect(fixture.saved().completedList[0].actualOperation!.movements[0].quantity).toBe('800')
	})

	it('relinquishes an owned price when the edited deal disables updating the catalog', () => {
		const fixture = setup()
		const source = fact(fixture)
		const operation = purchase('85')
		operation.pricing![0].updateResourcePrice = false
		fixture.commands.edit(fixture.id, { eventUid: source.eventUid! }, { actualOperation: operation })
		expect(fuel(fixture).price!.amountPerUnit).toBe('75')
		expect(fixture.saved().completedList[0].actualOperation!.pricing![0].pricePerUnit).toBe('85')
	})

	it('leaves an occurrence in its schedule when saving unchanged details or moving to the same date', () => {
		const fixture = setup()
		createPlan(fixture, '/2')
		const reference = { seriesUid: fixture.saved().plannedList[0].seriesUid!, occurrenceDate: '2026.11.03' }
		const before = fixture.saved()
		expect(fixture.commands.edit(fixture.id, reference, { name: 'Покупка' }).status).toBe('unchanged')
		expect(fixture.commands.move(fixture.id, reference, '2026.11.03').status).toBe('unchanged')
		expect(fixture.saved()).toEqual(before)
	})

	it('rejects an exhausted price revision without leaving the newly completed event behind', () => {
		const fixture = setup()
		fixture.store.editDocument(fixture.id, draft => {
			;(draft as ResourceDocumentData).resources.find(item => item.id === 'fuel')!.price!.revision =
				Number.MAX_SAFE_INTEGER
		})
		const before = fixture.saved()
		expect(() => fact(fixture)).toThrow('ревизий')
		expect(fixture.saved()).toEqual(before)
	})

	it('validates current and historical command provenance when reading the new journal flags', () => {
		const fixture = setup()
		fact(fixture)
		const changed = fixture.saved()
		changed.priceHistory[0].undone = true
		expect(() => parseResourceDocumentData(changed)).toThrow('текущей ценой')
		delete changed.priceHistory[0].undone
		changed.priceHistory[0].commandId = 'another-command'
		expect(() => parseResourceDocumentData(changed)).toThrow('другую команду')
	})

	it('applies an explicitly chosen price over an independent write without claiming that it was preserved', () => {
		const fixture = setup()
		const source = fact(fixture)
		fixture.commands.setPrice(fixture.id, 'fuel', {
			amountPerUnit: d('99'),
			quoteResourceId: 'RUB',
			asOf: '2026.11.06'
		})
		const result = fixture.commands.edit(
			fixture.id,
			{ eventUid: source.eventUid! },
			{ actualOperation: purchase('85') },
			{ applyPriceNow: true }
		)
		expect(fuel(fixture).price!.amountPerUnit).toBe('85')
		expect(result.priceWarnings).toEqual([])
	})
})
