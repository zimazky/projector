export type StorageOperation =
	'access' | 'serialize' | 'backup-read' | 'backup-write' | 'session-write' | 'database-read' | 'database-write'
type StorageGroup = 'session' | 'legacy' | 'backups' | 'other'
export type StorageDiagnostic = {
	backend: 'localStorage' | 'IndexedDB'
	reason: 'quota' | 'access-denied' | 'serialization' | 'unknown'
	errorName: string
	operation: StorageOperation
	/** Оценка размера строк UTF-16, а не измерение квоты браузера. */
	attemptedBytes: number | null
	storedBytes: number | null
	groups: Array<{ group: StorageGroup; entries: number; bytes: number }>
}

/** Только размеры и категории. Содержимое документов в диагностику не попадает. */
function storageUsage(storage?: Storage): Pick<StorageDiagnostic, 'storedBytes' | 'groups'> {
	if (!storage) return { storedBytes: null, groups: [] }
	try {
		const groups = new Map<StorageGroup, { group: StorageGroup; entries: number; bytes: number }>()
		for (let index = 0; index < storage.length; index++) {
			const key = storage.key(index)
			if (key === null) continue
			const value = storage.getItem(key)
			if (value === null) continue
			const group: StorageGroup =
				key === 'documentTabs'
					? 'session'
					: key.startsWith('documentTabs.backup.')
						? 'backups'
						: key.startsWith('document_')
							? 'legacy'
							: 'other'
			const summary = groups.get(group) ?? { group, entries: 0, bytes: 0 }
			summary.entries++
			summary.bytes += (key.length + value.length) * 2
			groups.set(group, summary)
		}
		const summaries = Array.from(groups.values())
		return { storedBytes: summaries.reduce((total, item) => total + item.bytes, 0), groups: summaries }
	} catch {
		return { storedBytes: null, groups: [] }
	}
}

export function storageDiagnostic(
	error: unknown,
	operation: StorageOperation = 'session-write',
	value?: string,
	storage?: Storage,
	backend: StorageDiagnostic['backend'] = 'localStorage'
): StorageDiagnostic {
	if (error instanceof DocumentPersistenceError) return error.diagnostic
	const name = error instanceof Error ? error.name : 'UnknownError'
	const reason =
		name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
			? 'quota'
			: name === 'SecurityError' || name === 'NotAllowedError'
				? 'access-denied'
				: operation === 'serialize'
					? 'serialization'
					: 'unknown'
	return {
		backend,
		reason,
		errorName: name,
		operation,
		attemptedBytes: value === undefined ? null : value.length * 2,
		...storageUsage(storage)
	}
}

export class DocumentPersistenceError extends Error {
	readonly diagnostic: StorageDiagnostic
	constructor(
		error: unknown,
		operation: StorageOperation,
		value?: string,
		storage?: Storage,
		backend: StorageDiagnostic['backend'] = 'localStorage'
	) {
		super(error instanceof Error ? error.message : 'Не удалось записать локальную сессию.', { cause: error })
		this.diagnostic = storageDiagnostic(error, operation, value, storage, backend)
	}
}

export function storageFailureMessage(diagnostic: StorageDiagnostic): string {
	const reason = {
		quota: 'Превышена квота ' + diagnostic.backend + '.',
		'access-denied': 'Браузер запретил доступ к ' + diagnostic.backend + '.',
		serialization: 'Не удалось преобразовать сессию в JSON.',
		unknown: 'Ошибка операции в ' + diagnostic.backend + '.'
	}[diagnostic.reason]
	return 'Не удалось сохранить локальную сессию. ' + reason + ' Экспортируйте документы перед закрытием страницы.'
}

export const storageOperationLabels: Record<StorageOperation, string> = {
	access: 'Доступ к хранилищу',
	serialize: 'Подготовка JSON сессии',
	'backup-read': 'Поиск резервной копии',
	'backup-write': 'Запись резервной копии перед миграцией',
	'session-write': 'Запись текущей сессии',
	'database-read': 'Чтение сессии IndexedDB',
	'database-write': 'Транзакция сессии и резервной копии IndexedDB'
}
export const storageGroupLabels: Record<StorageGroup, string> = {
	session: 'Текущая сохранённая сессия',
	legacy: 'Документы прежнего формата',
	backups: 'Резервные снимки',
	other: 'Другие записи этого сайта'
}
export function storageSizeLabel(bytes: number | null): string {
	return bytes === null ? 'недоступно' : (bytes / 1024 / 1024).toFixed(2) + ' МиБ'
}
