import { record, documentDate } from './DocumentFormat'
import { parseDecimal, parsePrice } from 'src/7-shared/libs/Decimal/Decimal'

export class ResourceFormatError extends Error {}
export function invalidResource(path: string, message: string): never {
	throw new ResourceFormatError(`Неверный формат ресурсного документа: ${path}: ${message}`)
}

type Reader = (value: unknown, path: string) => unknown

export const text: Reader = (value, path) => {
	if (typeof value !== 'string') invalidResource(path, 'ожидается строка')
	return value
}
export const id: Reader = (value, path) => {
	const result = text(value, path) as string
	if (!result.trim()) invalidResource(path, 'пустой идентификатор или имя')
	return result
}
const flag: Reader = (value, path) => {
	if (typeof value !== 'boolean') invalidResource(path, 'ожидается boolean')
	return value
}
export const integer: Reader = (value, path) => {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
		invalidResource(path, 'ожидается неотрицательное безопасное целое')
	return value
}
export const choice =
	(...values: (string | number)[]): Reader =>
	(value, path) => {
		if (!values.includes(value as string | number)) invalidResource(path, 'неподдерживаемое значение')
		return value
	}
export const list =
	(read: Reader): Reader =>
	(value, path) => {
		if (!Array.isArray(value)) invalidResource(path, 'ожидается массив')
		return value.map((item, index) => read(item, `${path}[${index}]`))
	}

/** Строгие объекты: неизвестное поле отклоняется, а не теряется при записи. */
export const shape =
	(required: Record<string, Reader>, optional: Record<string, Reader> = {}): Reader =>
	(value, path) => {
		if (!record(value)) invalidResource(path, 'ожидается объект')
		for (const key of Object.keys(value))
			if (!Object.hasOwn(required, key) && !Object.hasOwn(optional, key))
				invalidResource(`${path}.${key}`, 'неизвестное поле')
		const result: Record<string, unknown> = {}
		for (const [key, read] of Object.entries(required)) result[key] = read(value[key], `${path}.${key}`)
		for (const [key, read] of Object.entries(optional))
			if (Object.hasOwn(value, key)) result[key] = read(value[key], `${path}.${key}`)
		return result
	}

export const date: Reader = (value, path) => {
	try {
		return documentDate(value)
	} catch {
		return invalidResource(path, 'ожидается действительная дата YYYY.MM.DD')
	}
}
export const month: Reader = (value, path) => {
	if (typeof value !== 'string' || !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value) || value.startsWith('0000'))
		invalidResource(path, 'ожидается месяц YYYY-MM')
	return value
}
const decimal: Reader = (value, path) => {
	try {
		return parseDecimal(value, 18)
	} catch {
		return invalidResource(path, 'неверное десятичное число')
	}
}
const priceAmount: Reader = (value, path) => {
	try {
		return parsePrice(value)
	} catch {
		return invalidResource(path, 'ожидается неотрицательная десятичная цена')
	}
}
export const timezone: Reader = (value, path) => {
	id(value, path)
	try {
		new Intl.DateTimeFormat('en', { timeZone: value as string }).format(0)
	} catch {
		return invalidResource(path, 'неверный часовой пояс')
	}
	return value
}

const occurrence = shape({ seriesUid: id, occurrenceDate: date })
const purchaseReference = shape({ eventUid: id, movementId: id }, { occurrence })
const cashbackContext = shape({ categoryId: id, paymentMovementIds: list(id) })
const payout = shape({ sourcePurchases: list(purchaseReference), purchaseMonth: month, rewardResourceId: id })
const rule = shape(
	{ id, ratePercent: decimal },
	{ categoryId: id, limitAmount: decimal, minimumPurchaseAmount: decimal }
)
export const monthSettings = shape(
	{
		accountId: id,
		month,
		calculationResourceId: id,
		rewardResourceId: id,
		rewardUnitsPerCalculationUnit: decimal,
		rounding: shape({ scale: integer, mode: choice('half-up', 'half-even', 'down') }),
		rules: list(rule),
		revision: integer,
		conditionsComplete: flag
	},
	{ rewardAccountId: id, totalLimitAmount: decimal, note: text }
)
const cashbackSnapshot = shape(
	{
		source: purchaseReference,
		settings: monthSettings,
		ruleId: id,
		calculationAmount: decimal,
		expectedRewardQuantity: decimal,
		approximate: flag
	},
	{ cashbackPayoutUid: id }
)
const pricing = shape({
	pricedMovementId: id,
	quoteResourceId: id,
	pricePerUnit: priceAmount,
	updateResourcePrice: flag
})
const target: Reader = (value, path) => {
	if (!record(value)) return invalidResource(path, 'ожидается цель движения')
	switch (value.kind) {
		case 'account':
			return shape({ kind: choice('account'), accountId: id })(value, path)
		case 'account-category':
			return shape({ kind: choice('account-category'), categoryId: id })(value, path)
		case 'unassigned':
			return shape({ kind: choice('unassigned') })(value, path)
		default:
			return invalidResource(path, 'неверный вид цели')
	}
}
const movementFields = { id, resourceId: id, quantity: decimal, role: choice('principal', 'fee', 'tax') }
const operationKind = choice('income', 'expense', 'transfer', 'exchange', 'opening', 'adjustment')
const operationExtras = { pricing: list(pricing), cashback: cashbackContext, cashbackPayout: payout }
const plannedOperation = shape(
	{ kind: operationKind, movements: list(shape({ ...movementFields, target })) },
	operationExtras
)
const actualOperation = shape(
	{
		kind: operationKind,
		effectiveDate: date,
		movements: list(shape({ ...movementFields, accountId: id }))
	},
	{ ...operationExtras, originalPlan: plannedOperation, cashbackSnapshots: list(cashbackSnapshot) }
)

const eventRequired = { eventUid: id, name: text, start: date, projectId: id }
const eventOptional = {
	comment: text,
	time: text,
	duration: text,
	end: date,
	repeat: id,
	seriesUid: id,
	occurrence,
	plannedOperation
}
const planSnapshot = shape(eventRequired, eventOptional)
const event = shape(eventRequired, { ...eventOptional, actualOperation, originalPlan: planSnapshot })
const price = shape(
	{ amountPerUnit: priceAmount, quoteResourceId: id, asOf: date, revision: integer },
	{ sourceEventUid: id, commandId: id }
)

export const resourceDocumentSchema = shape(
	{
		schemaVersion: choice(3),
		baseResourceId: id,
		timezone,
		projectsList: list(shape({ id, name: id, color: text, background: text })),
		completedList: list(event),
		plannedList: list(event),
		units: list(shape({ id, symbol: id, scale: integer })),
		resources: list(
			shape(
				{
					id,
					name: id,
					unitId: id,
					kind: choice('currency', 'bond', 'material', 'bonus', 'other'),
					categoryId: id,
					archived: flag
				},
				{ price }
			)
		),
		accounts: list(shape({ id, name: id, allowedResourceIds: list(id), categoryId: id, archived: flag })),
		balanceCategories: list(
			shape({ id, name: id, dimension: choice('account', 'resource'), includeInGrandTotal: flag, showInSummary: flag })
		),
		priceHistory: list(
			shape(
				{ id, commandId: id, resourceId: id, price },
				{ previousPrice: price, undone: flag, previousPriceUnavailable: flag }
			)
		)
	},
	{
		cashbackCategories: list(shape({ id, name: id })),
		cashbackMonthSettings: list(monthSettings),
		migration: shape({
			contextId: id,
			sourceSchemaVersion: choice(0, 1, 2),
			sourceFingerprint: id,
			currencyConfirmed: flag
		})
	}
)

export const migrationContextSchema = shape({
	id,
	currency: shape({ code: id, scale: integer }),
	currencyConfirmed: flag,
	asOf: date,
	timezone
})
