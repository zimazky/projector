import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures'
import { readLocalSnapshot } from './storage'

test('большая старая сессия мигрирует без записи в заполненный localStorage', async ({ context, page }, testInfo) => {
	const tabs = JSON.parse(readFileSync('src/test-utils/fixtures/legacy-tabs.json', 'utf8'))
	const a = JSON.parse(readFileSync('src/test-utils/fixtures/legacy-document.json', 'utf8'))
	const b = JSON.parse(readFileSync('src/test-utils/fixtures/repeating-document.json', 'utf8'))
	a.completedList[0].comment = 'x'.repeat(2400000)
	const original = {
		documentTabs: JSON.stringify(tabs),
		'document_fixture-a': JSON.stringify({ data: a, savedAt: Date.now() }),
		'document_fixture-b': JSON.stringify({ data: b, savedAt: Date.now() })
	}
	await context.addInitScript(entries => {
		if (!sessionStorage.getItem('seeded')) {
			for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
			sessionStorage.setItem('seeded', 'yes')
		}
		const set = Storage.prototype.setItem
		Storage.prototype.setItem = function (key, value) {
			if (
				this === localStorage &&
				(key === 'documentTabs' || key.startsWith('document_') || key.startsWith('documentTabs.backup.'))
			)
				throw new DOMException('Quota', 'QuotaExceededError')
			return set.call(this, key, value)
		}
	}, original)
	await page.goto('/index.html')
	await expect(page.getByTestId('document-tab')).toHaveCount(2)
	const current = await readLocalSnapshot(page)
	expect(current.documents[0].data.completedList[0].comment.length).toBe(2400000)
	await expect(page.getByRole('alert')).toHaveCount(0)
	const backup = await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('projector-documents', 1)
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
		try {
			return await new Promise<string[]>((resolve, reject) => {
				const tx = db.transaction('recovery', 'readonly')
				const request = tx.objectStore('recovery').getAll()
				tx.oncomplete = () => resolve(request.result)
				tx.onabort = () => reject(tx.error)
			})
		} finally {
			db.close()
		}
	})
	expect(backup).toHaveLength(1)
	expect(JSON.parse(backup[0])).toEqual(original)
	expect(
		await page.evaluate(
			keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])),
			Object.keys(original)
		)
	).toEqual(original)
	await page.locator('button[title=""]').click()
	await page.getByText('Projects', { exact: true }).click()
	await page.getByRole('button', { name: 'Add Project', exact: true }).click()
	await page.getByLabel('Project Name', { exact: true }).fill('After migration')
	await page.getByRole('button', { name: 'Add', exact: true }).click()
	await expect(page.getByRole('heading', { name: 'Add Project', exact: true })).toBeHidden()
	await expect(page.getByText('After migration', { exact: true })).toBeVisible()
	expect(JSON.stringify(await readLocalSnapshot(page))).toContain('After migration')
	await page.reload()
	await expect(page.getByTestId('document-tab')).toHaveCount(2)
	expect(JSON.stringify(await readLocalSnapshot(page))).toContain('After migration')
	await expect(page.getByRole('alert')).toHaveCount(0)
	expect(await page.evaluate(() => localStorage.getItem('documentTabs'))).toBe(original.documentTabs)
	await page.screenshot({ path: testInfo.outputPath('migration-complete.png'), fullPage: true })
})

test('отмена транзакции не оставляет частичную миграцию и допускает повтор', async ({ context, page }) => {
	const tabs = readFileSync('src/test-utils/fixtures/legacy-tabs.json', 'utf8')
	const a = readFileSync('src/test-utils/fixtures/legacy-document.json', 'utf8')
	const b = readFileSync('src/test-utils/fixtures/repeating-document.json', 'utf8')
	await context.addInitScript(
		({ tabs, a, b }) => {
			localStorage.setItem('documentTabs', tabs)
			localStorage.setItem('document_fixture-a', JSON.stringify({ data: JSON.parse(a), savedAt: Date.now() }))
			localStorage.setItem('document_fixture-b', JSON.stringify({ data: JSON.parse(b), savedAt: Date.now() }))
			const put = IDBObjectStore.prototype.put
			;(window as any).__allowDatabaseWrites = () => {
				IDBObjectStore.prototype.put = put
			}
			IDBObjectStore.prototype.put = function (value, key) {
				if (this.name === 'session') throw new DOMException('Quota', 'QuotaExceededError')
				return put.call(this, value, key)
			}
		},
		{ tabs, a, b }
	)
	await page.goto('/index.html')
	await expect(page.getByTestId('document-tab')).toHaveCount(2)
	await expect(page.getByRole('alert')).toContainText('Превышена квота IndexedDB')
	expect(await readLocalSnapshot(page)).toBeNull()
	const count = await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>(resolve => {
			const request = indexedDB.open('projector-documents', 1)
			request.onsuccess = () => resolve(request.result)
		})
		try {
			return await new Promise<number>(resolve => {
				const tx = db.transaction('recovery')
				const request = tx.objectStore('recovery').count()
				tx.oncomplete = () => resolve(request.result)
			})
		} finally {
			db.close()
		}
	})
	expect(count).toBe(0)
	expect(await page.evaluate(() => localStorage.getItem('documentTabs'))).toBe(tabs)
	await page.evaluate(() => (window as any).__allowDatabaseWrites())
	await page.getByRole('button', { name: 'Повторить локальное сохранение', exact: true }).click()
	await expect(page.getByRole('alert')).toHaveCount(0)
	expect((await readLocalSnapshot(page)).documents).toHaveLength(2)
})

test('импорт сохранённой сессии возвращает последние правки и сохраняет текущие вкладки', async ({ page }) => {
	await page.goto('/index.html')
	await page.getByRole('button', { name: 'Создать новый документ', exact: true }).click()
	const exported = await readLocalSnapshot(page)
	exported.documents[0].ref.name = 'Recovered export'
	exported.documents[0].data.projectsList.push({
		id: 'exported-project',
		name: 'Latest exported project',
		color: 'black',
		background: 'white'
	})
	await page.getByTestId('session-import-input').setInputFiles({
		name: 'projector-session.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(exported))
	})
	await expect(page.getByTestId('document-tab')).toHaveCount(2)
	await expect(page.getByTestId('document-title')).toContainText('Recovered export (восстановлено)')
	const current = await readLocalSnapshot(page)
	expect(current.documents[0].ref.name).toBe('Новый документ')
	expect(current.documents[1].data.projectsList[0].name).toBe('Latest exported project')
	await page.reload()
	await expect(page.getByTestId('document-tab')).toHaveCount(2)
	expect(JSON.stringify(await readLocalSnapshot(page))).toContain('Latest exported project')
})
