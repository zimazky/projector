import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures'
import { readLocalSnapshot, readRecoveryArchives } from './storage'

function oldSession() {
	const tabs = JSON.parse(readFileSync('src/test-utils/fixtures/legacy-tabs.json', 'utf8'))
	return JSON.stringify({
		...tabs,
		schemaVersion: 1,
		documents: tabs.documents.map((document: any, index: number) => ({
			...document,
			data: JSON.parse(
				readFileSync(`src/test-utils/fixtures/${index ? 'repeating-document' : 'legacy-document'}.json`, 'utf8')
			),
			operation: 'saving',
			error: { code: 'old', message: 'Previous operation', at: 1 }
		}))
	})
}

for (const abort of [false, true]) {
	test(`IndexedDB v1 → v2 сохраняет оригинал${abort ? ' после отката и повтора' : ''}`, async ({ context, page }) => {
		const original = oldSession()
		// Открываем origin до приложения, чтобы заполнить настоящий IndexedDB.
		await page.route('**/__e2e__/storage-setup', route =>
			route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Storage setup</title>' })
		)
		await page.goto('/__e2e__/storage-setup')
		await page.evaluate(async original => {
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open('projector-documents', 1)
				request.onupgradeneeded = () => {
					request.result.createObjectStore('session')
					request.result.createObjectStore('recovery', { autoIncrement: true })
				}
				request.onsuccess = () => resolve(request.result)
				request.onerror = () => reject(request.error)
			})
			try {
				await new Promise<void>((resolve, reject) => {
					const tx = db.transaction('session', 'readwrite')
					tx.objectStore('session').put(original, 'current')
					tx.oncomplete = () => resolve()
					tx.onabort = () => reject(tx.error)
				})
			} finally {
				db.close()
			}
		}, original)
		if (abort) {
			await context.addInitScript(() => {
				const put = IDBObjectStore.prototype.put
				;(window as any).__allowV2Migration = () => {
					IDBObjectStore.prototype.put = put
				}
				IDBObjectStore.prototype.put = function (value, key) {
					if (this.name === 'session') throw new DOMException('Quota', 'QuotaExceededError')
					return put.call(this, value, key)
				}
			})
		}
		await page.goto('/index.html')
		await expect(page.getByTestId('document-tab')).toHaveCount(2)
		if (abort) {
			await expect(page.getByRole('alert')).toContainText('Превышена квота IndexedDB')
			expect(await readLocalSnapshot(page)).toEqual(JSON.parse(original))
			expect(await readRecoveryArchives(page)).toEqual([])
			await page.evaluate(() => (window as any).__allowV2Migration())
			await page.getByRole('button', { name: 'Повторить локальное сохранение', exact: true }).click()
		}
		await expect(page.getByRole('alert')).toHaveCount(0)
		const current = await readLocalSnapshot(page)
		expect(current.schemaVersion).toBe(2)
		expect(current.documentOrder).toEqual(['fixture-a', 'fixture-b'])
		for (const document of current.documents) {
			expect(Object.keys(document).sort()).toEqual(['data', 'id', 'lastAccessedAt', 'ref', 'sync'])
			expect(document.sync.baseLocalVersion).toBeNull()
		}
		const archives = await readRecoveryArchives(page)
		expect(archives).toHaveLength(1)
		expect(JSON.parse(archives[0]).indexedDB.current).toBe(original)
		await page.reload()
		await expect(page.getByTestId('document-tab')).toHaveCount(2)
		expect((await readLocalSnapshot(page)).schemaVersion).toBe(2)
		expect(await readRecoveryArchives(page)).toEqual(archives)
		await page.getByTestId('document-tab').first().click()
		await page.getByTitle('Закрыть вкладку', { exact: true }).first().click()
		await expect(page.getByText('Есть несохранённые изменения.')).toBeVisible()
		await page.getByRole('button', { name: 'Отмена', exact: true }).click()
		await expect(page.getByTestId('document-tab')).toHaveCount(2)
	})
}

test('импорт экспорта сессии v1 сохраняет существующие вкладки и записывает v2', async ({ page }) => {
	await page.goto('/index.html')
	await page.getByRole('button', { name: 'Создать новый документ', exact: true }).click()
	await readLocalSnapshot(page)
	await page.getByTestId('session-import-input').setInputFiles({
		name: 'projector-session-v1.json',
		mimeType: 'application/json',
		buffer: Buffer.from(oldSession())
	})
	await expect(page.getByTestId('document-tab')).toHaveCount(3)
	const current = await readLocalSnapshot(page)
	expect(current.schemaVersion).toBe(2)
	expect(current.documents[0].ref.name).toBe('Новый документ')
	expect(current.documents.slice(1).map((document: any) => document.ref.name)).toEqual([
		'Demo A (восстановлено)',
		'Demo B (восстановлено)'
	])
	for (const document of current.documents) expect(document).not.toHaveProperty('state')
	await page.reload()
	await expect(page.getByTestId('document-tab')).toHaveCount(3)
	await expect(page.getByRole('alert')).toHaveCount(0)
})
