import { resourceDocument } from 'src/test-utils/resourceDocument'
import { ResourceDocumentPersistence } from './ResourceDocumentPersistence'
import { LocalDocumentPersistence } from './DocumentPersistence'
import { IndexedDocumentStorage } from './IndexedDocumentStorage'
import { parseResourceSessionSnapshot, serializeResourceSessionSnapshot } from './ResourceSessionFormat'
import {
	createResourceMigrationContext,
	parseResourceDocumentData,
	serializeResourceDocumentData
} from './ResourceDocumentFormat'
import { parseSessionSnapshot } from './DocumentSessionFormat'
import { createInitialSyncSnapshot, type DocumentTabsSnapshot } from './DocumentTabsStore.types'
import type { ResourceSessionSnapshot } from './ResourceDocument.types'
import { computeFingerprint } from './DocumentSyncFingerprint'
import { DocumentTabsStore } from './DocumentTabsStore'
import { legacySessionV1 } from 'src/test-utils/legacySession'
import { EventsStore } from '../../Events/EventsStore'
import { ProjectsStore } from '../../Projects/ProjectsStore'
import { DocumentStoreManager } from './DocumentStoreManager'

const context = (id: string) =>
	createResourceMigrationContext({
		id,
		currency: { code: 'RUB', scale: 2 },
		currencyConfirmed: true,
		asOf: '2026.11.01',
		timezone: 'Europe/Moscow'
	})

function snapshot(): ResourceSessionSnapshot {
	const data = parseResourceDocumentData(resourceDocument())
	const fp = computeFingerprint(data)
	return {
		schemaVersion: 4,
		savedAt: 10,
		activeDocumentId: 'a',
		documentOrder: ['a'],
		documents: [
			{
				id: 'a',
				ref: { fileId: 'file', name: 'Source', mimeType: 'application/json', parentFolderId: null, space: 'drive' },
				data,
				sync: {
					...createInitialSyncSnapshot('drive'),
					localFingerprint: fp,
					baseFingerprint: fp,
					remoteFingerprint: fp,
					baseLocalVersion: 0,
					baseRevisionId: '1',
					remoteRevisionId: '1',
					lastRemoteCheckAt: 10
				},
				lastAccessedAt: 10
			}
		]
	}
}
function oldSnapshot(): DocumentTabsSnapshot {
	const data = {
		projectsList: [],
		completedList: [],
		plannedList: [{ name: 'Old plan', start: '2026.11.01', debit: 10, projectId: 'default' }]
	}
	const fp = computeFingerprint(data)
	return {
		...snapshot(),
		schemaVersion: 3,
		documents: [
			{
				...snapshot().documents[0],
				data,
				sync: { ...snapshot().documents[0].sync, localFingerprint: fp, baseFingerprint: fp, remoteFingerprint: fp }
			}
		]
	}
}

describe('R03 resource session v4, conservative migration and storage boundaries', () => {
	beforeEach(() => localStorage.clear())
	afterEach(() => jest.restoreAllMocks())

	it('round-trips v4 with explicit document v3 and the complete graph', () => {
		const input = snapshot()
		const json = serializeResourceSessionSnapshot(input)
		expect(parseResourceSessionSnapshot(json)).toEqual(input)
		expect(JSON.parse(json).documents[0].data.schemaVersion).toBe(3)
		const restored = parseResourceSessionSnapshot(json)
		const events = new EventsStore(new ProjectsStore(), true)
		events.init(restored.documents[0].data)
		expect(events.prepareToSave().completedList).toEqual(input.documents[0].data.completedList)
	})

	it('keeps valid new base snapshots and clears unproved hashes or inconsistent versions', () => {
		for (const change of ['hash', 'old-json', 'different-context', 'contradictory-version']) {
			const input = snapshot()
			if (change === 'hash') input.documents[0].sync.baseFingerprint = 'abcd1234'
			if (change === 'old-json')
				input.documents[0].sync.baseFingerprint = oldSnapshot().documents[0].sync.baseFingerprint
			if (change === 'different-context') {
				const other = parseResourceDocumentData(resourceDocument())
				other.resources[0].name = 'Different'
				input.documents[0].sync.baseFingerprint = computeFingerprint(other)
			}
			if (change === 'contradictory-version') input.documents[0].sync.localFingerprint = 'invalid'
			const parsed = parseResourceSessionSnapshot(JSON.stringify(input))
			expect(parsed.documents[0].sync.baseLocalVersion).toBeNull()
			expect(parsed.documents[0].sync.baseFingerprint).toBeNull()
			expect(parsed.documents[0].sync.needsRemoteCheck).toBe(true)
			expect(parsed.documents[0].sync.lastRemoteCheckAt).toBeNull()
		}
	})

	it('does not infer a known base from an equal fingerprint when baseLocalVersion is null', () => {
		const input = snapshot()
		input.documents[0].sync.baseLocalVersion = null
		const parsed = parseResourceSessionSnapshot(JSON.stringify(input))
		expect(parsed.documents[0].sync.baseLocalVersion).toBeNull()
		expect(parsed.documents[0].sync.baseFingerprint).toBeNull()
	})

	it.each([1, 2, 3])('migrates session v%s with unknown resource base, stable context and intact original', version => {
		const source = version === 1 ? legacySessionV1(oldSnapshot()) : { ...oldSnapshot(), schemaVersion: version }
		const json = JSON.stringify(source)
		const parsed = parseResourceSessionSnapshot(json, () => null, context)
		expect(JSON.stringify(source)).toBe(json)
		expect(parsed.documents[0].data.migration!.contextId).toBe('a')
		expect(parsed.documents[0].data.plannedList[0].plannedOperation!.movements[0].quantity).toBe('-10')
		expect(parsed.documents[0].sync.baseLocalVersion).toBeNull()
		expect(parsed.documents[0].sync.baseFingerprint).toBeNull()
		expect(parsed.documents[0].sync.remoteFingerprint).toBeNull()
		expect(parsed.documents[0].sync.needsRemoteCheck).toBe(true)
		expect(parseResourceSessionSnapshot(json, () => null, context)).toEqual(parsed)
		expect(parseResourceSessionSnapshot(serializeResourceSessionSnapshot(parsed))).toEqual(parsed)
	})

	it('migrates a split legacy session through the existing legacy project normalization', () => {
		const source: any = legacySessionV1(oldSnapshot())
		delete source.schemaVersion
		const content = JSON.stringify({
			savedAt: 10,
			data: {
				projectsList: [],
				completedList: [],
				plannedList: [{ name: 'Recovered project', project: 'Recovered', start: '2026.11.01', debit: 1 }]
			}
		})
		delete source.documents[0].data
		const read = jest.fn().mockReturnValue(content)
		const result = parseResourceSessionSnapshot(JSON.stringify(source), read, context)
		expect(read).toHaveBeenCalledWith('a')
		expect(result.documents[0].data.projectsList[0].name).toBe('Recovered')
	})

	it('requires context for old sessions and explicit nested version in v4', () => {
		expect(() => parseResourceSessionSnapshot(JSON.stringify(oldSnapshot()))).toThrow()
		const input: any = snapshot()
		delete input.documents[0].data.schemaVersion
		expect(() => parseResourceSessionSnapshot(JSON.stringify(input), () => null, context)).toThrow('явная')
		input.documents[0].data.schemaVersion = 2
		expect(() => parseResourceSessionSnapshot(JSON.stringify(input), () => null, context)).toThrow()
	})

	it('does not reinterpret unknown versions or silently discard new envelope fields', () => {
		for (const change of [
			'session',
			'document',
			'root-field',
			'entry-field',
			'sync-field',
			'ref-field',
			'graph',
			'order'
		]) {
			const input: any = snapshot()
			if (change === 'session') input.schemaVersion = 5
			if (change === 'document') input.documents[0].data.schemaVersion = 4
			if (change === 'root-field') input.extra = 1
			if (change === 'entry-field') input.documents[0].extra = 1
			if (change === 'sync-field') input.documents[0].sync.extra = 1
			if (change === 'ref-field') input.documents[0].ref.extra = 1
			if (change === 'graph') input.documents[0].data.accounts[0].allowedResourceIds = ['missing']
			if (change === 'order') input.documentOrder = ['missing']
			expect(() => parseResourceSessionSnapshot(JSON.stringify(input))).toThrow()
		}
	})

	it('rejects new documents/sessions on every active public route without replacing current state', async () => {
		const store = new DocumentTabsStore({} as any)
		store.openNewDocument('Keep')
		const original = store.activeDocument
		const input = serializeResourceSessionSnapshot(snapshot())
		expect(() => parseSessionSnapshot(input, () => null)).toThrow()
		expect(() => store.importLocalSession(input)).toThrow()
		expect(store.activeDocument).toBe(original)
		localStorage.setItem('documentTabs', input)
		expect(() =>
			new LocalDocumentPersistence(
				() => localStorage,
				() => undefined
			).load()
		).toThrow()
		expect(localStorage.getItem('documentTabs')).toBe(input)
	})

	it.each(['create', 'replace'])('stops a resource graph before legacy store %s can lose its catalogs', operation => {
		const empty = { projectsList: [], completedList: [], plannedList: [] }
		const data = resourceDocument()
		const manager = new DocumentStoreManager({
			activeDocumentId: 'a',
			getDocumentData: () => (operation === 'create' ? data : empty)
		})
		if (operation === 'create') {
			expect(() => manager.createStores('a')).toThrow('справочники')
			expect(manager.storesCount).toBe(0)
		} else {
			manager.createStores('a')
			expect(() => manager.updateStoresData('a', data)).toThrow('справочники')
			expect(manager.getDocumentDataForSave('a')).toEqual(empty)
		}
	})

	it('backs up a legacy local snapshot before first v4 write, and reloads all resources', () => {
		const original = JSON.stringify(oldSnapshot())
		localStorage.setItem('documentTabs', original)
		const persistence = new ResourceDocumentPersistence(
			context,
			() => localStorage,
			() => undefined
		)
		const migrated = persistence.load() as ResourceSessionSnapshot
		expect(localStorage.getItem('documentTabs')).toBe(original)
		persistence.save(migrated)
		expect(JSON.parse(localStorage.getItem('documentTabs.backup.0')!).documentTabs).toBe(original)
		expect(persistence.load()).toEqual(migrated)
		persistence.save(snapshot())
		expect(persistence.load()).toEqual(snapshot())
	})

	it('keeps source storage unchanged when currency is unconfirmed or backup writing fails', () => {
		const original = JSON.stringify(oldSnapshot())
		localStorage.setItem('documentTabs', original)
		const persistence = new ResourceDocumentPersistence(
			id => ({ ...context(id), currencyConfirmed: false }),
			() => localStorage,
			() => undefined
		)
		const migrated = persistence.load() as ResourceSessionSnapshot
		expect(() => persistence.save(migrated)).toThrow()
		expect(localStorage.getItem('documentTabs')).toBe(original)
		const confirmed = new ResourceDocumentPersistence(
			context,
			() => localStorage,
			() => undefined
		)
		const data = confirmed.load() as ResourceSessionSnapshot
		jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
			throw new DOMException('Quota', 'QuotaExceededError')
		})
		expect(() => confirmed.save(data)).toThrow()
		expect(localStorage.getItem('documentTabs')).toBe(original)
	})

	it('uses the same indexed queue and backup transaction for v4 without losing resource fields', async () => {
		let current: string | undefined = JSON.stringify(oldSnapshot())
		const original = current
		const backups: string[] = []
		jest.spyOn(IndexedDocumentStorage.prototype, 'read').mockImplementation(async () => current)
		const write = jest.spyOn(IndexedDocumentStorage.prototype, 'write').mockImplementation(async (json, backup) => {
			if (backup) backups.push(backup)
			current = json
		})
		const persistence = new ResourceDocumentPersistence(
			context,
			() => localStorage,
			() => ({}) as IDBFactory
		)
		const converted = await persistence.load()
		expect(current).toBe(original)
		await persistence.save(converted!)
		expect(JSON.parse(backups[0]).indexedDB.current).toBe(original)
		await persistence.save(snapshot())
		expect(await persistence.load()).toEqual(snapshot())
		expect(write).toHaveBeenCalledTimes(2)
		expect(JSON.parse(current!).documents[0].data.cashbackMonthSettings).toHaveLength(1)
	})

	it('retains an unreadable future indexed source and does not try to overwrite it', async () => {
		const source = JSON.stringify({ ...snapshot(), schemaVersion: 99 })
		jest.spyOn(IndexedDocumentStorage.prototype, 'read').mockResolvedValue(source)
		const write = jest.spyOn(IndexedDocumentStorage.prototype, 'write').mockResolvedValue()
		jest.spyOn(IndexedDocumentStorage.prototype, 'export').mockResolvedValue({ current: source, recovery: [] } as any)
		const persistence = new ResourceDocumentPersistence(
			context,
			() => localStorage,
			() => ({}) as IDBFactory
		)
		await expect(persistence.load()).rejects.toThrow()
		expect(write).not.toHaveBeenCalled()
		expect(await persistence.exportSource()).toContain('99')
	})

	it('archives old local entries only after checking the v4 graph inside the indexed transaction', async () => {
		const current = serializeResourceSessionSnapshot(snapshot())
		const old = JSON.stringify(oldSnapshot())
		localStorage.setItem('documentTabs', old)
		jest.spyOn(IndexedDocumentStorage.prototype, 'read').mockResolvedValue(current)
		const archives: string[] = []
		jest.spyOn(IndexedDocumentStorage.prototype, 'archiveLegacy').mockImplementation(async (archive, validate) => {
			validate(current)
			archives.push(archive)
		})
		const persistence = new ResourceDocumentPersistence(
			context,
			() => localStorage,
			() => ({}) as IDBFactory
		)
		const result = await persistence.cleanupLegacy()
		expect(result.removedEntries).toBe(1)
		expect(JSON.parse(archives[0]).entries.documentTabs).toBe(old)
		expect(localStorage.getItem('documentTabs')).toBeNull()
	})

	it('does not save an unconfirmed migrated document even through document export', () => {
		const input = parseResourceSessionSnapshot(
			JSON.stringify(oldSnapshot()),
			() => null,
			id => ({ ...context(id), currencyConfirmed: false })
		)
		expect(() => serializeResourceSessionSnapshot(input)).toThrow('подтвердите')
		expect(() => serializeResourceDocumentData(input.documents[0].data)).toThrow('подтвердите')
	})
})
