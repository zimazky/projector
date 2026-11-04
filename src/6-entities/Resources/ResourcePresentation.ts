import type { ActualOperation, PlannedOperation } from '../Operations/OperationContracts'
import type { ResourceCatalogStores } from '../Document/model/ResourceCatalogStores'
import type { ReadonlyJson } from './DocumentCatalogStore'
import type { ResourceBalanceReport } from '../EventsCache/ResourceBalance.types'

export function describeMovements(
	operation: ReadonlyJson<ActualOperation | PlannedOperation> | undefined,
	catalogs: ResourceCatalogStores | undefined
): string[] {
	return (
		operation?.movements.map(movement => {
			const resource = catalogs?.resourcesStore.getById(movement.resourceId)
			const unit = resource && catalogs?.unitsStore.getById(resource.unitId)?.symbol
			const location =
				'accountId' in movement
					? catalogs?.accountsStore.getById(movement.accountId)?.name
					: movement.target.kind === 'account'
						? catalogs?.accountsStore.getById(movement.target.accountId)?.name
						: movement.target.kind === 'account-category'
							? `Категория: ${catalogs?.balanceCategoriesStore.getById(movement.target.categoryId)?.name ?? movement.target.categoryId}`
							: 'Не выбрано'
			return `${movement.quantity.startsWith('-') ? '' : '+'}${movement.quantity} ${unit ?? resource?.name ?? movement.resourceId} · ${resource?.name ?? movement.resourceId} · ${location ?? 'Счёт недоступен'}${movement.role === 'fee' ? ' · комиссия' : movement.role === 'tax' ? ' · налог' : ''}`
		}) ?? []
	)
}

export function valuationLabel(report: ReadonlyJson<ResourceBalanceReport>, catalogs: ResourceCatalogStores): string {
	const resource = catalogs.resourcesStore.getById(report.grandTotal.currencyResourceId)
	const symbol = resource && catalogs.unitsStore.getById(resource.unitId)?.symbol
	return `${formatDecimalAmount(report.grandTotal.amount)} ${symbol ?? resource?.name ?? report.grandTotal.currencyResourceId}${report.grandTotal.complete ? '' : ' · неполная оценка'}`
}

/** Локализованное отображение сохраняет строковую десятичную точность. */
export function formatDecimalAmount(value: string): string {
	const [integer, fraction] = value.split('.')
	return integer.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + (fraction ? ',' + fraction : '')
}
