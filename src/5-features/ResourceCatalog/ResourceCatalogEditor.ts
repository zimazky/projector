import type { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'
import type { ResourceDocumentData } from 'src/6-entities/Document/model/ResourceDocument.types'
import type { BalanceCategory, Resource, ResourceAccount, Unit } from 'src/6-entities/Resources/ResourceContracts'
import { parseResourceDocumentData } from 'src/6-entities/Document/model/ResourceDocumentFormat'
import { parsePrice, parseQuantity } from 'src/7-shared/libs/Decimal/Decimal'
import { newEventUid } from 'src/6-entities/Events/EventIdentity'

export type CatalogChange =
	| { kind: 'account'; value: ResourceAccount }
	| { kind: 'resource'; value: Resource }
	| { kind: 'category'; value: BalanceCategory }
	| { kind: 'unit'; value: Unit }

/** Контекст одной формы. Смена вкладки сохраняет адрес; замена данных делает форму устаревшей. */
export class ResourceCatalogEditor {
	private readonly session
	private readonly stores
	private readonly version
	readonly commandId = `catalog:${newEventUid()}`

	constructor(
		private readonly tabs: DocumentTabsStore,
		readonly documentId: string
	) {
		this.session = tabs.documents.find(item => item.id === documentId)
		this.stores = tabs.getDocumentStores(documentId)
		this.version = this.session?.sync.localVersion
		this.check()
	}

	check(): void {
		if (
			!this.session ||
			!this.stores?.resourceStores ||
			this.tabs.documents.find(item => item.id === this.documentId) !== this.session ||
			this.tabs.getDocumentStores(this.documentId) !== this.stores ||
			!this.stores.isInitialized ||
			this.session.sync.localVersion !== this.version
		)
			throw new Error('Исходный документ закрыт или изменён. Откройте форму заново.')
	}

	get data(): ResourceDocumentData {
		this.check()
		return this.tabs.getDocumentDataForSave(this.documentId) as ResourceDocumentData
	}

	private apply(data: ResourceDocumentData, change: CatalogChange): void {
		const key = { account: 'accounts', resource: 'resources', category: 'balanceCategories', unit: 'units' } as const
		const list = data[key[change.kind]] as { id: string }[]
		const index = list.findIndex(item => item.id === change.value.id)
		const value = JSON.parse(JSON.stringify(change.value))
		if (index < 0) list.push(value)
		else list[index] = value
	}

	/** Проверка графа и предупреждения до публикации, без изменения живых сторов. */
	preview(change: CatalogChange): string[] {
		const before = this.data
		const after = JSON.parse(JSON.stringify(before)) as ResourceDocumentData
		this.apply(after, change)
		parseResourceDocumentData(after)
		const warnings: string[] = []
		if (change.kind === 'account' || change.kind === 'resource') {
			const key = change.kind === 'account' ? 'accounts' : 'resources'
			const previous = before[key].find(item => item.id === change.value.id)
			if (previous && previous.categoryId !== change.value.categoryId)
				warnings.push('Смена категории перегруппирует всю историю и прогноз этого элемента.')
		}
		for (const event of after.plannedList) {
			for (const movement of event.plannedOperation?.movements ?? []) {
				const target = movement.target
				const resource = after.resources.find(item => item.id === movement.resourceId)!
				const matches = after.accounts.some(
					account =>
						!account.archived &&
						!resource.archived &&
						account.allowedResourceIds.includes(resource.id) &&
						(target.kind === 'unassigned' ||
							(target.kind === 'account' ? account.id === target.accountId : account.categoryId === target.categoryId))
				)
				if (!matches) {
					warnings.push(`План «${event.name}»: нет подходящего активного счёта для ${resource.name}.`)
				}
			}
		}
		return [...new Set(warnings)]
	}

	save(change: CatalogChange): void {
		this.check()
		this.tabs.editDocument(this.documentId, draft => this.apply(draft as ResourceDocumentData, change))
	}

	price(resourceId: string, amount: string, quoteResourceId: string, asOf: string): void {
		this.check()
		this.tabs.resourceCommands.setPrice(
			this.documentId,
			resourceId,
			{
				amountPerUnit: parsePrice(amount.replace(',', '.')),
				quoteResourceId,
				asOf
			},
			{ commandId: this.commandId }
		)
	}

	balance(kind: 'opening' | 'adjustment', accountId: string, resourceId: string, quantity: string, date: string): void {
		const data = this.data
		const resource = data.resources.find(item => item.id === resourceId)
		const account = data.accounts.find(item => item.id === accountId)
		if (!resource || resource.archived || !account || account.archived)
			throw new Error('Выберите активный счёт и ресурс.')
		const scale = data.units.find(item => item.id === resource.unitId)!.scale
		const operation = {
			effectiveDate: date,
			movements: [
				{
					resourceId,
					accountId,
					quantity: parseQuantity(quantity.replace(',', '.'), scale),
					role: 'principal' as const
				}
			]
		}
		const details = { name: kind === 'opening' ? 'Начальный остаток' : 'Корректировка остатка', start: date }
		const commands = this.tabs.resourceCommands
		if (kind === 'opening') commands.opening(this.documentId, details, operation, { commandId: this.commandId })
		else commands.adjust(this.documentId, details, operation, { commandId: this.commandId })
	}
}
