import type { Unit, Resource, ResourceAccount, BalanceCategory, PriceChange } from '../../Resources/ResourceContracts'
import type { CashbackCategory, CashbackMonthSettings } from '../../Cashback/CashbackContracts'
import type { LegacyDocumentData, DocumentSessionSnapshot } from './DocumentTabsStore.types'

export type ResourceMigrationContext = {
	id: string
	currency: { code: string; scale: number }
	currencyConfirmed: boolean
	asOf: string
	timezone: string
}

/** Полный сохраняемый граф. Индексы, прогноз и рекомендации сюда не входят. */
export type ResourceDocumentData = LegacyDocumentData & {
	schemaVersion: 3
	baseResourceId: string
	timezone: string
	units: Unit[]
	resources: Resource[]
	accounts: ResourceAccount[]
	balanceCategories: BalanceCategory[]
	priceHistory: PriceChange[]
	cashbackCategories?: CashbackCategory[]
	cashbackMonthSettings?: CashbackMonthSettings[]
	migration?: {
		contextId: string
		sourceSchemaVersion: 0 | 1 | 2
		sourceFingerprint: string
		currencyConfirmed: boolean
	}
}

export type ResourceSessionSnapshot = DocumentSessionSnapshot<ResourceDocumentData, 4>
