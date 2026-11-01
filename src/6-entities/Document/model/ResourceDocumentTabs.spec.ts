import { resourceDocument } from 'src/test-utils/resourceDocument'
import { deferred } from 'src/test-utils/deferred'
import { parseDecimal as d } from 'src/7-shared/libs/Decimal/Decimal'
import { DocumentTabsStore } from './DocumentTabsStore'
import { createResourceDocumentRuntime } from './ResourceDocumentRuntime'
import { ResourceDocumentPersistence } from './ResourceDocumentPersistence'
import { parseResourceDocumentData } from './ResourceDocumentFormat'
import type { ResourceDocumentData } from './ResourceDocument.types'
import { computeFingerprint } from './DocumentSyncFingerprint'

const runtime = createResourceDocumentRuntime({
	id: 'test-runtime',
	currency: { code: 'RUB', scale: 2 },
	currencyConfirmed: true,
	asOf: '2026.11.01',
	timezone: 'Europe/Moscow'
})

const persistence = () =>
	new ResourceDocumentPersistence(
		undefined,
		() => localStorage,
		() => undefined
	)

function setup() {
	let remote = resourceDocument()
	let version = 1
	const metadata = () => ({
		id: 'file',
		name: 'Resource.json',
		mimeType: 'application/json',
		version: String(version),
		modifiedTime: '2026-11-01T00:00:00Z'
	})
	const api = {
		isGoogleLoggedIn: true,
		getFileMetadata: jest.fn(async () => metadata()),
		downloadFileContent: jest.fn(async () => JSON.stringify(remote)),
		updateFileContent: jest.fn(async (_file: string, content: string) => {
			remote = JSON.parse(content)
			version++
			return { status: 'success', file: metadata() }
		})
	}
	const storage = persistence()
	const store = new DocumentTabsStore(api as any, storage, runtime)
	store.openNewDocument('Ресурсы')
	const id = store.activeDocumentId!
	store.applyContentToDocument(id, resourceDocument())
	const saved = () => store.getDocumentDataForSave(id) as ResourceDocumentData
	const catalogs = store.getDocumentStores(id)!.resourceStores!
	const edit = (change: (draft: ResourceDocumentData) => void) =>
		store.editDocument(id, draft => change(draft as ResourceDocumentData))
	return {
		store,
		id,
		catalogs,
		api,
		saved,
		edit,
		storage,
		updateRemote: (next: ResourceDocumentData) => {
			remote = next
			version++
		}
	}
}

describe('Resource document publication and persistence', () => {
	beforeEach(() => localStorage.clear())
	afterEach(() => jest.restoreAllMocks())

	it('selects v4 persistence together with the internal runtime', async () => {
		const store = new DocumentTabsStore({} as any, undefined, runtime)
		store.openNewDocument()
		expect(store.persistenceError).toBeNull()
		expect(JSON.parse(localStorage.getItem('documentTabs')!).schemaVersion).toBe(4)
		const syncBefore = { ...store.activeDocument!.sync }
		const restored = new DocumentTabsStore({} as any, undefined, runtime)
		expect(await restored.restoreFromLocalStorage()).toBe(true)
		expect(restored.getActiveDocumentStores()!.resourceStores).toBeDefined()
		expect(restored.activeDocument!.sync).toEqual(syncBefore)
	})

	it('persists account/category/price/monthly settings changes and reloads without editing events', async () => {
		const { store, catalogs, saved, api } = setup()
		const beforeEvents = saved().completedList
		const eventVersion = store.activeEventsStore!.version
		catalogs.accountsStore.upsert({ ...catalogs.accountsStore.getById('card')!, name: 'Зарплатная карта' })
		catalogs.balanceCategoriesStore.upsert({
			...catalogs.balanceCategoriesStore.getById('money')!,
			includeInGrandTotal: false
		})
		catalogs.resourcesStore.upsert({
			...catalogs.resourcesStore.getById('USD')!,
			price: { ...catalogs.resourcesStore.getById('USD')!.price!, amountPerUnit: d('95'), revision: 1 }
		})
		catalogs.cashbackMonthSettingsStore.upsert({
			...catalogs.cashbackMonthSettingsStore.list[0],
			note: 'Проверено',
			revision: 2
		})
		expect(store.activeEventsStore!.version).toBe(eventVersion)
		expect(saved().completedList).toEqual(beforeEvents)
		const snapshot = store.captureDocumentSnapshot(store.activeDocumentId!)!
		store.dispose()
		const restored = new DocumentTabsStore(api as any, persistence(), runtime)
		expect(await restored.restoreFromLocalStorage()).toBe(true)
		expect(restored.activeDocument!.data).toEqual(snapshot.data)
		expect(restored.activeDocument!.sync.localVersion).toBe(snapshot.localVersion)
		expect(restored.captureDocumentSnapshot(restored.activeDocumentId!)!.localVersion).toBe(snapshot.localVersion)
		expect(restored.getDocumentDataForSave()).toEqual(snapshot.data)
	})

	it('publishes one snapshot and localVersion for a compound edit across stores', () => {
		const { store, id, edit, saved } = setup()
		const version = store.activeDocument!.sync.localVersion
		const save = jest.spyOn(Storage.prototype, 'setItem')
		const published = jest.fn()
		store.setOnStoresChanged({ onDocumentChanged: published })
		edit(draft => {
			draft.accounts[0].name = 'Edited card'
			draft.resources[1].price!.amountPerUnit = d('94')
			draft.cashbackMonthSettings![0].note = 'Edited settings'
			draft.completedList[0].name = 'Edited purchase'
		})
		expect(store.activeDocument!.sync.localVersion).toBe(version + 1)
		expect(published).toHaveBeenCalledTimes(1)
		const writes = save.mock.calls.filter(([key]) => key === 'documentTabs')
		expect(writes).toHaveLength(1)
		expect(JSON.parse(writes[0][1]).documents.find((doc: any) => doc.id === id).data).toEqual(saved())
	})

	it('does not publish, persist or change any version when the last part of a command is invalid', () => {
		const { store, edit, saved, catalogs } = setup()
		const before = saved()
		const version = store.activeDocument!.sync.localVersion
		const resourceVersion = catalogs.resourcesStore.version
		const save = jest.spyOn(Storage.prototype, 'setItem')
		expect(() =>
			edit(draft => {
				draft.resources[1].name = 'Changed'
				draft.accounts[0].categoryId = 'missing'
			})
		).toThrow()
		expect(saved()).toEqual(before)
		expect(store.activeDocument!.sync.localVersion).toBe(version)
		expect(catalogs.resourcesStore.version).toBe(resourceVersion)
		expect(save).not.toHaveBeenCalled()
	})

	it('keeps edits addressed to their original document after changing the active tab', async () => {
		const { store, id, catalogs, saved, api } = setup()
		const firstVersion = store.activeDocument!.sync.localVersion
		store.openNewDocument('Вторая вкладка')
		const second = store.activeDocument!
		const secondData = store.captureDocumentSnapshot(second.id)!.data
		catalogs.accountsStore.upsert({ ...catalogs.accountsStore.getById('card')!, name: 'Правка первой вкладки' })
		expect(store.activeDocument).toBe(second)
		expect(store.activeDocument!.data).toEqual(secondData)
		expect(store.documents.find(doc => doc.id === id)!.sync.localVersion).toBe(firstVersion + 1)
		const expected = saved()
		const restored = new DocumentTabsStore(api as any, persistence(), runtime)
		expect(await restored.restoreFromLocalStorage()).toBe(true)
		expect(restored.getDocumentDataForSave(id)).toEqual(expected)
		expect(restored.getDocumentDataForSave(second.id)).toEqual(secondData)
	})

	it('applies every remote catalog and event once without a false user edit', () => {
		const { store, id, saved, catalogs } = setup()
		const remote = resourceDocument()
		remote.accounts[0].name = 'Remote card'
		remote.resources[1].price!.amountPerUnit = d('97')
		remote.balanceCategories[0].includeInGrandTotal = false
		remote.cashbackMonthSettings![0].note = 'Remote settings'
		remote.completedList[0].name = 'Remote event'
		const version = store.activeDocument!.sync.localVersion
		const changed = jest.fn()
		store.setOnStoresChanged({ onDocumentChanged: changed, onEventsChanged: changed, onProjectsChanged: changed })
		store.applyContentToDocument(id, remote, {
			id: 'file',
			name: 'Resource.json',
			mimeType: 'application/json',
			version: '2'
		})
		expect(saved()).toEqual(parseResourceDocumentData(remote))
		expect(store.getDocumentStores(id)!.resourceStores).toBe(catalogs)
		expect(store.activeDocument!.sync.localVersion).toBe(version + 1)
		expect(store.activeDocument!.sync.baseLocalVersion).toBe(version + 1)
		expect(store.captureDocumentSnapshot(id)!.localVersion).toBe(version + 1)
		expect(changed).not.toHaveBeenCalled()
	})

	it('keeps an in-flight immutable snapshot separate from a later price edit', () => {
		const { store, id, catalogs } = setup()
		const sent = store.captureDocumentSnapshot(id)!
		const fingerprint = computeFingerprint(sent.data)
		catalogs.resourcesStore.upsert({
			...catalogs.resourcesStore.getById('USD')!,
			price: { ...catalogs.resourcesStore.getById('USD')!.price!, amountPerUnit: d('96') }
		})
		expect(Object.isFrozen((sent.data as ResourceDocumentData).resources[1].price)).toBe(true)
		expect(computeFingerprint(sent.data)).toBe(fingerprint)
		expect(store.activeDocument!.sync.localVersion).toBe(sent.localVersion + 1)
		expect(store.activeDocument!.sync.localFingerprint).not.toBe(fingerprint)
	})

	it('keeps visible edits after a storage failure and persists the full graph on retry', async () => {
		const { store, catalogs, saved, api } = setup()
		const original = localStorage.getItem('documentTabs')
		const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('Quota', 'QuotaExceededError')
		})
		catalogs.accountsStore.upsert({ ...catalogs.accountsStore.getById('card')!, name: 'Pending card' })
		expect(store.persistenceError).not.toBeNull()
		expect(await store.waitForLocalPersistence()).toBe(false)
		expect(saved().accounts[0].name).toBe('Pending card')
		expect(localStorage.getItem('documentTabs')).toBe(original)
		set.mockRestore()
		store.retryLocalPersistence()
		expect(await store.waitForLocalPersistence()).toBe(true)
		const restored = new DocumentTabsStore(api as any, persistence(), runtime)
		expect(await restored.restoreFromLocalStorage()).toBe(true)
		expect(restored.getDocumentDataForSave()).toEqual(saved())
	})

	it('exports/imports v4 as independent tabs and rejects it through the legacy route', () => {
		const { store, id, saved } = setup()
		const archive = store.exportLocalSession()
		const expected = saved()
		expect(store.importLocalSession(archive)).toBe(1)
		expect(store.activeDocumentId).not.toBe(id)
		expect(store.getDocumentDataForSave()).toEqual(expected)
		store.getActiveDocumentStores()!.resourceStores!.accountsStore.upsert({ ...expected.accounts[0], name: 'Copy' })
		expect(saved()).toEqual(expected)
		const legacy = new DocumentTabsStore({} as any)
		expect(() => legacy.importLocalSession(archive)).toThrow()
	})

	it('reads, writes and replaces the full resource graph through the selected Drive codec', async () => {
		const { store, api, updateRemote } = setup()
		expect((await store.openFromDrive('file')).status).toBe('opened')
		const id = store.activeDocumentId!
		const catalogs = store.getActiveDocumentStores()!.resourceStores!
		catalogs.accountsStore.upsert({ ...catalogs.accountsStore.getById('card')!, name: 'Saved to Drive' })
		expect((await store.saveDocument(id)).status).toBe('saved')
		const uploaded = JSON.parse(api.updateFileContent.mock.calls[0][1])
		expect(uploaded.schemaVersion).toBe(3)
		expect(uploaded.accounts[0].name).toBe('Saved to Drive')
		expect(uploaded.completedList[0].actualOperation.movements).toHaveLength(3)
		const remote = resourceDocument()
		remote.resources[1].name = 'Remote resource'
		updateRemote(remote)
		expect((await store.pullDocument(id)).status).toBe('pulled')
		expect(store.getDocumentDataForSave(id)).toEqual(parseResourceDocumentData(remote))
		expect(store.getDocumentStores(id)!.resourceStores).toBe(catalogs)
	})

	it('does not mark a later catalog edit saved by an older Drive response', async () => {
		const { store, api } = setup()
		expect((await store.openFromDrive('file')).status).toBe('opened')
		const id = store.activeDocumentId!
		const catalogs = store.getActiveDocumentStores()!.resourceStores!
		catalogs.accountsStore.upsert({ ...catalogs.accountsStore.getById('card')!, name: 'Sent' })
		const response = deferred<any>()
		api.updateFileContent.mockImplementationOnce(() => response.promise)
		const saving = store.saveDocument(id)
		for (let tick = 0; tick < 20 && !api.updateFileContent.mock.calls.length; tick++) await Promise.resolve()
		expect(api.updateFileContent).toHaveBeenCalledTimes(1)
		const sentVersion = store.activeDocument!.sync.localVersion
		catalogs.accountsStore.upsert({ ...catalogs.accountsStore.getById('card')!, name: 'Later' })
		response.resolve({ status: 'success', file: { id: 'file', name: 'Resource.json', version: '2' } })
		expect((await saving).status).toBe('saved')
		expect(store.activeDocument!.sync.baseLocalVersion).toBe(sentVersion)
		expect(store.activeDocument!.sync.localVersion).toBe(sentVersion + 1)
		expect((store.activeDocument!.data as ResourceDocumentData).accounts[0].name).toBe('Later')
	})
})
