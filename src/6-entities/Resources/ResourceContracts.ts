import type { Decimal } from '../../7-shared/libs/Decimal/Decimal'

export type Unit = {
	id: string
	symbol: string
	/** Допустимое число дробных разрядов количества: 0–18. */
	scale: number
}

export type BalanceCategory<Dimension extends 'account' | 'resource' = 'account' | 'resource'> = {
	id: string
	name: string
	dimension: Dimension
	includeInGrandTotal: boolean
	showInSummary: boolean
}

export type ResourcePrice = {
	/** Неотрицательная цена; отсутствие цены представляется отсутствием всей записи. */
	amountPerUnit: Decimal
	quoteResourceId: string
	asOf: string
	revision: number
	sourceEventUid?: string
	commandId?: string
}

export type Resource = {
	id: string
	name: string
	unitId: string
	kind: 'currency' | 'bond' | 'material' | 'bonus' | 'other'
	categoryId: string
	archived: boolean
	price?: ResourcePrice
}

/** Документный счёт; не связан со статическими индексами старого Accounts. */
export type ResourceAccount = {
	id: string
	name: string
	allowedResourceIds: string[]
	categoryId: string
	archived: boolean
}

export type PriceChange = {
	id: string
	commandId: string
	resourceId: string
	previousPrice?: ResourcePrice
	price: ResourcePrice
	/** Отменённая запись остаётся в коротком журнале, чтобы её цена не воскресла при следующей отмене. */
	undone?: boolean
	/** Предыдущее значение неизвестно после усечения журнала или неподдержанного внешнего изменения. */
	previousPriceUnavailable?: boolean
}

/** Набор неизменяем на всём горизонте одной оценки. */
export type PriceSnapshot = {
	readonly version: number
	readonly calculatedAt: string
	readonly baseResourceId: string
	readonly prices: Readonly<Record<string, Readonly<ResourcePrice>>>
}

export type UnvaluedPosition = {
	resourceId: string
	quantity: Decimal
	location:
		{ kind: 'account'; accountId: string } | { kind: 'account-category'; categoryId: string } | { kind: 'unassigned' }
	reason: 'missing-price' | 'missing-quote-price' | 'unsupported-quote'
}

type ValuationSummary = {
	/** Известная часть оценки; округляется один раз в масштабе основной валюты. */
	amount: Decimal
	currencyResourceId: string
	priceSetVersion: number
	calculatedAt: string
}

export type ValuationResult = ValuationSummary &
	(
		| { complete: true; unvaluedPositions: [] }
		| { complete: false; unvaluedPositions: [UnvaluedPosition, ...UnvaluedPosition[]] }
	)
