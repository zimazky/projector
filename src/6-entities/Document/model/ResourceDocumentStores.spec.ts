import { autorun } from 'mobx'
import { resourceDocument } from 'src/test-utils/resourceDocument'
import { parseDecimal as d } from 'src/7-shared/libs/Decimal/Decimal'
import { DocumentStoreManager } from './DocumentStoreManager'
import { parseResourceDocumentData } from './ResourceDocumentFormat'
import type { ResourceDocumentData } from './ResourceDocument.types'

function setup() {
	const source = resourceDocument()
	const onDocumentChanged = jest.fn()
	const onEventsChanged = jest.fn()
	const onProjectsChanged = jest.fn()
	const manager = new DocumentStoreManager(
		{ activeDocumentId: 'a', getDocumentData: () => source },
		{ onDocumentChanged, onEventsChanged, onProjectsChanged },
		true
	)
	const stores = manager.createStores('a')
	const catalogs = stores.resourceStores!
	const saved = () => manager.getDocumentDataForSave('a') as ResourceDocumentData
	const edit = (change: (draft: ResourceDocumentData) => void) =>
		manager.editDocument('a', draft => change(draft as ResourceDocumentData))
	return { source, manager, stores, catalogs, saved, edit, onDocumentChanged, onEventsChanged, onProjectsChanged }
}

describe('Resource document stores', () => {
	it('initializes the entire graph without publishing an edit or retaining source references', () => {
		const { source, saved, onDocumentChanged } = setup()
		expect(saved()).toEqual(parseResourceDocumentData(source))
		expect(onDocumentChanged).not.toHaveBeenCalled()
		source.resources[0].name = 'Outside mutation'
		expect(saved().resources[0].name).toBe('Рубли')
	})

	it('exposes immutable catalogs and independent writable save snapshots', () => {
		const { catalogs, saved } = setup()
		expect(Object.isFrozen(catalogs.accountsStore.list)).toBe(true)
		expect(Object.isFrozen(catalogs.accountsStore.getById('card')!.allowedResourceIds)).toBe(true)
		const snapshot = saved()
		snapshot.accounts[0].allowedResourceIds.push('USD')
		snapshot.resources[0].price!.amountPerUnit = d('9')
		expect(saved().accounts[0].allowedResourceIds).toEqual(['RUB'])
		expect(saved().resources[0].price!.amountPerUnit).toBe('1')
	})

	it('keeps an empty catalog immutable before its first edit', () => {
		const { manager } = setup()
		const empty = parseResourceDocumentData(resourceDocument())
		empty.cashbackMonthSettings = []
		manager.updateStoresData('a', empty)
		expect(Object.isFrozen(manager.getStores('a')!.resourceStores!.cashbackMonthSettingsStore.list)).toBe(true)
	})

	it('publishes a resource rename without rebuilding events or changing the source graph', () => {
		const { catalogs, stores, source, saved, onDocumentChanged, onEventsChanged } = setup()
		const eventsVersion = stores.eventsStore.version
		const resourcesVersion = catalogs.resourcesStore.version
		const accountsVersion = catalogs.accountsStore.version
		const observed: string[] = []
		const stop = autorun(() => observed.push(catalogs.resourcesStore.getById('USD')!.name))
		catalogs.resourcesStore.upsert({ ...catalogs.resourcesStore.getById('USD')!, name: 'Доллары США' })
		stop()
		expect(observed).toEqual(['Доллары', 'Доллары США'])
		expect(stores.eventsStore.version).toBe(eventsVersion)
		expect(catalogs.resourcesStore.version).toBe(resourcesVersion + 1)
		expect(catalogs.accountsStore.version).toBe(accountsVersion)
		expect(saved().completedList).toEqual(parseResourceDocumentData(source).completedList)
		expect(source.resources[1].name).toBe('Доллары')
		expect(onDocumentChanged).toHaveBeenCalledTimes(1)
		expect(onEventsChanged).not.toHaveBeenCalled()
	})

	it('updates one account/month settings entry using its compound key', () => {
		const { catalogs, saved, onDocumentChanged } = setup()
		const settings = catalogs.cashbackMonthSettingsStore.list[0]
		catalogs.cashbackMonthSettingsStore.upsert({ ...settings, note: 'Уточнено', revision: 2 })
		expect(saved().cashbackMonthSettings).toHaveLength(1)
		expect(saved().cashbackMonthSettings![0].revision).toBe(2)
		catalogs.cashbackMonthSettingsStore.upsert({ ...settings, month: '2026-12' })
		expect(saved().cashbackMonthSettings).toHaveLength(2)
		expect(onDocumentChanged).toHaveBeenCalledTimes(2)
	})

	it('validates a compound edit once and publishes only the final graph', () => {
		const { edit, saved, onDocumentChanged, onEventsChanged, onProjectsChanged, catalogs } = setup()
		const snapshots: ResourceDocumentData[] = []
		onDocumentChanged.mockImplementation(() => snapshots.push(saved()))
		edit(draft => {
			draft.balanceCategories.push({
				id: 'new-account-category',
				name: 'Сбережения',
				dimension: 'account',
				includeInGrandTotal: false,
				showInSummary: true
			})
			draft.accounts[0].categoryId = 'new-account-category'
			draft.accounts[0].name = 'Основная карта'
			draft.resources[1].price!.amountPerUnit = d('95')
			draft.resources[1].price!.revision++
			draft.cashbackMonthSettings![0].note = 'Новые условия'
			draft.completedList[0].name = 'Новое название покупки'
		})
		expect(onDocumentChanged).toHaveBeenCalledTimes(1)
		expect(onEventsChanged).toHaveBeenCalledTimes(1)
		expect(onProjectsChanged).not.toHaveBeenCalled()
		expect(snapshots).toEqual([saved()])
		expect(catalogs.accountsStore.getById('card')!.categoryId).toBe('new-account-category')
		expect(snapshots[0].resources[1].price!.amountPerUnit).toBe('95')
	})

	it.each(['resources', 'accounts', 'units', 'balanceCategories', 'cashbackCategories'] as const)(
		'rejects removal of a referenced %s entry before changing any store',
		key => {
			const { edit, saved, catalogs, stores, onDocumentChanged } = setup()
			const before = saved()
			const version = catalogs.resourcesStore.version
			const eventsVersion = stores.eventsStore.version
			expect(() =>
				edit(draft => {
					draft.resources[1].name = 'Must roll back'
					draft[key] = []
				})
			).toThrow()
			expect(saved()).toEqual(before)
			expect(catalogs.resourcesStore.version).toBe(version)
			expect(stores.eventsStore.version).toBe(eventsVersion)
			expect(onDocumentChanged).not.toHaveBeenCalled()
		}
	)

	it('keeps the document intact when the edit callback throws or returns an async result', () => {
		const { edit, saved, onDocumentChanged } = setup()
		const before = saved()
		expect(() =>
			edit(draft => {
				draft.accounts[0].name = 'Changed'
				throw new Error('failure')
			})
		).toThrow('failure')
		expect(() =>
			edit(async draft => {
				draft.accounts[0].name = 'Changed'
			})
		).toThrow('synchronous')
		expect(saved()).toEqual(before)
		expect(onDocumentChanged).not.toHaveBeenCalled()
	})

	it('does not publish or increment catalog versions for a no-op', () => {
		const { catalogs, edit, onDocumentChanged } = setup()
		const version = catalogs.accountsStore.version
		catalogs.accountsStore.upsert(catalogs.accountsStore.getById('card')!)
		edit(() => {})
		expect(catalogs.accountsStore.version).toBe(version)
		expect(onDocumentChanged).not.toHaveBeenCalled()
	})

	it('replaces a validated remote graph in existing store instances without user publications', () => {
		const { manager, catalogs, saved, source, stores, onDocumentChanged } = setup()
		const next = parseResourceDocumentData(source)
		next.accounts[0].name = 'Remote card'
		next.resources[1].price!.amountPerUnit = d('98')
		next.balanceCategories[0].showInSummary = false
		next.cashbackMonthSettings![0].revision++
		next.completedList[0].name = 'Remote purchase'
		manager.updateStoresData('a', next)
		expect(manager.getStores('a')).toBe(stores)
		expect(manager.getStores('a')!.resourceStores).toBe(catalogs)
		expect(saved()).toEqual(parseResourceDocumentData(next))
		expect(onDocumentChanged).not.toHaveBeenCalled()
	})

	it('does not install any part of an invalid remote graph', () => {
		const { manager, saved, source } = setup()
		const before = saved()
		const next = parseResourceDocumentData(source)
		next.resources[0].name = 'Changed'
		next.accounts = []
		expect(() => manager.updateStoresData('a', next)).toThrow()
		expect(saved()).toEqual(before)
	})

	it.each(['remove', 'clear', 'dispose'])('detaches callbacks and rejects stale catalog writes after %s', operation => {
		const { manager, catalogs, stores, onDocumentChanged } = setup()
		if (operation === 'remove') manager.removeStores('a')
		else if (operation === 'clear') manager.clear()
		else manager.dispose()
		stores.projectsStore.add('Detached', 'red', 'blue')
		expect(() => catalogs.accountsStore.upsert({ ...catalogs.accountsStore.getById('card')!, name: 'Stale' })).toThrow(
			'disposed'
		)
		expect(stores.isInitialized).toBe(false)
		expect(onDocumentChanged).not.toHaveBeenCalled()
	})

	it('preserves absent optional catalogs and publishes newly added ones', () => {
		const { source, manager } = setup()
		delete source.cashbackCategories
		delete source.cashbackMonthSettings
		source.completedList = []
		source.plannedList = []
		source.priceHistory = []
		for (const resource of source.resources)
			if (resource.price) {
				delete resource.price.sourceEventUid
				delete resource.price.commandId
			}
		manager.updateStoresData('a', source)
		expect(manager.getDocumentDataForSave('a')).not.toHaveProperty('cashbackCategories')
		manager.getStores('a')!.resourceStores!.cashbackCategoriesStore.upsert({ id: 'new', name: 'Новая' })
		expect((manager.getDocumentDataForSave('a') as ResourceDocumentData).cashbackCategories).toEqual([
			{ id: 'new', name: 'Новая' }
		])
	})
})
