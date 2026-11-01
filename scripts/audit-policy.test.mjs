import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateAudit, inspectAudit, validatePolicy } from './audit-policy.mjs'
import { advisory, emptyPolicy, exception, fixture, today, vulnerability } from './test-utils/audit-fixtures.mjs'

const evaluate = (data, exceptions = [], scope = 'full') =>
	evaluateAudit(inspectAudit(data.report, data.lock, scope), validatePolicy({ schemaVersion: 1, exceptions }, today))

test('empty audit and empty exception list pass', () => {
	assert.deepEqual(validatePolicy(emptyPolicy, today), [])
	assert.equal(evaluate(fixture()).status, 'passed')
})
for (const severity of ['info', 'low', 'moderate', 'high', 'critical']) {
	test(severity + ' findings remain visible; only high/critical block', () => {
		const result = evaluate(fixture(vulnerability('leaf', severity)))
		assert.equal(result.counts[severity], 1)
		assert.equal(result.findings.length, 1)
		assert.equal(result.status, ['high', 'critical'].includes(severity) ? 'blocked' : 'passed')
	})
}

test('exact exception permits only the reviewed finding', () => {
	const result = evaluate(fixture(vulnerability()), [exception()])
	assert.equal(result.status, 'passed')
	assert.equal(result.accepted.length, 1)
	assert.equal(result.accepted[0].exception.owner, 'Projector maintainer')
})
for (const patch of [
	{ advisory: 'GHSA-dddd-eeee-ffff' },
	{ version: '2.0.0' },
	{ package: 'other', path: 'node_modules/other' },
	{ path: 'node_modules/parent/node_modules/leaf' },
	{ scope: 'production' },
	{ severity: 'critical' }
]) {
	test('different exception tuple cannot allow a finding: ' + JSON.stringify(patch), () => {
		assert.equal(evaluate(fixture(vulnerability()), [exception(patch)]).status, 'blocked')
	})
}
test('an advisory replaced by another is blocked even with unchanged counters', () => {
	const old = fixture(vulnerability())
	const replacement = fixture(vulnerability('leaf', 'high', [advisory('leaf', 'high', 'GHSA-dddd-eeee-ffff')]))
	assert.deepEqual(old.report.metadata, replacement.report.metadata)
	assert.equal(evaluate(old, [exception()]).status, 'passed')
	assert.equal(evaluate(replacement, [exception()]).status, 'blocked')
})
test('a newly introduced installed path is not covered by an existing exception', () => {
	const data = fixture(
		vulnerability('leaf', 'high', [advisory()], ['node_modules/leaf', 'node_modules/parent/node_modules/leaf'])
	)
	assert.deepEqual(
		evaluate(data, [exception()]).blocked.map(row => row.path),
		['node_modules/parent/node_modules/leaf']
	)
})
test('parent meta-vulnerability resolves to the original advisory and needs its own exception', () => {
	const result = evaluate(fixture(vulnerability(), vulnerability('parent', 'high', ['leaf'])), [exception()])
	assert.equal(result.status, 'blocked')
	assert.equal(result.blocked[0].package, 'parent')
	assert.equal(result.blocked[0].advisory, 'GHSA-aaaa-bbbb-cccc')
})
test('dependency cycles with a real advisory resolve without recursion; empty cycles fail', () => {
	assert.equal(
		evaluate(fixture(vulnerability('leaf', 'high', [advisory(), 'parent']), vulnerability('parent', 'high', ['leaf'])))
			.blocked.length,
		2
	)
	assert.throws(
		() => evaluate(fixture(vulnerability('leaf', 'high', ['parent']), vulnerability('parent', 'high', ['leaf']))),
		/No advisory/
	)
})
test('source severity cannot be hidden by a lower package-level severity', () => {
	assert.equal(
		evaluate(fixture(vulnerability('leaf', 'low', [advisory('leaf', 'critical')]))).blocked[0].severity,
		'critical'
	)
})
test('repeated advisory identities cannot lower an already reported severity', () => {
	const result = evaluate(
		fixture(vulnerability('leaf', 'low', [advisory('leaf', 'critical'), advisory('leaf', 'low')]))
	)
	assert.equal(result.blocked[0].severity, 'critical')
})
test('non-GHSA sources retain their stable npm advisory identity', () => {
	const source = { ...advisory(), url: 'https://www.npmjs.com/advisories/1234' }
	assert.equal(evaluate(fixture(vulnerability('leaf', 'high', [source]))).blocked[0].advisory, 'npm:1234')
})
for (const patch of [
	{ owner: '' },
	{ reason: '' },
	{ expiresOn: today },
	{ expiresOn: '2026-02-30' },
	{ expiresOn: '2026-10-31' },
	{ version: '*' },
	{ version: '^1.0.0' },
	{ path: 'node_modules/*' },
	{ path: '../node_modules/leaf' },
	{ path: 'node_modules/x/../leaf' },
	{ advisory: '*' },
	{ scope: '*' },
	{ severity: 'moderate' }
]) {
	test('invalid or expired exception fails: ' + JSON.stringify(patch), () => {
		assert.throws(() => validatePolicy({ schemaVersion: 1, exceptions: [exception(patch)] }, today))
	})
}
test('invalid schemas and duplicate exceptions fail before evaluating reports', () => {
	for (const value of [null, {}, { schemaVersion: 2, exceptions: [] }])
		assert.throws(() => validatePolicy(value, today))
	assert.throws(() => validatePolicy({ schemaVersion: 1, exceptions: [exception(), exception()] }, today), /Duplicate/)
})
for (const corrupt of [
	data => {
		data.report.auditReportVersion = 3
	},
	data => {
		data.report.error = { code: 'ENOTFOUND' }
	},
	data => {
		delete data.report.metadata
	},
	data => {
		data.report.metadata.vulnerabilities.high = 0
	},
	data => {
		data.report.vulnerabilities.leaf.severity = 'unknown'
	},
	data => {
		data.report.vulnerabilities.leaf.via = ['missing']
	},
	data => {
		data.report.vulnerabilities.leaf.via = []
	},
	data => {
		data.report.vulnerabilities.leaf.nodes = []
	},
	data => {
		data.report.vulnerabilities.leaf.via[0].source = null
	},
	data => {
		data.report.vulnerabilities.leaf.via[0].url = 'not-a-url'
	},
	data => {
		delete data.lock.packages['node_modules/leaf']
	}
]) {
	test('malformed report or missing installed version fails: ' + corrupt.toString(), () => {
		const data = fixture(vulnerability())
		corrupt(data)
		assert.throws(() => evaluate(data))
	})
}
