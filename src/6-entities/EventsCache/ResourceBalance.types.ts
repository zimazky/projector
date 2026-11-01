import type { Decimal } from 'src/7-shared/libs/Decimal/Decimal'
import type { PriceSnapshot, ValuationResult } from '../Resources/ResourceContracts'

export type BalanceLocation =
	{ kind: 'account'; accountId: string } | { kind: 'account-category'; categoryId: string } | { kind: 'unassigned' }
export type QuantityTotals = { quantity: Decimal; incoming: Decimal; outgoing: Decimal }
export type QuantityBucket = QuantityTotals & { resourceId: string; location: BalanceLocation }
export type BalancePosition = {
	resourceId: string
	location: BalanceLocation
	actual: QuantityTotals
	planned: QuantityTotals
	quantity: Decimal
}
export type ResourceQuantity = Omit<BalancePosition, 'location'>
export type OverduePlan = {
	eventUid: string
	name: string
	seriesUid?: string
	start: string
	end?: string
	occurrenceCount: number
	positions: QuantityBucket[]
}
export type QuantityReport = {
	date: string
	forecastFrom: string
	mode: 'actual' | 'forecast'
	positions: BalancePosition[]
}
export type ResourceBalanceReport = QuantityReport & {
	documentId: string
	timezone: string
	valuationBasis: 'current-prices'
	priceSnapshot: PriceSnapshot
	grandTotal: ValuationResult
	accounts: {
		accountId: string
		categoryId: string
		includeInGrandTotal: boolean
		showInSummary: boolean
		resources: ResourceQuantity[]
	}[]
	accountCategories: { categoryId: string; includeInGrandTotal: boolean; resources: ResourceQuantity[] }[]
	resourceCategories: { categoryId: string; includeInGrandTotal: boolean; resources: ResourceQuantity[] }[]
	unassigned: BalancePosition[]
	overdue: OverduePlan[]
}
