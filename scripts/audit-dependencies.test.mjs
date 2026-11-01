import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { runAudits } from './audit-dependencies.mjs'
import {
	emptyPolicy,
	exception,
	fixture,
	temporaryDirectory,
	today,
	vulnerability
} from './test-utils/audit-fixtures.mjs'

function setup(t, responses, data = fixture(), policy = emptyPolicy) {
	const root = temporaryDirectory(t),
		output = join(root, 'reports')
	mkdirSync(join(root, 'security'))
	writeFileSync(join(root, 'security/audit-policy.json'), JSON.stringify(policy))
	writeFileSync(join(root, 'package-lock.json'), JSON.stringify(data.lock))
	const calls = []
	const run = () =>
		runAudits({
			root,
			output,
			npmCli: 'synthetic-npm-cli.js',
			today,
			execute: (command, args, options) => {
				calls.push({ command, args, options })
				const result = responses[calls.length - 1]
				if (result instanceof Error) throw result
				return result
			}
		})
	return { run, calls, output, root }
}
const response = (data = fixture(), status = data.report.metadata.vulnerabilities.total ? 1 : 0) => ({
	status,
	stdout: JSON.stringify(data.report),
	stderr: ''
})
const read = path => JSON.parse(readFileSync(path, 'utf8'))

test('both modes are collected and saved; exit 1 with moderate findings passes the policy', t => {
	const data = fixture(vulnerability('leaf', 'moderate'))
	const { run, calls, output } = setup(t, [response(data), response()], data)
	const summary = run()
	assert.equal(summary.status, 'passed')
	assert.equal(summary.checks.full.auditStatus, 'advisories')
	assert.equal(summary.checks.production.auditStatus, 'clean')
	assert.equal(summary.checks.full.npmExitCode, 1)
	assert.deepEqual(read(join(output, 'full.json')), data.report)
	assert.deepEqual(read(join(output, 'production.json')), fixture().report)
	assert.equal(calls.length, 2)
	assert.ok(calls[0].args.includes('--include=dev'))
	assert.ok(calls[1].args.includes('--omit=dev'))
	assert.equal(calls[0].options.timeout, 60000)
	assert.equal(read(join(output, 'summary.json')).status, 'passed')
})
test('critical full finding blocks even if npm unexpectedly exits 0; production still runs', t => {
	const data = fixture(vulnerability('leaf', 'critical'))
	const { run, calls, output } = setup(t, [response(data, 0), response()], data)
	assert.equal(run().status, 'blocked')
	assert.equal(calls.length, 2)
	assert.equal(read(join(output, 'summary.json')).checks.full.blocked[0].severity, 'critical')
})
test('production high findings cannot be excused by a full-only exception', t => {
	const data = fixture(vulnerability())
	const { run } = setup(t, [response(data), response(data)], data, { schemaVersion: 1, exceptions: [exception()] })
	const summary = run()
	assert.equal(summary.checks.full.status, 'passed')
	assert.equal(summary.checks.production.status, 'blocked')
})
for (const bad of [
	{ status: 1, stdout: JSON.stringify({ error: { code: 'ENOTFOUND' } }), stderr: 'network failure' },
	{ status: 0, stdout: '<html>registry unavailable</html>', stderr: '' },
	{ status: 0, stdout: '{}', stderr: '' },
	{ status: 1, stdout: '', stderr: 'network failure' },
	{ status: null, stdout: '{partial', stderr: '', error: { code: 'ETIMEDOUT' }, signal: 'SIGTERM' },
	{ ...response(), status: 2 },
	{ ...response(), status: 1 },
	new Error('cannot start npm')
]) {
	test(
		'collection error is never success, preserves raw data, and does not skip production: ' + JSON.stringify(bad),
		t => {
			const { run, calls, output } = setup(t, [bad, response()])
			mkdirSync(output)
			writeFileSync(join(output, 'full.json'), JSON.stringify(fixture().report))
			const summary = run()
			assert.equal(summary.status, 'error')
			assert.equal(summary.checks.full.status, 'error')
			assert.equal(summary.checks.full.auditStatus, 'error')
			assert.equal(summary.checks.production.status, 'passed')
			assert.equal(calls.length, 2)
			assert.equal(readFileSync(join(output, 'full.json'), 'utf8'), bad.stdout ?? '')
			assert.equal(readFileSync(join(output, 'full.stderr.log'), 'utf8'), bad.stderr ?? '')
		}
	)
}
test('expired exception is an error even if findings have disappeared; reports are retained', t => {
	const { run, calls, output } = setup(t, [response(), response()], fixture(), {
		schemaVersion: 1,
		exceptions: [exception({ expiresOn: today })]
	})
	assert.equal(run().status, 'error')
	assert.equal(calls.length, 2)
	assert.ok(read(join(output, 'full.json')).metadata)
	assert.ok(read(join(output, 'production.json')).metadata)
})
test('unreadable policy or lockfile does not prevent capturing both npm reports', t => {
	const { run, calls, output, root } = setup(t, [response(), response()])
	writeFileSync(join(root, 'package-lock.json'), 'invalid lockfile')
	assert.equal(run().status, 'error')
	assert.equal(calls.length, 2)
	assert.ok(read(join(output, 'full.json')).metadata)
	assert.ok(read(join(output, 'production.json')).metadata)
})

for (const [name, full, expected] of [
	['clean', response(), 0],
	['moderate', response(fixture(vulnerability('leaf', 'moderate'))), 0],
	['blocked', response(fixture(vulnerability('leaf', 'critical'))), 1],
	['network error', { status: 1, stdout: '{"error":{"code":"ENOTFOUND"}}', stderr: '' }, 2]
]) {
	test('real CLI exit code and saved summary: ' + name, t => {
		const root = temporaryDirectory(t)
		mkdirSync(join(root, 'scripts'))
		mkdirSync(join(root, 'security'))
		for (const file of ['audit-policy.mjs', 'audit-dependencies.mjs'])
			copyFileSync(new URL(file, import.meta.url), join(root, 'scripts', file))
		writeFileSync(join(root, 'security/audit-policy.json'), JSON.stringify(emptyPolicy))
		writeFileSync(join(root, 'package-lock.json'), JSON.stringify(fixture(vulnerability()).lock))
		const fakeNpm = join(root, 'fake-npm.cjs')
		writeFileSync(
			fakeNpm,
			`const outputs = ${JSON.stringify({ full, production: response() })};
const result = outputs[process.argv.includes('--omit=dev') ? 'production' : 'full'];
process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exitCode = result.status;`
		)
		const script = join(root, 'scripts/audit-dependencies.mjs')
		// Windows paths are case-insensitive; entry-point detection must still run the gate.
		const path = process.platform === 'win32' ? join(root.toUpperCase(), 'scripts/audit-dependencies.mjs') : script
		const result = spawnSync(process.execPath, [path], {
			cwd: root,
			encoding: 'utf8',
			env: { ...process.env, npm_execpath: fakeNpm },
			windowsHide: true
		})
		assert.equal(result.status, expected, result.stderr)
		const summary = read(join(root, 'artifacts/audit/summary.json'))
		assert.equal(summary.status, expected === 0 ? 'passed' : expected === 1 ? 'blocked' : 'error')
		assert.equal(summary.checks.production.status, 'passed')
	})
}

test('importing the CLI does not run npm or create reports', t => {
	const root = temporaryDirectory(t)
	for (const file of ['audit-policy.mjs', 'audit-dependencies.mjs'])
		copyFileSync(new URL(file, import.meta.url), join(root, file))
	writeFileSync(join(root, 'import.mjs'), "import './audit-dependencies.mjs'\n")
	const result = spawnSync(process.execPath, [join(root, 'import.mjs')], {
		cwd: root,
		encoding: 'utf8',
		windowsHide: true
	})
	assert.equal(result.status, 0, result.stderr)
	assert.equal(result.stdout, '')
	assert.equal(existsSync(join(root, 'artifacts/audit')), false)
})
