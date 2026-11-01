import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { temporaryDirectory } from './test-utils/audit-fixtures.mjs'

function setup(t) {
	const root = temporaryDirectory(t)
	mkdirSync(join(root, 'scripts'))
	mkdirSync(join(root, 'artifacts/pages-build'), { recursive: true })
	copyFileSync(new URL('./package-pages.mjs', import.meta.url), join(root, 'scripts/package-pages.mjs'))
	writeFileSync(
		join(root, 'index.html'),
		'<!doctype html><link href="dist/main.css"><script src="dist/main.js"></script>'
	)
	for (const name of ['main.js', 'main.css', 'main.js.LICENSE.txt'])
		writeFileSync(join(root, 'artifacts/pages-build', name), 'synthetic asset')
	return {
		root,
		run: () =>
			spawnSync(process.execPath, [join(root, 'scripts/package-pages.mjs')], {
				cwd: root,
				encoding: 'utf8',
				windowsHide: true
			})
	}
}
test('Pages packaging copies the explicit app artifact and excludes audit reports', t => {
	const { root, run } = setup(t)
	mkdirSync(join(root, 'artifacts/audit'))
	writeFileSync(join(root, 'artifacts/audit/full.json'), '{"auditReportVersion":2}')
	assert.equal(run().status, 0)
	assert.ok(readFileSync(join(root, 'artifacts/pages/dist/main.js'), 'utf8'))
	assert.equal(existsSync(join(root, 'artifacts/pages/full.json')), false)
})
for (const relative of ['full.json', 'dist/audit.json', 'docs/audit.json']) {
	test('unexpected audit artifact blocks packaging: ' + relative, t => {
		const { root, run } = setup(t)
		const target = join(root, 'artifacts/pages', relative)
		mkdirSync(join(target, '..'), { recursive: true })
		writeFileSync(target, '{}')
		const result = run()
		assert.notEqual(result.status, 0)
		assert.match(result.stderr, /Unexpected Pages/)
	})
}
