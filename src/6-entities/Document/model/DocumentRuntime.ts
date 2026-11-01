import { createEmptyDocumentData } from './DocumentTabsStore.types'
import type { DocumentData, DocumentSessionSnapshot } from './DocumentTabsStore.types'
import { parseDocumentData, serializeDocumentData } from './DocumentFormat'
import { parseSessionSnapshot } from './DocumentSessionFormat'
import { LocalDocumentPersistence, type DocumentPersistence } from './DocumentPersistence'

export type DocumentRuntimeSnapshot = DocumentSessionSnapshot<DocumentData, 3 | 4>

/** Один выбранный маршрут отвечает за весь жизненный цикл документа. */
export interface DocumentRuntime {
	readonly resourceAccounting: boolean
	readonly sessionSchemaVersion: 3 | 4
	createEmptyData(): DocumentData
	parseData(content: unknown): DocumentData
	serializeData(data: DocumentData): string
	parseSession(json: string): DocumentRuntimeSnapshot
	createPersistence(): DocumentPersistence<DocumentRuntimeSnapshot>
}

export const legacyDocumentRuntime: DocumentRuntime = Object.freeze({
	resourceAccounting: false,
	sessionSchemaVersion: 3,
	createEmptyData: createEmptyDocumentData,
	parseData: parseDocumentData,
	serializeData: serializeDocumentData,
	createPersistence: () => new LocalDocumentPersistence(),
	parseSession: (json: string) => parseSessionSnapshot(json, () => null)
})
