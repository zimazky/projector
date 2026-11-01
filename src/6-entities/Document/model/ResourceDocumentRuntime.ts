import type { DocumentRuntime } from './DocumentRuntime'
import type { ResourceMigrationContext } from './ResourceDocument.types'
import {
	createEmptyResourceDocumentData,
	parseResourceDocumentData,
	serializeResourceDocumentData
} from './ResourceDocumentFormat'
import { parseResourceSessionSnapshot } from './ResourceSessionFormat'
import { ResourceDocumentPersistence } from './ResourceDocumentPersistence'

/** Внутренний режим R04–R08. Миграция старых документов выполняется отдельно, на копии. */
export function createResourceDocumentRuntime(context: ResourceMigrationContext): DocumentRuntime {
	const empty = createEmptyResourceDocumentData(context)
	return Object.freeze<DocumentRuntime>({
		resourceAccounting: true,
		sessionSchemaVersion: 4,
		createEmptyData: () => parseResourceDocumentData(empty),
		parseData: parseResourceDocumentData,
		serializeData: data => serializeResourceDocumentData(parseResourceDocumentData(data)),
		parseSession: json => parseResourceSessionSnapshot(json),
		createPersistence: () => new ResourceDocumentPersistence()
	})
}
