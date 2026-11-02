import { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'
import { ResourceDocumentPersistence } from 'src/6-entities/Document/model/ResourceDocumentPersistence'
import { createResourceDocumentRuntime } from 'src/6-entities/Document/model/ResourceDocumentRuntime'
import type { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { resourceBalanceDocument, balancePlan } from 'src/test-utils/resourceBalanceDocument'
import { ResourceCatalogEditor } from './ResourceCatalogEditor'

const runtime = createResourceDocumentRuntime({
	id: 'catalog-test',
	currency: { code: 'RUB', scale: 2 },
	currencyConfirmed: true,
	asOf: '2026.11.01',
	timezone: 'Europe/Moscow'
})
let tabs: DocumentTabsStore
let id: string
const editor = () => new ResourceCatalogEditor(tabs, id)
beforeEach(() => {
	localStorage.clear()
	tabs = new DocumentTabsStore(
		{} as GoogleApiService,
		new ResourceDocumentPersistence(
			undefined,
			() => localStorage,
			() => undefined
		),
		runtime
	)
	tabs.openNewDocument('A')
	id = tabs.activeDocumentId!
	tabs.applyContentToDocument(id, resourceBalanceDocument())
})
afterEach(() => tabs.dispose())

it('rename preserves IDs, movements and events-store version', () => {
	const form = editor(),
		data = form.data
	const version = tabs.getDocumentStores(id)!.eventsStore.version
	form.save({ kind: 'account', value: { ...data.accounts[0], name: 'Новое имя' } })
	const saved = editor().data
	expect(saved.accounts[0].id).toBe(data.accounts[0].id)
	expect(saved.accounts[0].name).toBe('Новое имя')
	expect(saved.completedList).toEqual(data.completedList)
	expect(tabs.getDocumentStores(id)!.eventsStore.version).toBe(version)
})

it('switching to B retains the original document address', () => {
	const form = editor(),
		account = form.data.accounts[0]
	tabs.openNewDocument('B')
	const b = tabs.activeDocumentId!,
		before = tabs.getDocumentDataForSave(b)
	form.save({ kind: 'account', value: { ...account, name: 'Только A' } })
	expect(editor().data.accounts[0].name).toBe('Только A')
	expect(tabs.getDocumentDataForSave(b)).toEqual(before)
})

it.each(['close', 'replace', 'edit'] as const)('rejects stale form after %s', action => {
	const form = editor(),
		account = form.data.accounts[0]
	if (action === 'close') tabs.closeDocument(id)
	else if (action === 'replace') tabs.applyContentToDocument(id, resourceBalanceDocument())
	else tabs.getDocumentStores(id)!.resourceStores!.accountsStore.upsert({ ...account, name: 'Другой редактор' })
	expect(() => form.save({ kind: 'account', value: { ...account, name: 'Устарело' } })).toThrow('Откройте форму заново')
})

it('regrouping warns without publishing; save keeps history references', () => {
	const form = editor(),
		before = form.data
	form.save({ kind: 'category', value: { ...before.balanceCategories[0], id: 'another', name: 'Другая' } })
	const next = editor(),
		account = next.data.accounts[0]
	const version = tabs.activeDocument!.sync.localVersion
	expect(next.preview({ kind: 'account', value: { ...account, categoryId: 'another' } })).toContain(
		'Смена категории перегруппирует всю историю и прогноз этого элемента.'
	)
	expect(tabs.activeDocument!.sync.localVersion).toBe(version)
	expect(next.data.accounts[0].categoryId).toBe(account.categoryId)
})

it.each(['account', 'resource'] as const)('archive of %s warns about plans without compatible active account', kind => {
	const data = editor().data
	data.plannedList = [balancePlan('plan', '2026.11.10', 'RUB', '-10', { kind: 'account', accountId: 'card' })]
	tabs.applyContentToDocument(id, data)
	const form = editor()
	const change =
		kind === 'account'
			? { kind, value: { ...form.data.accounts.find(row => row.id === 'card')!, archived: true } }
			: { kind, value: { ...form.data.resources.find(row => row.id === 'RUB')!, archived: true } }
	expect(form.preview(change)).toEqual([expect.stringContaining('нет подходящего активного счёта')])
	form.save(change)
	expect(editor().data.plannedList[0].eventUid).toBe('plan')
})

it('category plan loses its last eligible account when that account is moved', () => {
	const data = editor().data
	data.balanceCategories.push({ ...data.balanceCategories[0], id: 'new', name: 'Новая' })
	data.plannedList = [
		balancePlan('fuel-plan', '2026.11.10', 'fuel', '-10', { kind: 'account-category', categoryId: 'everyday' })
	]
	tabs.applyContentToDocument(id, data)
	const form = editor()
	expect(
		form.preview({ kind: 'account', value: { ...data.accounts.find(row => row.id === 'tank')!, categoryId: 'new' } })
	).toEqual([expect.stringContaining('перегруппирует'), expect.stringContaining('fuel-plan')])
})

it('invalid reference fails atomically', () => {
	const form = editor(),
		before = form.data
	expect(() => form.save({ kind: 'resource', value: { ...before.resources[0], unitId: 'missing' } })).toThrow()
	expect(editor().data).toEqual(before)
})

it('unit cannot lose precision used by history', () => {
	editor().balance('opening', 'card', 'RUB', '0.01', '2026.11.01')
	const form = editor(),
		before = form.data
	expect(() => form.save({ kind: 'unit', value: { ...before.units[0], scale: 0 } })).toThrow()
	expect(editor().data).toEqual(before)
})

it('manual price uses the command journal and keeps an exact decimal', () => {
	const form = editor()
	form.price('USD', '95,123456789012345678', 'RUB', '2026.11.01')
	const data = editor().data
	expect(data.resources.find(row => row.id === 'USD')!.price).toMatchObject({
		amountPerUnit: '95.123456789012345678',
		commandId: form.commandId,
		revision: 1
	})
	expect(data.priceHistory.at(-1)!.commandId).toBe(form.commandId)
})

it('opening and signed correction are separate operations without overwriting history', () => {
	editor().balance('opening', 'card', 'RUB', '100,25', '2026.11.01')
	editor().balance('adjustment', 'card', 'RUB', '-0.05', '2026.11.02')
	const events = editor().data.completedList
	expect(events.map(row => row.actualOperation!.kind)).toEqual(['opening', 'adjustment'])
	expect(events.map(row => row.actualOperation!.movements[0].quantity)).toEqual(['100.25', '-0.05'])
})

it.each(['0.001', '9007199254740993.001', '1e5'])('rejects incompatible quantity %s without publishing', quantity => {
	const form = editor(),
		before = form.data
	expect(() => form.balance('opening', 'card', 'RUB', quantity, '2026.11.01')).toThrow()
	expect(editor().data).toEqual(before)
})

it('bonus resource and account need no monetary price and can be excluded', () => {
	const form = editor()
	form.save({
		kind: 'resource',
		value: {
			id: 'bonus-new',
			name: 'Программа',
			kind: 'bonus',
			unitId: 'point',
			categoryId: 'materials',
			archived: false
		}
	})
	editor().save({
		kind: 'account',
		value: {
			id: 'bonus-new-account',
			name: 'Бонусный счёт',
			categoryId: 'everyday',
			allowedResourceIds: ['bonus-new'],
			archived: false
		}
	})
	expect(editor().data.resources.find(row => row.id === 'bonus-new')!.price).toBeUndefined()
	expect(editor().data.balanceCategories.find(row => row.id === 'materials')!.includeInGrandTotal).toBe(false)
})
