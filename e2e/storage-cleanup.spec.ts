import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { readLocalSnapshot, readRecoveryArchives } from './storage'

const originals: Record<string, string> = {
	documentTabs: readFileSync('src/test-utils/fixtures/legacy-tabs.json', 'utf8'),
	'document_fixture-a': JSON.stringify({
		data: JSON.parse(readFileSync('src/test-utils/fixtures/legacy-document.json', 'utf8')),
		savedAt: 0
	}),
	'document_fixture-b': JSON.stringify({
		data: JSON.parse(readFileSync('src/test-utils/fixtures/repeating-document.json', 'utf8')),
		savedAt: 0
	}),
	data: 'old single document',
	'data.json': 'old Drive ID',
	lastOpenedDocument: 'old document reference',
	document_doc_100_abc: '{"data":{"projectsList":[],"plannedList":[],"completedList":[]},"savedAt":0}',
	'documentTabs.backup.0': 'previous backup'
}

async function clean(page: Page) {
	await page.locator('button[title=""]').click()
	await page.getByText('Очистить старые локальные записи', { exact: true }).click()
}
async function legacyValues(page: Page) {
	return page.evaluate(
		keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])),
		Object.keys(originals)
	)
}

test.beforeEach(async ({ context, page }) => {
	await context.addInitScript(entries => {
		if (sessionStorage.getItem('cleanup-seeded')) return
		for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
		localStorage.setItem('theme', 'keep this setting')
		sessionStorage.setItem('cleanup-seeded', 'yes')
	}, originals)
	await page.goto('/index.html')
	await expect(page.getByTestId('document-tab')).toHaveCount(2)
	await readLocalSnapshot(page)
})

test('очистка архивирует поколения хранения, сохраняет сессию и не возвращает закрытые пустые вкладки', async ({
	page
}, testInfo) => {
	const current = await readLocalSnapshot(page)
	const initialArchives = (await readRecoveryArchives(page)).length
	await clean(page)
	await expect(page.getByRole('status')).toContainText('Удалено старых записей: 8')
	expect(Object.values(await legacyValues(page)).every(value => value === null)).toBe(true)
	expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('keep this setting')
	expect(await readLocalSnapshot(page)).toEqual(current)
	const archives = await readRecoveryArchives(page)
	expect(archives).toHaveLength(initialArchives + 1)
	expect(JSON.parse(archives.at(-1)!)).toMatchObject({ kind: 'localStorage-cleanup', entries: originals })
	await page.screenshot({ path: testInfo.outputPath('cleanup-complete.png'), fullPage: true })
	await clean(page)
	await expect(page.getByRole('status')).toContainText('Старых локальных записей для очистки нет')
	expect((await readRecoveryArchives(page)).length).toBe(archives.length)
	await page.locator('button[title=""]').click()
	const downloading = page.waitForEvent('download')
	await page.getByText('Экспортировать резервные снимки', { exact: true }).click()
	const downloaded = JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'))
	expect(JSON.parse(downloaded.indexedDB.recovery.at(-1)).entries).toEqual(originals)
	await page.getByTestId('new-document-button').click()
	await expect(page.getByTestId('document-tab')).toHaveCount(3)
	await page.getByTestId('document-tab').last().getByTitle('Закрыть вкладку', { exact: true }).click()
	await expect(page.getByTestId('document-tab')).toHaveCount(2)
	expect((await readLocalSnapshot(page)).documents).toHaveLength(2)
	await page.reload()
	await expect(page.getByTestId('document-tab')).toHaveCount(2)
	expect((await readLocalSnapshot(page)).documents.map((item: any) => item.data)).toEqual(
		current.documents.map((item: any) => item.data)
	)
	expect(Object.values(await legacyValues(page)).every(value => value === null)).toBe(true)
})

test('ошибка архива сохраняет исходники и допускает повтор', async ({ page }) => {
	const current = await readLocalSnapshot(page)
	const initialArchives = await readRecoveryArchives(page)
	await page.evaluate(() => {
		const add = IDBObjectStore.prototype.add
		;(window as any).__restoreCleanupArchive = () => {
			IDBObjectStore.prototype.add = add
		}
		IDBObjectStore.prototype.add = function (value, key) {
			if (this.name === 'recovery') throw new DOMException('Cleanup archive quota', 'QuotaExceededError')
			return add.call(this, value, key)
		}
	})
	page.once('dialog', dialog => dialog.accept())
	await clean(page)
	await expect(page.getByRole('status')).toContainText('Очистка не выполнена')
	expect(await legacyValues(page)).toEqual(originals)
	expect(await readLocalSnapshot(page)).toEqual(current)
	expect(await readRecoveryArchives(page)).toEqual(initialArchives)
	await page.evaluate(() => (window as any).__restoreCleanupArchive())
	await clean(page)
	await expect(page.getByRole('status')).toContainText('Удалено старых записей: 8')
})

test('изменённый во время архивации ключ сохраняется', async ({ page }) => {
	await page.evaluate(() => {
		const add = IDBObjectStore.prototype.add
		IDBObjectStore.prototype.add = function (value, key) {
			if (this.name === 'recovery' && JSON.parse(value as string).kind === 'localStorage-cleanup')
				localStorage.setItem('data', 'changed during archive')
			return add.call(this, value, key)
		}
	})
	await clean(page)
	await expect(page.getByRole('status')).toContainText('Изменившихся записей оставлено: 1')
	expect(await page.evaluate(() => localStorage.getItem('data'))).toBe('changed during archive')
	const archive = JSON.parse((await readRecoveryArchives(page)).at(-1)!)
	expect(archive.entries.data).toBe(originals.data)
})

for (const mode of ['invalid', 'missing'] as const) {
	test(`без подтверждённой сессии IndexedDB очистка запрещена: ${mode}`, async ({ page }) => {
		const archives = await readRecoveryArchives(page)
		await page.evaluate(async mode => {
			const db = await new Promise<IDBDatabase>(resolve => {
				const request = indexedDB.open('projector-documents', 1)
				request.onsuccess = () => resolve(request.result)
			})
			try {
				await new Promise<void>((resolve, reject) => {
					const tx = db.transaction('session', 'readwrite')
					if (mode === 'invalid') tx.objectStore('session').put('{}', 'current')
					else tx.objectStore('session').delete('current')
					tx.oncomplete = () => resolve()
					tx.onabort = () => reject(tx.error)
				})
			} finally {
				db.close()
			}
		}, mode)
		page.once('dialog', dialog => dialog.accept())
		await clean(page)
		await expect(page.getByRole('status')).toContainText('Очистка не выполнена')
		expect(await legacyValues(page)).toEqual(originals)
		expect(await readRecoveryArchives(page)).toEqual(archives)
	})
}
