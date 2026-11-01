import { test, expect } from './fixtures'
import { readLocalSnapshot } from './storage'
import type { Page } from '@playwright/test'

const day = (page: Page, date: string) => page.locator(`[data-testid="calendar-day"][data-date="${date}"]`)
const balance = (page: Page, date: string) => day(page, date).locator('[title^="planned:"]')

async function seed(page: Page, events: object[]) {
	await page.clock.setFixedTime(new Date('2026-11-01T09:00:00Z'))
	await page.addInitScript(events => {
		localStorage.setItem(
			'documentTabs',
			JSON.stringify({
				schemaVersion: 2,
				activeDocumentId: 'reactivity',
				documentOrder: ['reactivity'],
				savedAt: 1,
				documents: [
					{
						id: 'reactivity',
						lastAccessedAt: 1,
						ref: { fileId: null, name: 'Reactivity', mimeType: 'application/json', space: null, parentFolderId: null },
						data: {
							projectsList: [{ name: 'Project', color: 'red', background: 'white' }],
							completedList: [],
							plannedList: events
						},
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
						}
					}
				]
			})
		)
	}, events)
	await page.goto('/index.html')
	await expect(page.getByTestId('document-tab')).toHaveCount(1)
}

test('drag-and-drop перемещает и копирует событие, сразу обновляя дни и баланс', async ({ page }) => {
	await seed(page, [{ name: 'Move me', start: '2026.11.01', credit: 1000, project: 'Project' }])
	const transfer = await page.evaluateHandle(() => new DataTransfer())
	await day(page, '2026.11.01')
		.getByRole('button', { name: 'Move me' })
		.dispatchEvent('dragstart', { dataTransfer: transfer })
	await day(page, '2026.11.02').dispatchEvent('drop', { dataTransfer: transfer })
	await expect(day(page, '2026.11.01').getByRole('button', { name: 'Move me' })).toHaveCount(0)
	await expect(day(page, '2026.11.02').getByRole('button', { name: 'Move me' })).toHaveCount(1)
	await expect(balance(page, '2026.11.01')).toHaveAttribute('title', 'planned: 0.000.00\nactual: 0.00')
	await expect(balance(page, '2026.11.02')).toHaveAttribute('title', 'planned: 0.00+1000.00\nactual: 0.00')
	await day(page, '2026.11.02')
		.getByRole('button', { name: 'Move me' })
		.dispatchEvent('dragstart', { dataTransfer: transfer })
	await day(page, '2026.11.03').dispatchEvent('drop', { dataTransfer: transfer, ctrlKey: true })
	await expect(day(page, '2026.11.02').getByRole('button', { name: 'Move me' })).toHaveCount(1)
	await expect(day(page, '2026.11.03').getByRole('button', { name: 'Move me' })).toHaveCount(1)
	await expect(balance(page, '2026.11.03')).toHaveAttribute('title', 'planned: 1000.00+1000.00\nactual: 0.00')
	expect((await readLocalSnapshot(page)).documents[0].data.plannedList.map((event: any) => event.start)).toEqual([
		'2026.11.02',
		'2026.11.03'
	])
	await transfer.dispose()
})

test('поиск и часы повторно прокручивают ту же неделю; Escape убирает подсветку', async ({ page }) => {
	await seed(page, [
		{ name: 'Match A', start: '2026.10.30' },
		{ name: 'Match B', start: '2026.10.31' }
	])
	const input = page.getByPlaceholder('Поиск событий...')
	const highlighted = page.locator('[class*="highlighted_"]')
	const week = day(page, '2026.10.30').locator('..')
	const viewport = week.locator('..')
	const offset = () =>
		week.evaluate(element =>
			Math.round(element.getBoundingClientRect().top - element.parentElement!.getBoundingClientRect().top)
		)
	await input.fill('match')
	await input.press('Enter')
	// Поиск начинает с ближайшего к сегодня совпадения.
	await expect(highlighted).toContainText('Match B')
	await expect.poll(offset).toBe(0)
	await viewport.evaluate(element => {
		element.scrollTop += 50
	})
	await expect.poll(offset).toBeLessThan(-20)
	await input.press('Shift+Enter')
	await expect(highlighted).toContainText('Match A')
	await expect.poll(offset).toBe(0)
	await viewport.evaluate(element => {
		element.scrollTop += 50
	})
	await expect.poll(offset).toBeLessThan(-20)
	await page.getByTitle('Перейти к текущей неделе', { exact: true }).click()
	await expect.poll(offset).toBe(0)
	await input.press('Escape')
	await expect(highlighted).toHaveCount(0)
})

test('завершение и удаление повторяемых вхождений обновляет календарь и счётчик проекта', async ({ page }) => {
	await seed(page, [
		{ name: 'Daily', start: '2026.11.01', end: '2026.11.04', repeat: '/1', credit: 1000, project: 'Project' }
	])
	await day(page, '2026.11.01').getByRole('button', { name: 'Daily' }).click()
	await page.getByRole('button', { name: 'Complete', exact: true }).click()
	await expect(day(page, '2026.11.01').locator('[class*="completed_"]')).toContainText('Daily')
	await expect(balance(page, '2026.11.02')).toHaveAttribute('title', 'planned: 1000.00+1000.00\nactual: 1000.00')
	await day(page, '2026.11.02').getByRole('button', { name: 'Daily' }).click()
	await page.getByRole('button', { name: 'Delete', exact: true }).click()
	await page.getByRole('button', { name: 'Yes', exact: true }).click()
	await expect(day(page, '2026.11.02').getByRole('button', { name: 'Daily' })).toHaveCount(0)
	await expect(day(page, '2026.11.03').getByRole('button', { name: 'Daily' })).toHaveCount(1)
	await day(page, '2026.11.03').getByRole('button', { name: 'Daily' }).click()
	await page.getByRole('button', { name: 'Delete All', exact: true }).click()
	await page.getByRole('button', { name: 'Yes', exact: true }).click()
	await expect(day(page, '2026.11.03').getByRole('button', { name: 'Daily' })).toHaveCount(0)
	await page.getByRole('button', { name: 'Меню', exact: true }).click()
	await page.getByText('Projects', { exact: true }).click()
	await expect(page.getByText('Project', { exact: true }).locator('..')).toContainText('1 event')
	const data = (await readLocalSnapshot(page)).documents[0].data
	expect(data.completedList).toHaveLength(1)
	expect(data.plannedList).toHaveLength(0)
})
