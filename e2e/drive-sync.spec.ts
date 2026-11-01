import { readLocalSnapshot } from './storage'
import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

test.use({ driveMode: true })
const data = (name: string) => ({
	completedList: [],
	plannedList: [],
	projectsList: [{ background: 'white', color: 'black', name }]
})

async function setup(page: Page, race = false) {
	const files = new Map([['source', { name: 'Demo.json', version: '1', content: data('Base') }]])
	let writes = 0,
		rejected = 0,
		creates = 0,
		injectRace = race
	let hold: Promise<void> | null = null
	const metadata = (id: string) => {
		if (id === 'root' || id === 'appDataFolder')
			return { id, name: 'Root', mimeType: 'application/vnd.google-apps.folder', version: '1', parents: [] }
		const file = files.get(id)!
		return {
			id,
			name: file.name,
			version: file.version,
			mimeType: 'application/json',
			parents: ['root'],
			webViewLink: 'https://drive.google.com/file/d/' + id + '/view'
		}
	}
	const v2 = (id: string) => {
		const file = metadata(id)
		return {
			...file,
			title: file.name,
			etag: '"etag-' + file.version + '"',
			parents: [{ id: 'root' }],
			alternateLink: file.webViewLink
		}
	}
	const remoteEdit = (name: string) => {
		const file = files.get('source')!
		file.version = (BigInt(file.version) + 1n).toString()
		file.content = data(name)
	}
	await page.route('**/__e2e__/drive/**', async route => {
		const endpoint = new URL(route.request().url()).pathname
		const args = route.request().postDataJSON()
		if (endpoint.endsWith('/get'))
			return route.fulfill({
				json: { result: args.alt === 'media' ? files.get(args.fileId)!.content : metadata(args.fileId) }
			})
		if (endpoint.endsWith('/list')) return route.fulfill({ json: { result: { files: [] } } })
		if (args.method === 'GET') {
			expect(args.path).toBe('/drive/v2/files/source')
			return route.fulfill({ json: { result: v2('source') } })
		}
		if (args.method === 'POST') {
			expect(args.path).toBe('/upload/drive/v3/files')
			const parts = args.body.split('\r\n\r\n')
			const description = JSON.parse(parts[1].split('\r\n--')[0])
			const content = JSON.parse(parts[2].split('\r\n--')[0])
			const id = 'save-as-' + ++creates
			files.set(id, { name: description.name, version: '1', content })
			return route.fulfill({ json: { result: metadata(id) } })
		}
		expect(args.method).toBe('PUT')
		expect(args.path).toBe('/upload/drive/v2/files/source')
		expect(args.params.newRevision).toBe(true)
		expect(args.headers['If-Match']).toMatch(/^"etag-\d+"$/)
		if (injectRace) {
			injectRace = false
			remoteEdit('Concurrent remote edit')
		}
		if (args.headers['If-Match'] !== v2('source').etag) {
			rejected++
			return route.fulfill({ status: 412, json: { result: { error: { code: 412, message: 'Precondition Failed' } } } })
		}
		const file = files.get('source')!
		file.content = JSON.parse(args.body)
		file.version = (BigInt(file.version) + 1n).toString()
		writes++
		const response = v2('source')
		if (hold) await hold
		return route.fulfill({ json: { result: response } })
	})
	await page.addInitScript(content => {
		localStorage.setItem(
			'documentTabs',
			JSON.stringify({
				schemaVersion: 2,
				activeDocumentId: 'linked',
				documentOrder: ['linked'],
				savedAt: Date.now(),
				documents: [
					{
						id: 'linked',
						ref: {
							fileId: 'source',
							name: 'Demo.json',
							mimeType: 'application/json',
							space: 'drive',
							parentFolderId: 'root',
							webViewLink: 'https://drive.google.com/file/d/source/view'
						},
						data: content,
						lastAccessedAt: Date.now(),
						sync: {
							localVersion: 1,
							baseLocalVersion: 1,
							localFingerprint: JSON.stringify(content),
							baseFingerprint: JSON.stringify(content),
							remoteFingerprint: null,
							baseRevisionId: 'drive-v3:source:1',
							remoteRevisionId: 'drive-v3:source:1',
							lastSyncAt: null,
							lastRemoteCheckAt: null,
							needsRemoteCheck: true,
							origin: 'drive'
						}
					}
				]
			})
		)
	}, data('Base'))
	await page.goto('/index.html')
	await expect(page.getByTestId('document-tab')).toHaveAttribute('data-sync-status', 'synced')
	await page.getByRole('button', { name: 'Меню', exact: true }).click()
	await page.getByText('Projects', { exact: true }).click()
	return {
		files,
		remoteEdit,
		get writes() {
			return writes
		},
		get rejected() {
			return rejected
		},
		get creates() {
			return creates
		},
		holdWrites(pending: Promise<void>) {
			hold = pending
		}
	}
}

async function edit(page: Page, name: string) {
	await page.getByRole('button', { name: 'Add Project', exact: true }).click()
	await page.getByLabel('Project Name', { exact: true }).fill(name)
	await page.getByRole('button', { name: 'Add', exact: true }).click()
	await expect(page.getByRole('heading', { name: 'Add Project', exact: true })).toBeHidden()
}

for (const mode of ['ordinary', 'conflict-before', 'race-at-put'] as const) {
	test('сохранение в тот же файл: ' + mode, async ({ page }, testInfo) => {
		const server = await setup(page, mode === 'race-at-put')
		await edit(page, 'Browser edit')
		if (mode === 'conflict-before') server.remoteEdit('Remote edit')
		await page.getByTitle('Сохранить', { exact: true }).click()
		if (mode !== 'ordinary') {
			await expect(page.getByRole('button', { name: /Сохранить локальную версию в этот файл/ })).toBeVisible()
			expect(server.writes).toBe(0)
			expect(server.files.get('source')!.content.projectsList[0].name).toContain(
				mode === 'race-at-put' ? 'Concurrent' : 'Remote'
			)
			expect(server.rejected).toBe(mode === 'race-at-put' ? 1 : 0)
			await page.getByRole('button', { name: /Сохранить локальную версию в этот файл/ }).click()
		}
		await expect(page.getByTestId('document-tab')).toHaveAttribute('data-sync-status', 'synced')
		await expect(page.getByTestId('document-title')).toHaveAttribute('data-sync-status', 'synced')
		await expect(page.getByTestId('document-title')).toHaveText('Demo.json')
		expect(server.writes).toBe(1)
		expect(server.files.size).toBe(1)
		expect(server.creates).toBe(0)
		expect(server.files.get('source')!.content.projectsList.some(project => project.name === 'Browser edit')).toBe(true)
		const stored = (await readLocalSnapshot(page)).documents[0]
		expect(stored.ref.fileId).toBe('source')
		expect(stored.ref.webViewLink).toBe('https://drive.google.com/file/d/source/view')
		await edit(page, 'Repeated save')
		await page.getByTitle('Сохранить', { exact: true }).click()
		await expect(page.getByTestId('document-tab')).toHaveAttribute('data-sync-status', 'synced')
		expect(server.writes).toBe(2)
		expect(server.files.size).toBe(1)
		await page.screenshot({ path: testInfo.outputPath('in-place-save.png'), fullPage: true })
	})
}

test('правки во время записи остаются dirty и не закрывают вкладку', async ({ page }) => {
	const server = await setup(page)
	await edit(page, 'Sent snapshot')
	let release: () => void = () => {}
	server.holdWrites(
		new Promise<void>(resolve => {
			release = resolve
		})
	)
	await page.getByTitle('Закрыть вкладку', { exact: true }).click()
	await page
		.getByRole('button', { name: 'Сохранить', exact: true })
		.filter({ hasText: /^Сохранить$/ })
		.click()
	await expect.poll(() => server.writes).toBe(1)
	await edit(page, 'New local edit')
	const alert = page.waitForEvent('dialog').then(async dialog => {
		expect(dialog.message()).toContain('новые изменения')
		await dialog.accept()
	})
	release()
	await alert
	await expect(page.getByTestId('document-tab')).toHaveCount(1)
	await expect(page.getByTestId('document-tab')).toHaveAttribute('data-sync-status', 'dirty')
	expect(server.files.get('source')!.content.projectsList.some(project => project.name === 'New local edit')).toBe(
		false
	)
	expect(JSON.stringify((await readLocalSnapshot(page)).documents[0].data)).toContain('New local edit')
})

test('Сохранить как создаёт отдельный файл, исходный остаётся целым', async ({ page }) => {
	const server = await setup(page)
	await edit(page, 'Save as edit')
	await page.getByTitle('Сохранить как...', { exact: true }).click()
	await page.getByLabel('Имя файла', { exact: true }).fill('Another.json')
	await page
		.getByRole('button', { name: 'Сохранить', exact: true })
		.filter({ hasText: /^Сохранить$/ })
		.click()
	await expect(page.getByLabel('Имя файла', { exact: true })).toBeHidden()
	await expect(page.getByTestId('document-tab')).toHaveAttribute('data-sync-status', 'synced')
	expect(server.creates).toBe(1)
	expect(server.writes).toBe(0)
	expect(server.files.size).toBe(2)
	expect(server.files.get('source')!.content).toEqual(data('Base'))
	expect((await readLocalSnapshot(page)).documents[0].ref.fileId).toBe('save-as-1')
})
