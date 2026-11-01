import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'
import type { EventsStore } from 'src/6-entities/Events/EventsStore'
import { OccurrenceCounter } from './OccurrenceCounter'

type Point = { date: timestamp; total: number }
function prefix(rows: Array<{ date: timestamp; amount: number }>): Point[] {
	let total = 0
	return rows.sort((a, b) => a.date - b.date).map(row => ({ date: row.date, total: (total += row.amount) }))
}
function sumBefore(rows: Point[], date: timestamp): number {
	let left = 0,
		right = rows.length
	while (left < right) {
		const mid = (left + right) >>> 1
		if (rows[mid].date < date) left = mid + 1
		else right = mid
	}
	return left ? rows[left - 1].total : 0
}

/** Индекс строится один раз для версии документа. Списки исходных событий не сортируются. */
export class BalanceIndex {
	readonly actual: Point[]
	readonly planned: Point[]
	readonly firstActual: timestamp | null
	readonly lastActual: timestamp | null
	readonly firstPlanned: timestamp | null
	readonly totalActual: number

	constructor(private events: EventsStore | null) {
		this.actual = prefix(
			(events?.completed ?? []).map(e => ({ date: DateTime.getBeginDayTimestamp(e.start), amount: e.credit - e.debit }))
		)
		this.firstActual = this.actual[0]?.date ?? null
		this.lastActual = this.actual.at(-1)?.date ?? null
		this.totalActual = this.actual.at(-1)?.total ?? 0
		const singles = events?.planned ?? [],
			repeatable = events?.plannedRepeatable ?? []
		let first: number | null = null
		for (const event of [...singles, ...repeatable]) if (first === null || event.start < first) first = event.start
		this.firstPlanned = first === null ? null : DateTime.getBeginDayTimestamp(first)
		this.planned = prefix(
			singles
				.filter(e => this.lastActual === null || e.end > this.lastActual)
				.map(e => ({
					date: Math.max(e.start, this.lastActual ?? e.start),
					amount: e.credit - e.debit
				}))
		)
	}

	actualBefore(date: timestamp): number {
		return sumBefore(this.actual, date)
	}
	plannedBefore(date: timestamp, counter: OccurrenceCounter): number {
		if (this.lastActual !== null && date <= this.lastActual) return this.actualBefore(date)
		let balance = this.totalActual + sumBefore(this.planned, date)
		for (const event of this.events?.plannedRepeatable ?? []) {
			const amount = event.credit - event.debit
			if (!amount) continue
			balance +=
				amount *
				counter.count(event.repeat, event.start, this.lastActual ?? event.start, Math.min(date, event.end || date))
		}
		return balance
	}
}
