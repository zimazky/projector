import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DocumentTabsStore } from './DocumentTabsStore'
import { parseDocumentData, serializeDocumentData } from './DocumentFormat'
import { LocalDocumentPersistence } from './DocumentPersistence'
import { MainStore } from 'src/1-app/Stores/MainStore'
import { getIsDirty, getDocumentUiState } from './DocumentSyncSelectors'

const fixture = (name: string) => readFileSync(join(__dirname, '../../../test-utils/fixtures', name), 'utf8')
const empty = () => ({ projectsList: [], completedList: [], plannedList: [] })
function seedLegacy() {
	localStorage.setItem('documentTabs', fixture('legacy-tabs.json'))
	for (const [id, file] of [
		['fixture-a', 'legacy-document.json'],
		['fixture-b', 'repeating-document.json']
	])
		localStorage.setItem('document_' + id, JSON.stringify({ data: JSON.parse(fixture(file)), savedAt: Date.now() }))
}

describe('Формат документов и восстановление', () => {
	beforeEach(() => localStorage.clear())
	afterEach(() => jest.restoreAllMocks())

	test.each(['legacy-document.json', 'repeating-document.json'])('миграция и повторный round-trip %s', file => {
		const original = JSON.parse(fixture(file))
		const before = JSON.stringify(original)
		const migrated = parseDocumentData(original)
		expect(parseDocumentData(serializeDocumentData(migrated))).toEqual(migrated)
		expect(JSON.parse(serializeDocumentData(migrated)).schemaVersion).toBe(1)
		expect(JSON.stringify(original)).toBe(before)
	})

	test.each([
		{ start: '2026.02.30' },
		{ start: '2026-02.29' },
		{ start: '2026.10-31' },
		{ start: '0000.01.01' },
		{ time: '25:00' },
		{ duration: '1e9:00' },
		{ duration: '999999999999999999999d 1:00' },
		{ credit: Infinity },
		{ debit: NaN },
		{ end: '2026.10.30' },
		{ repeat: '/0' },
		{ repeat: '/1', duration: '25:00' },
		{ project: 'Missing', schemaVersion: 1 },
		{ comment: 12 }
	])('отклоняет неверный DTO %j', patch => {
		const { schemaVersion, ...event } = patch as any
		expect(() =>
			parseDocumentData({
				...empty(),
				...(schemaVersion ? { schemaVersion } : {}),
				plannedList: [{ name: 'Test', start: '2026.10.31', ...event }]
			})
		).toThrow()
	})

	it('восстанавливает старые ссылки на проекты на копии, проверяет их в v1', () => {
		const old = { ...empty(), plannedList: [{ name: 'A', start: '2026-10-31', project: 'Recovered' }] }
		const data = parseDocumentData(old)
		expect(data.projectsList[0].name).toBe('Recovered')
		expect(data.plannedList[0].start).toBe('2026.10.31')
		expect(old.projectsList).toEqual([])
		expect(() => parseDocumentData({ ...old, schemaVersion: 2 })).toThrow('schemaVersion')
		expect(() => parseDocumentData({ ...old, projectsList: [data.projectsList[0], data.projectsList[0]] })).toThrow()
	})

	it('восстанавливает все вкладки при зависшем GAPI до его инициализации', () => {
		seedLegacy()
		const tabs = new DocumentTabsStore({} as any)
		const api = {
			initGapi: jest.fn(() => expect(tabs.documents).toHaveLength(2)),
			waitForGapiReady: () => new Promise(() => {})
		}
		new MainStore({ init: jest.fn() } as any, api as any, tabs).init()
		expect(tabs.activeDocumentId).toBe('fixture-b')
		expect(getIsDirty(tabs.documents[0])).toBe(true)
		expect(getDocumentUiState(tabs.documents[0]).status).not.toBe('synced')
	})

	it('отказ GAPI не отменяет восстановление; повтор восстановления не дублирует вкладки', async () => {
		seedLegacy()
		const tabs = new DocumentTabsStore({} as any)
		jest.spyOn(console, 'error').mockImplementation(() => {})
		new MainStore(
			{ init: jest.fn() } as any,
			{ initGapi: jest.fn(), waitForGapiReady: () => Promise.reject(null) } as any,
			tabs
		).init()
		await Promise.resolve()
		expect(tabs.documents).toHaveLength(2)
		expect(await tabs.restoreFromLocalStorage()).toBe(false)
		expect(tabs.documents).toHaveLength(2)
	})

	it('миграция сохраняет точный оригинал перед первой атомарной записью', async () => {
		seedLegacy()
		const original = localStorage.getItem('documentTabs')
		const originalData = localStorage.getItem('document_fixture-a')
		const tabs = new DocumentTabsStore({} as any)
		expect(await tabs.restoreFromLocalStorage()).toBe(true)
		expect(localStorage.getItem('documentTabs')).toBe(original)
		tabs.activateDocument('fixture-a')
		const backup = JSON.parse(localStorage.getItem('documentTabs.backup.0')!)
		expect(backup.documentTabs).toBe(original)
		expect(backup.documents['document_fixture-a']).toBe(originalData)
		expect(JSON.parse(localStorage.getItem('documentTabs')!).schemaVersion).toBe(2)
		const next = new DocumentTabsStore({} as any)
		expect(await next.restoreFromLocalStorage()).toBe(true)
		next.activateDocument('fixture-b')
		expect(localStorage.getItem('documentTabs.backup.1')).toBeNull()
		next.getDocumentStores('fixture-b')!.projectsStore.add('After restore', 'black', 'white')
		const again = new DocumentTabsStore({} as any)
		expect(await again.restoreFromLocalStorage()).toBe(true)
		expect(again.activeProjectsStore!.exists('After restore')).toBe(true)
		expect(again.activeDocumentId).toBe('fixture-b')
	})

	test.each([
		'order',
		'active',
		'duplicate',
		'missing-data',
		'invalid-data',
		'invalid-sync',
		'future-version',
		'nested-version'
	])('не применяет часть повреждённой сессии: %s', mode => {
		seedLegacy()
		const raw = JSON.parse(localStorage.getItem('documentTabs')!)
		if (mode === 'order') raw.documentOrder.push('absent')
		if (mode === 'active') raw.activeDocumentId = 'absent'
		if (mode === 'duplicate') raw.documents[1].id = raw.documents[0].id
		if (mode === 'missing-data') localStorage.removeItem('document_fixture-b')
		if (mode === 'invalid-data') localStorage.setItem('document_fixture-b', '{')
		if (mode === 'invalid-sync') raw.documents[1].sync = { localVersion: -1 }
		if (mode === 'future-version') raw.schemaVersion = 999
		if (mode === 'nested-version') {
			raw.schemaVersion = 1
			for (const item of raw.documents) item.data = { ...empty(), schemaVersion: 999 }
		}
		localStorage.setItem('documentTabs', JSON.stringify(raw))
		return (async () => {
			const tabs = new DocumentTabsStore({} as any)
			expect(await tabs.restoreFromLocalStorage()).toBe(false)
			expect(tabs.documents).toHaveLength(0)
			expect(tabs.persistenceError).toBeTruthy()
			tabs.openNewDocument('Memory only')
			expect(JSON.parse(localStorage.getItem('documentTabs')!)).toEqual(raw)
			expect(tabs.exportRecoverySource()).toContain('document_fixture-a')
		})()
	})

	it('квота не разделяет содержимое и метаданные; экспорт и повтор сохраняют последние правки', async () => {
		const tabs = new DocumentTabsStore({} as any)
		tabs.openNewDocument('A')
		const lastGood = localStorage.getItem('documentTabs')
		const save = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('Quota', 'QuotaExceededError')
		})
		expect(() => tabs.activeProjectsStore!.add('Latest', 'black', 'white')).not.toThrow()
		expect(tabs.persistenceError).toContain('Превышена квота localStorage')
		expect(tabs.persistenceDiagnostic?.errorName).toBe('QuotaExceededError')
		expect(tabs.persistenceDiagnostic?.operation).toBe('session-write')
		expect(tabs.persistenceDiagnostic?.attemptedBytes).toBeGreaterThan(0)
		expect(tabs.activeProjectsStore!.exists('Latest')).toBe(true)
		expect(localStorage.getItem('documentTabs')).toBe(lastGood)
		expect(tabs.exportLocalSession()).toContain('Latest')
		const restored = new DocumentTabsStore({} as any)
		expect(await restored.restoreFromLocalStorage()).toBe(true)
		expect(restored.activeProjectsStore!.exists('Latest')).toBe(false)
		save.mockRestore()
		tabs.retryLocalPersistence()
		expect(tabs.persistenceError).toBeNull()
		expect(tabs.persistenceDiagnostic).toBeNull()
		expect(localStorage.getItem('documentTabs')).toContain('Latest')
	})

	it('при отказе резервирования не заменяет старую сессию', async () => {
		seedLegacy()
		const original = localStorage.getItem('documentTabs')
		const tabs = new DocumentTabsStore({} as any)
		await tabs.restoreFromLocalStorage()
		jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('Quota', 'QuotaExceededError')
		})
		tabs.activateDocument('fixture-a')
		expect(localStorage.getItem('documentTabs')).toBe(original)
		expect(tabs.persistenceError).toBeTruthy()
		expect(tabs.persistenceDiagnostic?.operation).toBe('backup-write')
		expect(tabs.persistenceDiagnostic?.errorName).toBe('QuotaExceededError')
		expect(tabs.documents).toHaveLength(2)
	})

	it('недоступное Storage не ломает создание и редактирование в памяти', async () => {
		const persistence = new LocalDocumentPersistence(() => {
			throw new DOMException('Denied', 'SecurityError')
		})
		const tabs = new DocumentTabsStore({} as any, persistence)
		expect(await tabs.restoreFromLocalStorage()).toBe(false)
		expect(() => tabs.openNewDocument()).not.toThrow()
		tabs.activeProjectsStore!.add('Memory', 'black', 'white')
		expect(tabs.exportLocalSession()).toContain('Memory')
	})

	it('невалидный импорт оставляет исходные сторы и локальную запись целыми', () => {
		const tabs = new DocumentTabsStore({} as any)
		tabs.openNewDocument()
		tabs.activeProjectsStore!.add('Original', 'black', 'white')
		const before = tabs.activeDocument!.data
		const stored = localStorage.getItem('documentTabs')
		expect(() =>
			tabs.applyContentToActiveDocument({ ...empty(), plannedList: [{ name: 'Bad', start: '2026.02.30' }] })
		).toThrow()
		expect(tabs.activeDocument!.data).toEqual(before)
		expect(localStorage.getItem('documentTabs')).toBe(stored)
		expect(tabs.activeProjectsStore!.exists('Original')).toBe(true)
	})
})
