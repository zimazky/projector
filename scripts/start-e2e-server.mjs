import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import webpack from 'webpack'
import WebpackDevServer from 'webpack-dev-server'

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectory = join(workspace, '.remediation-tmp')
mkdirSync(temporaryDirectory, { recursive: true })
const temporaryRoot = realpathSync(temporaryDirectory)
const sandbox = realpathSync(mkdtempSync(join(temporaryRoot, 'playwright-')))

// HMR изменяет только копию; .env и пользовательские профили сюда не попадают.
for (const name of ['src', 'dist/favicons', 'index.html', 'tsconfig.json', 'webpack.config.cjs']) {
	cpSync(join(workspace, name), join(sandbox, name), { recursive: true })
}
const environment = { CLIENT_ID: 'playwright-placeholder', OPEN_WEATHER_KEY: 'playwright-placeholder' }
Object.assign(process.env, environment)
writeFileSync(
	join(sandbox, '.env'),
	Object.entries(environment)
		.map(([key, value]) => `${key}=${value}`)
		.join('\n') + '\n'
)
// dotenv-webpack разрешает .env относительно cwd, а не compiler.context.
process.chdir(sandbox)
const require = createRequire(import.meta.url)
// Зависимости остаются в основном checkout; абсолютные typeRoots сохраняют проверку типов.
const typescript = require('typescript')
const tsconfig = typescript.readConfigFile(join(workspace, 'tsconfig.json'), typescript.sys.readFile)
if (tsconfig.error) throw new Error('Cannot read application tsconfig')
tsconfig.config.compilerOptions.typeRoots = (
	tsconfig.config.compilerOptions.typeRoots ?? ['./node_modules/@types']
).map(path => resolve(workspace, path))
writeFileSync(join(sandbox, 'tsconfig.json'), JSON.stringify(tsconfig.config, null, 2) + '\n')
const { devServer, ...buildConfig } = require(join(sandbox, 'webpack.config.cjs'))
const compiler = webpack({
	...buildConfig,
	context: sandbox,
	stats: { preset: 'errors-warnings', errorsSpace: 12 },
	infrastructureLogging: { level: 'warn' }
})
const server = new WebpackDevServer(devServer, compiler)
const reportDirectory = join(workspace, 'artifacts/playwright')
mkdirSync(reportDirectory, { recursive: true })
writeFileSync(join(reportDirectory, 'server.json'), JSON.stringify({ sandbox, pid: process.pid }, null, 2) + '\n')

function removeSandbox() {
	// Проверяем абсолютную цель перед рекурсивным удалением, включая Windows.
	const child = relative(temporaryRoot, sandbox)
	if (!child || child.startsWith('..') || isAbsolute(child) || !child.startsWith('playwright-')) {
		throw new Error(`Unexpected E2E sandbox: ${sandbox}`)
	}
	process.chdir(workspace)
	rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

let stopping = false
async function stop() {
	if (stopping) return
	stopping = true
	try {
		await server.stop()
		await new Promise((resolveClose, rejectClose) =>
			compiler.close(error => (error ? rejectClose(error) : resolveClose()))
		)
		removeSandbox()
		process.exit(0)
	} catch (error) {
		console.error(error.message)
		process.exit(1)
	}
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
try {
	await server.start()
} catch (error) {
	removeSandbox()
	throw error
}
