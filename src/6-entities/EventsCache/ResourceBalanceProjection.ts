import { decimal } from 'src/7-shared/libs/Decimal/Decimal'
import type { BalanceCategory, Resource, ResourceAccount } from '../Resources/ResourceContracts'
import type {
	BalancePosition,
	QuantityBucket,
	QuantityReport,
	ResourceBalanceReport,
	ResourceQuantity
} from './ResourceBalance.types'
import { addTotals, bucketKey, EMPTY_TOTALS } from './QuantitySeries'

export function combinePositions(
	actual: readonly QuantityBucket[],
	planned: readonly QuantityBucket[]
): BalancePosition[] {
	const rows = new Map<string, BalancePosition>()
	for (const [kind, buckets] of [
		['actual', actual],
		['planned', planned]
	] as const)
		for (const row of buckets) {
			const key = bucketKey(row)
			const position = rows.get(key) ?? {
				resourceId: row.resourceId,
				location: { ...row.location },
				actual: { ...EMPTY_TOTALS },
				planned: { ...EMPTY_TOTALS },
				quantity: EMPTY_TOTALS.quantity
			}
			position[kind] = addTotals(position[kind], row)
			position.quantity = decimal.add(position.actual.quantity, position.planned.quantity)
			rows.set(key, position)
		}
	return [...rows.values()]
}

function resourceTotals(positions: readonly BalancePosition[]): ResourceQuantity[] {
	const rows = new Map<string, ResourceQuantity>()
	for (const position of positions) {
		const previous = rows.get(position.resourceId) ?? {
			resourceId: position.resourceId,
			actual: EMPTY_TOTALS,
			planned: EMPTY_TOTALS,
			quantity: EMPTY_TOTALS.quantity
		}
		const actual = addTotals(previous.actual, position.actual),
			planned = addTotals(previous.planned, position.planned)
		rows.set(position.resourceId, {
			resourceId: position.resourceId,
			actual,
			planned,
			quantity: decimal.add(actual.quantity, planned.quantity)
		})
	}
	return [...rows.values()]
}

export function projectResourceQuantities(
	quantities: QuantityReport,
	catalogs: {
		resources: readonly Readonly<Resource>[]
		accounts: readonly Pick<ResourceAccount, 'id' | 'categoryId'>[]
		balanceCategories: readonly BalanceCategory[]
	}
): Pick<ResourceBalanceReport, 'accounts' | 'accountCategories' | 'resourceCategories' | 'unassigned'> & {
	included: BalancePosition[]
} {
	const categories = new Map(catalogs.balanceCategories.map(item => [item.id, item]))
	const accounts = new Map(catalogs.accounts.map(item => [item.id, item]))
	const resources = new Map(catalogs.resources.map(item => [item.id, item]))
	const accountCategory = (position: BalancePosition): string | undefined =>
		position.location.kind === 'account'
			? accounts.get(position.location.accountId)?.categoryId
			: position.location.kind === 'account-category'
				? position.location.categoryId
				: undefined
	const byAccount = new Map<string, BalancePosition[]>(),
		byAccountCategory = new Map<string, BalancePosition[]>(),
		byResourceCategory = new Map<string, BalancePosition[]>()
	const group = (map: Map<string, BalancePosition[]>, id: string | undefined, position: BalancePosition) => {
		if (id !== undefined) {
			const rows = map.get(id) ?? []
			rows.push(position)
			map.set(id, rows)
		}
	}
	for (const position of quantities.positions) {
		if (position.location.kind === 'account') group(byAccount, position.location.accountId, position)
		group(byAccountCategory, accountCategory(position), position)
		group(byResourceCategory, resources.get(position.resourceId)?.categoryId, position)
	}
	const included = quantities.positions.filter(position => {
		const resourceCategory = resources.get(position.resourceId)?.categoryId
		if (!resourceCategory || !categories.get(resourceCategory)?.includeInGrandTotal) return false
		const group = accountCategory(position)
		return position.location.kind === 'unassigned' || !!(group && categories.get(group)?.includeInGrandTotal)
	})
	return {
		included,
		accounts: catalogs.accounts.map(account => ({
			accountId: account.id,
			categoryId: account.categoryId,
			includeInGrandTotal: categories.get(account.categoryId)!.includeInGrandTotal,
			showInSummary: categories.get(account.categoryId)!.showInSummary,
			resources: resourceTotals(byAccount.get(account.id) ?? [])
		})),
		accountCategories: catalogs.balanceCategories
			.filter(category => category.dimension === 'account' && category.showInSummary)
			.map(category => ({
				categoryId: category.id,
				includeInGrandTotal: category.includeInGrandTotal,
				resources: resourceTotals(byAccountCategory.get(category.id) ?? [])
			})),
		resourceCategories: catalogs.balanceCategories
			.filter(category => category.dimension === 'resource' && category.showInSummary)
			.map(category => ({
				categoryId: category.id,
				includeInGrandTotal: category.includeInGrandTotal,
				resources: resourceTotals(byResourceCategory.get(category.id) ?? [])
			})),
		unassigned: quantities.positions.filter(position => position.location.kind === 'unassigned')
	}
}
