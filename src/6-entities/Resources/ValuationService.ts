import { decimal, parseDecimal, parsePrice, roundMoney } from 'src/7-shared/libs/Decimal/Decimal'
import type { Decimal } from 'src/7-shared/libs/Decimal/Decimal'
import { freezeSnapshot } from '../Document/model/DocumentSyncFingerprint'
import type { PriceSnapshot, Resource, UnvaluedPosition, ValuationResult } from './ResourceContracts'
import type { BalanceLocation } from '../EventsCache/ResourceBalance.types'

export type ValuationPosition = { resourceId: string; quantity: Decimal; location: BalanceLocation }

export function createPriceSnapshot(
	resources: readonly Readonly<Resource>[],
	baseResourceId: string,
	version: number,
	calculatedAt: string
): PriceSnapshot {
	if (!Number.isSafeInteger(version) || version < 0) throw new Error('Некорректная версия набора цен')
	return freezeSnapshot({
		version,
		calculatedAt,
		baseResourceId,
		prices: Object.fromEntries(
			resources
				.filter(resource => resource.price)
				.map(resource => [
					resource.id,
					{ ...resource.price!, amountPerUnit: parsePrice(resource.price!.amountPerUnit) }
				])
		)
	})
}

/** Только справочник цен: прямая цена или один валютный шаг. Количества не изменяются. */
export class ValuationService {
	private resources: Map<string, Pick<Resource, 'id' | 'kind'>>
	constructor(
		readonly snapshot: PriceSnapshot,
		resources: readonly Readonly<Resource>[],
		private readonly currencyScale: number
	) {
		this.resources = new Map(resources.map(resource => [resource.id, { id: resource.id, kind: resource.kind }]))
		const base = snapshot.prices[snapshot.baseResourceId]
		if (
			this.resources.get(snapshot.baseResourceId)?.kind !== 'currency' ||
			base?.amountPerUnit !== '1' ||
			base.quoteResourceId !== snapshot.baseResourceId
		)
			throw new Error('Основная валюта требует фиксированную цену 1')
	}
	value(positions: readonly ValuationPosition[]): ValuationResult {
		let amount = parseDecimal('0')
		const unvalued: UnvaluedPosition[] = []
		for (const position of positions) {
			if (position.quantity === '0') continue
			const price = Object.hasOwn(this.snapshot.prices, position.resourceId)
				? this.snapshot.prices[position.resourceId]
				: undefined
			let reason: UnvaluedPosition['reason'] | undefined
			let rate = price?.amountPerUnit
			if (!price) reason = 'missing-price'
			else if (this.resources.get(price.quoteResourceId)?.kind !== 'currency') reason = 'unsupported-quote'
			else if (price.quoteResourceId !== this.snapshot.baseResourceId) {
				const quote = Object.hasOwn(this.snapshot.prices, price.quoteResourceId)
					? this.snapshot.prices[price.quoteResourceId]
					: undefined
				if (!quote) reason = 'missing-quote-price'
				else if (quote.quoteResourceId !== this.snapshot.baseResourceId) reason = 'unsupported-quote'
				else rate = decimal.multiply(price.amountPerUnit, quote.amountPerUnit)
			}
			if (reason)
				unvalued.push({
					resourceId: position.resourceId,
					quantity: position.quantity,
					location: { ...position.location },
					reason
				})
			else amount = decimal.add(amount, decimal.multiply(position.quantity, rate!))
		}
		const summary = {
			amount: roundMoney(amount, this.currencyScale),
			currencyResourceId: this.snapshot.baseResourceId,
			priceSetVersion: this.snapshot.version,
			calculatedAt: this.snapshot.calculatedAt
		}
		return unvalued.length
			? { ...summary, complete: false, unvaluedPositions: unvalued as [UnvaluedPosition, ...UnvaluedPosition[]] }
			: { ...summary, complete: true, unvaluedPositions: [] }
	}
}
