import { SessionDocumentPersistence } from './DocumentPersistence'
import type { ResourceSessionSnapshot } from './ResourceDocument.types'
import {
	parseResourceSessionSnapshot,
	serializeResourceSessionSnapshot,
	RESOURCE_SESSION_SCHEMA_VERSION,
	type ResourceSessionMigration
} from './ResourceSessionFormat'

/** Внутренний путь R03 с теми же очередью, архивом и атомарной записью IndexedDB. */
export class ResourceDocumentPersistence extends SessionDocumentPersistence<ResourceSessionSnapshot> {
	constructor(
		migration?: ResourceSessionMigration,
		storage: () => Storage = () => window.localStorage,
		indexedFactory: () => IDBFactory | undefined = () => globalThis.indexedDB
	) {
		super(storage, indexedFactory, {
			schemaVersion: RESOURCE_SESSION_SCHEMA_VERSION,
			parse: (json, readLegacy) => parseResourceSessionSnapshot(json, readLegacy, migration),
			serialize: serializeResourceSessionSnapshot
		})
	}
}
