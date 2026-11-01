import { parseDocumentData, record } from './DocumentFormat'
import { computeFingerprint } from './DocumentSyncFingerprint'
import {
	createInitialSyncSnapshot,
	type DocumentTabsSnapshot,
	type DocumentSyncSnapshot
} from './DocumentTabsStore.types'

export class SessionFormatError extends Error {}
export const SESSION_SCHEMA_VERSION = 3
function invalid(): never {
	throw new SessionFormatError('Неверный снимок сессии. Исходные данные сохранены; экспортируйте резервную копию.')
}
const time = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const nullableTime = (value: unknown) => value === null || time(value)
const nullableString = (value: unknown) => value === null || typeof value === 'string'

/** Проверяет весь граф вкладок и всё содержимое до создания первого доменного стора. */
export function parseSessionSnapshot(json: string, readLegacy: (id: string) => string | null): DocumentTabsSnapshot {
	try {
		const raw: unknown = JSON.parse(json)
		if (!record(raw)) return invalid()
		if (raw.schemaVersion !== undefined && ![1, 2, SESSION_SCHEMA_VERSION].includes(raw.schemaVersion as number))
			return invalid()
		const legacy = raw.schemaVersion === undefined
		const oldState = raw.schemaVersion === undefined || raw.schemaVersion === 1
		if (!Array.isArray(raw.documents) || !Array.isArray(raw.documentOrder) || !time(raw.savedAt)) return invalid()
		const ids = new Set<string>()
		const documents = raw.documents.map(value => {
			if (
				!record(value) ||
				typeof value.id !== 'string' ||
				!value.id ||
				ids.has(value.id) ||
				!time(value.lastAccessedAt)
			)
				return invalid()
			ids.add(value.id)
			const ref = value.ref
			if (
				!record(ref) ||
				!nullableString(ref.fileId) ||
				typeof ref.name !== 'string' ||
				typeof ref.mimeType !== 'string' ||
				!nullableString(ref.parentFolderId) ||
				(ref.space !== null && ref.space !== 'drive' && ref.space !== 'appDataFolder') ||
				(ref.webViewLink !== undefined && typeof ref.webViewLink !== 'string')
			)
				return invalid()
			// Старые флаги существуют только на входе односторонней миграции.
			const state = oldState && record(value.state) ? { ...value.state } : null
			if (legacy && state && state.hasUnsyncedChanges === undefined) state.hasUnsyncedChanges = state.isDirty
			if (
				oldState &&
				(!record(state) ||
					['isDirty', 'isLoading', 'isSaving', 'hasUnsyncedChanges'].some(key => typeof state[key] !== 'boolean') ||
					['lastLoadedAt', 'lastSavedAt', 'lastSyncedAt'].some(key => !nullableTime(state[key])) ||
					!nullableString(state.error) ||
					!['offline', 'syncing', 'synced', 'needs-sync', 'update-available', 'error'].includes(
						state.syncStatus as string
					))
			)
				return invalid()
			if (!oldState && value.sync === undefined) return invalid()
			if (value.sync !== undefined) {
				if (!record(value.sync)) return invalid()
				const sync = value.sync
				for (const key of [
					'localFingerprint',
					'baseFingerprint',
					'remoteFingerprint',
					'baseRevisionId',
					'remoteRevisionId'
				])
					if (!nullableString(sync[key])) return invalid()
				for (const key of ['lastSyncAt', 'lastRemoteCheckAt']) if (!nullableTime(sync[key])) return invalid()
				if (
					typeof sync.needsRemoteCheck !== 'boolean' ||
					!['new-local', 'drive', 'restored-local'].includes(sync.origin as string)
				)
					return invalid()
				if (sync.serverModifiedAt !== undefined && !nullableString(sync.serverModifiedAt)) return invalid()
				if (sync.localVersion !== undefined || !legacy) {
					if (
						!Number.isSafeInteger(sync.localVersion) ||
						(sync.localVersion as number) < 0 ||
						(sync.baseLocalVersion !== null &&
							(!Number.isSafeInteger(sync.baseLocalVersion) ||
								(sync.baseLocalVersion as number) < 0 ||
								(sync.baseLocalVersion as number) > (sync.localVersion as number)))
					)
						return invalid()
				}
			}
			let data = value.data
			if (legacy) {
				const source = readLegacy(value.id)
				if (!source) return invalid()
				const old: unknown = JSON.parse(source)
				if (!record(old) || !time(old.savedAt)) return invalid()
				data = old.data
			}
			if (
				raw.schemaVersion === SESSION_SCHEMA_VERSION &&
				record(data) &&
				data.schemaVersion !== undefined &&
				data.schemaVersion !== 2
			)
				return invalid()
			const parsed = parseDocumentData(
				!legacy && record(data)
					? { schemaVersion: raw.schemaVersion === SESSION_SCHEMA_VERSION ? 2 : 1, ...data }
					: data
			)
			const source = value.sync as Partial<DocumentSyncSnapshot> | undefined
			const sync = createInitialSyncSnapshot(ref.fileId ? 'restored-local' : 'new-local')
			// Только известные поля: state/operation/error не переносятся в новый снимок.
			for (const key of Object.keys(sync) as Array<keyof DocumentSyncSnapshot>) {
				if (source?.[key] !== undefined) Object.assign(sync, { [key]: source[key] })
			}
			if (source?.serverModifiedAt !== undefined) sync.serverModifiedAt = source.serverModifiedAt
			if (raw.schemaVersion !== SESSION_SCHEMA_VERSION) {
				// Переносим только точные JSON-базы; старые короткие хэши не доказывают равенство.
				for (const key of ['localFingerprint', 'baseFingerprint', 'remoteFingerprint'] as const) {
					if (!sync[key]) continue
					try {
						sync[key] = computeFingerprint(parseDocumentData(JSON.parse(sync[key]!)))
					} catch {
						sync[key] = null
					}
				}
				if (source?.baseFingerprint && sync.baseFingerprint === null) sync.baseLocalVersion = null
			}
			if (!Number.isSafeInteger(source?.localVersion)) {
				sync.localVersion = state?.isDirty || state?.hasUnsyncedChanges ? 1 : 0
				sync.baseLocalVersion = null
				sync.baseFingerprint = null
			} else if (state?.isDirty && sync.baseLocalVersion === sync.localVersion) {
				// Противоречивый старый снимок не должен терять предупреждение.
				sync.baseLocalVersion = null
				sync.baseFingerprint = null
			}
			if (sync.baseLocalVersion === null) sync.baseFingerprint = null
			return {
				id: value.id,
				ref: {
					fileId: ref.fileId as string | null,
					name: ref.name,
					mimeType: ref.mimeType,
					parentFolderId: ref.parentFolderId as string | null,
					space: ref.space,
					...(ref.webViewLink === undefined ? {} : { webViewLink: ref.webViewLink as string })
				},
				sync,
				data: parsed,
				lastAccessedAt: value.lastAccessedAt
			}
		})
		const order = raw.documentOrder
		if (
			order.length !== ids.size ||
			new Set(order).size !== ids.size ||
			order.some(id => typeof id !== 'string' || !ids.has(id)) ||
			(raw.activeDocumentId !== null && (typeof raw.activeDocumentId !== 'string' || !ids.has(raw.activeDocumentId))) ||
			(ids.size > 0 && raw.activeDocumentId === null)
		)
			return invalid()
		return {
			schemaVersion: SESSION_SCHEMA_VERSION,
			documents,
			documentOrder: [...order],
			activeDocumentId: raw.activeDocumentId,
			savedAt: raw.savedAt
		} as DocumentTabsSnapshot
	} catch (error) {
		if (error instanceof SessionFormatError) throw error
		throw new SessionFormatError(error instanceof Error ? error.message : 'Не удалось прочитать снимок сессии.')
	}
}
