import type { DocumentTabsSnapshot } from 'src/6-entities/Document/model/DocumentTabsStore.types'

/** Исторический формат v1 только для проверки входной миграции. */
export function legacySessionV1(snapshot: DocumentTabsSnapshot) {
	return {
		...snapshot,
		schemaVersion: 1,
		documents: snapshot.documents.map(document => ({
			...document,
			state: {
				isDirty:
					document.sync.baseLocalVersion === null || document.sync.localVersion !== document.sync.baseLocalVersion,
				isLoading: false,
				isSaving: false,
				lastLoadedAt: null,
				lastSavedAt: null,
				error: null,
				syncStatus: 'offline',
				lastSyncedAt: null,
				hasUnsyncedChanges: document.sync.needsRemoteCheck
			}
		}))
	}
}
