import type { EventDto } from '../Events/EventDto'
import { documentDate } from '../Document/model/DocumentFormat'
import { OccurrenceCounter } from './OccurrenceCounter'
import { mergeBuckets, multiplyBucket, QuantitySeries, totals } from './QuantitySeries'
import type { OverduePlan, QuantityBucket } from './ResourceBalance.types'

/** Три непересекающиеся корзины назначения. Повторения хранятся расписаниями. */
export class ForecastIndex {
	private singles: QuantitySeries
	private entries: {
		eventUid: string
		name: string
		seriesUid?: string
		start: string
		end?: string
		repeat?: string
		positions: QuantityBucket[]
	}[]
	private occurrences = new OccurrenceCounter()
	private repeats: { repeat: string; start: string; end?: string; positions: QuantityBucket[] }[]
	constructor(events: readonly EventDto[]) {
		this.entries = events
			.filter(event => event.plannedOperation)
			.map(event => ({
				eventUid: event.eventUid!,
				name: event.name,
				...(event.seriesUid ? { seriesUid: event.seriesUid } : {}),
				start: documentDate(event.start),
				...(event.end && event.repeat ? { end: documentDate(event.end) } : {}),
				...(event.repeat ? { repeat: event.repeat } : {}),
				positions: event.plannedOperation!.movements.map(movement => ({
					resourceId: movement.resourceId,
					location: { ...movement.target },
					...totals(movement.quantity)
				}))
			}))
		this.singles = new QuantitySeries(
			this.entries
				.filter(event => !event.repeat)
				.flatMap(event => event.positions.map(row => ({ ...row, date: event.start })))
		)
		const patterns = new Map<string, { repeat: string; start: string; end?: string; positions: QuantityBucket[] }>()
		for (const event of this.entries)
			if (event.repeat) {
				const key = JSON.stringify([event.repeat, event.start, event.end])
				const group = patterns.get(key) ?? { repeat: event.repeat, start: event.start, end: event.end, positions: [] }
				group.positions.push(...event.positions)
				patterns.set(key, group)
			}
		this.repeats = [...patterns.values()].map(group => ({ ...group, positions: mergeBuckets(group.positions) }))
	}
	between(begin: string, end: string): QuantityBucket[] {
		begin = documentDate(begin)
		end = documentDate(end)
		if (end <= begin) return []
		const rows = this.singles.between(begin, end)
		for (const event of this.repeats)
			if (event.repeat) {
				const count = this.occurrences.countDates(
					event.repeat,
					event.start,
					begin,
					event.end && event.end < end ? event.end : end
				)
				if (count) rows.push(...event.positions.map(row => multiplyBucket(row, count)))
			}
		return mergeBuckets(rows)
	}
	overdue(before: string): OverduePlan[] {
		before = documentDate(before)
		return this.entries.flatMap(event => {
			const count = event.repeat
				? this.occurrences.countDates(
						event.repeat,
						event.start,
						event.start,
						event.end && event.end < before ? event.end : before
					)
				: event.start < before
					? 1
					: 0
			return count
				? [
						{
							eventUid: event.eventUid,
							name: event.name,
							...(event.seriesUid ? { seriesUid: event.seriesUid } : {}),
							start: event.start,
							...(event.end ? { end: event.end } : {}),
							occurrenceCount: count,
							positions: event.positions.map(row => multiplyBucket(row, count))
						}
					]
				: []
		})
	}
	get cacheSize(): number {
		return this.occurrences.size
	}
}
