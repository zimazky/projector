import { cleanupLegacyStorage, isLegacyDocumentKey } from './DocumentStorageCleanup'
import { deferred } from 'src/test-utils/deferred'

const current = JSON.stringify({
	schemaVersion: 1,
	documents: [],
	documentOrder: [],
	activeDocumentId: null,
	savedAt: 0
})
function database() {
	const archives: string[] = []
	return {
		archives,
		read: jest.fn(async () => current),
		archiveLegacy: jest.fn(async (archive: string, validate: (value: string | undefined) => void) => {
			validate(current)
			archives.push(archive)
		})
	}
}

describe('Архивирование и очистка прежнего localStorage', () => {
	beforeEach(() => localStorage.clear())
	afterEach(() => jest.restoreAllMocks())

	it('архивирует все поколения хранения и удаляет только их, сохраняя остальные записи', async () => {
		const old = {
			data: 'old data',
			'data.json': 'Drive ID',
			lastOpenedDocument: 'old ref',
			documentTabs: 'old tabs',
			document_doc_123_abc: 'empty document',
			'documentTabs.backup.0': 'old backup'
		}
		for (const [key, value] of Object.entries(old)) localStorage.setItem(key, value)
		localStorage.setItem('weather', 'keep')
		localStorage.setItem('documentTabs.backup.notes', 'not our numbered backup')
		const db = database()
		const result = await cleanupLegacyStorage(localStorage, db)
		expect(JSON.parse(db.archives[0])).toMatchObject({ kind: 'localStorage-cleanup', entries: old })
		expect(result).toMatchObject({ archivedEntries: 6, removedEntries: 6, changedEntries: 0, failedEntries: 0 })
		expect(result.freedBytes).toBe(
			Object.entries(old).reduce((sum, [key, value]) => sum + (key.length + value.length) * 2, 0)
		)
		for (const key of Object.keys(old)) expect(localStorage.getItem(key)).toBeNull()
		expect(localStorage.getItem('weather')).toBe('keep')
		expect(localStorage.getItem('documentTabs.backup.notes')).toBe('not our numbered backup')
		expect(db.read).toHaveBeenCalledTimes(1)
	})

	it('до подтверждения архива ничего не удаляет', async () => {
		localStorage.setItem('data', 'original')
		const committed = deferred<void>()
		const db = database()
		db.archiveLegacy.mockImplementation(async (_archive, validate) => {
			validate(current)
			await committed.promise
		})
		const cleanup = cleanupLegacyStorage(localStorage, db)
		await Promise.resolve()
		expect(localStorage.getItem('data')).toBe('original')
		committed.resolve()
		expect((await cleanup).removedEntries).toBe(1)
	})

	it('отказ архива не удаляет исходники', async () => {
		localStorage.setItem('data', 'original')
		const db = database()
		db.archiveLegacy.mockRejectedValue(new DOMException('Quota', 'QuotaExceededError'))
		await expect(cleanupLegacyStorage(localStorage, db)).rejects.toThrow('Quota')
		expect(localStorage.getItem('data')).toBe('original')
	})

	test.each([undefined, '{}', '{'])('без проверенной сессии IndexedDB не удаляет данные: %s', async value => {
		localStorage.setItem('data', 'original')
		const db = database()
		db.read.mockResolvedValue(value as any)
		await expect(cleanupLegacyStorage(localStorage, db)).rejects.toThrow()
		expect(db.archiveLegacy).not.toHaveBeenCalled()
		expect(localStorage.getItem('data')).toBe('original')
	})

	it('повторно проверяет current в транзакции архива', async () => {
		localStorage.setItem('data', 'original')
		const db = database()
		db.archiveLegacy.mockImplementation(async (_archive, validate) => validate(undefined))
		await expect(cleanupLegacyStorage(localStorage, db)).rejects.toThrow('Сначала дождитесь сохранения')
		expect(localStorage.getItem('data')).toBe('original')
	})

	it('оставляет изменившуюся запись и новые ключи, появившиеся во время архивации', async () => {
		localStorage.setItem('data', 'before')
		localStorage.setItem('documentTabs', 'unchanged')
		const db = database()
		db.archiveLegacy.mockImplementation(async (archive, validate) => {
			validate(current)
			db.archives.push(archive)
			localStorage.setItem('data', 'concurrent edit')
			localStorage.setItem('document_new', 'new')
		})
		const result = await cleanupLegacyStorage(localStorage, db)
		expect(result).toMatchObject({ archivedEntries: 2, removedEntries: 1, changedEntries: 1 })
		expect(JSON.parse(db.archives[0]).entries.data).toBe('before')
		expect(localStorage.getItem('data')).toBe('concurrent edit')
		expect(localStorage.getItem('document_new')).toBe('new')
	})

	it('частичный отказ удаления сохраняет архив и допускает повтор', async () => {
		localStorage.setItem('data', 'a')
		localStorage.setItem('documentTabs', 'b')
		const remove = Storage.prototype.removeItem
		const spy = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
			if (key === 'data') throw new DOMException('Denied', 'SecurityError')
			remove.call(this, key)
		})
		const db = database()
		expect(await cleanupLegacyStorage(localStorage, db)).toMatchObject({
			archivedEntries: 2,
			removedEntries: 1,
			failedEntries: 1
		})
		expect(localStorage.getItem('data')).toBe('a')
		expect(JSON.parse(db.archives[0]).entries).toEqual({ data: 'a', documentTabs: 'b' })
		spy.mockRestore()
		expect((await cleanupLegacyStorage(localStorage, db)).removedEntries).toBe(1)
		expect((await cleanupLegacyStorage(localStorage, db)).archivedEntries).toBe(0)
		expect(db.archives).toHaveLength(2)
	})

	it('не создаёт новые архивы при повторе после полной очистки', async () => {
		const db = database()
		localStorage.setItem('theme', 'dark')
		expect((await cleanupLegacyStorage(localStorage, db)).removedEntries).toBe(0)
		expect(db.archiveLegacy).not.toHaveBeenCalled()
		expect(isLegacyDocumentKey('document')).toBe(false)
	})
})
