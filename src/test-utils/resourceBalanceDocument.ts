import { resourceDocument } from './resourceDocument'
import type { EventDto } from 'src/6-entities/Events/EventDto'
import type { PlannedTarget } from 'src/6-entities/Operations/OperationContracts'
import { parseDecimal } from 'src/7-shared/libs/Decimal/Decimal'

export function resourceBalanceDocument() {
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
export function balanceActual(
	uid: string,
	effectiveDate: string,
	accountId: string,
	resourceId: string,
	quantity: string,
	details: Partial<EventDto> = {}
): EventDto {
	return {
		eventUid: uid,
		name: uid,
		start: effectiveDate,
		projectId: 'default',
		...details,
		actualOperation: {
			kind: 'adjustment',
			effectiveDate,
			movements: [{ id: uid + ':movement', accountId, resourceId, quantity: parseDecimal(quantity), role: 'principal' }]
		}
	}
}
export function balancePlan(
	uid: string,
	start: string,
	resourceId: string,
	quantity: string,
	target: PlannedTarget = { kind: 'unassigned' },
	details: Partial<EventDto> = {}
): EventDto {
	return {
		eventUid: uid,
		name: uid,
		start,
		projectId: 'default',
		...details,
		...(details.repeat ? { seriesUid: uid + ':series' } : {}),
		plannedOperation: {
			kind: 'adjustment',
			movements: [{ id: uid + ':movement', resourceId, quantity: parseDecimal(quantity), role: 'principal', target }]
		}
	}
}
