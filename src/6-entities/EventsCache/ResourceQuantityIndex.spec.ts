import { HoldingsIndex } from './HoldingsIndex'
import { ForecastIndex } from './ForecastIndex'
import { combinePositions } from './ResourceBalanceProjection'
import { OccurrenceCounter } from './OccurrenceCounter'
import { balanceActual as actual, balancePlan as plan } from 'src/test-utils/resourceBalanceDocument'
import type { EventDto } from '../Events/EventDto'
import type { BalancePosition } from './ResourceBalance.types'
import type { PlannedTarget } from '../Operations/OperationContracts'
import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import ZCron from 'src/7-shared/libs/ZCron/ZCron'

const stamp = (date: string) => Date.parse(date.replaceAll('.', '-') + 'T00:00:00Z')
const label = (value: number) => new Date(value).toISOString().slice(0, 10).replaceAll('-', '.')
const scaled = (text: string): bigint => {
	const negative = text.startsWith('-')
	const [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.')
	return (BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'))) * (negative ? -1n : 1n)
}
const unscaled = (input: bigint): string => {
	const absolute = input < 0n ? -input : input
	const fraction = (absolute % 1000n).toString().padStart(3, '0').replace(/0+$/, '')
	return (input < 0n ? '-' : '') + absolute / 1000n + (fraction ? '.' + fraction : '')
}
function matches(repeat: string, start: string, date: string): boolean {
	if (repeat.startsWith('/')) return ((stamp(date) - stamp(start)) / 86400000) % Number(repeat.slice(1)) === 0
	if (repeat === '* * *') return true
	if (repeat === '* * 1-5') return new Date(stamp(date)).getUTCDay() >= 1 && new Date(stamp(date)).getUTCDay() <= 5
	if (repeat === '1 * *') return date.endsWith('.01')
	throw new Error('Unknown reference schedule')
}
/** Независимый эталон: BigInt в тысячных и прямой обход только маленького конечного набора дней. */
function reference(completed: EventDto[], planned: EventDto[], date: string, from: string) {
	const rows = new Map<string, { actual: bigint[]; planned: bigint[] }>()
	const add = (resourceId: string, location: object, quantity: string, kind: 'actual' | 'planned') => {
		const key = JSON.stringify([resourceId, location])
		const row = rows.get(key) ?? { actual: [0n, 0n, 0n], planned: [0n, 0n, 0n] }
		const amount = scaled(quantity)
		row[kind][0] += amount
		row[kind][amount > 0n ? 1 : 2] += amount
		rows.set(key, row)
	}
	for (const event of completed)
		if (event.actualOperation && event.actualOperation.effectiveDate < date)
			for (const move of event.actualOperation.movements)
				add(move.resourceId, { kind: 'account', accountId: move.accountId }, move.quantity, 'actual')
	for (const event of planned) {
		let count = 0
		if (!event.repeat) count = event.start >= from && event.start < date ? 1 : 0
		else
			for (
				let day = Math.max(stamp(event.start), stamp(from));
				day < stamp(date) && (!event.end || day < stamp(event.end));
				day += 86400000
			)
				if (matches(event.repeat, event.start, label(day))) count++
		for (let i = 0; i < count; i++)
			for (const move of event.plannedOperation?.movements ?? [])
				add(move.resourceId, move.target, move.quantity, 'planned')
	}
	return Object.fromEntries([...rows].map(([key, row]) => [key, [...row.actual, ...row.planned].map(unscaled)]))
}
function indexed(positions: BalancePosition[]) {
	return Object.fromEntries(
		positions.map(row => [
			JSON.stringify([row.resourceId, row.location]),
			[
				row.actual.quantity,
				row.actual.incoming,
				row.actual.outgoing,
				row.planned.quantity,
				row.planned.incoming,
				row.planned.outgoing
			]
		])
	)
}

describe('R06 quantity indexes', () => {
	afterEach(() => {
		jest.restoreAllMocks()
		DateTime.initLocale(3)
	})
	it('indexes unsorted actual movements by effectiveDate and charges a multi-day card only once', () => {
		const source = [
			actual('future', '2026.11.07', 'card', 'RUB', '-30', { start: '2026.11.01', end: '2026.11.09' }),
			actual('opening', '2026.11.01', 'card', 'RUB', '100'),
			actual('today', '2026.11.03', 'card', 'RUB', '-10')
		]
		const before = JSON.stringify(source)
		const index = new HoldingsIndex(source)
		expect(index.before('2026.11.03')[0].quantity).toBe('100')
		expect(index.before('2026.11.04')[0].quantity).toBe('90')
		expect(index.before('2026.11.07')[0].quantity).toBe('90')
		expect(index.before('2026.11.08')[0].quantity).toBe('60')
		expect(index.between('2026.11.03', '2026.11.08')[0].quantity).toBe('-40')
		expect(JSON.stringify(source)).toBe(before)
	})
	it('keeps category plans, account plans and unassigned plans in disjoint buckets', () => {
		const index = new ForecastIndex([
			plan('a', '2026.11.03', 'RUB', '-5', { kind: 'account', accountId: 'card' }),
			plan('g', '2026.11.03', 'RUB', '-7', { kind: 'account-category', categoryId: 'everyday' }),
			plan('u', '2026.11.03', 'RUB', '-9')
		])
		expect(index.between('2026.11.03', '2026.11.04').map(row => [row.location.kind, row.quantity])).toEqual([
			['account', '-5'],
			['account-category', '-7'],
			['unassigned', '-9']
		])
	})
	it('does not turn a multi-day overdue single into a new plan on the forecast boundary', () => {
		const index = new ForecastIndex([
			plan('span', '2026.10.30', 'RUB', '-12', { kind: 'unassigned' }, { end: '2026.11.08' })
		])
		expect(index.between('2026.11.03', '2026.11.09')).toEqual([])
		expect(index.overdue('2026.11.03')[0]).toMatchObject({
			eventUid: 'span',
			occurrenceCount: 1,
			positions: [{ quantity: '-12' }]
		})
	})
	it('keeps incoming and outgoing plans visible when their net quantity is zero', () => {
		const index = new ForecastIndex([plan('in', '2026.11.03', 'USD', '10'), plan('out', '2026.11.03', 'USD', '-10')])
		expect(index.between('2026.11.03', '2026.11.04')[0]).toMatchObject({
			quantity: '0',
			incoming: '10',
			outgoing: '-10'
		})
	})
	it.each(['/2', '* * *', '* * 1-5', '1 * *'])(
		'matches a finite independent reference with %s and exclusive ends',
		repeat => {
			const events = [
				plan('series', '2026.11.01', 'RUB', '-1.25', { kind: 'unassigned' }, { repeat, end: '2026.11.10' })
			]
			const index = new ForecastIndex(events)
			for (let day = stamp('2026.10.31'); day <= stamp('2026.11.12'); day += 86400000) {
				const date = label(day)
				expect(indexed(combinePositions([], index.between('2026.11.03', date)))).toEqual(
					reference([], events, date, '2026.11.03')
				)
			}
		}
	)
	it.each(Array.from({ length: 20 }, (_, seed) => seed + 1))(
		'matches BigInt brute force for finite mixed dataset %i',
		seed => {
			let state = seed
			const random = (limit: number) => {
				state = (Math.imul(state, 1664525) + 1013904223) >>> 0
				return state % limit
			}
			const completed: EventDto[] = [],
				planned: EventDto[] = []
			for (let i = 0; i < 24; i++) {
				const resource = ['RUB', 'USD', 'fuel'][random(3)]
				const account = resource === 'USD' ? 'broker' : resource === 'fuel' ? 'tank' : ['card', 'card-b'][random(2)]
				const amount = unscaled(BigInt((random(20) + 1) * 250 * (random(2) ? 1 : -1)))
				const date = `2026.11.${String(random(10) + 1).padStart(2, '0')}`
				completed.push(actual('a-' + i, date, account, resource, amount))
				const target: PlannedTarget = [
					{ kind: 'account', accountId: account } as const,
					{ kind: 'account-category', categoryId: 'everyday' } as const,
					{ kind: 'unassigned' } as const
				][random(3)]
				planned.push(
					plan(
						'p-' + i,
						date,
						resource,
						amount,
						target,
						i % 3 ? {} : { repeat: ['/2', '* * *', '* * 1-5', '1 * *'][random(4)], end: '2026.11.11' }
					)
				)
			}
			const holdings = new HoldingsIndex(completed),
				forecast = new ForecastIndex(planned)
			for (let day = stamp('2026.10.31'); day <= stamp('2026.11.12'); day += 86400000) {
				const date = label(day)
				expect(indexed(combinePositions(holdings.before(date), forecast.between('2026.11.05', date)))).toEqual(
					reference(completed, planned, date, '2026.11.05')
				)
			}
		}
	)
	it('counts millennia and overdue series without calling the daily matcher or expanding occurrences', () => {
		const matcher = jest.spyOn(ZCron, 'isMatch').mockImplementation(() => {
			throw new Error('Daily scan')
		})
		const index = new ForecastIndex([
			plan('ancient', '0001.01.01', 'RUB', '-1', { kind: 'unassigned' }, { repeat: '/1' })
		])
		const expected = (stamp('9999.12.31') - stamp('0001.01.01')) / 86400000
		expect(index.between('0001.01.01', '9999.12.31')[0].quantity).toBe('-' + expected)
		expect(index.overdue('9999.12.31')[0].occurrenceCount).toBe(expected)
		expect(matcher).not.toHaveBeenCalled()
	})
	it.each([0, 3, -8, 5.5])('counts civil weekdays and leap days independently of DateTime timezone %s', timezone => {
		DateTime.initLocale(timezone)
		const counter = new OccurrenceCounter()
		expect(counter.countDates('* * 1-5', '2026.11.01', '2026.11.01', '2026.11.08')).toBe(5)
		expect(counter.countDates('29 2 *', '2000.01.01', '2000.01.01', '2400.01.01')).toBe(97)
	})
})
