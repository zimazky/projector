import { parseSessionSnapshot, SESSION_SCHEMA_VERSION } from './DocumentSessionFormat'
import type { DocumentTabsSnapshot } from './DocumentTabsStore.types'
import { DocumentPersistenceError, type StorageOperation } from './DocumentStorageDiagnostic'
import { IndexedDocumentStorage } from './IndexedDocumentStorage'
import { cleanupLegacyStorage, isLegacyDocumentKey, type LegacyStorageCleanupResult } from './DocumentStorageCleanup'

export interface DocumentPersistence {
	load(): DocumentTabsSnapshot | null | Promise<DocumentTabsSnapshot | null>
	save(snapshot: DocumentTabsSnapshot): void | Promise<void>
	exportSource(): string | Promise<string>
	clear(): void | Promise<void>
	cleanupLegacy?(): Promise<LegacyStorageCleanupResult>
}

/** Одна запись содержит весь граф вкладок и контент. Ошибка setItem сохраняет предыдущую запись. */
export class LocalDocumentPersistence implements DocumentPersistence {
	private legacySource: string | null = null
	private migrationSource: string | undefined
	private queue: Promise<void> = Promise.resolve()
	constructor(
		private readonly storage: () => Storage = () => window.localStorage,
		private readonly indexedFactory: () => IDBFactory | undefined = () => globalThis.indexedDB
	) {}

	load(): DocumentTabsSnapshot | null | Promise<DocumentTabsSnapshot | null> {
		const factory = this.indexedFactory()
		if (!factory) return this.loadLocal()
		return this.enqueue(async () => {
			try {
				const current = await new IndexedDocumentStorage(factory).read()
				if (current !== undefined) {
					try {
						const snapshot = parseSessionSnapshot(current, () => null)
						if (JSON.parse(current).schemaVersion !== SESSION_SCHEMA_VERSION)
							this.migrationSource = JSON.stringify({ indexedDB: { current } })
						return snapshot
					} catch (error: unknown) {
						this.migrationSource = JSON.stringify({ indexedDB: { current } })
						throw error
					}
				}
				const snapshot = this.loadLocal()
				if (snapshot) this.migrationSource = this.exportLocalSource()
				return snapshot
			} catch (error: unknown) {
				throw new DocumentPersistenceError(error, 'database-read', undefined, undefined, 'IndexedDB')
			}
		})
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const pending = this.queue.then(operation)
		this.queue = pending.then(
			() => {},
			() => {}
		)
		return pending
	}

	private loadLocal(): DocumentTabsSnapshot | null {
		const storage = this.storage()
		const json = storage.getItem('documentTabs')
		if (!json) return null
		const sources: Record<string, string | null> = {}
		const snapshot = parseSessionSnapshot(json, id => {
			const value = storage.getItem('document_' + id)
			sources['document_' + id] = value
			return value
		})
		if (JSON.parse(json).schemaVersion !== SESSION_SCHEMA_VERSION)
			this.legacySource = JSON.stringify({ documentTabs: json, documents: sources })
		return snapshot
	}

	save(snapshot: DocumentTabsSnapshot): void | Promise<void> {
		const factory = this.indexedFactory()
		if (!factory) return this.saveLocal(snapshot)
		let serialized: string
		try {
			serialized = JSON.stringify(snapshot)
		} catch (error: unknown) {
			throw new DocumentPersistenceError(error, 'serialize', undefined, undefined, 'IndexedDB')
		}
		return this.enqueue(async () => {
			try {
				await new IndexedDocumentStorage(factory).write(serialized, this.migrationSource)
				this.migrationSource = undefined
				this.legacySource = null
			} catch (error: unknown) {
				throw new DocumentPersistenceError(error, 'database-write', serialized, undefined, 'IndexedDB')
			}
		})
	}

	private saveLocal(snapshot: DocumentTabsSnapshot): void {
		let operation: StorageOperation = 'serialize'
		let storage: Storage | undefined
		let attempted: string | undefined
		try {
			const serialized = JSON.stringify(snapshot)
			attempted = serialized
			operation = 'access'
			storage = this.storage()
			if (this.legacySource) {
				// Никогда не заменяем предыдущую резервную копию другим исходником.
				let index = 0
				while (true) {
					const key = 'documentTabs.backup.' + index++
					operation = 'backup-read'
					const existing = storage.getItem(key)
					if (existing === this.legacySource) break
					if (existing === null) {
						operation = 'backup-write'
						attempted = this.legacySource
						storage.setItem(key, this.legacySource)
						break
					}
				}
				this.legacySource = null
			}
			operation = 'session-write'
			attempted = serialized
			storage.setItem('documentTabs', serialized)
		} catch (error: unknown) {
			throw new DocumentPersistenceError(error, operation, attempted, storage)
		}
	}

	exportSource(): string | Promise<string> {
		const factory = this.indexedFactory()
		if (!factory) return this.exportLocalSource()
		return this.enqueue(async () => {
			const stored = await new IndexedDocumentStorage(factory).export()
			let local: unknown
			try {
				local = JSON.parse(this.exportLocalSource())
			} catch {
				local = { unavailable: true }
			}
			return JSON.stringify({ localStorage: local, indexedDB: stored }, null, 2)
		})
	}

	private exportLocalSource(): string {
		const storage = this.storage()
		const entries: Record<string, string | null> = {}
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i)!
			if (isLegacyDocumentKey(key)) entries[key] = storage.getItem(key)
		}
		return JSON.stringify(entries, null, 2)
	}

	cleanupLegacy(): Promise<LegacyStorageCleanupResult> {
		return this.enqueue(async () => {
			const factory = this.indexedFactory()
			if (!factory) throw new Error('Очистка доступна после переноса сессии в IndexedDB. Старые записи не удалены.')
			const result = await cleanupLegacyStorage(this.storage(), new IndexedDocumentStorage(factory))
			this.legacySource = null
			this.migrationSource = undefined
			return result
		})
	}

	clear(): void | Promise<void> {
		const factory = this.indexedFactory()
		if (factory) {
			return this.enqueue(() =>
				new IndexedDocumentStorage(factory).write(
					JSON.stringify({
						schemaVersion: SESSION_SCHEMA_VERSION,
						documents: [],
						documentOrder: [],
						activeDocumentId: null,
						savedAt: Date.now()
					})
				)
			)
		}
		// Резервные копии и исходные данные миграции не удаляются при закрытии вкладок.
		this.storage().removeItem('documentTabs')
	}
}
