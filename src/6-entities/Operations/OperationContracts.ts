import type { Decimal } from '../../7-shared/libs/Decimal/Decimal'
import type { CashbackContext, CashbackPurchaseSnapshot, CashbackPayoutLink } from '../Cashback/CashbackContracts'

export type PlannedTarget =
	| { kind: 'account'; accountId: string; categoryId?: never }
	| { kind: 'account-category'; categoryId: string; accountId?: never }
	| { kind: 'unassigned'; accountId?: never; categoryId?: never }

export type MovementRole = 'principal' | 'fee' | 'tax'

export type PlannedMovement = {
	id: string
	resourceId: string
	/** Положительное количество — приход, отрицательное — расход. */
	quantity: Decimal
	target: PlannedTarget
	role: MovementRole
}

export type ActualMovement = {
	id: string
	resourceId: string
	quantity: Decimal
	accountId: string
	role: MovementRole
}

export type OperationKind = 'income' | 'expense' | 'transfer' | 'exchange' | 'opening' | 'adjustment'

export type ExchangePricing = {
	pricedMovementId: string
	quoteResourceId: string
	pricePerUnit: Decimal
	updateResourcePrice: boolean
}

export type PlannedOperation = {
	kind: OperationKind
	movements: PlannedMovement[]
	pricing?: ExchangePricing[]
	cashback?: CashbackContext
	cashbackPayout?: CashbackPayoutLink
}

export type ActualOperation = {
	kind: OperationKind
	/** Дата учёта независима от длительности задачи. */
	effectiveDate: string
	movements: ActualMovement[]
	originalPlan?: PlannedOperation
	pricing?: ExchangePricing[]
	cashback?: CashbackContext
	cashbackSnapshots?: CashbackPurchaseSnapshot[]
	cashbackPayout?: CashbackPayoutLink
}
