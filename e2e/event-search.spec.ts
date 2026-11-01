import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

const name = (i: number) => `Match ${String(i).padStart(2, '0')}`

test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: new Date('2026-11-01T09:00:00Z') })
	await page.clock.pauseAt(new Date('2026-11-01T09:00:01Z'))
})

async function openSearchFixture(page: Page, day: string) {
	const row = (i: number) => ({ name: name(i), start: day, project: '' })
	const documents = ['a', 'b'].map(id => ({
		id,
		ref: { fileId: null, name: id, mimeType: 'application/json', space: null, parentFolderId: null },
		data:
			id === 'a'
				? {
						projectsList: [],
						completedList: Array.from({ length: 3 }, (_, i) => row(i)),
						plannedList: [
							...Array.from({ length: 5 }, (_, i) => row(i + 3)),
							...Array.from({ length: 5 }, (_, i) => ({
								...row(i + 8),
								repeat: '* * *',
								end: day === '2026.11.01' ? '2026.11.02' : '2026.10.31'
							}))
						]
					}
				: { projectsList: [], completedList: [], plannedList: [row(99)] },
		sync: {
			localVersion: 0,
			baseLocalVersion: 0,
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
		lastAccessedAt: Date.parse('2026-11-01T09:00:00Z')
	}))
	const snapshot = {
		schemaVersion: 2,
		activeDocumentId: 'a',
		documentOrder: ['a', 'b'],
		documents,
		savedAt: Date.parse('2026-11-01T09:00:00Z')
	}
	await page.addInitScript(snapshot => localStorage.setItem('documentTabs', JSON.stringify(snapshot)), snapshot)
	await page.goto('/index.html')
	await expect(page.getByTestId('document-tab')).toHaveCount(2)
}

for (const day of ['2026.10.30', '2026.11.01']) {
	test(`все 13 совпадений одного дня доступны в обе стороны: ${day}`, async ({ page }, testInfo) => {
		await openSearchFixture(page, day)
		const input = page.getByPlaceholder('Поиск событий...')
		const highlighted = page.locator('[class*="highlighted_"]')
		await input.fill('match')
		await input.press('Enter')
		for (let i = 0; i < 13; i++) await page.getByTitle('Предыдущее (Shift+Enter)', { exact: true }).click()
		for (let i = 0; i < 13; i++) {
			await expect(highlighted).toHaveCount(1)
			await expect(highlighted).toContainText(name(i))
			if (i < 12) await input.press('Enter')
		}
		await expect(page.locator('header')).toContainText('13 / 13')
		for (let i = 12; i >= 0; i--) {
			await expect(highlighted).toContainText(name(i))
			if (i > 0) await input.press('Shift+Enter')
		}
		await expect(page.locator('header')).toContainText('1 / 13')
		await page.screenshot({ path: testInfo.outputPath('search.png'), fullPage: true })
	})
}

test('смена вкладки отменяет результаты, подсветку и отложенный поиск', async ({ page }) => {
	await openSearchFixture(page, '2026.11.01')
	const input = page.getByPlaceholder('Поиск событий...')
	const next = page.getByTitle('Следующее (Enter)', { exact: true })
	const highlighted = page.locator('[class*="highlighted_"]')
	await input.fill('match')
	await page.clock.runFor(350)
	await expect(highlighted).toContainText(name(0))
	await page.getByTestId('document-tab').last().click()
	await expect(input).toHaveValue('')
	await expect(next).toBeDisabled()
	await expect(highlighted).toHaveCount(0)
	await input.fill('match')
	await page.getByTestId('document-tab').first().click()
	await page.clock.runFor(350)
	await expect(input).toHaveValue('')
	await expect(next).toBeDisabled()
	await expect(highlighted).toHaveCount(0)
	await input.fill('match')
	await input.press('Escape')
	await page.clock.runFor(350)
	await expect(input).toHaveValue('')
	await expect(next).toBeDisabled()
})
