import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import webpack from 'webpack'
import WebpackDevServer from 'webpack-dev-server'

const require = createRequire(import.meta.url)
const { devServer, ...config } = require('../webpack.config.cjs')
const output = resolve('artifacts/drive-write-live')
mkdirSync(output, { recursive: true })
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Проверка S01 — Google Drive</title>
<body style="font-family:system-ui;max-width:800px;margin:40px auto;padding:16px">
<h1>Проверка сохранения в Google Drive</h1>
<p>Проверка создаёт два файла с префиксом projector-s01-check, проверяет обновление и отказ устаревшей записи, затем перемещает тестовые файлы в корзину. Ваши существующие документы не используются.</p>
<p>Токены и содержимое ваших документов в отчёт не записываются. После проверки сообщите результат в чате.</p>
<button id="login" disabled>1. Войти в Google</button> <button id="run" disabled>2. Запустить проверку</button>
<pre id="result" style="white-space:pre-wrap" aria-live="polite">Инициализация Google API…</pre>
<script src="/probe/probe.js"></script></body></html>`
const compiler = webpack({
	...config,
	mode: 'development',
	entry: './src/test-utils/driveWriteProbePage.ts',
	output: { path: output, filename: 'probe.js', publicPath: '/probe/' },
	stats: 'errors-warnings',
	infrastructureLogging: { level: 'warn' }
})
const server = new WebpackDevServer(
	{
		...devServer,
		hot: false,
		client: false,
		static: false,
		watchFiles: [],
		setupMiddlewares: middlewares => {
			middlewares.push({
				name: 'drive-live-probe',
				middleware: (request, response, next) => {
					if (request.method === 'GET' && ['/', '/index.html'].includes(request.path))
						return response.type('html').send(html)
					if (request.method === 'POST' && request.path === '/result') {
						if (request.headers.origin !== `http://${request.headers.host}`) return response.sendStatus(403)
						let body = ''
						request.on('data', data => {
							body += data
							if (body.length > 64000) request.destroy()
						})
						request.on('end', () => {
							try {
								const report = JSON.parse(body)
								if (typeof report.passed !== 'boolean' || !Array.isArray(report.steps)) return response.sendStatus(400)
								writeFileSync(resolve(output, 'result.json'), JSON.stringify(report, null, 2) + '\n')
								console.log(
									`Drive live probe: ${report.passed ? 'PASSED' : 'FAILED'}; report: artifacts/drive-write-live/result.json`
								)
								response.sendStatus(204)
							} catch {
								response.sendStatus(400)
							}
						})
						return
					}
					next()
				}
			})
			return middlewares
		}
	},
	compiler
)
async function stop() {
	await server.stop()
	compiler.close(() => process.exit(0))
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
await server.start()
console.log(
	`Open http://127.0.0.1:${devServer.port}/index.html (or localhost on the same port if configured in Google OAuth).`
)
