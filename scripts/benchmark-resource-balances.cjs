// Isolated TypeScript loader for this local benchmark; no generated application bundle is needed.
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const os = require('node:os')
const { performance } = require('node:perf_hooks')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const resolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
	return resolve.call(this, request.startsWith('src/') ? path.join(root, request) : request, ...args)
}
require.extensions['.ts'] = (module, filename) =>
	module._compile(
		ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
		}).outputText,
		filename
	)
const { resourceBalanceBenchmarkData } = require('../src/test-utils/resourceBalanceBenchmarkData.ts')
const DateTime = require('../src/7-shared/libs/DateTime/DateTime.ts').default
const { ProjectsStore } = require('../src/6-entities/Projects/ProjectsStore.ts')
const { EventsStore } = require('../src/6-entities/Events/EventsStore.ts')
const { EventsCache } = require('../src/6-entities/EventsCache/EventsCache.ts')
const mode = process.argv[2] || 'legacy'
const data = resourceBalanceBenchmarkData()
const first = DateTime.YYYYMMDDToTimestamp('2026.10.01')
const dates = Array.from({ length: 147 }, (_, i) => first + i * 86400)
const samples = []
for (let run = 0; run < 5; run++) {
	if (mode === 'legacy') {
		const legacy = event => ({
			name: event.name,
			start: event.start,
			...(event.repeat ? { repeat: event.repeat, end: event.end } : {}),
			credit: 0,
			debit: 0,
			...((event.actualOperation ?? event.plannedOperation).movements[0].quantity.startsWith('-')
				? {
						debit:
							-Number((event.actualOperation ?? event.plannedOperation).movements[0].quantity) *
							((event.actualOperation ?? event.plannedOperation).movements[0].resourceId === 'USD' ? 90 : 1)
					}
				: {
						credit:
							Number((event.actualOperation ?? event.plannedOperation).movements[0].quantity) *
							((event.actualOperation ?? event.plannedOperation).movements[0].resourceId === 'USD' ? 90 : 1)
					})
		})
		const projects = new ProjectsStore()
		const events = new EventsStore(projects)
		events.init({ completedList: data.completedList.map(legacy), plannedList: data.plannedList.map(legacy) })
		const cache = new EventsCache({
			activeEventsStore: events,
			activeProjectsStore: projects,
			getAllDocumentStores: () => []
		})
		let begin = performance.now()
		cache.getActualBalance(first)
		const build = performance.now() - begin
		begin = performance.now()
		for (const date of dates) {
			cache.getActualBalance(date)
			cache.getPlannedBalance(date)
		}
		const cold = performance.now() - begin
		begin = performance.now()
		for (const date of dates) {
			cache.getActualBalance(date)
			cache.getPlannedBalance(date)
		}
		samples.push({ build, cold, warm: performance.now() - begin, priceChange: null })
	} else if (mode === 'resource') {
		const { DocumentStoreManager } = require('../src/6-entities/Document/model/DocumentStoreManager.ts')
		const { ResourceBalanceCache } = require('../src/6-entities/EventsCache/ResourceBalanceCache.ts')
		const { ResourceBalanceClock } = require('../src/6-entities/EventsCache/ResourceBalanceClock.ts')
		const { parseDecimal } = require('../src/7-shared/libs/Decimal/Decimal.ts')
		let published = JSON.parse(JSON.stringify(data))
		const manager = new DocumentStoreManager(
			{ activeDocumentId: 'benchmark', getDocumentData: () => published },
			{
				onDocumentChanged: () => {
					published = manager.getDocumentDataForSave('benchmark')
				}
			},
			true
		)
		const stores = manager.createStores('benchmark')
		const cache = new ResourceBalanceCache(
			{
				activeEventsStore: stores.eventsStore,
				activeProjectsStore: stores.projectsStore,
				getAllDocumentStores: () => [stores],
				getDocumentStores: () => stores,
				getDocumentData: () => published
			},
			new ResourceBalanceClock(() => Date.parse('2026-11-01T09:00:00Z'))
		)
		let begin = performance.now()
		cache.diagnostics('benchmark')
		const build = performance.now() - begin
		const from = DateTime.getYYYYMMDD(first),
			end = DateTime.getYYYYMMDD(first + dates.length * 86400)
		begin = performance.now()
		cache.range('benchmark', from, end)
		const cold = performance.now() - begin
		begin = performance.now()
		cache.range('benchmark', from, end)
		const warm = performance.now() - begin
		const before = cache.diagnostics('benchmark')
		manager.editDocument('benchmark', draft => {
			draft.resources.find(resource => resource.id === 'USD').price.amountPerUnit = parseDecimal('95')
		})
		begin = performance.now()
		cache.range('benchmark', from, end)
		const priceChange = performance.now() - begin
		const after = cache.diagnostics('benchmark')
		if (before.indexBuilds !== after.indexBuilds || before.quantityReads !== after.quantityReads)
			throw new Error('Price change rebuilt quantities')
		samples.push({ build, cold, warm, priceChange })
		cache.dispose()
		manager.dispose()
	} else {
		throw new Error('Expected legacy or resource mode')
	}
}
const median = name => {
	const values = samples
		.map(row => row[name])
		.filter(value => value !== null)
		.sort((a, b) => a - b)
	return values.length ? Number(values[Math.floor(values.length / 2)].toFixed(3)) : null
}
const result = {
	mode,
	environment: { node: process.version, platform: process.platform, cpu: os.cpus()[0].model },
	fixture: {
		actual: data.completedList.length,
		planned: data.plannedList.filter(event => !event.repeat).length,
		schedules: 100,
		accounts: 20,
		resources: 2,
		days: dates.length
	},
	medianMs: { build: median('build'), cold: median('cold'), warm: median('warm'), priceChange: median('priceChange') },
	samples
}
const output = path.join(root, 'artifacts/r06')
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(path.join(output, mode + '.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
