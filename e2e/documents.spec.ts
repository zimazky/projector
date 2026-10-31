import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

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
	const hasProject = await page.evaluate(() =>
		Object.keys(localStorage)
			.filter(key => key.startsWith('document_'))
			.some(key => localStorage.getItem(key)?.includes('Browser fixture'))
	)
	expect(hasProject).toBe(true)
})
