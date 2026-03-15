import {
	DocumentTabsSnapshot,
	RestoredDocumentSnapshot,
	DocumentDataSnapshot,
	DocumentRef
} from 'src/6-entities/Document/model/DocumentTabsStore.types'

const OLD_DATA_KEY = 'data'
const OLD_LAST_OPENED_DOC_KEY = 'lastOpenedDocument'
const DOCUMENT_TABS_KEY = 'documentTabs'
const DOCUMENT_DATA_PREFIX = 'document_'

/**
 * Сервис для миграции данных из старой single-document структуры в новую multi-document.
 */
export class MigrationService {
	/**
	 * Выполнить миграцию из старой структуры в новую.
	 * Проверяет наличие старых данных и создаёт первую вкладку из них.
	 */
	static migrateFromSingleDocument(): boolean {
		const oldData = localStorage.getItem(OLD_DATA_KEY)
		const oldDoc = localStorage.getItem(OLD_LAST_OPENED_DOC_KEY)

		if (!oldData || !oldDoc) {
			// Нет старых данных для миграции
			return false
		}

		// Проверка: уже есть новая структура?
		const newTabs = localStorage.getItem(DOCUMENT_TABS_KEY)
		if (newTabs) {
			// Миграция уже выполнена
			return false
		}

		try {
			const oldDocParsed = JSON.parse(oldDoc) as {
				fileId: string | null
				name: string
				mimeType: string
				space: string | null
				parentFolderId: string | null
				updatedAt: number
			}

			const documentId = `doc_migrated_${Date.now()}`

			// Создание снимка вкладок
			const snapshot: DocumentTabsSnapshot = {
				activeDocumentId: documentId,
				documentOrder: [documentId],
				documents: [
					{
						id: documentId,
						ref: {
							fileId: oldDocParsed.fileId,
							name: oldDocParsed.name,
							mimeType: oldDocParsed.mimeType,
							space: (oldDocParsed.space as 'drive' | 'appDataFolder' | null) ?? null,
							parentFolderId: oldDocParsed.parentFolderId
						},
						state: {
							isDirty: false,
							isLoading: false,
							isSaving: false,
							lastLoadedAt: oldDocParsed.updatedAt,
							lastSavedAt: null,
							error: null,
							syncStatus: oldDocParsed.fileId ? 'offline' : 'offline',
							lastSyncedAt: null,
							hasUnsyncedChanges: false
						},
						lastAccessedAt: oldDocParsed.updatedAt
					}
				],
				savedAt: Date.now()
			}

			localStorage.setItem(DOCUMENT_TABS_KEY, JSON.stringify(snapshot))

			// Сохранение данных документа
			const dataSnapshot: DocumentDataSnapshot = {
				data: JSON.parse(oldData),
				savedAt: Date.now()
			}
			localStorage.setItem(`${DOCUMENT_DATA_PREFIX}${documentId}`, JSON.stringify(dataSnapshot))

			// Очистка старых ключей (опционально - можно оставить для отката)
			// localStorage.removeItem(OLD_DATA_KEY)
			// localStorage.removeItem(OLD_LAST_OPENED_DOC_KEY)

			console.log('Миграция данных выполнена успешно')
			return true
		} catch (e) {
			console.error('Ошибка при миграции данных:', e)
			return false
		}
	}

	/**
	 * Проверить, есть ли старые данные для миграции.
	 */
	static hasOldData(): boolean {
		const oldData = localStorage.getItem(OLD_DATA_KEY)
		const oldDoc = localStorage.getItem(OLD_LAST_OPENED_DOC_KEY)
		return !!(oldData && oldDoc)
	}

	/**
	 * Проверить, выполнена ли уже миграция.
	 */
	static isMigrated(): boolean {
		const newTabs = localStorage.getItem(DOCUMENT_TABS_KEY)
		return !!newTabs
	}

	/**
	 * Экспорт старых данных для возможности отката.
	 */
	static exportOldData(): { data: string | null; lastOpenedDocument: string | null } {
		return {
			data: localStorage.getItem(OLD_DATA_KEY),
			lastOpenedDocument: localStorage.getItem(OLD_LAST_OPENED_DOC_KEY)
		}
	}

	/**
	 * Импорт старых данных (для отката).
	 */
	static importOldData(oldData: { data: string; lastOpenedDocument: string }): void {
		localStorage.setItem(OLD_DATA_KEY, oldData.data)
		localStorage.setItem(OLD_LAST_OPENED_DOC_KEY, oldData.lastOpenedDocument)
		localStorage.removeItem(DOCUMENT_TABS_KEY)

		// Очистка новых ключей документов
		const keysToRemove: string[] = []
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i)
			if (key && key.startsWith(DOCUMENT_DATA_PREFIX)) {
				keysToRemove.push(key)
			}
		}
		keysToRemove.forEach(key => localStorage.removeItem(key))
	}
}
