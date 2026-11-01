import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { readLocalSnapshot, readRecoveryArchives } from './storage'

function originalSession() {
	return JSON.stringify({
		schemaVersion: 2,
		activeDocumentId: 'projects',
		documentOrder: ['projects'],
		savedAt: 1,
		documents: [
			{
				id: 'projects',
				ref: {
					fileId: null,
					name: 'Projects fixture',
					mimeType: 'application/json',
					space: null,
					parentFolderId: null
				},
				data: {
					projectsList: [
						{ name: 'A', color: 'red', background: 'blue' },
						{ name: 'B', color: 'green', background: 'white' }
					],
					completedList: [],
					plannedList: [{ name: 'Project event', project: 'B', start: '2026.11.01' }]
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
				},
				lastAccessedAt: 1
			}
		]
	})
}

async function seed(page: Page, original: string) {
	await page.clock.setFixedTime(new Date('2026-11-01T09:00:00Z'))
	await page.route('**/__e2e__/projects-setup', route =>
		route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Projects setup</title>' })
	)
	await page.goto('/__e2e__/projects-setup')
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
}

async function view(page: Page, name: 'Projects' | 'Calendar') {
	await page.getByRole('button', { name: 'Меню', exact: true }).click()
	await page.getByText(name, { exact: true }).click()
}

test('ID проекта переживает переименование и reload; удаление соседнего проекта сохраняет стиль', async ({
	page
}, testInfo) => {
	const original = originalSession()
	await seed(page, original)
	await page.goto('/index.html')
	await expect(page.getByTestId('document-tab')).toHaveCount(1)
	const before = await readLocalSnapshot(page)
	const id = before.documents[0].data.projectsList.find((p: any) => p.name === 'B').id
	expect(before.schemaVersion).toBe(3)
	expect(JSON.parse((await readRecoveryArchives(page))[0]).indexedDB.current).toBe(original)
	await view(page, 'Projects')
	await expect(page.getByTitle('Delete B', { exact: true })).toBeDisabled()
	await page.getByTitle('Edit B', { exact: true }).click()
	await page.getByLabel('Project Name', { exact: true }).fill('Renamed')
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(page.getByRole('heading', { name: 'Edit Project', exact: true })).toBeHidden()
	await page.getByTitle('Delete A', { exact: true }).click()
	await page.getByRole('button', { name: 'Yes', exact: true }).click()
	await expect(page.getByText('A', { exact: true })).toBeHidden()
	await view(page, 'Calendar')
	const event = page.locator('[draggable="true"]').filter({ hasText: 'Project event' })
	await expect(event).toHaveCSS('color', 'rgb(0, 128, 0)')
	await expect(event).toHaveCSS('background-color', 'rgb(255, 255, 255)')
	await event.click()
	await expect(page.getByRole('combobox')).toHaveValue(id)
	await expect(page.getByRole('combobox').locator('option:checked')).toHaveText('Renamed')
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(page.getByRole('combobox')).toBeHidden()
	await expect(page.getByTestId('local-save-pending')).toHaveCount(0)
	await page.reload()
	await expect(event).toHaveCSS('color', 'rgb(0, 128, 0)')
	const after = await readLocalSnapshot(page)
	expect(after.documents[0].data.projectsList[0]).toMatchObject({ id, name: 'Renamed' })
	expect(after.documents[0].data.plannedList[0].projectId).toBe(id)
	await event.click()
	await page.getByRole('button', { name: 'Delete', exact: true }).click()
	await page.getByRole('button', { name: 'Yes', exact: true }).click()
	await expect(event).toHaveCount(0)
	await view(page, 'Projects')
	const card = page.getByText('Renamed', { exact: true }).locator('..')
	await expect(card).toContainText('0 events')
	await expect(page.getByTitle('Delete Renamed', { exact: true })).toBeEnabled()
	await page.screenshot({ path: testInfo.outputPath('projects.png'), fullPage: true })
	await page.getByTitle('Delete Renamed', { exact: true }).click()
	await page.getByRole('button', { name: 'Yes', exact: true }).click()
	expect((await readLocalSnapshot(page)).documents[0].data.projectsList).toEqual([])
})

test('отказ миграции IndexedDB v2 → v3 сохраняет исходник; повтор архивирует его один раз', async ({
	page,
	context
}) => {
	const original = originalSession()
	await seed(page, original)
	await context.addInitScript(() => {
		if (sessionStorage.getItem('allowProjectMigration')) return
		const put = IDBObjectStore.prototype.put
		;(window as any).__allowProjectMigration = () => {
			IDBObjectStore.prototype.put = put
			sessionStorage.setItem('allowProjectMigration', 'true')
		}
		IDBObjectStore.prototype.put = function (value, key) {
			if (this.name === 'session') throw new DOMException('Quota', 'QuotaExceededError')
			return put.call(this, value, key)
		}
	})
	await page.goto('/index.html')
	await expect(page.getByRole('alert')).toContainText('Превышена квота IndexedDB')
	expect(await readLocalSnapshot(page)).toEqual(JSON.parse(original))
	expect(await readRecoveryArchives(page)).toEqual([])
	await page.evaluate(() => (window as any).__allowProjectMigration())
	await page.getByRole('button', { name: 'Повторить локальное сохранение', exact: true }).click()
	await expect(page.getByRole('alert')).toHaveCount(0)
	const data = (await readLocalSnapshot(page)).documents[0].data
	expect(data.plannedList[0].projectId).toBe(data.projectsList[1].id)
	const archives = await readRecoveryArchives(page)
	expect(archives).toHaveLength(1)
	expect(JSON.parse(archives[0]).indexedDB.current).toBe(original)
	await page.reload()
	await expect(page.getByTestId('document-tab')).toHaveCount(1)
	expect((await readLocalSnapshot(page)).documents[0].data).toEqual(data)
	expect(await readRecoveryArchives(page)).toEqual(archives)
})
