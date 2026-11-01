import { parseSessionWithCodec, readLegacySessionDocument, type SessionDocumentContext } from './DocumentSessionFormat'
import { record } from './DocumentFormat'
import { computeFingerprint } from './DocumentSyncFingerprint'
import type { DocumentSyncSnapshot } from './DocumentTabsStore.types'
import type { ResourceDocumentData, ResourceMigrationContext, ResourceSessionSnapshot } from './ResourceDocument.types'
import {
	migrateLegacyResourceDocument,
	parseResourceDocumentData,
	serializeResourceDocumentData
} from './ResourceDocumentFormat'
import { invalidResource } from './ResourceDocumentSchema'

export const RESOURCE_SESSION_SCHEMA_VERSION = 4
export type ResourceSessionMigration = (documentId: string) => ResourceMigrationContext

function normalizeSync(
	sync: DocumentSyncSnapshot,
	data: ResourceDocumentData,
	context: SessionDocumentContext
): DocumentSyncSnapshot {
	const localFingerprint = computeFingerprint(data)
	if (context.sessionSchemaVersion !== RESOURCE_SESSION_SCHEMA_VERSION || data.migration?.currencyConfirmed === false) {
		return {
			...sync,
			localFingerprint,
			baseLocalVersion: null,
			baseFingerprint: null,
			remoteFingerprint: null,
			needsRemoteCheck: true,
			lastRemoteCheckAt: null
		}
	}
	let uncertain = false
	const normalize = (source: string | null): string | null => {
		if (source === null) return null
		try {
			return computeFingerprint(parseResourceDocumentData(source))
		} catch {
			uncertain = true
			return null
		}
	}
	const storedLocal = normalize(sync.localFingerprint)
	const baseFingerprint = normalize(sync.baseFingerprint)
	const remoteFingerprint = normalize(sync.remoteFingerprint)
	if (
		(storedLocal !== null && storedLocal !== localFingerprint) ||
		(sync.baseLocalVersion === sync.localVersion && baseFingerprint !== localFingerprint)
	)
		uncertain = true
	const knownBase = !uncertain && sync.baseLocalVersion !== null && baseFingerprint !== null
	return {
		...sync,
		localFingerprint,
		remoteFingerprint,
		baseLocalVersion: knownBase ? sync.baseLocalVersion : null,
		baseFingerprint: knownBase ? baseFingerprint : null,
		needsRemoteCheck: sync.needsRemoteCheck || uncertain || !knownBase,
		lastRemoteCheckAt: uncertain || !knownBase ? null : sync.lastRemoteCheckAt
	}
}

/** Только явный новый маршрут принимает v4; вложенная версия больше не подставляется. */
export function parseResourceSessionSnapshot(
	json: string,
	readLegacy: (id: string) => string | null = () => null,
	migration?: ResourceSessionMigration
): ResourceSessionSnapshot {
	return parseSessionWithCodec(json, readLegacy, {
		schemaVersion: RESOURCE_SESSION_SCHEMA_VERSION,
		strict: true,
		readDocument(data, context) {
			if (context.sessionSchemaVersion === RESOURCE_SESSION_SCHEMA_VERSION) {
				if (!record(data) || data.schemaVersion !== 3)
					return invalidResource('session.data.schemaVersion', 'требуется явная версия документа 3')
				return parseResourceDocumentData(data)
			}
			if (!migration)
				return invalidResource('session.migration', 'требуется выбор валюты и контекст для каждого документа')
			const legacy = readLegacySessionDocument(data, context)
			const converted = migrateLegacyResourceDocument(
				{ schemaVersion: 2, ...legacy },
				migration(context.documentId)
			).data
			converted.migration!.sourceSchemaVersion = (
				record(data) && data.schemaVersion !== undefined
					? data.schemaVersion
					: context.sessionSchemaVersion === 3
						? 2
						: context.sessionSchemaVersion === undefined
							? 0
							: 1
			) as 0 | 1 | 2
			return converted
		},
		normalizeSync
	})
}

export function serializeResourceSessionSnapshot(snapshot: ResourceSessionSnapshot): string {
	const checked = parseResourceSessionSnapshot(JSON.stringify(snapshot))
	checked.documents.forEach(document => serializeResourceDocumentData(document.data))
	return JSON.stringify(checked)
}
