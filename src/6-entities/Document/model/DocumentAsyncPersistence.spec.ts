import { DocumentTabsStore } from './DocumentTabsStore'
import type { DocumentPersistence } from './DocumentPersistence'
import { deferred } from 'src/test-utils/deferred'
import type { DocumentTabsSnapshot } from './DocumentTabsStore.types'

function setup(overrides: Partial<DocumentPersistence> = {}) {
	const persistence: DocumentPersistence = {
		load: () => null,
		save: () => {},
		exportSource: () => '{}',
		clear: () => {},
		...overrides
	}
	return new DocumentTabsStore({} as any, persistence)
}

describe('Асинхронное локальное хранилище', () => {
	beforeEach(() => localStorage.clear())

	it('поздняя ошибка предыдущей записи не отменяет успешную новую запись', async () => {
		const old = deferred<void>(),
			latest = deferred<void>()
		const save = jest.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
		const store = setup({ save })
		store.openNewDocument()
		store.activeProjectsStore!.add('Latest', 'black', 'white')
		expect(store.isPersistingLocalSession).toBe(true)
		latest.resolve()
		expect(await store.waitForLocalPersistence()).toBe(true)
		old.reject(new DOMException('Quota', 'QuotaExceededError'))
		await Promise.resolve()
		expect(store.persistenceError).toBeNull()
		expect(store.isPersistingLocalSession).toBe(false)
		expect(store.exportLocalSession()).toContain('Latest')
	})

	it('подтверждение ранней записи не снимает ожидание или ошибку последней', async () => {
		const old = deferred<void>(),
			latest = deferred<void>()
		const store = setup({ save: jest.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise) })
		store.openNewDocument()
		store.activeProjectsStore!.add('Latest', 'black', 'white')
		old.resolve()
		await Promise.resolve()
		expect(store.isPersistingLocalSession).toBe(true)
		latest.reject(new DOMException('Quota', 'QuotaExceededError'))
		expect(await store.waitForLocalPersistence()).toBe(false)
		expect(store.persistenceDiagnostic?.reason).toBe('quota')
		expect(store.exportLocalSession()).toContain('Latest')
	})

	it('сброс не получает позднюю ошибку старого сохранения', async () => {
		const saving = deferred<void>()
		const store = setup({ save: () => saving.promise })
		store.openNewDocument()
		store.clear()
		saving.reject(new Error('Late failure'))
		await Promise.resolve()
		expect(store.documents).toHaveLength(0)
		expect(store.persistenceError).toBeNull()
		expect(store.isPersistingLocalSession).toBe(false)
	})

	it('восстановление блокирует открытие новых документов до проверки источника', async () => {
		const source = new DocumentTabsStore({} as any)
		source.openNewDocument('Original')
		const snapshot = JSON.parse(source.exportLocalSession()) as DocumentTabsSnapshot
		const loading = deferred<DocumentTabsSnapshot | null>()
		const save = jest.fn().mockResolvedValue(undefined)
		const store = setup({ load: () => loading.promise, save })
		const restoring = store.restoreFromLocalStorage()
		expect(store.isRestoringLocalSession).toBe(true)
		store.openNewDocument('Must wait')
		expect(store.documents).toHaveLength(0)
		expect(await store.openFromDrive('file')).toEqual({ status: 'cancelled' })
		loading.resolve(snapshot)
		expect(await restoring).toBe(true)
		expect(store.isRestoringLocalSession).toBe(false)
		expect(store.activeDocument!.ref!.name).toBe('Original')
		expect(save).toHaveBeenCalledTimes(1)
		expect(await store.waitForLocalPersistence()).toBe(true)
	})

	it('сброс отменяет поздний результат восстановления', async () => {
		const source = new DocumentTabsStore({} as any)
		source.openNewDocument('Old')
		const loading = deferred<DocumentTabsSnapshot | null>()
		const store = setup({ load: () => loading.promise })
		const restoring = store.restoreFromLocalStorage()
		store.clear()
		store.openNewDocument('New')
		loading.resolve(JSON.parse(source.exportLocalSession()))
		expect(await restoring).toBe(false)
		expect(store.activeDocument!.ref!.name).toBe('New')
		expect(store.isRestoringLocalSession).toBe(false)
	})

	it('отсутствие сессии снимает блокировку после чтения IndexedDB', async () => {
		const store = setup({ load: async () => null })
		expect(await store.restoreFromLocalStorage()).toBe(false)
		store.openNewDocument('Allowed')
		expect(store.activeDocument!.ref!.name).toBe('Allowed')
		expect(store.canPersistLocalSession).toBe(true)
	})

	it('экспортированная сессия добавляется без удаления текущих вкладок', () => {
		const exported = setup()
		exported.openNewDocument('From export')
		exported.activeProjectsStore!.add('Last edit', 'black', 'white')
		const store = setup()
		store.openNewDocument('Existing')
		store.activeProjectsStore!.add('Keep me', 'black', 'white')
		expect(store.importLocalSession(exported.exportLocalSession())).toBe(1)
		expect(store.documents).toHaveLength(2)
		expect(store.documents[0].ref!.name).toBe('Existing')
		expect(store.getDocumentStores(store.documents[0].id)!.projectsStore.exists('Keep me')).toBe(true)
		expect(store.activeDocument!.ref!.name).toBe('From export (восстановлено)')
		expect(store.activeProjectsStore!.exists('Last edit')).toBe(true)
		expect(new Set(store.documents.map(document => document.id)).size).toBe(2)
	})

	it('невалидный архив не заменяет открытые вкладки или их сторы', () => {
		const store = setup()
		store.openNewDocument('Keep')
		const original = store.activeDocument
		const stores = store.getActiveDocumentStores()
		expect(() => store.importLocalSession('{"schemaVersion":1}')).toThrow()
		expect(store.activeDocument).toBe(original)
		expect(store.getActiveDocumentStores()).toBe(stores)
	})

	it('очистка ждёт подтверждения последней записи и дедуплицирует нажатия', async () => {
		const saved = deferred<void>(),
			archived = deferred<any>()
		const cleanupLegacy = jest.fn(() => archived.promise)
		const store = setup({ save: () => saved.promise, cleanupLegacy })
		store.openNewDocument()
		const first = store.cleanupLegacyLocalStorage()
		expect(store.cleanupLegacyLocalStorage()).toBe(first)
		expect(store.isCleaningLegacyStorage).toBe(true)
		expect(cleanupLegacy).not.toHaveBeenCalled()
		saved.resolve()
		await Promise.resolve()
		await Promise.resolve()
		await Promise.resolve()
		expect(cleanupLegacy).toHaveBeenCalledTimes(1)
		archived.resolve({ archivedEntries: 1, removedEntries: 1, changedEntries: 0, failedEntries: 0, freedBytes: 100 })
		await first
		expect(store.isCleaningLegacyStorage).toBe(false)
	})

	it('ошибка текущей записи запрещает очистку', async () => {
		const cleanupLegacy = jest.fn()
		const store = setup({
			save: async () => {
				throw new Error('Cannot save')
			},
			cleanupLegacy
		})
		store.openNewDocument()
		await expect(store.cleanupLegacyLocalStorage()).rejects.toThrow('Локальная сессия не сохранена')
		expect(cleanupLegacy).not.toHaveBeenCalled()
		expect(store.isCleaningLegacyStorage).toBe(false)
	})
})
