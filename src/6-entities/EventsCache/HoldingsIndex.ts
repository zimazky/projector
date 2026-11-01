import type { EventDto } from '../Events/EventDto'
import { QuantitySeries, totals } from './QuantitySeries'
import type { QuantityBucket } from './ResourceBalance.types'

/** Факты индексируются по effectiveDate, независимо от дат/длительности карточки. */
export class HoldingsIndex {
	private quantities: QuantitySeries
	constructor(events: readonly EventDto[]) {
		this.quantities = new QuantitySeries(
			events.flatMap(
				event =>
					event.actualOperation?.movements.map(movement => ({
						date: event.actualOperation!.effectiveDate,
						resourceId: movement.resourceId,
						location: { kind: 'account' as const, accountId: movement.accountId },
						...totals(movement.quantity)
					})) ?? []
			)
		)
	}
	before(date: string): QuantityBucket[] {
		return this.quantities.beforeDate(date)
	}
	between(begin: string, end: string): QuantityBucket[] {
		return this.quantities.between(begin, end)
	}
}
