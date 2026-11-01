import { test, expect } from './fixtures'

test.beforeEach(async ({ page }) => {
	await page.route('**/__resource-codec__', route =>
		route.fulfill({
			contentType: 'text/html',
			body: '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Resource codec test</title></head><body><script src="/dist/resource-codec.js"></script></body></html>'
		})
	)
	await page.goto('/__resource-codec__')
	await page.waitForFunction(() => (window as any).__resourceCodec !== undefined)
})

test('v4 сохраняет полный граф в IndexedDB и неизменяемый отправленный снимок после Reload', async ({ page }) => {
	const expected = await page.evaluate(async () => {
		const probe = (window as any).__resourceCodec
		const snapshot = probe.snapshot()
		const sent = probe.serialize(snapshot)
		const saving = probe.persistence().save(snapshot)
		snapshot.documents[0].data.resources[1].price.amountPerUnit = '95'
		await saving
		return JSON.parse(sent)
	})
	await page.reload()
	await page.waitForFunction(() => (window as any).__resourceCodec !== undefined)
	const actual = await page.evaluate(async () => (window as any).__resourceCodec.persistence().load())
	expect(actual).toEqual(expected)
	expect(actual.documents[0].data.cashbackMonthSettings[0].rewardAccountId).toBe('bonus-account')
	expect(actual.documents[0].data.completedList[0].actualOperation.movements).toHaveLength(3)
})

async function seedLegacy(page: import('@playwright/test').Page) {
	return page.evaluate(() => {
		const snapshot = (window as any).__resourceCodec.snapshot()
		snapshot.schemaVersion = 3
		snapshot.documents[0].data = {
			projectsList: [],
			completedList: [{ name: 'Both', projectId: 'default', start: '2026.11.01', credit: 100, debit: 20 }],
			plannedList: [{ name: 'Plan', projectId: 'default', start: '2026.11.02', debit: 10 }]
		}
		const fp = JSON.stringify(snapshot.documents[0].data)
		Object.assign(snapshot.documents[0].sync, { localFingerprint: fp, baseFingerprint: fp, remoteFingerprint: fp })
		const original = JSON.stringify(snapshot)
		localStorage.setItem('documentTabs', original)
		return original
	})
}

test('миграция в v4 архивирует исходник и не требует места в localStorage', async ({ page }) => {
	const original = await seedLegacy(page)
	const saved = await page.evaluate(async () => {
		const nativeSet = Storage.prototype.setItem
		Storage.prototype.setItem = function (key, value) {
			if (this === localStorage) throw new DOMException('Quota', 'QuotaExceededError')
			return nativeSet.call(this, key, value)
		}
		const probe = (window as any).__resourceCodec
		const persistence = probe.persistence()
		const converted = await persistence.load()
		await persistence.save(converted)
		return { converted, archive: await probe.storage().export(), original: localStorage.getItem('documentTabs') }
	})
	expect(saved.original).toBe(original)
	expect(saved.converted.documents[0].sync.baseLocalVersion).toBeNull()
	expect(
		saved.converted.documents[0].data.completedList[0].actualOperation.movements.map(
			(movement: any) => movement.quantity
		)
	).toEqual(['100', '-20'])
	expect(JSON.stringify(saved.archive)).toContain('documentTabs')
	await page.reload()
	await page.waitForFunction(() => (window as any).__resourceCodec !== undefined)
	expect(await page.evaluate(async () => (window as any).__resourceCodec.persistence().load())).toEqual(saved.converted)
})

test('ошибка IndexedDB откатывает сессию и архив, повтор не дублирует движения', async ({ page }) => {
	const original = await seedLegacy(page)
	const result = await page.evaluate(async () => {
		const probe = (window as any).__resourceCodec
		const persistence = probe.persistence()
		const converted = await persistence.load()
		const put = IDBObjectStore.prototype.put
		IDBObjectStore.prototype.put = function (value, key) {
			if (this.name === 'session') throw new DOMException('Quota', 'QuotaExceededError')
			return put.call(this, value, key!)
		}
		let failed = false
		try {
			await persistence.save(converted)
		} catch {
			failed = true
		} finally {
			IDBObjectStore.prototype.put = put
		}
		const afterFailure = await probe.storage().export()
		await persistence.save(converted)
		return {
			failed,
			afterFailure,
			afterRetry: await persistence.load(),
			converted,
			old: localStorage.getItem('documentTabs')
		}
	})
	expect(result.failed).toBe(true)
	expect(result.afterFailure.current).toBeUndefined()
	expect(result.afterFailure.recovery).toEqual([])
	expect(result.old).toBe(original)
	expect(result.afterRetry).toEqual(result.converted)
})

test('прежний путь отклоняет v4, будущая версия сохраняется для экспорта', async ({ page }) => {
	const result = await page.evaluate(async () => {
		const probe = (window as any).__resourceCodec
		await probe.persistence().save(probe.snapshot())
		const before = await probe.storage().read()
		let oldRejected = false
		try {
			await probe.legacyPersistence().load()
		} catch {
			oldRejected = true
		}
		const unchanged = before === (await probe.storage().read())
		const future = JSON.stringify({ ...probe.snapshot(), schemaVersion: 99 })
		await probe.storage().write(future)
		let futureRejected = false
		try {
			await probe.persistence().load()
		} catch {
			futureRejected = true
		}
		return {
			oldRejected,
			unchanged,
			futureRejected,
			source: await probe.storage().read(),
			future,
			exported: await probe.persistence().exportSource()
		}
	})
	expect(result.oldRejected).toBe(true)
	expect(result.unchanged).toBe(true)
	expect(result.futureRejected).toBe(true)
	expect(result.source).toBe(result.future)
	expect(result.exported).toContain('99')
})

test('документные справочники изолированы по вкладкам, составная команда даёт один снимок и переживает Reload', async ({
	page
}) => {
	const expected = await page.evaluate(async () => {
		const probe = (window as any).__resourceCodec
		const tabs = probe.tabs()
		tabs.openNewDocument('Первая')
		const firstId = tabs.activeDocumentId
		tabs.applyContentToDocument(firstId, probe.snapshot().documents[0].data)
		const catalogs = tabs.getDocumentStores(firstId).resourceStores
		const eventVersion = tabs.getDocumentStores(firstId).eventsStore.version
		tabs.openNewDocument('Вторая')
		const secondId = tabs.activeDocumentId
		const secondBefore = tabs.captureDocumentSnapshot(secondId)
		const firstBefore = tabs.captureDocumentSnapshot(firstId)
		await tabs.waitForLocalPersistence()
		let writes = 0
		const put = IDBObjectStore.prototype.put
		IDBObjectStore.prototype.put = function (value, key) {
			if (this.name === 'session') writes++
			return put.call(this, value, key!)
		}
		try {
			tabs.editDocument(firstId, (draft: any) => {
				draft.accounts[0].name = 'Основная карта'
				draft.balanceCategories[0].includeInGrandTotal = false
				draft.resources[1].price.amountPerUnit = '95'
				draft.resources[1].price.revision++
				draft.cashbackMonthSettings[0].note = 'Условия проверены'
			})
			await tabs.waitForLocalPersistence()
		} finally {
			IDBObjectStore.prototype.put = put
		}
		const firstAfter = tabs.captureDocumentSnapshot(firstId)
		const result = {
			writes,
			oneVersion: firstAfter.localVersion === firstBefore.localVersion + 1,
			eventsUnchanged: tabs.getDocumentStores(firstId).eventsStore.version === eventVersion,
			secondUnchanged:
				JSON.stringify(tabs.captureDocumentSnapshot(secondId).data) === JSON.stringify(secondBefore.data),
			catalogsUpdated: catalogs.accountsStore.getById('card').name === 'Основная карта',
			snapshot: JSON.parse(tabs.exportLocalSession())
		}
		tabs.dispose()
		return result
	})
	expect(expected.writes).toBe(1)
	expect(expected.oneVersion).toBe(true)
	expect(expected.eventsUnchanged).toBe(true)
	expect(expected.secondUnchanged).toBe(true)
	expect(expected.catalogsUpdated).toBe(true)
	await page.reload()
	await page.waitForFunction(() => (window as any).__resourceCodec !== undefined)
	const restored = await page.evaluate(async () => {
		const tabs = (window as any).__resourceCodec.tabs()
		const success = await tabs.restoreFromLocalStorage()
		const snapshot = JSON.parse(tabs.exportLocalSession())
		tabs.dispose()
		return { success, snapshot }
	})
	expect(restored.success).toBe(true)
	expect(restored.snapshot.documents).toEqual(expected.snapshot.documents)
	expect(restored.snapshot.documentOrder).toEqual(expected.snapshot.documentOrder)
	expect(restored.snapshot.activeDocumentId).toBe(expected.snapshot.activeDocumentId)
})

test('ошибка IndexedDB сохраняет видимую правку справочника, повтор записывает её для Reload', async ({ page }) => {
	const result = await page.evaluate(async () => {
		const probe = (window as any).__resourceCodec
		const tabs = probe.tabs()
		tabs.openNewDocument('Ошибка записи')
		const id = tabs.activeDocumentId
		tabs.applyContentToDocument(id, probe.snapshot().documents[0].data)
		await tabs.waitForLocalPersistence()
		const before = await probe.storage().read()
		const put = IDBObjectStore.prototype.put
		IDBObjectStore.prototype.put = function (value, key) {
			if (this.name === 'session') throw new DOMException('Quota', 'QuotaExceededError')
			return put.call(this, value, key!)
		}
		let failed: boolean
		try {
			const accounts = tabs.getDocumentStores(id).resourceStores.accountsStore
			accounts.upsert({ ...accounts.getById('card'), name: 'Видимая правка' })
			failed = !(await tabs.waitForLocalPersistence()) && !!tabs.persistenceError
		} finally {
			IDBObjectStore.prototype.put = put
		}
		const unchangedOnDisk = before === (await probe.storage().read())
		const visible = tabs.getDocumentDataForSave(id).accounts[0].name
		tabs.retryLocalPersistence()
		const retried = await tabs.waitForLocalPersistence()
		tabs.dispose()
		return { failed, unchangedOnDisk, visible, retried }
	})
	expect(result).toEqual({ failed: true, unchangedOnDisk: true, visible: 'Видимая правка', retried: true })
	await page.reload()
	await page.waitForFunction(() => (window as any).__resourceCodec !== undefined)
	const name = await page.evaluate(async () => {
		const tabs = (window as any).__resourceCodec.tabs()
		await tabs.restoreFromLocalStorage()
		return tabs.getDocumentDataForSave().accounts[0].name
	})
	expect(name).toBe('Видимая правка')
})
