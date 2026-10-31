import type { DriveFileMetadata } from 'src/7-shared/services/gapi'
import type { DocumentData } from './DocumentTabsStore.types'
import { normalizeMainStoreData } from './DocumentTabsStore.utils'

/** Строка int64 остаётся строкой: преобразование в Number теряет старшие разряды. */
export function driveVersion(metadata: DriveFileMetadata, expectedId = metadata.id): string {
	if (
		!metadata.id ||
		metadata.id !== expectedId ||
		metadata.trashed ||
		typeof metadata.version !== 'string' ||
		!/^\d+$/.test(metadata.version)
	) {
		throw new Error('Drive не вернул действующую версию файла. Повторите проверку.')
	}
	return 'drive-v3:' + encodeURIComponent(metadata.id) + ':' + metadata.version
}

export function isDriveVersion(value: string | null): boolean {
	return !!value && /^drive-v3:[^:]+:\d+$/.test(value)
}

export class DriveReadChangedError extends Error {
	constructor(readonly metadata: DriveFileMetadata) {
		super('Версия Drive изменилась во время чтения. Повторите проверку.')
	}
}

type Reader = {
	getFileMetadata(id: string): Promise<DriveFileMetadata>
	downloadFileContent(id: string): Promise<unknown>
}

/** Двойное чтение version связывает содержимое и metadata; повтор ограничен двумя попытками. */
export async function readDriveDocument(
	api: Reader,
	id: string,
	current: () => boolean
): Promise<{
	data: DocumentData
	metadata: DriveFileMetadata
	version: string
} | null> {
	let latest: DriveFileMetadata | undefined
	for (let attempt = 0; attempt < 2; attempt++) {
		const before = await api.getFileMetadata(id)
		if (!current()) return null
		const version = driveVersion(before, id)
		const content = await api.downloadFileContent(id)
		if (!current()) return null
		latest = await api.getFileMetadata(id)
		if (!current()) return null
		if (driveVersion(latest, id) === version)
			return { data: normalizeMainStoreData(content), metadata: latest, version }
	}
	throw new DriveReadChangedError(latest!)
}
