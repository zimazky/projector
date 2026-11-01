import { test, expect } from './fixtures'

test.beforeEach(async ({ page }) => {
	await page.route('**/__resource-balances__', route =>
		route.fulfill({
			contentType: 'text/html',
			body: '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resource balances</title></head><body><script src="/dist/resource-codec.js"></script></body></html>'
		})
	)
	await page.goto('/__resource-balances__')
	await page.waitForFunction(() => (window as any).__resourceCodec !== undefined)
})

test('прогретый прогноз обновляется от цены и категории; назначение внутри группы сохраняет итог после Reload', async ({
	page
}) => {
	const result = await page.evaluate(async () => {
		const probe = (window as any).__resourceCodec
		const tabs = probe.tabs()
		tabs.openNewDocument('Прогноз')
		const id = tabs.activeDocumentId
		const data = probe.balanceDocument()
		data.completedList = [
			probe.balanceActual('a', '2026.11.01', 'card', 'RUB', '20000'),
			probe.balanceActual('b', '2026.11.01', 'card-b', 'RUB', '10000'),
			probe.balanceActual('usd', '2026.11.01', 'broker', 'USD', '10')
		]
		data.plannedList = [
			probe.balancePlan('a-plan', '2026.11.03', 'RUB', '-5000', { kind: 'account', accountId: 'card' }),
			probe.balancePlan('g-plan', '2026.11.03', 'RUB', '-7000', { kind: 'account-category', categoryId: 'everyday' })
		]
		tabs.applyContentToDocument(id, data)
		const cache = probe.balanceCache(tabs)
		const before = cache.get(id, '2026.11.04')
		cache.range(id, '2026.11.01', '2026.11.08')
		const stats = cache.diagnostics(id)
		probe.commands(tabs).setPrice(id, 'USD', { amountPerUnit: '95', quoteResourceId: 'RUB', asOf: '2026.11.03' })
		const priced = cache.get(id, '2026.11.04')
		const afterStats = cache.diagnostics(id)
		const operation = tabs
			.getDocumentDataForSave(id)
			.plannedList.find((event: any) => event.eventUid === 'g-plan').plannedOperation
		operation.movements[0].target = { kind: 'account', accountId: 'card-b' }
		probe.commands(tabs).edit(id, { eventUid: 'g-plan' }, { plannedOperation: operation })
		const assigned = cache.get(id, '2026.11.04')
		tabs.editDocument(id, (draft: any) => {
			draft.balanceCategories.find((row: any) => row.id === 'everyday').showInSummary = false
		})
		const hidden = cache.get(id, '2026.11.04')
		await tabs.waitForLocalPersistence()
		const range = cache.range(id, '2026.11.01', '2026.11.08')
		const result = {
			before: before.grandTotal.amount,
			priced: priced.grandTotal.amount,
			assigned: assigned.grandTotal.amount,
			hidden: hidden.grandTotal.amount,
			hiddenRows: hidden.accountCategories.length,
			positionsReused: before.positions === priced.positions,
			indexReused: stats.indexBuilds === afterStats.indexBuilds && stats.quantityReads === afterStats.quantityReads,
			cardB: assigned.accounts.find((row: any) => row.accountId === 'card-b').resources[0].quantity,
			oneSnapshot: range.every((row: any) => row.priceSnapshot === range[0].priceSnapshot)
		}
		cache.dispose()
		tabs.dispose()
		return result
	})
	expect(result).toEqual({
		before: '18900',
		priced: '18950',
		assigned: '18950',
		hidden: '18950',
		hiddenRows: 0,
		positionsReused: true,
		indexReused: true,
		cardB: '3000',
		oneSnapshot: true
	})
	await page.reload()
	await page.waitForFunction(() => (window as any).__resourceCodec !== undefined)
	const restored = await page.evaluate(async () => {
		const probe = (window as any).__resourceCodec,
			tabs = probe.tabs()
		await tabs.restoreFromLocalStorage()
		const cache = probe.balanceCache(tabs),
			report = cache.get(tabs.activeDocumentId, '2026.11.04')
		const result = {
			amount: report.grandTotal.amount,
			hiddenRows: report.accountCategories.length,
			cardB: report.accounts.find((row: any) => row.accountId === 'card-b').resources[0].quantity
		}
		cache.dispose()
		tabs.dispose()
		return result
	})
	expect(restored).toEqual({ amount: '18950', hiddenRows: 0, cardB: '3000' })
})

test('сегодняшний и будущий факты считаются по датам; смена дня/пояса переносит только границу планов', async ({
	page
}) => {
	const result = await page.evaluate(() => {
		const probe = (window as any).__resourceCodec,
			tabs = probe.tabs()
		tabs.openNewDocument('Граница')
		const id = tabs.activeDocumentId,
			data = probe.balanceDocument()
		data.completedList = [
			probe.balanceActual('a', '2026.11.01', 'card', 'RUB', '100'),
			probe.balanceActual('t', '2026.11.03', 'card', 'RUB', '-10'),
			probe.balanceActual('f', '2026.11.07', 'card', 'RUB', '50', { start: '2026.11.01' })
		]
		data.plannedList = [
			probe.balancePlan('late', '2026.11.02', 'RUB', '-70'),
			probe.balancePlan('today', '2026.11.03', 'RUB', '-5')
		]
		tabs.applyContentToDocument(id, data)
		const cache = probe.balanceCache(tabs)
		const today = cache.get(id, '2026.11.03').grandTotal.amount
		const tomorrow = cache.get(id, '2026.11.04').grandTotal.amount
		const future = cache.get(id, '2026.11.08').grandTotal.amount
		const stats = cache.diagnostics(id)
		cache.clock.refresh(Date.parse('2026-11-04T00:30:00Z'))
		const next = cache.get(id, '2026.11.05')
		tabs.editDocument(id, (draft: any) => {
			draft.timezone = 'America/New_York'
		})
		const timezone = cache.get(id, '2026.11.05')
		const result = {
			today,
			tomorrow,
			future,
			afterMidnight: next.grandTotal.amount,
			overdue: next.overdue.map((row: any) => row.eventUid),
			afterTimezone: timezone.grandTotal.amount,
			forecastFrom: timezone.forecastFrom,
			reused: stats.indexBuilds === cache.diagnostics(id).indexBuilds
		}
		cache.dispose()
		tabs.dispose()
		return result
	})
	expect(result).toEqual({
		today: '100',
		tomorrow: '85',
		future: '135',
		afterMidnight: '90',
		overdue: ['late', 'today'],
		afterTimezone: '85',
		forecastFrom: '2026.11.03',
		reused: true
	})
})

test('неполная оценка сохраняет количества и известную сумму; исключённый ресурс не делает итог неполным', async ({
	page
}) => {
	const result = await page.evaluate(() => {
		const probe = (window as any).__resourceCodec,
			tabs = probe.tabs()
		tabs.openNewDocument('Оценка')
		const id = tabs.activeDocumentId,
			data = probe.balanceDocument()
		delete data.resources.find((row: any) => row.id === 'fuel').price
		data.completedList = [
			probe.balanceActual('r', '2026.11.01', 'card', 'RUB', '100'),
			probe.balanceActual('f', '2026.11.01', 'tank', 'fuel', '10')
		]
		tabs.applyContentToDocument(id, data)
		const cache = probe.balanceCache(tabs),
			before = cache.get(id, '2026.11.04')
		tabs.editDocument(id, (draft: any) => {
			draft.balanceCategories.find((row: any) => row.id === 'materials').includeInGrandTotal = true
		})
		const after = cache.get(id, '2026.11.04')
		const result = {
			before: before.grandTotal.complete,
			after: after.grandTotal.complete,
			amount: after.grandTotal.amount,
			unvalued: after.grandTotal.unvaluedPositions,
			quantity: after.positions.find((row: any) => row.resourceId === 'fuel').quantity,
			basis: after.valuationBasis
		}
		cache.dispose()
		tabs.dispose()
		return result
	})
	expect(result).toEqual({
		before: true,
		after: false,
		amount: '100',
		unvalued: [
			{ resourceId: 'fuel', quantity: '10', location: { kind: 'account', accountId: 'tank' }, reason: 'missing-price' }
		],
		quantity: '10',
		basis: 'current-prices'
	})
})
