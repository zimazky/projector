import { resourceDocument } from 'src/test-utils/resourceDocument'
import {
	parseResourceDocumentData,
	serializeResourceDocumentData,
	migrateLegacyResourceDocument,
	createResourceMigrationContext,
	createEmptyResourceDocumentData,
	normalizeResourceStoreData
} from './ResourceDocumentFormat'
import { parseDocumentData, serializeDocumentData } from './DocumentFormat'
import { normalizeMainStoreData } from './DocumentTabsStore.utils'
import { computeFingerprint, freezeSnapshot } from './DocumentSyncFingerprint'
import type { ResourceDocumentData } from './ResourceDocument.types'
import { EventsStore } from '../../Events/EventsStore'
import { ProjectsStore } from '../../Projects/ProjectsStore'
import { parseDecimal as d } from 'src/7-shared/libs/Decimal/Decimal'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import * as eventIdentity from '../../Events/EventIdentity'

export const migrationContext = () =>
	createResourceMigrationContext({
		id: 'file-one',
		currency: { code: 'RUB', scale: 2 },
		currencyConfirmed: true,
		asOf: '2026.11.01',
		timezone: 'Europe/Moscow'
	})
const legacy = () => ({
	projectsList: [{ name: 'House', color: 'black', background: 'white' }],
	completedList: [{ name: 'Both', project: 'House', start: '2026.11.01', credit: 100.25, debit: 40.5 }],
	plannedList: [
		{ name: 'Same', start: '2026.11.02', debit: 0.1 },
		{ name: 'Same', start: '2026.11.02', debit: 0.1 },
		{ name: 'Repeat', start: '2026.11.02', repeat: '/7', credit: 300 },
		{ name: 'Task', start: '2026.11.02' }
	]
})

describe('R03 resource document codec and migration', () => {
	it('round-trips the full graph, canonicalizes numbers, and never aliases or mutates the source', () => {
		const source = freezeSnapshot(resourceDocument())
		const before = JSON.stringify(source)
		const parsed = parseResourceDocumentData(source)
		expect(parsed).toEqual({ ...source, plannedList: [source.plannedList[1], source.plannedList[0]] })
		expect(parseResourceDocumentData(serializeResourceDocumentData(parsed))).toEqual(parsed)
		expect(normalizeResourceStoreData(parsed)).toEqual(parsed)
		parsed.resources[0].name = 'Changed'
		expect(JSON.stringify(source)).toBe(before)
		const noncanonical = resourceDocument()
		noncanonical.resources[1].price!.amountPerUnit = '+090.000' as any
		expect(parseResourceDocumentData(noncanonical).resources[1].price!.amountPerUnit).toBe('90')
	})

	it('preserves the entire R02 event graph across store snapshots and the new codec', () => {
		const document = parseResourceDocumentData(resourceDocument())
		const events = new EventsStore(new ProjectsStore(), true)
		events.init(document)
		const output = parseResourceDocumentData(serializeResourceDocumentData({ ...document, ...events.prepareToSave() }))
		expect(output).toEqual(document)
	})

	it('includes resource edits in fingerprints and keeps the sent snapshot immutable', () => {
		const document = resourceDocument()
		const snapshot = serializeResourceDocumentData(document)
		const before = computeFingerprint(document)
		document.resources[1].price!.amountPerUnit = d('95')
		expect(computeFingerprint(document)).not.toBe(before)
		expect(parseResourceDocumentData(snapshot).resources[1].price!.amountPerUnit).toBe('90')
	})

	it.each([undefined, 1, 2])(
		'migrates legacy schema %s on a copy with stable IDs and distinct equal-content events',
		version => {
			const normalized = parseDocumentData(legacy())
			const source = version === undefined ? legacy() : { schemaVersion: version, ...normalized }
			const json = JSON.stringify(source)
			const { data, sourceJson } = migrateLegacyResourceDocument(json, migrationContext())
			expect(sourceJson).toBe(json)
			expect(JSON.stringify(source)).toBe(json)
			expect(parseResourceDocumentData(json, migrationContext())).toEqual(data)
			expect(parseResourceDocumentData(serializeResourceDocumentData(data))).toEqual(data)
			expect(data.migration!.sourceSchemaVersion).toBe(version ?? 0)
			const equalEvents = data.plannedList.filter(event => event.name === 'Same')
			expect(equalEvents[0].eventUid).not.toBe(equalEvents[1].eventUid)
			expect(data.completedList[0].actualOperation!.movements.map(value => value.quantity)).toEqual(['100.25', '-40.5'])
			expect(
				data.completedList[0].actualOperation!.movements.every(value => value.accountId === data.accounts[0].id)
			).toBe(true)
			expect(equalEvents[0].plannedOperation!.movements[0].target).toEqual({ kind: 'unassigned' })
			expect(data.plannedList.find(event => event.name === 'Repeat')!.seriesUid).toBeTruthy()
			expect(data.plannedList.find(event => event.name === 'Task')!.plannedOperation).toBeUndefined()
			expect(data.completedList[0]).not.toHaveProperty('credit')
			expect(data.completedList[0]).not.toHaveProperty('debit')
		}
	)

	it('requires explicit currency and prevents writing an unconfirmed interpretation', () => {
		expect(() => parseResourceDocumentData(legacy())).toThrow('выбор')
		const context = { ...migrationContext(), currencyConfirmed: false }
		const { data, sourceJson } = migrateLegacyResourceDocument(legacy(), context)
		expect(sourceJson).toBe(JSON.stringify(legacy()))
		expect(() => serializeResourceDocumentData(data)).toThrow('подтвердите')
		expect(() => createEmptyResourceDocumentData(context)).toThrow('подтвердите')
		const usd = parseResourceDocumentData(legacy(), { ...migrationContext(), currency: { code: 'USD', scale: 2 } })
		expect(usd.resources[0].name).toBe('USD')
		expect(usd.completedList[0].actualOperation!.movements[0].quantity).toBe('100.25')
	})

	it('keeps the migration context and expands legacy exponential numbers without float arithmetic', () => {
		const context = { ...migrationContext(), currency: { code: 'RUB', scale: 8 } }
		const data = parseResourceDocumentData(
			{
				projectsList: [],
				completedList: [{ name: 'Small', start: '2026.11.01', debit: 1e-7, credit: -2e-7 }],
				plannedList: []
			},
			context
		)
		expect(data.migration!.contextId).toBe(context.id)
		expect(data.completedList[0].actualOperation!.movements.map(value => value.quantity)).toEqual([
			'-0.0000002',
			'-0.0000001'
		])
		expect(() =>
			parseResourceDocumentData(
				{
					projectsList: [],
					completedList: [],
					plannedList: [{ name: 'Precision', start: '2026.11.01', debit: 0.123 }]
				},
				migrationContext()
			)
		).toThrow()
	})

	it('creates an empty graph and isolates different migration contexts', () => {
		const empty = createEmptyResourceDocumentData(migrationContext())
		expect(parseResourceDocumentData(serializeResourceDocumentData(empty))).toEqual(empty)
		expect(empty.accounts).toEqual([])
		expect(empty.resources[0].price!.amountPerUnit).toBe('1')
		const first = parseResourceDocumentData(legacy(), migrationContext())
		const second = parseResourceDocumentData(legacy(), { ...migrationContext(), id: 'file-two' })
		expect(first.completedList[0].eventUid).not.toBe(second.completedList[0].eventUid)
	})

	it('keeps the public route from opening or writing a resource graph even without its header', () => {
		const data = resourceDocument()
		expect(() => parseDocumentData(data)).toThrow()
		expect(() => serializeDocumentData(data)).toThrow()
		expect(() => normalizeMainStoreData(data)).toThrow()
		const { schemaVersion: _, ...withoutVersion } = data
		expect(() => parseDocumentData(withoutVersion)).toThrow('codec')
		expect(() =>
			parseDocumentData({
				projectsList: [],
				completedList: [],
				plannedList: [{ name: 'Identity', start: '2026.11.01', eventUid: 'uid' }]
			})
		).toThrow('codec')
	})

	it('allows an absent price and an explicit zero, including a currency with no quote price', () => {
		const data = resourceDocument()
		delete data.resources[1].price
		data.resources[4].price!.amountPerUnit = d('0')
		const output = parseResourceDocumentData(serializeResourceDocumentData(data))
		expect(output.resources[1].price).toBeUndefined()
		expect(output.resources[4].price!.amountPerUnit).toBe('0')
	})

	it('normalizes optional display fields and schedule anchors to the store representation without regenerating IDs', () => {
		const data = resourceDocument()
		const series = data.plannedList[1]
		series.repeat = '2 * *'
		series.start = '2026.11.01'
		series.comment = ''
		series.time = '00:00'
		series.duration = '0:00'
		const generate = jest.spyOn(eventIdentity, 'newEventUid').mockImplementation(() => {
			throw new Error('read generated UID')
		})
		try {
			const normalized = parseResourceDocumentData(data, { ...migrationContext(), id: 'ignored-for-v3' })
			const events = new EventsStore(new ProjectsStore(), true)
			events.init(normalized)
			expect({ ...normalized, ...events.prepareToSave() }).toEqual(normalized)
			expect(normalized.plannedList[0]).toMatchObject({ eventUid: 'series', start: '2026.11.02', time: '0:00' })
			expect(generate).not.toHaveBeenCalled()
		} finally {
			generate.mockRestore()
		}
	})

	it('retains an empty finite schedule whose first matching date is beyond its end', () => {
		const data = resourceDocument()
		data.plannedList[1].repeat = '20 * *'
		data.plannedList[1].end = '2026.11.03'
		const checked = parseResourceDocumentData(data)
		const events = new EventsStore(new ProjectsStore(), true)
		events.init(checked)
		expect(parseResourceDocumentData({ ...checked, ...events.prepareToSave() })).toEqual(checked)
	})

	it('round-trips completion and cancellation of a detached repeat through the full codec', () => {
		let data = parseResourceDocumentData(resourceDocument())
		const events = new EventsStore(new ProjectsStore(), true)
		events.init(data)
		const source = events.plannedRepeatable[0]
		events.completeEvent(source.id, DateTime.YYYYMMDDToTimestamp('2026.11.09'), {
			...events.getEventDto(source.id)!,
			actualOperation: {
				kind: 'expense',
				effectiveDate: '2026.11.09',
				movements: [
					{ id: 'repeat-actual', resourceId: 'RUB', quantity: d('-450'), role: 'principal', accountId: 'card' }
				]
			}
		})
		data = parseResourceDocumentData(serializeResourceDocumentData({ ...data, ...events.prepareToSave() }))
		events.init(data)
		const completed = events.completed.find(event => event.occurrence)!
		events.uncompleteEvent(completed.id, events.getEventDto(completed.id)!)
		data = parseResourceDocumentData(serializeResourceDocumentData({ ...data, ...events.prepareToSave() }))
		expect(data.completedList).toHaveLength(1)
		expect(data.plannedList.filter(event => event.occurrence)).toHaveLength(1)
		expect(data.plannedList.find(event => event.occurrence)!.plannedOperation!.movements[0].quantity).toBe('-500')
	})

	it('retains the expected bonus snapshot when the payout is confirmed in a different resource', () => {
		const data = resourceDocument()
		const payout = data.plannedList[0].plannedOperation!
		payout.movements[0].resourceId = 'RUB'
		payout.movements[0].quantity = d('100')
		payout.movements[0].target = { kind: 'account', accountId: 'card' }
		payout.cashbackPayout!.rewardResourceId = 'RUB'
		const paid = data.plannedList.shift()!
		paid.actualOperation = {
			kind: 'income',
			effectiveDate: '2026.12.05',
			movements: [{ id: 'actual-reward', resourceId: 'RUB', quantity: d('100'), role: 'principal', accountId: 'card' }],
			cashbackPayout: payout.cashbackPayout
		}
		delete paid.plannedOperation
		data.completedList.push(paid)
		const output = parseResourceDocumentData(data)
		expect(output.completedList[0].actualOperation!.cashbackSnapshots![0].expectedRewardQuantity).toBe('150')
	})

	it('links a future payout to one exact repeat occurrence and rejects other dates', () => {
		const data = resourceDocument()
		data.plannedList[1].plannedOperation!.cashback = { categoryId: 'gas', paymentMovementIds: ['series-pay'] }
		const future = JSON.parse(JSON.stringify(data.plannedList[0]))
		future.eventUid = 'future-payout'
		future.plannedOperation.movements[0].id = 'future-reward'
		future.plannedOperation.cashbackPayout.sourcePurchases = [
			{
				eventUid: 'series',
				movementId: 'series-pay',
				occurrence: { seriesUid: 'series-origin', occurrenceDate: '2026.11.09' }
			}
		]
		data.plannedList.push(future)
		expect(() => parseResourceDocumentData(data)).not.toThrow()
		future.plannedOperation.cashbackPayout.sourcePurchases[0].occurrence.occurrenceDate = '2026.11.03'
		expect(() => parseResourceDocumentData(data)).toThrow('вхождение')
	})

	it('keeps saved purchase conditions independent from edited month settings and bonus prices', () => {
		const data = parseResourceDocumentData(resourceDocument())
		data.cashbackMonthSettings![0].rules[0].ratePercent = d('10')
		data.resources[4].price!.amountPerUnit = d('0.1')
		const roundTrip = parseResourceDocumentData(serializeResourceDocumentData(data))
		const snapshot = roundTrip.completedList[0].actualOperation!.cashbackSnapshots![0]
		expect(snapshot.settings.rules[0].ratePercent).toBe('5')
		expect(snapshot.expectedRewardQuantity).toBe('150')
	})

	const invalidCases: Array<[string, (data: ResourceDocumentData) => void]> = [
		[
			'invalid duration before normalization',
			data => {
				data.plannedList[1].duration = 'bad'
			}
		],
		[
			'overlapping series segments',
			data => {
				data.plannedList.push({ ...data.plannedList[1], eventUid: 'segment-2', plannedOperation: undefined } as any)
				delete data.plannedList[2].plannedOperation
			}
		],
		[
			'executed occurrence still scheduled',
			data => {
				data.plannedList[0].occurrence = { seriesUid: 'series-origin', occurrenceDate: '2026.11.09' }
			}
		],
		[
			'contradictory original operations',
			data => {
				const actual = data.completedList[0].actualOperation!
				actual.originalPlan = JSON.parse(JSON.stringify(actual.originalPlan))
				actual.originalPlan!.movements[0].quantity = d('-200')
			}
		],
		[
			'future version',
			data => {
				data.schemaVersion = 4 as any
			}
		],
		[
			'unknown root field',
			data => {
				;(data as any).forecast = []
			}
		],
		[
			'unknown nested field',
			data => {
				;(data.accounts[0] as any).balance = '0'
			}
		],
		[
			'duplicate resource',
			data => {
				data.resources.push(data.resources[0])
			}
		],
		[
			'duplicate event',
			data => {
				data.plannedList.push(data.plannedList[0])
			}
		],
		[
			'duplicate movement',
			data => {
				data.completedList[0].actualOperation!.movements[1].id = 'pay'
			}
		],
		[
			'missing UID',
			data => {
				delete data.completedList[0].eventUid
			}
		],
		[
			'missing series',
			data => {
				delete data.plannedList[1].seriesUid
			}
		],
		[
			'wrong category dimension',
			data => {
				data.accounts[0].categoryId = 'money'
			}
		],
		[
			'wrong resource category',
			data => {
				data.resources[0].categoryId = 'everyday'
			}
		],
		[
			'missing unit',
			data => {
				data.resources[0].unitId = 'missing'
			}
		],
		[
			'wrong unit scale',
			data => {
				data.units[0].scale = 19
			}
		],
		[
			'missing base currency',
			data => {
				data.baseResourceId = 'missing'
			}
		],
		[
			'nonunit base price',
			data => {
				data.resources[0].price!.amountPerUnit = d('2')
			}
		],
		[
			'missing account resource',
			data => {
				data.accounts[0].allowedResourceIds = ['missing']
			}
		],
		[
			'incompatible account',
			data => {
				data.completedList[0].actualOperation!.movements[1].accountId = 'card'
			}
		],
		[
			'wrong target category',
			data => {
				data.plannedList[1].plannedOperation!.movements[0].target = { kind: 'account-category', categoryId: 'money' }
			}
		],
		[
			'ambiguous target',
			data => {
				data.plannedList[0].plannedOperation!.movements[0].target = {
					kind: 'account',
					accountId: 'bonus-account',
					categoryId: 'everyday'
				} as any
			}
		],
		[
			'unknown pricing movement',
			data => {
				data.completedList[0].actualOperation!.pricing![0].pricedMovementId = 'missing'
			}
		],
		[
			'noncurrency quote',
			data => {
				data.resources[1].price!.quoteResourceId = 'fuel'
			}
		],
		[
			'dangling price origin',
			data => {
				data.resources[2].price!.sourceEventUid = 'missing'
			}
		],
		[
			'currency cycle',
			data => {
				data.resources[1].price!.quoteResourceId = 'USD'
			}
		],
		[
			'negative price',
			data => {
				data.resources[1].price!.amountPerUnit = d('-1')
			}
		],
		[
			'number instead of decimal',
			data => {
				data.resources[1].price!.amountPerUnit = 90 as any
			}
		],
		[
			'fractional bonus',
			data => {
				data.plannedList[0].plannedOperation!.movements[0].quantity = d('1.5')
			}
		],
		[
			'fractional quantity beyond scale',
			data => {
				data.completedList[0].actualOperation!.movements[1].quantity = d('40.1234')
			}
		],
		[
			'legacy financial field',
			data => {
				data.completedList[0].debit = 3000
			}
		],
		[
			'plan in actual list',
			data => {
				data.completedList[0].plannedOperation = data.plannedList[1].plannedOperation
			}
		],
		[
			'actual in plan list',
			data => {
				data.plannedList[1].actualOperation = data.completedList[0].actualOperation
			}
		],
		[
			'missing project',
			data => {
				data.completedList[0].projectId = 'missing'
			}
		],
		[
			'wrong snapshot identity',
			data => {
				data.completedList[0].originalPlan!.eventUid = 'other'
			}
		],
		[
			'invalid time',
			data => {
				data.plannedList[1].time = '25:00'
			}
		],
		[
			'invalid date',
			data => {
				data.completedList[0].start = '2026.02.30'
			}
		],
		[
			'invalid timezone',
			data => {
				data.timezone = 'No/Such_Timezone'
			}
		],
		[
			'zero accrual coefficient',
			data => {
				data.cashbackMonthSettings![0].rewardUnitsPerCalculationUnit = d('0')
			}
		],
		[
			'wrong reward account',
			data => {
				data.cashbackMonthSettings![0].rewardAccountId = 'card'
			}
		],
		[
			'duplicate month',
			data => {
				data.cashbackMonthSettings!.push(data.cashbackMonthSettings![0])
			}
		],
		[
			'duplicate rule category',
			data => {
				data.cashbackMonthSettings![0].rules.push({ ...data.cashbackMonthSettings![0].rules[0], id: 'other-rule' })
			}
		],
		[
			'wrong rule category',
			data => {
				data.cashbackMonthSettings![0].rules[0].categoryId = 'everyday'
			}
		],
		[
			'rate above 100',
			data => {
				data.cashbackMonthSettings![0].rules[0].ratePercent = d('101')
			}
		],
		[
			'negative limit',
			data => {
				data.cashbackMonthSettings![0].totalLimitAmount = d('-1')
			}
		],
		[
			'fractional bonus limit',
			data => {
				data.cashbackMonthSettings![0].rules[0].limitAmount = d('1.5')
			}
		],
		[
			'fractional minimum',
			data => {
				data.cashbackMonthSettings![0].rules[0].minimumPurchaseAmount = d('1.001')
			}
		],
		[
			'wrong rounding',
			data => {
				data.cashbackMonthSettings![0].rounding.scale = 2
			}
		],
		[
			'unknown cashback movement',
			data => {
				data.completedList[0].actualOperation!.cashback!.paymentMovementIds = ['missing']
			}
		],
		[
			'cashback on fee',
			data => {
				data.completedList[0].actualOperation!.cashback!.paymentMovementIds = ['fee']
			}
		],
		[
			'cashback on income',
			data => {
				data.completedList[0].actualOperation!.cashback!.paymentMovementIds = ['get-fuel']
			}
		],
		[
			'dangling payout',
			data => {
				data.completedList[0].actualOperation!.cashbackSnapshots![0].cashbackPayoutUid = 'missing'
			}
		],
		[
			'wrong payout source',
			data => {
				data.plannedList[0].plannedOperation!.cashbackPayout!.sourcePurchases[0].movementId = 'missing'
			}
		],
		[
			'wrong purchase month',
			data => {
				data.plannedList[0].plannedOperation!.cashbackPayout!.purchaseMonth = '2026-12'
			}
		],
		[
			'wrong snapshot rule',
			data => {
				data.completedList[0].actualOperation!.cashbackSnapshots![0].ruleId = 'missing'
			}
		],
		[
			'wrong snapshot month',
			data => {
				data.completedList[0].actualOperation!.cashbackSnapshots![0].settings.month = '2026-12'
			}
		],
		[
			'fractional expected bonus',
			data => {
				data.completedList[0].actualOperation!.cashbackSnapshots![0].expectedRewardQuantity = d('1.5')
			}
		],
		[
			'duplicate payout',
			data => {
				const copy = JSON.parse(JSON.stringify(data.plannedList[0]))
				copy.eventUid = 'payout-2'
				copy.plannedOperation.movements[0].id = 'reward-2'
				data.plannedList.push(copy)
			}
		]
	]
	it.each(invalidCases)('rejects %s without modifying the original', (_name, mutate) => {
		const data = resourceDocument()
		mutate(data)
		const before = JSON.stringify(data)
		expect(() => parseResourceDocumentData(data)).toThrow()
		expect(JSON.stringify(data)).toBe(before)
	})
})
