import { resourceDocument } from './resourceDocument'
import { ResourceDocumentPersistence } from 'src/6-entities/Document/model/ResourceDocumentPersistence'
import { LocalDocumentPersistence } from 'src/6-entities/Document/model/DocumentPersistence'
import { IndexedDocumentStorage } from 'src/6-entities/Document/model/IndexedDocumentStorage'
import {
	parseResourceDocumentData,
	createResourceMigrationContext
} from 'src/6-entities/Document/model/ResourceDocumentFormat'
import { serializeResourceSessionSnapshot } from 'src/6-entities/Document/model/ResourceSessionFormat'
import { computeFingerprint } from 'src/6-entities/Document/model/DocumentSyncFingerprint'
import { createInitialSyncSnapshot } from 'src/6-entities/Document/model/DocumentTabsStore.types'
import type { ResourceSessionSnapshot } from 'src/6-entities/Document/model/ResourceDocument.types'

/** Подключается только отдельным entry из start-e2e-server, без запуска приложения. */
const probe = {
	snapshot(): ResourceSessionSnapshot {
		const data = parseResourceDocumentData(resourceDocument())
		const fp = computeFingerprint(data)
		return {
			schemaVersion: 4,
			savedAt: 1,
			activeDocumentId: 'fixture',
			documentOrder: ['fixture'],
			documents: [
				{
					id: 'fixture',
					ref: {
						fileId: 'fixture-file',
						name: 'Resource fixture',
						mimeType: 'application/json',
						parentFolderId: null,
						space: 'drive'
					},
					data,
					lastAccessedAt: 1,
					sync: {
						...createInitialSyncSnapshot('drive'),
						localFingerprint: fp,
						baseFingerprint: fp,
						remoteFingerprint: fp,
						baseLocalVersion: 0
					}
				}
			]
		}
	},
	persistence: () =>
		new ResourceDocumentPersistence(id =>
			createResourceMigrationContext({
				id,
				currency: { code: 'RUB', scale: 2 },
				currencyConfirmed: true,
				asOf: '2026.11.01',
				timezone: 'Europe/Moscow'
			})
		),
	legacyPersistence: () => new LocalDocumentPersistence(),
	storage: () => new IndexedDocumentStorage(indexedDB),
	serialize: serializeResourceSessionSnapshot
}
Object.assign(window, { __resourceCodec: probe })
