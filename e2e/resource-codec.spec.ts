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
