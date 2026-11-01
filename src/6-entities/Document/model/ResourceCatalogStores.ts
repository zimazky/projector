import { DocumentCatalogStore, type ReadonlyJson } from '../../Resources/DocumentCatalogStore'
import type { ResourceDocumentData } from './ResourceDocument.types'

type CatalogData = Omit<ResourceDocumentData, 'projectsList' | 'completedList' | 'plannedList'>
type CatalogKey =
	| 'accounts'
	| 'resources'
	| 'units'
	| 'balanceCategories'
	| 'priceHistory'
	| 'cashbackCategories'
	| 'cashbackMonthSettings'

/** Все справочники принадлежат одному documentId; события хранятся только в EventsStore. */
export class ResourceCatalogStores {
	private metadata: Pick<CatalogData, 'schemaVersion' | 'baseResourceId' | 'timezone' | 'migration'>
	private optional = new Set<CatalogKey>()
	readonly accountsStore
	readonly resourcesStore
	readonly unitsStore
	readonly balanceCategoriesStore
	readonly priceHistoryStore
	readonly cashbackCategoriesStore
	readonly cashbackMonthSettingsStore

	constructor(data: ResourceDocumentData, edit: (change: (draft: ResourceDocumentData) => void) => void) {
		const catalog = <K extends CatalogKey>(
			key: K,
			id: (item: ReadonlyJson<NonNullable<CatalogData[K]>[number]>) => string
		) =>
			new DocumentCatalogStore<NonNullable<CatalogData[K]>[number]>(id, items =>
				edit(draft => {
					Object.assign(draft, { [key]: items })
				})
			)
		this.accountsStore = catalog('accounts', item => item.id)
		this.resourcesStore = catalog('resources', item => item.id)
		this.unitsStore = catalog('units', item => item.id)
		this.balanceCategoriesStore = catalog('balanceCategories', item => item.id)
		this.priceHistoryStore = catalog('priceHistory', item => item.id)
		this.cashbackCategoriesStore = catalog('cashbackCategories', item => item.id)
		this.cashbackMonthSettingsStore = catalog('cashbackMonthSettings', item =>
			JSON.stringify([item.accountId, item.month])
		)
		this.metadata = { schemaVersion: 3, baseResourceId: data.baseResourceId, timezone: data.timezone }
		this.install(data)
	}

	/** @internal Не публикует пользовательскую правку при загрузке/замене снимка. */
	install(data: ResourceDocumentData): void {
		this.metadata = {
			schemaVersion: 3,
			baseResourceId: data.baseResourceId,
			timezone: data.timezone,
			...(data.migration ? { migration: { ...data.migration } } : {})
		}
		this.optional = new Set(['cashbackCategories', 'cashbackMonthSettings'].filter(key => key in data) as CatalogKey[])
		this.accountsStore.install(data.accounts)
		this.resourcesStore.install(data.resources)
		this.unitsStore.install(data.units)
		this.balanceCategoriesStore.install(data.balanceCategories)
		this.priceHistoryStore.install(data.priceHistory)
		this.cashbackCategoriesStore.install(data.cashbackCategories ?? [])
		this.cashbackMonthSettingsStore.install(data.cashbackMonthSettings ?? [])
	}

	prepareToSave(): CatalogData {
		return {
			...JSON.parse(JSON.stringify(this.metadata)),
			accounts: this.accountsStore.snapshot(),
			resources: this.resourcesStore.snapshot(),
			units: this.unitsStore.snapshot(),
			balanceCategories: this.balanceCategoriesStore.snapshot(),
			priceHistory: this.priceHistoryStore.snapshot(),
			...(this.optional.has('cashbackCategories')
				? { cashbackCategories: this.cashbackCategoriesStore.snapshot() }
				: {}),
			...(this.optional.has('cashbackMonthSettings')
				? { cashbackMonthSettings: this.cashbackMonthSettingsStore.snapshot() }
				: {})
		}
	}
}
