import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateAudit, inspectAudit, validatePolicy } from './audit-policy.mjs'

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const json = path => JSON.parse(readFileSync(path, 'utf8'))

export function findNpmCli() {
	const candidates = [
		process.env.npm_execpath,
		join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
		resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')
	]
	const candidate = candidates.find(path => path && existsSync(path))
	if (!candidate) throw new Error('Run through npm run audit:ci to locate npm CLI')
	return candidate
}

/** Save both raw reports even if npm fails or the policy/lockfile cannot be read. */
export function runAudits({
	root = scriptRoot,
	output = join(root, 'artifacts/audit'),
	policyPath = join(root, 'security/audit-policy.json'),
	npmCli,
	execute = spawnSync,
	today = new Date().toISOString().slice(0, 10)
} = {}) {
	mkdirSync(output, { recursive: true })
	const summary = { schemaVersion: 1, startedAt: new Date().toISOString(), policyDateUtc: today, checks: {} }
	const captured = {}
	let cliError
	try {
		npmCli ??= findNpmCli()
	} catch (error) {
		cliError = error
	}
	for (const scope of ['full', 'production']) {
		const args = [
			npmCli,
			'audit',
			'--json',
			'--audit-level=low',
			'--fetch-retries=1',
			'--fetch-timeout=15000',
			'--include=optional',
			'--include=peer',
			...(scope === 'production' ? ['--omit=dev'] : ['--include=dev'])
		]
		const start = Date.now()
		let result
		try {
			if (cliError) throw cliError
			result = execute(process.execPath, args, {
				cwd: root,
				encoding: 'utf8',
				timeout: 60000,
				maxBuffer: 32 * 1024 * 1024,
				windowsHide: true
			})
		} catch (error) {
			result = { status: null, error }
		}
		writeFileSync(join(output, scope + '.json'), result.stdout ?? '')
		writeFileSync(join(output, scope + '.stderr.log'), result.stderr ?? '')
		captured[scope] = result
		summary.checks[scope] = {
			command: [process.execPath, ...args],
			npmExitCode: result.status,
			durationMs: Date.now() - start,
			rawReport: scope + '.json',
			auditStatus: 'error',
			status: 'error'
		}
	}
	let policy, lock
	try {
		policy = validatePolicy(json(policyPath), today)
		lock = json(join(root, 'package-lock.json'))
		summary.policySha256 = hash(policyPath)
		summary.lockfileSha256 = hash(join(root, 'package-lock.json'))
	} catch (error) {
		summary.policyError = error.message
	}
	for (const [scope, result] of Object.entries(captured)) {
		const check = summary.checks[scope]
		try {
			if (result.error || result.signal || ![0, 1].includes(result.status))
				throw new Error(
					'npm audit process failed: ' + (result.error?.code ?? result.error?.message ?? result.signal ?? result.status)
				)
			const report = JSON.parse(result.stdout)
			// Collection errors remain distinguishable from policy errors.
			if (report.error) throw new Error('npm audit returned an error: ' + (report.error.code ?? 'unknown'))
			if (summary.policyError) throw new Error('Invalid audit policy or lockfile: ' + summary.policyError)
			const inspected = inspectAudit(report, lock, scope)
			if (result.status === 1 && inspected.counts.total === 0) throw new Error('npm audit failed without findings')
			check.auditStatus = inspected.counts.total ? 'advisories' : 'clean'
			Object.assign(check, evaluateAudit(inspected, policy))
		} catch (error) {
			check.error = error.message
		}
	}
	summary.status = Object.values(summary.checks).some(check => check.status === 'error')
		? 'error'
		: Object.values(summary.checks).some(check => check.status === 'blocked')
			? 'blocked'
			: 'passed'
	summary.finishedAt = new Date().toISOString()
	writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
	return summary
}

if (import.meta.main) {
	try {
		const summary = runAudits()
		for (const [scope, check] of Object.entries(summary.checks)) {
			console.log(`${scope}: ${check.status} (npm exit ${check.npmExitCode}; blocked ${check.blocked?.length ?? 0})`)
			if (check.error) console.error(check.error)
			for (const finding of check.blocked ?? [])
				console.error(`${finding.severity}: ${finding.advisory} ${finding.package}@${finding.version} ${finding.path}`)
		}
		console.log('Reports: artifacts/audit')
		process.exitCode = summary.status === 'passed' ? 0 : summary.status === 'blocked' ? 1 : 2
	} catch (error) {
		console.error('Audit could not complete: ' + error.message)
		process.exitCode = 2
	}
}
