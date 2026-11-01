import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

// Explicit paths allow checking an isolated checkout without touching local node_modules.
const options = process.argv.slice(2)
const option = name => {
	const index = options.indexOf(name)
	return index === -1 ? undefined : options[index + 1]
}
const root = resolve(option('--root') ?? '.')
const output = resolve(option('--out') ?? `artifacts/baseline-${Date.now()}`)
mkdirSync(output, { recursive: true })
if (existsSync(join(output, 'summary.json'))) throw new Error('Choose a new report directory')
const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
if (!existsSync(npmCli)) throw new Error('Run through npm run verify:baseline or provide npm_execpath')
const execute = (command, args) =>
	spawnSync(command, args, {
		cwd: root,
		env: { ...process.env, FORCE_COLOR: '0', TZ: 'UTC' },
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024
	})
const git = args => execute('git', args).stdout?.trim()
const summary = {
	startedAt: new Date().toISOString(),
	root,
	commit: git(['rev-parse', 'HEAD']),
	branch: git(['branch', '--show-current']),
	workingTree: git(['status', '--porcelain=v1']),
	node: process.version,
	npm: execute(process.execPath, [npmCli, '--version']).stdout?.trim(),
	platform: process.platform,
	timezone: 'UTC',
	dateTimeSeed: process.env.DATETIME_TEST_SEED ?? '20261031',
	lockfileSha256: createHash('sha256')
		.update(readFileSync(join(root, 'package-lock.json')))
		.digest('hex'),
	checks: []
}
const checks = [
	['typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']],
	[
		'lint',
		[
			'node_modules/eslint/bin/eslint.js',
			'src/**/*.{js,jsx,ts,tsx}',
			'--format',
			'json',
			'--output-file',
			join(output, 'lint.json')
		]
	],
	['jest', ['node_modules/jest/bin/jest.js', '--runInBand', '--json', '--outputFile', join(output, 'jest.json')]],
	[
		'jest-repeat',
		['node_modules/jest/bin/jest.js', '--runInBand', '--json', '--outputFile', join(output, 'jest-repeat.json')]
	],
	[
		'build',
		[
			'node_modules/webpack/bin/webpack.js',
			'--mode',
			'production',
			'--output-path',
			join(output, 'build'),
			'--json',
			join(output, 'webpack.json')
		]
	],
	['audit', [npmCli, 'audit', '--json']],
	['audit-production', [npmCli, 'audit', '--omit=dev', '--json']]
]
for (const [name, args] of checks) {
	const started = Date.now()
	const result = execute(process.execPath, args)
	writeFileSync(join(output, `${name}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`)
	let status = result.status === 0 ? 'passed' : 'failed'
	if (name.startsWith('audit')) {
		writeFileSync(join(output, `${name}.json`), result.stdout ?? '')
		try {
			const audit = JSON.parse(result.stdout)
			status =
				audit.error || !audit.metadata?.vulnerabilities
					? 'error'
					: audit.metadata.vulnerabilities.total > 0
						? 'advisories'
						: result.status === 0
							? 'passed'
							: 'error'
		} catch {
			status = 'error'
		}
	}
	summary.checks.push({
		name,
		args,
		exitCode: result.status,
		status,
		durationMs: Date.now() - started,
		error: result.error?.message
	})
	writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
	console.log(`${name}: ${status} (exit ${result.status})`)
}
summary.finishedAt = new Date().toISOString()
writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(`Reports: ${output}`)
process.exitCode = summary.checks.some(check => check.status !== 'passed') ? 1 : 0
