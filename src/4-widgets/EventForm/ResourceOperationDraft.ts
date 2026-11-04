import { newEventUid } from 'src/6-entities/Events/EventIdentity'
import type {
	ActualOperation,
	PlannedOperation,
	MovementRole,
	OperationKind
} from 'src/6-entities/Operations/OperationContracts'
import type { ResourceCatalogStores } from 'src/6-entities/Document/model/ResourceCatalogStores'
import { calculateDecimal } from 'src/7-shared/libs/Decimal/DecimalExpression'
import { decimal, parsePrice, parseQuantity, parseDecimal } from 'src/7-shared/libs/Decimal/Decimal'

export type MovementDraft = {
	id: string
	resourceId: string
	quantity: string
	direction: 'in' | 'out'
	role: MovementRole
	targetKind: 'account' | 'account-category' | 'unassigned'
	targetId: string
	accountId: string
	price: string
	quoteResourceId: string
	updatePrice: boolean
}
export function newMovement(
	resourceId: string,
	quoteResourceId: string,
	direction: MovementDraft['direction'] = 'out'
): MovementDraft {
	return {
		id: newEventUid('movement'),
		resourceId,
		quantity: '',
		direction,
		role: 'principal',
		targetKind: 'unassigned',
		targetId: '',
		accountId: '',
		price: '',
		quoteResourceId,
		updatePrice: false
	}
}
export function movementDrafts(
	operation: PlannedOperation | ActualOperation | undefined,
	baseResourceId: string
): MovementDraft[] {
	return (
		operation?.movements.map(row => {
			const price = operation.pricing?.find(price => price.pricedMovementId === row.id)
			return {
				...newMovement(row.resourceId, baseResourceId),
				id: row.id,
				quantity: decimal.abs(row.quantity),
				direction: row.quantity.startsWith('-') ? 'out' : 'in',
				role: row.role,
				targetKind: 'accountId' in row ? 'account' : row.target.kind,
				targetId:
					'accountId' in row
						? row.accountId
						: row.target.kind === 'account'
							? row.target.accountId
							: row.target.kind === 'account-category'
								? row.target.categoryId
								: '',
				accountId: 'accountId' in row ? row.accountId : row.target.kind === 'account' ? row.target.accountId : '',
				price: price?.pricePerUnit ?? '',
				quoteResourceId: price?.quoteResourceId ?? baseResourceId,
				updatePrice: price?.updateResourcePrice ?? false
			}
		}) ?? [newMovement(baseResourceId, baseResourceId)]
	)
}
export function buildOperation(
	kind: OperationKind,
	rows: MovementDraft[],
	catalogs: ResourceCatalogStores,
	source?: ActualOperation | PlannedOperation
): PlannedOperation {
	const movements = rows.map(row => {
		const resource = catalogs.resourcesStore.getById(row.resourceId)
		if (!resource) throw new Error('Выберите ресурс каждой стороны.')
		const scale = catalogs.unitsStore.getById(resource.unitId)!.scale
		const amount = parseQuantity(calculateDecimal(row.quantity), scale)
		if (decimal.compare(amount, parseDecimal('0')) <= 0)
			throw new Error('Количество должно быть положительным; направление задаётся отдельно.')
		return {
			id: row.id,
			resourceId: row.resourceId,
			quantity: row.direction === 'out' ? decimal.negate(amount) : amount,
			role: row.role,
			target:
				row.targetKind === 'account'
					? { kind: 'account' as const, accountId: row.targetId }
					: row.targetKind === 'account-category'
						? { kind: 'account-category' as const, categoryId: row.targetId }
						: { kind: 'unassigned' as const }
		}
	})
	const pricing =
		kind === 'exchange'
			? rows
					.filter(row => row.price.trim())
					.map(row => ({
						pricedMovementId: row.id,
						quoteResourceId: row.quoteResourceId,
						pricePerUnit: parsePrice(calculateDecimal(row.price)),
						updateResourcePrice: row.updatePrice
					}))
			: undefined
	return {
		kind,
		movements,
		...(pricing?.length ? { pricing } : {}),
		...(source?.cashback ? { cashback: source.cashback } : {}),
		...(source?.cashbackPayout ? { cashbackPayout: source.cashbackPayout } : {})
	}
}
export function actualFromDraft(
	plan: PlannedOperation,
	rows: MovementDraft[],
	effectiveDate: string,
	source?: ActualOperation,
	newOccurrence = false
): ActualOperation {
	const ids = new Map(plan.movements.map(row => [row.id, newOccurrence ? newEventUid('movement') : row.id]))
	return {
		...plan,
		effectiveDate,
		movements: plan.movements.map((movement, index) => {
			const { target: _target, ...rest } = movement
			if (!rows[index].accountId) throw new Error('Для выполнения выберите конкретный счёт каждой стороны.')
			return { ...rest, id: ids.get(movement.id)!, accountId: rows[index].accountId }
		}),
		...(plan.pricing
			? { pricing: plan.pricing.map(price => ({ ...price, pricedMovementId: ids.get(price.pricedMovementId)! })) }
			: {}),
		...(plan.cashback
			? { cashback: { ...plan.cashback, paymentMovementIds: plan.cashback.paymentMovementIds.map(id => ids.get(id)!) } }
			: {}),
		...(source?.originalPlan ? { originalPlan: source.originalPlan } : {}),
		...(source?.cashbackSnapshots ? { cashbackSnapshots: source.cashbackSnapshots } : {})
	}
}
