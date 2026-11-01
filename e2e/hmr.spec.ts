import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { test, expect } from './fixtures'

test('TSX и CSS обновляются в Chromium', async ({ page }, testInfo) => {
	const { sandbox } = JSON.parse(readFileSync('artifacts/playwright/server.json', 'utf8')) as { sandbox: string }
	const child = relative(resolve('.remediation-tmp'), sandbox)
	if (!child.startsWith('playwright-') || child.includes('..')) throw new Error('Unexpected sandbox')
	const sourcePath = join(sandbox, 'src/7-shared/ui/EmptyState/EmptyState.tsx')
	const cssPath = join(sandbox, 'src/7-shared/ui/EmptyState/EmptyState.module.css')
	const source = readFileSync(sourcePath, 'utf8')
	const css = readFileSync(cssPath, 'utf8')
	await page.goto('/index.html')
	const heading = page.getByRole('heading', { name: 'Нет открытых документов', exact: true })
	await expect(heading).toBeVisible()
	const originalColor = await heading.evaluate(element => getComputedStyle(element).color)
	await page.evaluate(() => {
		;(window as Window & { hmrProbe?: string }).hmrProbe = 'same-page'
	})
	try {
		writeFileSync(cssPath, css + '\n.emptyStateTitle { color: rgb(17, 34, 51) !important; }\n')
		await expect(heading).toHaveCSS('color', 'rgb(17, 34, 51)')
		expect(await page.evaluate(() => (window as Window & { hmrProbe?: string }).hmrProbe)).toBe('same-page')
		await page.screenshot({ path: testInfo.outputPath('css-hmr.png'), fullPage: true })
	} finally {
		writeFileSync(cssPath, css)
		await expect(heading).toHaveCSS('color', originalColor)
	}
	try {
		writeFileSync(sourcePath, source.replace('</h2>', ' PLAYWRIGHT-HMR</h2>'))
		await expect(
			page.getByRole('heading', { name: 'Нет открытых документов PLAYWRIGHT-HMR', exact: true })
		).toBeVisible()
	} finally {
		writeFileSync(sourcePath, source)
		await expect(heading).toBeVisible()
	}
	expect(readFileSync(sourcePath, 'utf8')).toBe(source)
	expect(readFileSync(cssPath, 'utf8')).toBe(css)
})
