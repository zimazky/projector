import { decimal, parseDecimal, type Decimal } from 'src/7-shared/libs/Decimal/Decimal'
import { documentDate } from '../Document/model/DocumentFormat'
import type { BalanceLocation, QuantityBucket, QuantityTotals } from './ResourceBalance.types'

export const ZERO_QUANTITY = parseDecimal('0')
export const EMPTY_TOTALS: QuantityTotals = Object.freeze({
	quantity: ZERO_QUANTITY,
	incoming: ZERO_QUANTITY,
	outgoing: ZERO_QUANTITY
})
export const bucketKey = (row: { resourceId: string; location: BalanceLocation }): string =>
	JSON.stringify([
		row.resourceId,
		row.location.kind,
		'accountId' in row.location ? row.location.accountId : 'categoryId' in row.location ? row.location.categoryId : null
	])
export function totals(quantity: Decimal): QuantityTotals {
	return {
		quantity,
		incoming: decimal.compare(quantity, ZERO_QUANTITY) > 0 ? quantity : ZERO_QUANTITY,
		outgoing: decimal.compare(quantity, ZERO_QUANTITY) < 0 ? quantity : ZERO_QUANTITY
	}
}
export function addTotals(left: QuantityTotals, right: QuantityTotals): QuantityTotals {
	return {
		quantity: decimal.add(left.quantity, right.quantity),
		incoming: decimal.add(left.incoming, right.incoming),
		outgoing: decimal.add(left.outgoing, right.outgoing)
	}
}
export function mergeBuckets(rows: readonly QuantityBucket[]): QuantityBucket[] {
	const groups = new Map<string, QuantityBucket>()
	for (const row of rows) {
		const key = bucketKey(row)
		const old = groups.get(key)
		groups.set(key, {
			resourceId: row.resourceId,
			location: { ...row.location },
			...addTotals(old ?? EMPTY_TOTALS, row)
		})
	}
	return [...groups.values()]
}
export function multiplyBucket(row: QuantityBucket, count: number): QuantityBucket {
	const factor = parseDecimal(String(count))
	return {
		resourceId: row.resourceId,
		location: { ...row.location },
		quantity: decimal.multiply(row.quantity, factor),
		incoming: decimal.multiply(row.incoming, factor),
		outgoing: decimal.multiply(row.outgoing, factor)
	}
}
type Point = QuantityTotals & { date: string }
type Series = { resourceId: string; location: BalanceLocation; points: Point[] }

/** Накопленные суммы на календарных датах: один бинарный поиск на позицию. */
export class QuantitySeries {
	private series = new Map<string, Series>()
	constructor(rows: readonly (QuantityBucket & { date: string })[]) {
		for (const row of rows) {
			const key = bucketKey(row)
			let series = this.series.get(key)
			if (!series) {
				series = { resourceId: row.resourceId, location: { ...row.location }, points: [] }
				this.series.set(key, series)
			}
			series.points.push({
				date: documentDate(row.date),
				quantity: row.quantity,
				incoming: row.incoming,
				outgoing: row.outgoing
			})
		}
		for (const series of this.series.values()) {
			const compact: Point[] = []
			for (const point of series.points.sort((left, right) =>
				left.date < right.date ? -1 : left.date > right.date ? 1 : 0
			)) {
				const previous = compact.at(-1)
				const total = { date: point.date, ...addTotals(previous ?? EMPTY_TOTALS, point) }
				if (previous?.date === point.date) compact[compact.length - 1] = total
				else compact.push(total)
			}
			series.points = compact
		}
	}
	private before(points: Point[], date: string): QuantityTotals {
		let left = 0,
			right = points.length
		while (left < right) {
			const middle = (left + right) >>> 1
			if (points[middle].date < date) left = middle + 1
			else right = middle
		}
		if (!left) return EMPTY_TOTALS
		const point = points[left - 1]
		return { quantity: point.quantity, incoming: point.incoming, outgoing: point.outgoing }
	}
	beforeDate(date: string): QuantityBucket[] {
		date = documentDate(date)
		return [...this.series.values()]
			.map(series => ({
				resourceId: series.resourceId,
				location: { ...series.location },
				...this.before(series.points, date)
			}))
			.filter(row => row.incoming !== '0' || row.outgoing !== '0')
	}
	between(begin: string, end: string): QuantityBucket[] {
		begin = documentDate(begin)
		end = documentDate(end)
		if (end <= begin) return []
		return [...this.series.values()]
			.map(series => {
				const left = this.before(series.points, begin),
					right = this.before(series.points, end)
				return {
					resourceId: series.resourceId,
					location: { ...series.location },
					quantity: decimal.subtract(right.quantity, left.quantity),
					incoming: decimal.subtract(right.incoming, left.incoming),
					outgoing: decimal.subtract(right.outgoing, left.outgoing)
				}
			})
			.filter(row => row.incoming !== '0' || row.outgoing !== '0')
	}
}
