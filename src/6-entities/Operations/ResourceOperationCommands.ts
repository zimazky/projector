import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import ZCron from 'src/7-shared/libs/ZCron/ZCron'
import { parsePrice, parseQuantity } from 'src/7-shared/libs/Decimal/Decimal'
import { ProjectsStore } from '../Projects/ProjectsStore'
import { EventsStore } from '../Events/EventsStore'
import type { EventDto } from '../Events/EventDto'
import type { IEventModel } from '../Events/EventModel'
import { newEventUid, occurrenceEventUid, type OccurrenceIdentity } from '../Events/EventIdentity'
import type {
	ActualOperation,
	ActualMovement,
	ExchangePricing,
	PlannedMovement,
	PlannedOperation
} from './OperationContracts'
import type { ResourceDocumentData } from '../Document/model/ResourceDocument.types'
import type { DocumentData } from '../Document/model/DocumentTabsStore.types'
import type { ResourcePrice } from '../Resources/ResourceContracts'
import { documentDate, parseEventFields } from '../Document/model/DocumentFormat'
import { computeFingerprint } from '../Document/model/DocumentSyncFingerprint'
import { commandError, derivePricing, resourceScale, validateOperation } from './OperationValidation'
import {
	revertEventPrices,
	trimPriceHistory,
	writeEventPrices,
	writeManualPrice,
	type PriceCommandContext,
	type PriceWarning
} from './OperationPrices'

export type ResourceEventReference = { eventUid: string } | OccurrenceIdentity
export type ResourceEventDetails = Pick<
	EventDto,
	'name' | 'start' | 'comment' | 'projectId' | 'time' | 'duration' | 'end' | 'repeat'
>
export type PlannedOperationInput = Omit<PlannedOperation, 'movements'> & {
	movements: (Omit<PlannedMovement, 'id'> & { id?: string })[]
}
export type ActualOperationInput = Omit<ActualOperation, 'movements'> & {
	movements: (Omit<ActualMovement, 'id'> & { id?: string })[]
}
export type ResourceEventChanges = Partial<ResourceEventDetails> & {
	plannedOperation?: PlannedOperationInput
	actualOperation?: ActualOperationInput
}
export type OperationCommandOptions = {
	commandId?: string
	applyPriceNow?: boolean
	derivePricing?: Omit<ExchangePricing, 'pricePerUnit'>
}
export type OperationCommandResult = {
	status: 'changed' | 'unchanged'
	commandId: string
	eventUid?: string
	priceWarnings: PriceWarning[]
}
type DocumentEditor = { editDocument(documentId: string, edit: (draft: DocumentData) => void): void }
type Located = { model: IEventModel & { id: number }; completed: boolean; date: number }
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const sameJson = (left: unknown, right: unknown): boolean => {
	const canonical = (input: unknown) =>
		JSON.stringify(input, (_key, value) =>
			value && typeof value === 'object' && !Array.isArray(value)
				? Object.fromEntries(
						Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
					)
				: value
		)
	return canonical(left) === canonical(right)
}

export function documentToday(timezone: string, now = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(now)
	const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value
	return `${part('year')}.${part('month')}.${part('day')}`
}

/** Все преобразования выполняются в отдельном графе; живой документ публикуется только редактором R04. */
export class ResourceOperationCommands {
	constructor(
		private readonly documents: DocumentEditor,
		private readonly today = documentToday
	) {}

	private run(
		documentId: string,
		options: OperationCommandOptions,
		change: (data: ResourceDocumentData, context: PriceCommandContext) => string | undefined
	): OperationCommandResult {
		const commandId = options.commandId ?? `command:${newEventUid()}`
		if (!commandId.trim()) commandError('Требуется идентификатор команды')
		const result: OperationCommandResult = { status: 'unchanged', commandId, priceWarnings: [] }
		this.documents.editDocument(documentId, draft => {
			if (!('schemaVersion' in draft) || draft.schemaVersion !== 3)
				commandError('Команды ресурсов требуют новый режим документа')
			const data = draft as ResourceDocumentData
			const before = computeFingerprint(data)
			const context: PriceCommandContext = {
				commandId,
				today: documentDate(this.today(data.timezone)),
				applyPriceNow: options.applyPriceNow,
				warnings: result.priceWarnings
			}
			result.eventUid = change(data, context)
			if (computeFingerprint(data) !== before) {
				trimPriceHistory(data)
				result.status = 'changed'
			}
		})
		return result
	}

	private events(data: ResourceDocumentData): EventsStore {
		const projects = new ProjectsStore()
		projects.init(data.projectsList)
		const events = new EventsStore(projects, true)
		events.init(data)
		return events
	}

	private storeEvents(data: ResourceDocumentData, events: EventsStore): void {
		Object.assign(data, events.prepareToSave())
	}

	private locate(events: EventsStore, reference: ResourceEventReference): Located | undefined {
		if ('eventUid' in reference) {
			const completed = events.completed.find(item => item.eventUid === reference.eventUid)
			const model =
				completed ?? [...events.planned, ...events.plannedRepeatable].find(item => item.eventUid === reference.eventUid)
			return model && { model, completed: !!completed, date: model.start }
		}
		const date = DateTime.YYYYMMDDToTimestamp(documentDate(reference.occurrenceDate))
		const matches = (item: IEventModel) =>
			item.occurrence?.seriesUid === reference.seriesUid &&
			item.occurrence.occurrenceDate === documentDate(reference.occurrenceDate)
		const completed = events.completed.find(matches)
		const detached = completed ?? events.planned.find(matches)
		if (detached) return { model: detached, completed: !!completed, date }
		const series = events.plannedRepeatable.find(
			item =>
				item.seriesUid === reference.seriesUid &&
				date >= item.start &&
				(!item.end || date + (item.time ?? 0) < item.end) &&
				ZCron.isMatch(item.repeat, item.start, date)
		)
		return series && { model: series, completed: false, date }
	}

	private operation(
		data: ResourceDocumentData,
		input: ActualOperationInput,
		options: OperationCommandOptions,
		previous?: ActualOperation
	): ActualOperation
	private operation(
		data: ResourceDocumentData,
		input: PlannedOperationInput,
		options: OperationCommandOptions,
		previous?: PlannedOperation
	): PlannedOperation
	private operation(
		data: ResourceDocumentData,
		input: ActualOperationInput | PlannedOperationInput,
		options: OperationCommandOptions,
		previous?: ActualOperation | PlannedOperation
	): ActualOperation | PlannedOperation {
		const operation = copy(input) as ActualOperation | PlannedOperation
		for (const movement of operation.movements) {
			movement.id ??= newEventUid('movement')
			movement.quantity = parseQuantity(movement.quantity, resourceScale(data, movement.resourceId))
		}
		for (const pricing of operation.pricing ?? []) pricing.pricePerUnit = parsePrice(pricing.pricePerUnit)
		if ('effectiveDate' in operation) operation.effectiveDate = documentDate(operation.effectiveDate)
		if (options.derivePricing) {
			if (operation.pricing?.length) commandError('Нельзя одновременно задать и вывести цену сделки')
			operation.pricing = [derivePricing(data, operation, options.derivePricing)]
		}
		validateOperation(data, operation, previous)
		return operation
	}

	createPlanned(
		documentId: string,
		input: ResourceEventDetails & { eventUid?: string; plannedOperation?: PlannedOperationInput },
		options: OperationCommandOptions = {}
	): OperationCommandResult {
		return this.run(documentId, options, (data, context) => {
			const events = this.events(data)
			const eventUid = input.eventUid ?? `event-command:${encodeURIComponent(context.commandId)}`
			if (this.locate(events, { eventUid })) {
				if (input.eventUid) commandError('Событие с таким UID уже существует')
				return eventUid
			}
			const event = copy(input)
			parseEventFields(event, false)
			const plannedOperation = event.plannedOperation && this.operation(data, event.plannedOperation, options)
			events.addPlannedEventDto({ ...event, eventUid, plannedOperation, projectId: event.projectId ?? 'default' })
			const created = [...events.planned, ...events.plannedRepeatable].find(
				item => ![...data.plannedList, ...data.completedList].some(old => old.eventUid === item.eventUid)
			)!
			this.storeEvents(data, events)
			return created.eventUid
		})
	}

	createActual(
		documentId: string,
		input: Omit<ResourceEventDetails, 'repeat'> & { eventUid?: string; actualOperation: ActualOperationInput },
		options: OperationCommandOptions = {}
	): OperationCommandResult {
		return this.run(documentId, options, (data, context) => {
			const events = this.events(data)
			const eventUid = input.eventUid ?? `event-command:${encodeURIComponent(context.commandId)}`
			if (this.locate(events, { eventUid })) {
				if (input.eventUid) commandError('Событие с таким UID уже существует')
				return eventUid
			}
			const actualOperation = this.operation(data, input.actualOperation, options)
			parseEventFields(input, true)
			if (actualOperation.originalPlan) commandError('Исходный план назначается командой выполнения')
			events.addCompletedEventDto({
				...copy(input),
				eventUid,
				projectId: input.projectId ?? 'default',
				actualOperation
			})
			const created = events.completed.find(item => !data.completedList.some(old => old.eventUid === item.eventUid))!
			this.storeEvents(data, events)
			const event = data.completedList.find(item => item.eventUid === created.eventUid)!
			writeEventPrices(data, event, context)
			return created.eventUid
		})
	}

	complete(
		documentId: string,
		reference: ResourceEventReference,
		operation: ActualOperationInput | undefined,
		details: Partial<Omit<ResourceEventDetails, 'repeat'>> = {},
		options: OperationCommandOptions = {}
	): OperationCommandResult {
		return this.run(documentId, options, (data, context) => {
			const events = this.events(data)
			const located = this.locate(events, reference) ?? commandError('План или вхождение не найдено')
			if (located.completed) return located.model.eventUid
			if (located.model.repeat && 'eventUid' in reference)
				commandError('Для выполнения расписания укажите ключ вхождения')
			if (located.model.plannedOperation && !operation)
				commandError('Для выполнения финансового плана требуются фактические движения и счета')
			const actual = operation && this.operation(data, operation, options)
			if (actual?.originalPlan) commandError('Исходный план назначается командой выполнения')
			const start = details.start ?? actual?.effectiveDate ?? DateTime.getYYYYMMDD(located.date)
			const raw: EventDto = {
				...events.getEventDto(located.model.id)!,
				...copy(details),
				start,
				...(actual ? { actualOperation: actual } : {})
			}
			parseEventFields({ ...raw, repeat: undefined }, true)
			events.completeEvent(located.model.id, located.date, raw)
			const uid = located.model.repeat ? occurrenceEventUid(reference as OccurrenceIdentity) : located.model.eventUid!
			const completed =
				events.completed.find(item => item.eventUid === uid) ?? commandError('Вхождение не было выполнено')
			// R02 фиксирует исходную дату вхождения; фактическая дата карточки может быть другой.
			if (located.model.repeat)
				events.updateEvent(completed.id, {
					...events.getEventDto(completed.id)!,
					...copy(details),
					start,
					repeat: undefined
				})
			this.storeEvents(data, events)
			writeEventPrices(
				data,
				data.completedList.find(item => item.eventUid === uid)!,
				context
			)
			return uid
		})
	}

	edit(
		documentId: string,
		reference: ResourceEventReference,
		changes: ResourceEventChanges,
		options: OperationCommandOptions = {}
	): OperationCommandResult {
		return this.run(documentId, options, (data, context) => {
			const events = this.events(data)
			const located = this.locate(events, reference) ?? commandError('Событие или вхождение не найдено')
			const source = events.getEventDto(located.model.id)!
			const raw = { ...source, ...copy(changes) } as EventDto
			if (changes.repeat !== undefined && (!!changes.repeat !== !!located.model.repeat || !('eventUid' in reference)))
				commandError('Для нового расписания создайте отдельный план; правка вхождения не меняет расписание')
			if (located.completed) {
				if (changes.plannedOperation || changes.repeat)
					commandError('Факт не может стать планом или расписанием при редактировании')
				if (raw.actualOperation) {
					if (
						changes.actualOperation?.originalPlan &&
						!sameJson(changes.actualOperation.originalPlan, located.model.actualOperation?.originalPlan)
					)
						commandError('Исходный план нельзя менять при редактировании факта')
					raw.actualOperation = this.operation(data, raw.actualOperation, options, located.model.actualOperation)
					if (located.model.actualOperation?.originalPlan)
						raw.actualOperation.originalPlan = copy(located.model.actualOperation.originalPlan)
				}
			} else {
				if (changes.actualOperation) commandError('Фактические движения задаются командой выполнения')
				if (raw.plannedOperation)
					raw.plannedOperation = this.operation(data, raw.plannedOperation, options, located.model.plannedOperation)
			}
			parseEventFields(raw, located.completed)
			if (sameJson(raw, source))
				return located.model.repeat && !('eventUid' in reference)
					? occurrenceEventUid(reference)
					: located.model.eventUid
			if (located.model.repeat && !('eventUid' in reference)) {
				events.saveAsSingleEvent(located.model.id, located.date, raw)
				const uid = occurrenceEventUid(reference)
				const detached = events.planned.find(item => item.eventUid === uid)!
				if (changes.start)
					events.shiftToDate(detached.id, DateTime.YYYYMMDDToTimestamp(documentDate(changes.start)), located.date)
				this.storeEvents(data, events)
				return uid
			}
			events.updateEvent(located.model.id, raw)
			this.storeEvents(data, events)
			if (
				located.completed &&
				changes.actualOperation &&
				!sameJson(raw.actualOperation, located.model.actualOperation)
			) {
				const protectedResources = revertEventPrices(data, located.model.eventUid!, context)
				writeEventPrices(
					data,
					data.completedList.find(item => item.eventUid === located.model.eventUid)!,
					context,
					protectedResources
				)
			}
			return located.model.eventUid
		})
	}

	cancel(
		documentId: string,
		reference: ResourceEventReference,
		options: OperationCommandOptions = {}
	): OperationCommandResult {
		return this.run(documentId, options, (data, context) => {
			const events = this.events(data)
			const located = this.locate(events, reference) ?? commandError('Событие или вхождение не найдено')
			if (!located.completed) return located.model.eventUid
			events.uncompleteEvent(located.model.id, events.getEventDto(located.model.id)!)
			this.storeEvents(data, events)
			revertEventPrices(data, located.model.eventUid!, context)
			return located.model.eventUid
		})
	}

	remove(
		documentId: string,
		reference: ResourceEventReference,
		options: OperationCommandOptions = {}
	): OperationCommandResult {
		return this.run(documentId, options, (data, context) => {
			const events = this.events(data)
			const located = this.locate(events, reference)
			if (!located) return undefined
			if (located.model.repeat && !('eventUid' in reference))
				events.deleteCurrentRepeatableEvent(located.model.id, located.date)
			else events.deleteEvent(located.model.id)
			this.storeEvents(data, events)
			if (located.completed) revertEventPrices(data, located.model.eventUid!, context)
			return located.model.eventUid
		})
	}

	move(
		documentId: string,
		reference: ResourceEventReference,
		toDate: string,
		options: OperationCommandOptions = {}
	): OperationCommandResult {
		return this.run(documentId, options, data => {
			const events = this.events(data)
			const located = this.locate(events, reference) ?? commandError('Событие или вхождение не найдено')
			const date = DateTime.YYYYMMDDToTimestamp(documentDate(toDate))
			if (date === (located.model.repeat ? located.date : located.model.start))
				return located.model.repeat && !('eventUid' in reference)
					? occurrenceEventUid(reference)
					: located.model.eventUid
			let uid = located.model.eventUid!
			if (located.model.repeat) {
				if ('eventUid' in reference) commandError('Для переноса расписания укажите ключ вхождения')
				events.saveAsSingleEvent(located.model.id, located.date, events.getEventDto(located.model.id)!)
				uid = occurrenceEventUid(reference)
				const single = events.planned.find(item => item.eventUid === uid)!
				events.shiftToDate(single.id, date, located.date)
			} else events.shiftToDate(located.model.id, date, located.date)
			// Перенос карточки не меняет независимую дату финансового учёта.
			this.storeEvents(data, events)
			return uid
		})
	}

	copy(
		documentId: string,
		reference: ResourceEventReference,
		toDate: string,
		options: OperationCommandOptions = {}
	): OperationCommandResult {
		return this.run(documentId, options, data => {
			const events = this.events(data)
			const located = this.locate(events, reference) ?? commandError('Событие или вхождение не найдено')
			const before = new Set(data.plannedList.map(item => item.eventUid))
			events.copyToDate(located.model.id, DateTime.YYYYMMDDToTimestamp(documentDate(toDate)))
			const created = events.planned.find(item => !before.has(item.eventUid))!
			this.storeEvents(data, events)
			return created.eventUid
		})
	}

	applyPrice(
		documentId: string,
		reference: ResourceEventReference,
		options: OperationCommandOptions = {}
	): OperationCommandResult {
		return this.run(documentId, options, (data, context) => {
			const located = this.locate(this.events(data), reference) ?? commandError('Факт не найден')
			if (!located.completed) commandError('План не меняет цену справочника')
			const event = data.completedList.find(item => item.eventUid === located.model.eventUid)!
			if (event.actualOperation) validateOperation(data, event.actualOperation, event.actualOperation)
			writeEventPrices(data, event, context)
			return event.eventUid
		})
	}

	setPrice(
		documentId: string,
		resourceId: string,
		price: Omit<ResourcePrice, 'revision' | 'commandId' | 'sourceEventUid'>,
		options: OperationCommandOptions = {}
	): OperationCommandResult {
		return this.run(documentId, options, (data, context) => {
			writeManualPrice(data, resourceId, copy(price), context)
			return undefined
		})
	}

	opening(
		documentId: string,
		details: Omit<ResourceEventDetails, 'repeat'>,
		operation: Omit<ActualOperationInput, 'kind'>,
		options: OperationCommandOptions = {}
	): OperationCommandResult {
		return this.createActual(documentId, { ...details, actualOperation: { ...operation, kind: 'opening' } }, options)
	}

	adjust(
		documentId: string,
		details: Omit<ResourceEventDetails, 'repeat'>,
		operation: Omit<ActualOperationInput, 'kind'>,
		options: OperationCommandOptions = {}
	): OperationCommandResult {
		return this.createActual(documentId, { ...details, actualOperation: { ...operation, kind: 'adjustment' } }, options)
	}

	archive(documentId: string, kind: 'account' | 'resource', id: string, archived = true): OperationCommandResult {
		return this.run(documentId, {}, data => {
			const item =
				(kind === 'account' ? data.accounts : data.resources).find(item => item.id === id) ??
				commandError('Элемент справочника не найден')
			item.archived = archived
			return undefined
		})
	}

	removeCatalogEntry(documentId: string, kind: 'account' | 'resource', id: string): OperationCommandResult {
		return this.run(documentId, {}, data => {
			if (kind === 'account') data.accounts = data.accounts.filter(item => item.id !== id)
			else data.resources = data.resources.filter(item => item.id !== id)
			return undefined
		})
	}
}
