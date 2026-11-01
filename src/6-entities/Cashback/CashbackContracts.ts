import type { Decimal, DecimalRounding } from '../../7-shared/libs/Decimal/Decimal'

export type CashbackCategory = {
	id: string
	name: string
}

export type CashbackContext = {
	categoryId: string
	/** Только подходящие расходные стороны; комиссии и налоги не включаются автоматически. */
	paymentMovementIds: string[]
}

export type CashbackRule = {
	id: string
	/** Отсутствует для явно заданной базовой ставки. */
	categoryId?: string
	ratePercent: Decimal
	/** В единицах rewardResourceId, независимо от денежной цены бонуса. */
	limitAmount?: Decimal
	/** В единицах calculationResourceId. */
	minimumPurchaseAmount?: Decimal
}

export type CashbackMonthSettings = {
	accountId: string
	/** YYYY-MM, месяц покупки в часовом поясе документа. */
	month: string
	calculationResourceId: string
	rewardResourceId: string
	rewardAccountId?: string
	/** Коэффициент начисления, не денежная оценка бонуса. */
	rewardUnitsPerCalculationUnit: Decimal
	rounding: { scale: number; mode: DecimalRounding }
	rules: CashbackRule[]
	/** В единицах rewardResourceId. */
	totalLimitAmount?: Decimal
	revision: number
	conditionsComplete: boolean
	note?: string
}

export type PurchaseReference = {
	eventUid: string
	movementId: string
	/** Для повторения — исходная серия и исходная дата, даже после переноса. */
	occurrence?: { seriesUid: string; occurrenceDate: string }
}

/** Ожидание не является движением и само по себе не меняет остатки. */
export type CashbackPurchaseSnapshot = {
	source: PurchaseReference
	settings: CashbackMonthSettings
	ruleId: string
	calculationAmount: Decimal
	expectedRewardQuantity: Decimal
	approximate: boolean
	cashbackPayoutUid?: string
}

/** Одна выплата может покрывать несколько расходных сторон разных покупок. */
export type CashbackPayoutLink = {
	sourcePurchases: PurchaseReference[]
	/** Месяц использования лимитов сохраняется независимо от даты выплаты. */
	purchaseMonth: string
	rewardResourceId: string
}
