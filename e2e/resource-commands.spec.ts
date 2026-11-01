import { test, expect } from './fixtures'

test.beforeEach(async ({ page }) => {
	await page.route('**/__resource-commands__', route =>
		route.fulfill({
			contentType: 'text/html',
			body: '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resource commands</title></head><body><script src="/dist/resource-codec.js"></script></body></html>'
		})
	)
	await page.goto('/__resource-commands__')
	await page.waitForFunction(() => (window as any).__resourceCodec !== undefined)
	await page.evaluate(() => {
		const probe = (window as any).__resourceCodec
		const data = probe.snapshot().documents[0].data
		data.completedList = []
		data.plannedList = []
		data.priceHistory = []
		for (const resource of data.resources)
			if (resource.price) {
				delete resource.price.sourceEventUid
				delete resource.price.commandId
			}
		data.accounts.push({ ...data.accounts[0], id: 'card-b', name: 'Комиссия' })
		Object.assign(window, {
			__commandData: data,
			__purchase: (price = '80') => ({
				kind: 'exchange',
				effectiveDate: '2026.11.05',
				movements: [
					{ id: 'pay-' + price, resourceId: 'RUB', accountId: 'card', quantity: '-' + price + '0', role: 'principal' },
					{ id: 'fuel-' + price, resourceId: 'fuel', accountId: 'tank', quantity: '10', role: 'principal' },
					{ resourceId: 'RUB', accountId: 'card-b', quantity: '-5', role: 'fee' }
				],
				pricing: [
					{ pricedMovementId: 'fuel-' + price, quoteResourceId: 'RUB', pricePerUnit: price, updateResourcePrice: true }
				]
			})
		})
	})
})

test('выполнение вхождения и цена пишутся одной транзакцией; повтор и отмена работают после Reload', async ({
	page
}) => {
	const result = await page.evaluate(async () => {
		const probe = (window as any).__resourceCodec
		const tabs = probe.tabs()
		tabs.openNewDocument('Вхождение')
		const id = tabs.activeDocumentId
		tabs.applyContentToDocument(id, (window as any).__commandData)
		const commands = probe.commands(tabs)
		commands.createPlanned(id, {
			name: 'Заправка',
			start: '2026.11.01',
			repeat: '/2',
			end: '2026.11.12',
			plannedOperation: {
				kind: 'exchange',
				movements: [
					{ resourceId: 'RUB', quantity: '-800', role: 'principal', target: { kind: 'unassigned' } },
					{ resourceId: 'fuel', quantity: '10', role: 'principal', target: { kind: 'account', accountId: 'tank' } }
				]
			}
		})
		const reference = {
			seriesUid: tabs.getDocumentDataForSave(id).plannedList[0].seriesUid,
			occurrenceDate: '2026.11.03'
		}
		const beforeVersion = tabs.activeDocument.sync.localVersion
		await tabs.waitForLocalPersistence()
		const put = IDBObjectStore.prototype.put
		let writes = 0
		IDBObjectStore.prototype.put = function (value, key) {
			if (this.name === 'session') writes++
			return put.call(this, value, key!)
		}
		let duplicate: string
		try {
			commands.complete(id, reference, (window as any).__purchase())
			duplicate = commands.complete(id, reference, (window as any).__purchase()).status
			await tabs.waitForLocalPersistence()
		} finally {
			IDBObjectStore.prototype.put = put
		}
		const data = tabs.getDocumentDataForSave(id)
		const result = {
			id,
			reference,
			writes,
			duplicate,
			versionDelta: tabs.activeDocument.sync.localVersion - beforeVersion,
			price: data.resources.find((item: any) => item.id === 'fuel').price.amountPerUnit,
			actual: data.completedList[0],
			count: data.completedList.length
		}
		tabs.dispose()
		return result
	})
	expect(result.writes).toBe(1)
	expect(result.versionDelta).toBe(1)
	expect(result.duplicate).toBe('unchanged')
	expect(result.price).toBe('80')
	expect(result.count).toBe(1)
	expect(result.actual.actualOperation.movements).toHaveLength(3)
	expect(result.actual.occurrence).toEqual(result.reference)
	await page.reload()
	await page.waitForFunction(() => (window as any).__resourceCodec !== undefined)
	const cancelled = await page.evaluate(async reference => {
		const probe = (window as any).__resourceCodec
		const tabs = probe.tabs()
		await tabs.restoreFromLocalStorage()
		const commands = probe.commands(tabs)
		const repeated = commands.complete(tabs.activeDocumentId, reference, undefined).status
		commands.cancel(tabs.activeDocumentId, reference)
		await tabs.waitForLocalPersistence()
		const data = tabs.getDocumentDataForSave()
		tabs.dispose()
		return { repeated, data }
	}, result.reference)
	expect(cancelled.repeated).toBe('unchanged')
	expect(cancelled.data.completedList).toHaveLength(0)
	expect(
		cancelled.data.plannedList.filter((event: any) => event.occurrence?.occurrenceDate === '2026.11.03')
	).toHaveLength(1)
	expect(cancelled.data.resources.find((item: any) => item.id === 'fuel').price.amountPerUnit).toBe('75')
	await page.reload()
	await page.waitForFunction(() => (window as any).__resourceCodec !== undefined)
	expect(
		await page.evaluate(async () => {
			const tabs = (window as any).__resourceCodec.tabs()
			await tabs.restoreFromLocalStorage()
			return tabs.getDocumentDataForSave()
		})
	).toEqual(cancelled.data)
})

test('цепочка отмен после Reload не возвращает цену уже отменённой сделки', async ({ page }) => {
	const uids = await page.evaluate(async () => {
		const probe = (window as any).__resourceCodec
		const tabs = probe.tabs()
		tabs.openNewDocument('Две покупки')
		tabs.applyContentToDocument(tabs.activeDocumentId, (window as any).__commandData)
		const commands = probe.commands(tabs)
		const create = (price: string) =>
			commands.createActual(tabs.activeDocumentId, {
				name: price,
				start: '2026.11.05',
				actualOperation: (window as any).__purchase(price)
			}).eventUid
		const uids = { a: create('80'), b: create('90') }
		await tabs.waitForLocalPersistence()
		tabs.dispose()
		return uids
	})
	for (const [uid, expected] of [
		[uids.a, '90'],
		[uids.b, '75']
	]) {
		await page.reload()
		await page.waitForFunction(() => (window as any).__resourceCodec !== undefined)
		const price = await page.evaluate(async uid => {
			const probe = (window as any).__resourceCodec
			const tabs = probe.tabs()
			await tabs.restoreFromLocalStorage()
			probe.commands(tabs).cancel(tabs.activeDocumentId, { eventUid: uid })
			await tabs.waitForLocalPersistence()
			const price = tabs.getDocumentDataForSave().resources.find((item: any) => item.id === 'fuel').price.amountPerUnit
			tabs.dispose()
			return price
		}, uid)
		expect(price).toBe(expected)
	}
})

test('ошибка последней стороны не меняет документ; ошибка IndexedDB оставляет факт и цену для повтора', async ({
	page
}) => {
	const result = await page.evaluate(async () => {
		const probe = (window as any).__resourceCodec
		const tabs = probe.tabs()
		tabs.openNewDocument('Ошибки')
		const id = tabs.activeDocumentId
		tabs.applyContentToDocument(id, (window as any).__commandData)
		const commands = probe.commands(tabs)
		await tabs.waitForLocalPersistence()
		const before = JSON.stringify(tabs.getDocumentDataForSave())
		const beforeDisk = await probe.storage().read()
		const invalid = (window as any).__purchase()
		invalid.movements[2].accountId = 'tank'
		let rejected = false
		try {
			commands.createActual(id, { name: 'Ошибка комиссии', start: '2026.11.05', actualOperation: invalid })
		} catch {
			rejected = true
		}
		const unchanged = JSON.stringify(tabs.getDocumentDataForSave()) === before
		const put = IDBObjectStore.prototype.put
		IDBObjectStore.prototype.put = function (value, key) {
			if (this.name === 'session') throw new DOMException('Quota', 'QuotaExceededError')
			return put.call(this, value, key!)
		}
		let failed: boolean
		try {
			commands.createActual(id, {
				name: 'Видимый факт',
				start: '2026.11.05',
				actualOperation: (window as any).__purchase()
			})
			failed = !(await tabs.waitForLocalPersistence())
		} finally {
			IDBObjectStore.prototype.put = put
		}
		const oldDisk = (await probe.storage().read()) === beforeDisk
		const visible = tabs.getDocumentDataForSave()
		tabs.retryLocalPersistence()
		const retry = await tabs.waitForLocalPersistence()
		tabs.dispose()
		return { rejected, unchanged, failed, oldDisk, visible, retry }
	})
	expect(result.rejected).toBe(true)
	expect(result.unchanged).toBe(true)
	expect(result.failed).toBe(true)
	expect(result.oldDisk).toBe(true)
	expect(result.retry).toBe(true)
	expect(result.visible.completedList).toHaveLength(1)
	expect(result.visible.resources.find((item: any) => item.id === 'fuel').price.amountPerUnit).toBe('80')
	await page.reload()
	await page.waitForFunction(() => (window as any).__resourceCodec !== undefined)
	expect(
		await page.evaluate(async () => {
			const tabs = (window as any).__resourceCodec.tabs()
			await tabs.restoreFromLocalStorage()
			return tabs.getDocumentDataForSave()
		})
	).toEqual(result.visible)
})
