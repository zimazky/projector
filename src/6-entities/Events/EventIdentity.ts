import type { ActualOperation, PlannedOperation } from '../Operations/OperationContracts'
import type { EventDto } from './EventDto'

export type OccurrenceIdentity = { seriesUid: string; occurrenceDate: string }

/** Опционально только на время совместимости со старым форматом. */
export type EventMetadata = {
	eventUid?: string
	seriesUid?: string
	occurrence?: OccurrenceIdentity
	originalPlan?: Omit<EventDto, 'originalPlan' | 'actualOperation'>
	plannedOperation?: PlannedOperation
	actualOperation?: ActualOperation
}

export function newEventUid(kind: 'event' | 'series' | 'movement' = 'event'): string {
	const uid =
		globalThis.crypto.randomUUID?.() ??
		Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(
			''
		)
	return `${kind}:${uid}`
}

/** Ключ исходного вхождения не зависит от переноса и временного числового ID. */
export function occurrenceEventUid(occurrence: OccurrenceIdentity): string {
	return `occurrence:${encodeURIComponent(occurrence.seriesUid)}:${occurrence.occurrenceDate}`
}

export function cloneEventMetadata(source: EventMetadata): EventMetadata {
	const metadata: EventMetadata = {}
	for (const key of [
		'eventUid',
		'seriesUid',
		'occurrence',
		'originalPlan',
		'plannedOperation',
		'actualOperation'
	] as const)
		if (source[key] !== undefined) Object.assign(metadata, { [key]: JSON.parse(JSON.stringify(source[key])) })
	return metadata
}

/** Вызывается только командой создания. Чтение/маппинг не создают ID. */
export function createEventMetadata(source: EventMetadata, repeatable: boolean): EventMetadata {
	const metadata = cloneEventMetadata(source)
	metadata.eventUid ??= newEventUid()
	if (repeatable) metadata.seriesUid ??= newEventUid('series')
	return metadata
}

/** Новые движения и все внутренние ссылки копии перенумеровываются вместе. */
export function copyPlannedOperation(operation: PlannedOperation): PlannedOperation {
	const copy: PlannedOperation = JSON.parse(JSON.stringify(operation))
	const ids = new Map(copy.movements.map(movement => [movement.id, newEventUid('movement')]))
	const mapped = (id: string): string => {
		const replacement = ids.get(id)
		if (!replacement) throw new Error('Ссылка на неизвестное движение: ' + id)
		return replacement
	}
	copy.movements.forEach(movement => (movement.id = ids.get(movement.id)!))
	copy.pricing?.forEach(price => (price.pricedMovementId = mapped(price.pricedMovementId)))
	copy.cashback?.paymentMovementIds.forEach((id, index, list) => (list[index] = mapped(id)))
	// Копия покупки/поступления не подтверждает прежнюю выплату.
	delete copy.cashbackPayout
	return copy
}

export function copyAsPlannedMetadata(source: EventMetadata): EventMetadata {
	const operation = source.plannedOperation ?? source.originalPlan?.plannedOperation
	let plannedOperation = operation && copyPlannedOperation(operation)
	if (source.actualOperation) {
		const actual = source.actualOperation
		plannedOperation = copyPlannedOperation({
			kind: actual.kind,
			movements: actual.movements.map(({ accountId, ...movement }) => ({
				...movement,
				target: { kind: 'account', accountId }
			})),
			pricing: actual.pricing,
			cashback: actual.cashback
		})
	}
	return { eventUid: newEventUid(), ...(plannedOperation ? { plannedOperation } : {}) }
}

export function originalPlanSnapshot(source: EventDto): NonNullable<EventMetadata['originalPlan']> {
	const copy: EventDto = JSON.parse(JSON.stringify(source))
	delete copy.originalPlan
	delete copy.actualOperation
	return copy
}

/** Проверки идентичности до помещения данных в менеджеры; полный граф проверит codec R03. */
export function validateEventIdentities(events: (EventMetadata & { repeat?: string })[]): void {
	const eventIds = new Set<string>()
	const movementIds = new Set<string>()
	const occurrences = new Set<string>()
	for (const event of events) {
		if (!event.eventUid || eventIds.has(event.eventUid) || (event.repeat && !event.seriesUid))
			throw new Error('События нового формата требуют уникальные eventUid и seriesUid расписания')
		eventIds.add(event.eventUid)
		if (event.occurrence) {
			const key = occurrenceEventUid(event.occurrence)
			if (event.repeat || occurrences.has(key)) throw new Error('Повторяется ключ исходного вхождения')
			occurrences.add(key)
		}
		for (const operation of [event.plannedOperation, event.actualOperation]) {
			if (!operation) continue
			const localIds = new Set<string>()
			for (const movement of operation.movements) {
				if (!movement.id || movementIds.has(movement.id)) throw new Error('Движения требуют уникальные ID')
				movementIds.add(movement.id)
				localIds.add(movement.id)
			}
			for (const reference of [
				...(operation.pricing?.map(price => price.pricedMovementId) ?? []),
				...(operation.cashback?.paymentMovementIds ?? [])
			])
				if (!localIds.has(reference)) throw new Error('Ссылка на неизвестное движение: ' + reference)
		}
	}
}

/** Редактирование не позволяет подменить идентичность или снимок исходного плана. */
export function editedEventMetadata(source: EventMetadata, edited: EventMetadata): EventMetadata {
	return {
		eventUid: undefined,
		seriesUid: undefined,
		occurrence: undefined,
		originalPlan: undefined,
		...cloneEventMetadata({
			...source,
			plannedOperation: edited.plannedOperation ?? source.plannedOperation,
			actualOperation: edited.actualOperation ?? source.actualOperation
		})
	}
}
