import { parseSessionSnapshot } from './DocumentSessionFormat'

export type LegacyStorageCleanupResult = {
	archivedEntries: number
	removedEntries: number
	changedEntries: number
	failedEntries: number
	/** Оценка освобождённых строк UTF-16, не измерение дискового пространства. */
	freedBytes: number
}

export function isLegacyDocumentKey(key: string): boolean {
	return (
		['data', 'data.json', 'lastOpenedDocument', 'documentTabs'].includes(key) ||
		/^documentTabs\.backup\.\d+$/.test(key) ||
		(key.startsWith('document_') && key.length > 'document_'.length)
	)
}

type CleanupArchive = {
	read(): Promise<string | undefined>
	archiveLegacy(archive: string, validate: (current: string | undefined) => void): Promise<void>
}

function validateCurrent(current: string | undefined, parse: (json: string) => unknown): void {
	if (typeof current !== 'string')
		throw new Error('Сначала дождитесь сохранения сессии в IndexedDB. Старые записи не удалены.')
	parse(current)
}

/** localStorage не поддерживает общую транзакцию с IndexedDB: сначала архив, затем сверка каждого значения. */
export async function cleanupLegacyStorage(
	storage: Storage,
	database: CleanupArchive,
	parse: (json: string) => unknown = json => parseSessionSnapshot(json, () => null)
): Promise<LegacyStorageCleanupResult> {
	const validate = (current: string | undefined) => validateCurrent(current, parse)
	validate(await database.read())
	const entries: Record<string, string> = {}
	// Отдельный список ключей: во время удаления индексы Storage изменятся.
	const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
	for (const key of keys) {
		if (key === null || !isLegacyDocumentKey(key)) continue
		const value = storage.getItem(key)
		if (value !== null) entries[key] = value
	}
	const result: LegacyStorageCleanupResult = {
		archivedEntries: 0,
		removedEntries: 0,
		changedEntries: 0,
		failedEntries: 0,
		freedBytes: 0
	}
	if (!Object.keys(entries).length) return result
	const archive = JSON.stringify({ schemaVersion: 1, kind: 'localStorage-cleanup', savedAt: Date.now(), entries })
	// Внутри транзакции ещё раз проверяется актуальная запись current. До complete ничего не удаляем.
	await database.archiveLegacy(archive, validate)
	result.archivedEntries = Object.keys(entries).length
	for (const [key, original] of Object.entries(entries)) {
		try {
			if (storage.getItem(key) !== original) {
				result.changedEntries++
				continue
			}
			storage.removeItem(key)
			result.removedEntries++
			result.freedBytes += (key.length + original.length) * 2
		} catch {
			result.failedEntries++
		}
	}
	return result
}
