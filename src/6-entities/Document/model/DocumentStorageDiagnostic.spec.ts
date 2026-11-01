import { LocalDocumentPersistence } from './DocumentPersistence'
import { DocumentTabsStore } from './DocumentTabsStore'
import { DocumentPersistenceError, storageDiagnostic } from './DocumentStorageDiagnostic'
import type { DocumentTabsSnapshot } from './DocumentTabsStore.types'

describe('Диагностика локального сохранения', () => {
	beforeEach(() => localStorage.clear())
	afterEach(() => jest.restoreAllMocks())

	test.each([
		['QuotaExceededError', 'quota'],
		['NS_ERROR_DOM_QUOTA_REACHED', 'quota'],
		['SecurityError', 'access-denied'],
		['NotAllowedError', 'access-denied'],
		['Error', 'unknown']
	] as const)('различает %s', (name, reason) => {
		const error = new Error('Synthetic error')
		error.name = name
		expect(storageDiagnostic(error)).toMatchObject({ errorName: name, reason })
	})

	it('считает категории хранилища без содержимого и имён документов в результате', () => {
		localStorage.setItem('documentTabs', 'CURRENT_PRIVATE')
		localStorage.setItem('document_private-file-name', 'LEGACY_PRIVATE')
		localStorage.setItem('documentTabs.backup.0', 'BACKUP_PRIVATE')
		localStorage.setItem('unrelated', 'OTHER_PRIVATE')
		const diagnostic = storageDiagnostic(
			new DOMException('Quota', 'QuotaExceededError'),
			'session-write',
			'NEW_PRIVATE',
			localStorage
		)
		expect(diagnostic.groups.map(group => group.group)).toEqual(
			expect.arrayContaining(['session', 'legacy', 'backups', 'other'])
		)
		expect(diagnostic.groups.every(group => group.entries === 1)).toBe(true)
		expect(diagnostic.storedBytes).toBe(diagnostic.groups.reduce((sum, group) => sum + group.bytes, 0))
		expect(diagnostic.attemptedBytes).toBe('NEW_PRIVATE'.length * 2)
		expect(JSON.stringify(diagnostic)).not.toContain('PRIVATE')
		expect(JSON.stringify(diagnostic)).not.toContain('private-file-name')
	})

	it('ошибка чтения объёма не скрывает исходное превышение квоты', () => {
		const error = new DOMException('Quota', 'QuotaExceededError')
		const storage = {
			setItem: () => {
				throw error
			},
			get length() {
				throw new Error('Cannot inspect')
			}
		} as unknown as Storage
		const persistence = new LocalDocumentPersistence(() => storage)
		try {
			persistence.save({ schemaVersion: 1, documents: [] } as unknown as DocumentTabsSnapshot)
			throw new Error('Expected failure')
		} catch (failure) {
			expect(failure).toBeInstanceOf(DocumentPersistenceError)
			expect((failure as DocumentPersistenceError).cause).toBe(error)
			expect(storageDiagnostic(failure)).toMatchObject({
				reason: 'quota',
				operation: 'session-write',
				storedBytes: null
			})
		}
	})

	it('ошибку сериализации отличает от квоты и не обращается к Storage', () => {
		const storage = jest.fn()
		const snapshot = { schemaVersion: 1 } as any
		snapshot.self = snapshot
		const persistence = new LocalDocumentPersistence(storage)
		try {
			persistence.save(snapshot)
			throw new Error('Expected failure')
		} catch (failure) {
			expect(storageDiagnostic(failure)).toMatchObject({
				reason: 'serialization',
				operation: 'serialize',
				attemptedBytes: null
			})
		}
		expect(storage).not.toHaveBeenCalled()
	})

	it('запрет доступа показывает SecurityError и оставляет документ в памяти', () => {
		const persistence = new LocalDocumentPersistence(() => {
			throw new DOMException('Denied', 'SecurityError')
		})
		const tabs = new DocumentTabsStore({} as any, persistence)
		tabs.openNewDocument('In memory')
		expect(tabs.persistenceError).toContain('Браузер запретил доступ')
		expect(tabs.persistenceDiagnostic).toMatchObject({
			reason: 'access-denied',
			operation: 'access',
			errorName: 'SecurityError',
			storedBytes: null
		})
		expect(tabs.documents).toHaveLength(1)
	})
})
