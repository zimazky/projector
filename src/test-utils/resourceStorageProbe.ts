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
import { DocumentTabsStore } from 'src/6-entities/Document/model/DocumentTabsStore'
import { createResourceDocumentRuntime } from 'src/6-entities/Document/model/ResourceDocumentRuntime'
import type { GoogleApiService } from 'src/7-shared/services/GoogleApiService'
import { ResourceOperationCommands } from 'src/6-entities/Operations/ResourceOperationCommands'
import { ResourceBalanceCache } from 'src/6-entities/EventsCache/ResourceBalanceCache'
import { ResourceBalanceClock } from 'src/6-entities/EventsCache/ResourceBalanceClock'
import { resourceBalanceDocument, balanceActual, balancePlan } from './resourceBalanceDocument'

/** Подключается только отдельным entry из start-e2e-server, без запуска приложения. */
const probe = {
	balanceCache: (tabs: DocumentTabsStore) =>
		new ResourceBalanceCache(tabs, new ResourceBalanceClock(() => Date.parse('2026-11-03T09:00:00Z'))),
	balanceDocument: resourceBalanceDocument,
	balanceActual,
	balancePlan,
	commands: (tabs: DocumentTabsStore) => new ResourceOperationCommands(tabs, () => '2026.11.10'),
	tabs: () =>
		new DocumentTabsStore(
			{} as GoogleApiService,
			undefined,
			createResourceDocumentRuntime({
				id: 'browser-runtime',
				currency: { code: 'RUB', scale: 2 },
				currencyConfirmed: true,
				asOf: '2026.11.01',
				timezone: 'Europe/Moscow'
			})
		),
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
