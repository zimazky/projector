import { parseDocumentData, parseEventFields, record } from './DocumentFormat'
import { computeFingerprint } from './DocumentSyncFingerprint'
import { newEventUid } from '../../Events/EventIdentity'
import { decimal, legacyNumberToDecimal, parseDecimal, parseQuantity } from 'src/7-shared/libs/Decimal/Decimal'
import type { EventDto } from '../../Events/EventDto'
import {
	eventDtoToIEventModel,
	singleEventModelToEventDto,
	repeatableEventModelToEventDto
} from '../../Events/EventMappers'
import type { PlannedMovement, ActualMovement, OperationKind } from '../../Operations/OperationContracts'
import type { ResourceDocumentData, ResourceMigrationContext } from './ResourceDocument.types'
import {
	ResourceFormatError,
	invalidResource,
	migrationContextSchema,
	resourceDocumentSchema
} from './ResourceDocumentSchema'
import { validateResourceDocumentGraph } from './ResourceDocumentGraph'

export const RESOURCE_DOCUMENT_SCHEMA_VERSION = 3

export { parseResourceDocumentData as normalizeResourceStoreData }

function canonicalEvent(source: EventDto, completed = false): EventDto {
	parseEventFields(source, completed)
	const model = eventDtoToIEventModel(source)
	const common = { ...model, id: 0, projectId: source.projectId! }
	const result = model.repeat
		? repeatableEventModelToEventDto({ ...common, repeat: model.repeat }, true)
		: singleEventModelToEventDto({ ...common, days: 1 }, true)
	if (source.originalPlan) result.originalPlan = canonicalEvent(source.originalPlan)
	return result
}

function read(content: unknown): unknown {
	try {
		return typeof content === 'string' ? JSON.parse(content) : content
	} catch {
		return invalidResource('JSON', 'не удалось прочитать исходник')
	}
}

export function createResourceMigrationContext(
	options: Omit<ResourceMigrationContext, 'id'> & { id?: string }
): ResourceMigrationContext {
	return checkedContext({ ...options, id: options.id ?? `migration:${newEventUid()}` })
}

function checkedContext(context: ResourceMigrationContext): ResourceMigrationContext {
	const result = migrationContextSchema(context, 'migrationContext') as ResourceMigrationContext
	if (!/^[A-Z]{3}$/.test(result.currency.code) || result.currency.scale > 18)
		invalidResource('migrationContext.currency', 'требуются код валюты из трёх заглавных букв и масштаб 0–18')
	return result
}

function catalogs(context: ResourceMigrationContext): ResourceDocumentData {
	const prefix = `migration:${encodeURIComponent(context.id)}`
	const baseResourceId = `${prefix}:currency:${context.currency.code}`
	return {
		schemaVersion: RESOURCE_DOCUMENT_SCHEMA_VERSION,
		baseResourceId,
		timezone: context.timezone,
		projectsList: [],
		completedList: [],
		plannedList: [],
		units: [{ id: `${prefix}:unit`, symbol: context.currency.code, scale: context.currency.scale }],
		resources: [
			{
				id: baseResourceId,
				name: context.currency.code,
				unitId: `${prefix}:unit`,
				kind: 'currency',
				categoryId: `${prefix}:resource-category`,
				archived: false,
				price: { amountPerUnit: parseDecimal('1'), quoteResourceId: baseResourceId, asOf: context.asOf, revision: 0 }
			}
		],
		accounts: [],
		balanceCategories: [
			{
				id: `${prefix}:account-category`,
				name: 'Без категории',
				dimension: 'account',
				includeInGrandTotal: true,
				showInSummary: true
			},
			{
				id: `${prefix}:resource-category`,
				name: 'Без категории',
				dimension: 'resource',
				includeInGrandTotal: true,
				showInSummary: true
			}
		],
		priceHistory: []
	}
}

/** Для действительно нового документа валюта уже выбрана, старых сумм для интерпретации нет. */
export function createEmptyResourceDocumentData(options: ResourceMigrationContext): ResourceDocumentData {
	const context = checkedContext(options)
	if (!context.currencyConfirmed) invalidResource('currency', 'подтвердите основную валюту')
	return parseResourceDocumentData(catalogs(context))
}

/** Исходник возвращается отдельно и не перезаписывается. Контекст сохраняется в новом графе. */
export function migrateLegacyResourceDocument(
	content: unknown,
	options: ResourceMigrationContext
): {
	data: ResourceDocumentData
	sourceJson: string
	context: ResourceMigrationContext
} {
	const raw = read(content)
	const context = checkedContext(options)
	const legacy = parseDocumentData(raw)
	const data = catalogs(context)
	const prefix = `migration:${encodeURIComponent(context.id)}`
	const accountId = `${prefix}:technical-account`
	data.projectsList = legacy.projectsList
	data.accounts.push({
		id: accountId,
		name: 'Общий (до разделения)',
		allowedResourceIds: [data.baseResourceId],
		categoryId: `${prefix}:account-category`,
		archived: false
	})
	const convert = (source: EventDto, index: number, completed: boolean): EventDto => {
		const eventUid = `${prefix}:event:${completed ? 'completed' : 'planned'}:${index}`
		const event: EventDto = { ...source, eventUid }
		delete event.credit
		delete event.debit
		if (source.repeat) event.seriesUid = `${prefix}:series:${index}`
		const amounts = [
			{ side: 'credit', value: source.credit ?? 0 },
			{ side: 'debit', value: source.debit ?? 0 }
		] as const
		const movements = amounts
			.filter(item => item.value !== 0)
			.map(item => {
				const amount = legacyNumberToDecimal(item.value)
				const quantity = parseQuantity(item.side === 'debit' ? decimal.negate(amount) : amount, context.currency.scale)
				const movement = {
					id: `${eventUid}:movement:${item.side}`,
					resourceId: data.baseResourceId,
					quantity,
					role: 'principal' as const
				}
				return completed ? { ...movement, accountId } : { ...movement, target: { kind: 'unassigned' as const } }
			})
		if (movements.length) {
			let kind: OperationKind = 'adjustment'
			if (movements.length === 1)
				kind = decimal.compare(movements[0].quantity, parseDecimal('0')) > 0 ? 'income' : 'expense'
			if (completed)
				event.actualOperation = { kind, effectiveDate: event.start, movements: movements as ActualMovement[] }
			else event.plannedOperation = { kind, movements: movements as PlannedMovement[] }
		}
		return event
	}
	data.completedList = legacy.completedList.map((event, index) => convert(event, index, true))
	data.plannedList = legacy.plannedList.map((event, index) => convert(event, index, false))
	data.migration = {
		contextId: context.id,
		sourceSchemaVersion: (record(raw) ? (raw.schemaVersion ?? 0) : 0) as 0 | 1 | 2,
		sourceFingerprint: computeFingerprint(legacy),
		currencyConfirmed: context.currencyConfirmed
	}
	return {
		data: parseResourceDocumentData(data),
		sourceJson: typeof content === 'string' ? content : JSON.stringify(content),
		context
	}
}

/** Отдельный маршрут R03. Старые файлы требуют явного контекста и выбранной валюты. */
export function parseResourceDocumentData(
	content: unknown,
	migrationContext?: ResourceMigrationContext
): ResourceDocumentData {
	try {
		const raw = read(content)
		if (!record(raw)) return invalidResource('root', 'ожидается объект')
		if (raw.schemaVersion === undefined || raw.schemaVersion === 1 || raw.schemaVersion === 2) {
			if (!migrationContext) return invalidResource('migration', 'требуется контекст и выбор исходной валюты')
			return migrateLegacyResourceDocument(content, migrationContext).data
		}
		if (raw.schemaVersion !== RESOURCE_DOCUMENT_SCHEMA_VERSION)
			return invalidResource('schemaVersion', 'неподдерживаемая версия')
		const data = resourceDocumentSchema(raw, 'document') as ResourceDocumentData
		data.completedList = data.completedList.map(event => canonicalEvent(event, true))
		data.plannedList = data.plannedList.map(event => canonicalEvent(event))
		validateResourceDocumentGraph(data)
		// Такой же порядок выдаёт EventsStore: нормализация не создаёт ложный dirty при чтении.
		data.plannedList = [
			...data.plannedList.filter(event => event.repeat),
			...data.plannedList.filter(event => !event.repeat)
		]
		return data
	} catch (error) {
		if (error instanceof ResourceFormatError) throw error
		return invalidResource('graph', error instanceof Error ? error.message : 'не удалось проверить документ')
	}
}

export function serializeResourceDocumentData(data: ResourceDocumentData): string {
	const checked = parseResourceDocumentData(data)
	if (checked.migration && !checked.migration.currencyConfirmed)
		invalidResource('migration.currencyConfirmed', 'подтвердите валюту до первой записи нового формата')
	return JSON.stringify(checked, null, 2)
}
