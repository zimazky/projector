import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { readLocalSnapshot } from './storage'

async function restore(page: Page, data: Array<{ completedList: object[]; plannedList: object[] }>) {
	await page.clock.setFixedTime(new Date('2026-11-01T12:34:56Z'))
	await page.addInitScript(data => {
		localStorage.setItem(
			'documentTabs',
			JSON.stringify({
				schemaVersion: 2,
				activeDocumentId: 'balance-0',
				documentOrder: data.map((_, i) => 'balance-' + i),
				savedAt: 1,
				documents: data.map((events, i) => ({
					id: 'balance-' + i,
					ref: { fileId: null, name: 'Balance ' + i, mimeType: 'application/json', space: null, parentFolderId: null },
					data: { projectsList: [], ...events },
					sync: {
						localVersion: 1,
						baseLocalVersion: null,
						localFingerprint: null,
						baseFingerprint: null,
						remoteFingerprint: null,
						baseRevisionId: null,
						remoteRevisionId: null,
						lastSyncAt: null,
						lastRemoteCheckAt: null,
						needsRemoteCheck: false,
						origin: 'new-local'
					},
					lastAccessedAt: 1
				}))
			})
		)
	}, data)
	await page.goto('/index.html')
	await expect(page.getByTestId('document-tab')).toHaveCount(data.length)
}

const calendarDay = (page: Page, date: string) => page.locator(`[data-testid="calendar-day"][data-date="${date}"]`)
const balance = (page: Page, date: string) => calendarDay(page, date).locator('[title^="planned:"]')

test('прогноз по повторяемым событиям без фактической истории обновляется после правки и reload', async ({
	page
}, testInfo) => {
	await restore(page, [
		{
			completedList: [],
			plannedList: [{ name: 'Daily income', start: '2026.10.29', end: '2026.11.03', repeat: '/1', credit: 10 }]
		}
	])
	await expect(balance(page, '2026.11.01')).toHaveAttribute('title', 'planned: 30.00+10.00\nactual: 0.00')
	await expect(balance(page, '2026.11.03')).toHaveAttribute('title', 'planned: 50.000.00\nactual: 0.00')
	await calendarDay(page, '2026.11.01').getByTitle('Daily income\ncredit: 10', { exact: true }).click()
	await page.getByLabel('Credit', { exact: true }).fill('20')
	await page.getByRole('button', { name: 'Save All', exact: true }).click()
	await expect(page.getByLabel('Credit', { exact: true })).toBeHidden()
	await expect(balance(page, '2026.11.01')).toHaveAttribute('title', 'planned: 60.00+20.00\nactual: 0.00')
	await expect(balance(page, '2026.11.03')).toHaveAttribute('title', 'planned: 100.000.00\nactual: 0.00')
	await readLocalSnapshot(page)
	await page.reload()
	await expect(balance(page, '2026.11.01')).toHaveAttribute('title', 'planned: 60.00+20.00\nactual: 0.00')
	await page.screenshot({ path: testInfo.outputPath('balance.png'), fullPage: true })
})

test('баланс на начало дня учитывает несортированную историю и не переходит между вкладками', async ({ page }) => {
	await restore(page, [
		{
			completedList: [
				{ name: 'Later', start: '2026.11.02', time: '23:59', credit: 20 },
				{ name: 'Earlier', start: '2026.11.01', time: '0:00', credit: 100 }
			],
			plannedList: [{ name: 'Future', start: '2026.11.03', debit: 5 }]
		},
		{ completedList: [{ name: 'Other document', start: '2026.11.01', credit: 900 }], plannedList: [] }
	])
	await expect(balance(page, '2026.11.01')).toHaveAttribute('title', 'planned: 0.00+100.00\nactual: 0.00')
	await expect(balance(page, '2026.11.02')).toHaveAttribute('title', 'planned: 100.00+20.00\nactual: 100.00')
	await expect(balance(page, '2026.11.03')).toHaveAttribute('title', 'planned: 120.00-5.00\nactual: 120.00')
	await expect(balance(page, '2026.11.04')).toHaveAttribute('title', 'planned: 115.000.00\nactual: 120.00')
	await page.getByTestId('document-tab').last().click()
	await expect(balance(page, '2026.11.02')).toHaveAttribute('title', 'planned: 900.000.00\nactual: 900.00')
	await page.getByTestId('document-tab').first().click()
	await expect(balance(page, '2026.11.02')).toHaveAttribute('title', 'planned: 100.00+20.00\nactual: 100.00')
})
