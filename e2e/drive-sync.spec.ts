import { test, expect } from './fixtures'

test.use({ driveMode: true })

for (const conflict of [false, true]) {
	test(
		conflict
			? 'конфликт Drive сохраняет локальную версию отдельным файлом'
			: 'обычное сохранение создаёт отдельную версию Drive',
		async ({ page }, testInfo) => {
			const original = {
				completedList: [],
				plannedList: [],
				projectsList: [{ background: 'white', color: 'black', name: 'Base' }]
			}
			let version = '1'
			let writes = 0
			const requests: { method: string; path: string; body: string }[] = []
			await page.route('**/__e2e__/drive/**', async route => {
				const endpoint = new URL(route.request().url()).pathname
				const args = route.request().postDataJSON()
				if (endpoint.endsWith('/get')) {
					return route.fulfill({
						json: {
							result:
								args.alt === 'media'
									? original
									: {
											id: args.fileId,
											name: args.fileId === 'source' ? 'Demo.json' : 'Demo (версия browser).json',
											version: args.fileId === 'source' ? version : '1',
											mimeType: 'application/json',
											parents: ['root'],
											modifiedTime: '2026-10-31T10:00:00Z'
										}
						}
					})
				}
				if (endpoint.endsWith('/list')) return route.fulfill({ json: { result: { files: [] } } })
				requests.push(args)
				writes++
				expect(args.method).toBe('POST')
				expect(args.path).toBe('/upload/drive/v3/files')
				expect(args.body).toContain('Browser edit')
				expect(args.body).toContain('projectorSourceVersion')
				return route.fulfill({
					json: {
						result: {
							id: 'copy',
							name: 'Demo (версия browser).json',
							mimeType: 'application/json',
							version: '1',
							parents: ['root']
						}
					}
				})
			})
			await page.addInitScript(
				({ content }) => {
					const state = {
						isDirty: false,
						isLoading: false,
						isSaving: false,
						lastLoadedAt: null,
						lastSavedAt: null,
						error: null,
						syncStatus: 'synced',
						lastSyncedAt: null,
						hasUnsyncedChanges: false
					}
					localStorage.setItem(
						'documentTabs',
						JSON.stringify({
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
										parentFolderId: 'root'
									},
									state,
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
					localStorage.setItem('document_linked', JSON.stringify({ data: content, savedAt: Date.now() }))
				},
				{ content: original }
			)
			await page.goto('/index.html')
			await expect(page.getByTestId('document-tab')).toHaveAttribute('data-sync-status', 'synced')
			await expect(page.getByTestId('document-title')).toHaveAttribute('data-sync-status', 'synced')
			await page.locator('button[title=""]').click()
			await page.getByText('Projects', { exact: true }).click()
			await page.getByRole('button', { name: 'Add Project', exact: true }).click()
			await page.getByLabel('Project Name', { exact: true }).fill('Browser edit')
			await page.getByRole('button', { name: 'Add', exact: true }).click()
			await expect(page.getByRole('heading', { name: 'Add Project', exact: true })).toBeHidden()
			await expect(page.getByTestId('document-tab')).toHaveAttribute('data-sync-status', 'dirty')
			await expect(page.getByTestId('document-title')).toHaveAttribute('data-sync-status', 'dirty')
			if (conflict) version = '2'
			await page.getByTitle('Сохранить новую версию', { exact: true }).click()
			if (conflict) {
				await expect(page.getByTestId('document-tab')).toHaveAttribute('data-sync-status', 'conflict')
				expect(writes).toBe(0)
				await page.getByRole('button', { name: /Сохранить локальную версию отдельным файлом/ }).click()
			}
			await expect(page.getByTestId('document-tab')).toHaveAttribute('data-sync-status', 'synced')
			await expect(page.getByTestId('document-title')).toHaveAttribute('data-sync-status', 'synced')
			await expect(page.getByTestId('document-title')).toContainText('версия browser')
			expect(writes).toBe(1)
			expect(requests.every(request => request.method === 'POST')).toBe(true)
			expect(original.projectsList[0].name).toBe('Base')
			const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('documentTabs')!))
			expect(stored.documents[0].ref.fileId).toBe('copy')
			await page.screenshot({ path: testInfo.outputPath('drive-version.png'), fullPage: true })
		}
	)
}
