import { readLocalSnapshot } from './storage'
import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

async function openProjects(page: Page) {
	await page.locator('button[title=""]').click()
	await page.getByText('Projects', { exact: true }).click()
	await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
}

async function createDirtyDocument(page: Page) {
	await page.getByRole('button', { name: 'Создать новый документ', exact: true }).click()
	await openProjects(page)
	await page.getByRole('button', { name: 'Add Project', exact: true }).click()
	await page.getByLabel('Project Name', { exact: true }).fill('Browser fixture')
	await page.getByRole('button', { name: 'Add', exact: true }).click()
	await expect(page.getByRole('heading', { name: 'Add Project', exact: true })).toBeHidden()
	await expect(page.getByText('Browser fixture', { exact: true })).toBeVisible()
	await expect(page.getByTestId('document-tab').getByTitle('Есть несохранённые изменения')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
	await page.goto('/index.html')
	await expect(page.getByRole('heading', { name: 'Нет открытых документов' })).toBeVisible()
})

test('создание и переключение вкладок', async ({ page }, testInfo) => {
	await page.getByRole('button', { name: 'Создать новый документ', exact: true }).click()
	await page.getByTestId('new-document-button').click()
	const tabs = page.getByTestId('document-tab')
	await expect(tabs).toHaveCount(2)
	await tabs.first().click()
	await expect(tabs.first()).toHaveClass(/active/)
	await page.screenshot({ path: testInfo.outputPath('tabs.png'), fullPage: true })
})

for (const source of ['tab', 'menu'] as const) {
	test(`отмена закрытия: ${source}`, async ({ page }) => {
		await createDirtyDocument(page)
		if (source === 'tab') await page.getByTitle('Закрыть вкладку', { exact: true }).click()
		else {
			await page.locator('button[title=""]').click()
			await page.getByText('Закрыть документ', { exact: true }).click()
		}
		await expect(page.getByText('Есть несохранённые изменения.')).toBeVisible()
		await page.getByRole('button', { name: 'Отмена', exact: true }).click()
		await expect(page.getByTestId('document-tab')).toHaveCount(1)
		await expect(page.getByText('Browser fixture', { exact: true })).toBeVisible()
		await page.getByTitle('Закрыть вкладку', { exact: true }).click()
		await page.getByRole('button', { name: 'Не сохранять', exact: true }).click()
		await expect(page.getByRole('heading', { name: 'Нет открытых документов' })).toBeVisible()
	})
}

test('отмена Сохранить как оставляет локальные данные', async ({ page }) => {
	await createDirtyDocument(page)
	await page.getByTitle('Закрыть вкладку', { exact: true }).click()
	await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
	await expect(page.getByLabel('Имя файла', { exact: true })).toBeVisible()
	const saveDialog = page.locator('[class^="window_"]').filter({ has: page.getByLabel('Имя файла', { exact: true }) })
	await saveDialog.getByRole('button', { name: 'Отмена', exact: true }).click()
	await expect(saveDialog).toBeHidden()
	await expect(page.getByTestId('document-tab')).toHaveCount(1)
	await expect(page.getByText('Browser fixture', { exact: true })).toBeVisible()
	const hasProject = JSON.stringify(await readLocalSnapshot(page)).includes('Browser fixture')
	expect(hasProject).toBe(true)
})

test('после перезагрузки каждая вкладка восстанавливает свои последние правки', async ({ page }) => {
	await createDirtyDocument(page)
	await page.getByTestId('new-document-button').click()
	await page.getByRole('button', { name: 'Add Project', exact: true }).click()
	await page.getByLabel('Project Name', { exact: true }).fill('Second document')
	await page.getByRole('button', { name: 'Add', exact: true }).click()
	await expect(page.getByRole('heading', { name: 'Add Project', exact: true })).toBeHidden()
	await page.getByTestId('document-tab').first().click()
	await page.getByRole('button', { name: 'Add Project', exact: true }).click()
	await page.getByLabel('Project Name', { exact: true }).fill('Latest local edit')
	await page.getByRole('button', { name: 'Add', exact: true }).click()
	await expect(page.getByRole('heading', { name: 'Add Project', exact: true })).toBeHidden()
	await expect(page.getByTestId('local-save-pending')).toHaveCount(0)
	await page.reload()
	await expect(page.getByTestId('document-tab')).toHaveCount(2)
	await openProjects(page)
	await expect(page.getByText('Browser fixture', { exact: true })).toBeVisible()
	await expect(page.getByText('Latest local edit', { exact: true })).toBeVisible()
	await expect(page.getByText('Second document', { exact: true })).toBeHidden()
	await page.getByTestId('document-tab').last().click()
	await expect(page.getByText('Second document', { exact: true })).toBeVisible()
	await expect(page.getByText('Latest local edit', { exact: true })).toBeHidden()
})

for (const mode of ['blocked', 'pending'] as const) {
	test(`локальные документы доступны при ${mode} Google API`, async ({ page, context }) => {
		await createDirtyDocument(page)
		await context.route('https://apis.google.com/js/api.js', route =>
			mode === 'blocked'
				? route.abort('blockedbyclient')
				: route.fulfill({ contentType: 'application/javascript', body: 'window.gapi = { load: () => {} };' })
		)
		await expect(page.getByTestId('local-save-pending')).toHaveCount(0)
		await page.reload({ waitUntil: 'domcontentloaded' })
		await expect(page.getByTestId('document-tab')).toHaveCount(1, { timeout: 5000 })
		await openProjects(page)
		await expect(page.getByText('Browser fixture', { exact: true })).toBeVisible()
		await expect(page.getByRole('alert')).toHaveCount(0)
	})
}

test('при заполнении хранилища доступны экспорт последних правок и повтор записи', async ({ page }, testInfo) => {
	await createDirtyDocument(page)
	const before = await readLocalSnapshot(page)
	await page.evaluate(() => {
		const original = IDBObjectStore.prototype.put
		;(window as any).__restoreStorage = () => {
			IDBObjectStore.prototype.put = original
		}
		IDBObjectStore.prototype.put = function (value, key) {
			if (this.name === 'session') throw new DOMException('Quota', 'QuotaExceededError')
			return original.call(this, value, key)
		}
	})
	await page.getByRole('button', { name: 'Add Project', exact: true }).click()
	await page.getByLabel('Project Name', { exact: true }).fill('Latest unsaved edit')
	await page.getByRole('button', { name: 'Add', exact: true }).click()
	await expect(page.getByRole('alert')).toContainText('Превышена квота IndexedDB')
	await page.getByText('Подробности ошибки', { exact: true }).click()
	await expect(page.getByRole('alert')).toContainText('QuotaExceededError')
	await expect(page.getByRole('alert')).toContainText('Транзакция сессии и резервной копии IndexedDB')
	await expect(page.getByRole('alert')).toContainText('МиБ')
	expect(await readLocalSnapshot(page)).toEqual(before)
	const downloading = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Экспортировать открытую сессию', exact: true }).click()
	const download = await downloading
	expect(readFileSync((await download.path())!, 'utf8')).toContain('Latest unsaved edit')
	await page.screenshot({ path: testInfo.outputPath('storage-error.png'), fullPage: true })
	await page.evaluate(() => (window as any).__restoreStorage())
	await page.getByRole('button', { name: 'Повторить локальное сохранение', exact: true }).click()
	await expect(page.getByRole('alert')).toHaveCount(0)
	expect(JSON.stringify(await readLocalSnapshot(page))).toContain('Latest unsaved edit')
})
