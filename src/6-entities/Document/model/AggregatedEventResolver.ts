import type { DocumentId } from './DocumentTabsStore.types'
import type { DocumentSession } from './DocumentTabsStore.types'
import type { DocumentTabsStore } from './DocumentTabsStore'

/**
 * Резолвер для работы с событиями из агрегированного (виртуального) документа.
 * Извлекает информацию о документе-источнике из составного ID события.
 * 
 * Формат составного ID: ${docPrefix}_${hash}
 * Например: abc123_k8x9m2p4
 */
export class AggregatedEventResolver {
	/**
	 * Извлечь ID документа и оригинальный хеш события из составного ID.
	 * @param aggregatedId - составной ID в формате "docPrefix_hash"
	 * @returns объект с documentId и eventHash, или null если ID не составной
	 */
	static parseAggregatedId(aggregatedId: string | number): {
		documentId: DocumentId
		eventHash: string
	} | null {
		const idStr = String(aggregatedId)
		
		// Формат: docPrefix_hash (hash — 8 символов base36)
		// Ищем последнее подчёркивание, за которым следуют 8 символов
		const lastUnderscoreIndex = idStr.lastIndexOf('_')
		if (lastUnderscoreIndex === -1) return null
		
		const hash = idStr.substring(lastUnderscoreIndex + 1)
		
		// Проверяем, что хеш выглядит как хеш (8 символов base36)
		if (hash.length !== 8 || !/^[a-z0-9]{8}$/.test(hash)) return null
		
		const docPrefix = idStr.substring(0, lastUnderscoreIndex)
		
		// Восстанавливаем ID документа
		let documentId: DocumentId
		if (docPrefix === 'virt') {
			// Это событие из виртуального документа (не должно происходить)
			return null
		} else {
			documentId = `doc_${docPrefix}`
		}
		
		return {
			documentId,
			eventHash: hash
		}
	}

	/**
	 * Получить документ-источник по ID события из агрегированных данных.
	 * @param aggregatedId - составной ID события
	 * @param documentTabsStore - стор вкладок документов
	 * @returns документ-источник или null
	 */
	static findSourceDocument(
		aggregatedId: string | number,
		documentTabsStore: DocumentTabsStore
	): DocumentSession | null {
		const parsed = this.parseAggregatedId(aggregatedId)
		if (!parsed) return null
		
		return documentTabsStore.documents.find(d => d.id === parsed.documentId) ?? null
	}

	/**
	 * Проверить, является ли ID события составным (из агрегированного документа).
	 * @param eventId - ID события
	 * @returns true если ID составной
	 */
	static isAggregatedId(eventId: string | number): boolean {
		return this.parseAggregatedId(eventId) !== null
	}
}
