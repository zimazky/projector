import { DocumentTabsStore } from './DocumentTabsStore'
import { parseSessionSnapshot } from './DocumentSessionFormat'
import { LocalDocumentPersistence } from './DocumentPersistence'
import { getDocumentUiState, getIsDirty } from './DocumentSyncSelectors'
import { computeFingerprint } from './DocumentSyncFingerprint'
import { confirmedDocument } from 'src/test-utils/confirmedDocument'
import { legacySessionV1 } from 'src/test-utils/legacySession'

function source() {
	const store = new DocumentTabsStore({} as any)
	store.openNewDocument('Source')
	confirmedDocument(store.activeDocument!, 'file-source')
	store.activeProjectsStore!.add('Local edit', 'black', 'white')
	return { store, snapshot: JSON.parse(store.exportLocalSession()) }
}

describe('Сессия v2 и односторонняя миграция legacy', () => {
	beforeEach(() => localStorage.clear())
	afterEach(() => jest.restoreAllMocks())

	it('экспортирует только данные и sync, без state, ошибок и временных операций', () => {
		const { store } = source()
		const context = store.beginDocumentOperation(store.activeDocumentId!, 'saving')!
		store.failDocumentOperation(context, new Error('Transient'))
		const snapshot = JSON.parse(store.exportLocalSession())
		expect(snapshot.schemaVersion).toBe(3)
		expect(Object.keys(snapshot.documents[0]).sort()).toEqual(['data', 'id', 'lastAccessedAt', 'ref', 'sync'])
		expect(store.activeDocument).not.toHaveProperty('state')
		const restored = new DocumentTabsStore({} as any)
		expect(restored.importLocalSession(JSON.stringify(snapshot))).toBe(1)
		expect(restored.activeDocument!.operation).toBe('idle')
		expect(restored.activeDocument!.operationToken).toBeNull()
		expect(restored.activeDocument!.error).toBeNull()
		expect(getIsDirty(restored.activeDocument!)).toBe(true)
	})

	test.each(['dirty', 'clean', 'unknown'] as const)('v1 сохраняет %s и оригинал до первой записи v2', async mode => {
		const { snapshot } = source()
		const document = snapshot.documents[0]
		if (mode === 'clean') {
			document.sync.baseLocalVersion = document.sync.localVersion
			document.sync.baseFingerprint = document.sync.localFingerprint
		}
		if (mode === 'unknown') document.sync.baseLocalVersion = null
		const v1 = legacySessionV1(snapshot)
		v1.documents[0].state.isLoading = true
		v1.documents[0].state.isSaving = true
		v1.documents[0].state.error = 'Old error' as any
		const original = JSON.stringify(v1)
		localStorage.setItem('documentTabs', original)
		const restored = new DocumentTabsStore({} as any)
		expect(await restored.restoreFromLocalStorage()).toBe(true)
		expect(getIsDirty(restored.activeDocument!)).toBe(mode !== 'clean')
		expect(getDocumentUiState(restored.activeDocument!).status).not.toBe('synced')
		expect(restored.activeDocument!.sync.needsRemoteCheck).toBe(true)
		expect(restored.activeDocument!.operation).toBe('idle')
		expect(restored.activeDocument!.error).toBeNull()
		expect(localStorage.getItem('documentTabs')).toBe(original)
		restored.activateDocument(restored.activeDocumentId!)
		expect(JSON.parse(localStorage.getItem('documentTabs.backup.0')!).documentTabs).toBe(original)
		const current = JSON.parse(localStorage.getItem('documentTabs')!)
		expect(current.schemaVersion).toBe(3)
		expect(current.documents[0]).not.toHaveProperty('state')
		const again = new DocumentTabsStore({} as any)
		expect(await again.restoreFromLocalStorage()).toBe(true)
		expect(getIsDirty(again.activeDocument!)).toBe(mode !== 'clean')
		expect(again.activeDocument!.data).toEqual(document.data)
	})

	test.each([false, true])('старые флаги при отсутствии sync: dirty=%s не доказывают clean', dirty => {
		const { snapshot } = source()
		const v1: any = legacySessionV1(snapshot)
		delete v1.documents[0].sync
		v1.documents[0].state.isDirty = dirty
		v1.documents[0].state.hasUnsyncedChanges = dirty
		const parsed = parseSessionSnapshot(JSON.stringify(v1), () => null)
		expect(parsed.documents[0].sync.baseLocalVersion).toBeNull()
		expect(parsed.documents[0].sync.localVersion).toBe(dirty ? 1 : 0)
		expect(parsed.documents[0]).not.toHaveProperty('state')
	})

	it('противоречивый legacy dirty не снимается равным отпечатком', () => {
		const { snapshot } = source()
		const v1 = legacySessionV1(snapshot)
		const document = v1.documents[0]
		document.sync.baseLocalVersion = document.sync.localVersion
		document.sync.baseFingerprint = document.sync.localFingerprint
		document.state.isDirty = true
		const restored = new DocumentTabsStore({} as any)
		restored.importLocalSession(JSON.stringify(v1))
		expect(getIsDirty(restored.activeDocument!)).toBe(true)
		expect(restored.activeDocument!.sync.baseFingerprint).toBeNull()
	})

	it('неизвестная база v2 не становится известной при равном отпечатке и дальнейших правках', () => {
		const { snapshot } = source()
		const document = snapshot.documents[0]
		document.sync.baseLocalVersion = null
		document.sync.baseFingerprint = computeFingerprint(document.data)
		const restored = new DocumentTabsStore({} as any)
		restored.importLocalSession(JSON.stringify(snapshot))
		expect(restored.activeDocument!.sync.baseLocalVersion).toBeNull()
		restored.updateDocumentData(restored.activeDocumentId!, document.data)
		expect(getIsDirty(restored.activeDocument!)).toBe(true)
	})

	it('импорт v1 добавляет вкладки к текущим и сохраняет новую сессию v2', () => {
		const { store, snapshot } = source()
		const original = store.activeDocument!
		const v1 = JSON.stringify(legacySessionV1(snapshot))
		expect(store.importLocalSession(v1)).toBe(1)
		expect(store.documents).toHaveLength(2)
		expect(store.documents[0].id).toBe(original.id)
		expect(store.activeDocumentId).not.toBe(original.id)
		expect(getIsDirty(store.documents[0])).toBe(true)
		expect(getIsDirty(store.documents[1])).toBe(true)
		expect(store.exportLocalSession()).not.toContain('"state"')
	})

	test.each(['missing-sync', 'bad-version', 'future-schema'])(
		'неверный v2 не заменяет существующую сессию: %s',
		mode => {
			const { store, snapshot } = source()
			if (mode === 'missing-sync') delete snapshot.documents[0].sync
			if (mode === 'bad-version') snapshot.documents[0].sync.baseLocalVersion = -1
			if (mode === 'future-schema') snapshot.schemaVersion = 4
			const before = store.exportLocalSession()
			const stores = store.getActiveDocumentStores()
			expect(() => store.importLocalSession(JSON.stringify(snapshot))).toThrow()
			expect(store.getActiveDocumentStores()).toBe(stores)
			expect(JSON.parse(store.exportLocalSession()).documents).toEqual(JSON.parse(before).documents)
		}
	)

	it('отказ резервирования v1 оставляет исходник; повтор сохраняет резерв и последние правки', async () => {
		const { snapshot } = source()
		const original = JSON.stringify(legacySessionV1(snapshot))
		localStorage.setItem('documentTabs', original)
		const store = new DocumentTabsStore(
			{} as any,
			new LocalDocumentPersistence(
				() => localStorage,
				() => undefined
			)
		)
		await store.restoreFromLocalStorage()
		const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('Quota', 'QuotaExceededError')
		})
		store.activeProjectsStore!.add('Latest', 'black', 'white')
		expect(store.persistenceError).toBeTruthy()
		expect(localStorage.getItem('documentTabs')).toBe(original)
		set.mockRestore()
		store.retryLocalPersistence()
		expect(store.persistenceError).toBeNull()
		expect(JSON.parse(localStorage.getItem('documentTabs.backup.0')!).documentTabs).toBe(original)
		expect(localStorage.getItem('documentTabs')).toContain('Latest')
	})

	it('освобождает подавление callbacks после исключения применения данных', () => {
		const { store } = source()
		const projects = store.activeProjectsStore!
		const init = jest.spyOn(projects, 'init').mockImplementationOnce(() => {
			throw new Error('Apply failed')
		})
		expect(() => store.applyContentToDocument(store.activeDocumentId!, store.activeDocument!.data)).toThrow(
			'Apply failed'
		)
		init.mockRestore()
		projects.add('After failure', 'black', 'white')
		expect(store.activeDocument!.data.projectsList.some(project => project.name === 'After failure')).toBe(true)
		expect(store.exportLocalSession()).toContain('After failure')
		expect(getIsDirty(store.activeDocument!)).toBe(true)
	})
})
