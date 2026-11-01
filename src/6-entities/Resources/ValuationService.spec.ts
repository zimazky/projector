import { parseDecimal as d } from 'src/7-shared/libs/Decimal/Decimal'
import { resourceBalanceDocument } from 'src/test-utils/resourceBalanceDocument'
import { createPriceSnapshot, ValuationService, type ValuationPosition } from './ValuationService'

const position = (resourceId: string, quantity: string, accountId = 'card'): ValuationPosition => ({
	resourceId,
	quantity: d(quantity),
	location: { kind: 'account', accountId }
})
function setup() {
	const data = resourceBalanceDocument()
	const snapshot = createPriceSnapshot(data.resources, data.baseResourceId, 7, '2026-11-01T10:00:00Z')
	return { data, snapshot, service: new ValuationService(snapshot, data.resources, 2) }
}

describe('R06 current-price valuation', () => {
	it('values base currency, direct USD and a bond through one currency step with one price snapshot', () => {
		const { service } = setup()
		expect(service.value([position('RUB', '100'), position('USD', '10'), position('bond', '2')])).toEqual({
			amount: '19000',
			currencyResourceId: 'RUB',
			priceSetVersion: 7,
			calculatedAt: '2026-11-01T10:00:00Z',
			complete: true,
			unvaluedPositions: []
		})
	})

	it('preserves signs and never changes quantities', () => {
		const { service } = setup()
		const rows = [position('USD', '-2'), position('fuel', '0.5')]
		const before = JSON.stringify(rows)
		expect(service.value(rows).amount).toBe('-142.5')
		expect(JSON.stringify(rows)).toBe(before)
	})

	it('rounds once after summing positions, not once per account', () => {
		const { data } = setup()
		data.resources.find(item => item.id === 'USD')!.price!.amountPerUnit = d('0.5')
		const value = new ValuationService(createPriceSnapshot(data.resources, 'RUB', 1, 'now'), data.resources, 2)
		expect(value.value([position('USD', '0.01', 'a'), position('USD', '0.01', 'b')]).amount).toBe('0.01')
	})

	it('returns the known part and every unvalued nonzero position instead of substituting zero', () => {
		const { data } = setup()
		delete data.resources.find(item => item.id === 'USD')!.price
		const value = new ValuationService(createPriceSnapshot(data.resources, 'RUB', 2, 'now'), data.resources, 2)
		const result = value.value([position('RUB', '100'), position('USD', '2'), position('bond', '1')])
		expect(result).toMatchObject({
			amount: '100',
			complete: false,
			unvaluedPositions: [
				{ resourceId: 'USD', quantity: '2', reason: 'missing-price' },
				{ resourceId: 'bond', quantity: '1', reason: 'missing-quote-price' }
			]
		})
	})

	it('distinguishes an explicit zero price from an absent price', () => {
		const { data } = setup()
		data.resources.find(item => item.id === 'USD')!.price!.amountPerUnit = d('0')
		const value = new ValuationService(createPriceSnapshot(data.resources, 'RUB', 2, 'now'), data.resources, 2)
		expect(value.value([position('USD', '100'), position('bond', '2')])).toMatchObject({ amount: '0', complete: true })
	})

	it('ignores zero-quantity positions even if their price is unknown', () => {
		const { service } = setup()
		expect(service.value([position('unknown', '0')])).toMatchObject({ complete: true, amount: '0' })
	})

	it.each(['cycle', 'material-quote'])(
		'reports an unsupported %s instead of finding another conversion path',
		variant => {
			const { data } = setup()
			const usd = data.resources.find(item => item.id === 'USD')!
			if (variant === 'cycle') usd.price!.quoteResourceId = 'USD'
			else data.resources.find(item => item.id === 'bond')!.price!.quoteResourceId = 'fuel'
			const value = new ValuationService(createPriceSnapshot(data.resources, 'RUB', 2, 'now'), data.resources, 2)
			expect(value.value([position('bond', '1')])).toMatchObject({
				complete: false,
				unvaluedPositions: [{ reason: 'unsupported-quote' }]
			})
		}
	)

	it('freezes the snapshot and keeps it independent of later resource mutations', () => {
		const { data, snapshot, service } = setup()
		expect(Object.isFrozen(snapshot.prices.USD)).toBe(true)
		data.resources.find(item => item.id === 'USD')!.price!.amountPerUnit = d('95')
		data.resources.find(item => item.id === 'USD')!.kind = 'material'
		expect(service.value([position('USD', '1'), position('bond', '1')]).amount).toBe('9090')
	})

	it('does not hide decimal overflow as an empty or complete valuation', () => {
		const { service } = setup()
		expect(() => service.value([position('USD', '999999999999999999999999999999')])).toThrow()
	})

	it('requires the base currency invariant even for an empty set of positions', () => {
		const { data } = setup()
		data.resources.find(item => item.id === 'RUB')!.price!.amountPerUnit = d('0')
		expect(() => new ValuationService(createPriceSnapshot(data.resources, 'RUB', 1, 'now'), data.resources, 2)).toThrow(
			'Основная валюта'
		)
	})
})
