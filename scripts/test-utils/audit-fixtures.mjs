import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

export const today = '2026-11-01'
export const emptyPolicy = { schemaVersion: 1, exceptions: [] }
export const advisory = (name = 'leaf', severity = 'high', id = 'GHSA-aaaa-bbbb-cccc') => ({
	name,
	severity,
	source: 1234,
	url: 'https://github.com/advisories/' + id
})
export const vulnerability = (
	name = 'leaf',
	severity = 'high',
	via = [advisory(name, severity)],
	nodes = ['node_modules/' + name]
) => ({ name, severity, via, nodes })
export function fixture(...entries) {
	const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: entries.length }
	const packages = {}
	for (const entry of entries) {
		counts[entry.severity]++
		for (const node of entry.nodes) packages[node] = { version: '1.0.0' }
	}
	return {
		report: {
			auditReportVersion: 2,
			vulnerabilities: Object.fromEntries(entries.map(entry => [entry.name, entry])),
			metadata: { vulnerabilities: counts }
		},
		lock: { lockfileVersion: 3, packages }
	}
}
export function exception(patch = {}) {
	return {
		scope: 'full',
		package: 'leaf',
		advisory: 'GHSA-aaaa-bbbb-cccc',
		path: 'node_modules/leaf',
		version: '1.0.0',
		severity: 'high',
		owner: 'Projector maintainer',
		reason: 'Synthetic test exception',
		expiresOn: '2026-11-14',
		...patch
	}
}
export function temporaryDirectory(t) {
	const directory = mkdtempSync(join(tmpdir(), 'projector-ci-test-'))
	t.after(() => {
		// Only remove the exact directory created by this test, under the named temp root.
		const absolute = resolve(directory)
		if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith('projector-ci-test-'))
			throw new Error('Unexpected test cleanup target')
		rmSync(absolute, { recursive: true, force: true })
	})
	return directory
}
