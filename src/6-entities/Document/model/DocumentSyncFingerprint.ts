import type { DocumentData } from './DocumentTabsStore.types'

/**
 * Точное каноническое JSON-представление, а не 32-битный хэш.
 * Первый проход проверяет сериализуемость и раскрывает общие ссылки по правилам JSON.
 * Ошибки сериализации передаются вызывающему коду, случайной «версии» вместо ошибки нет.
 * Имя сохранено для совместимости полей snapshot; старые хэши не являются новой базой.
 */
export function computeFingerprint(data: DocumentData): string {
	return JSON.stringify(JSON.parse(JSON.stringify(data)), (_key, value: unknown) => {
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
		}
		return value
	})
}

/** Независимая копия: изменения доменных сторов не меняют отправленные данные. */
export function cloneDocumentData(data: DocumentData): DocumentData {
	return JSON.parse(computeFingerprint(data)) as DocumentData
}

/** Рекурсивно запрещает изменение отправленного JSON-снимка. */
export function freezeSnapshot<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.values(value).forEach(freezeSnapshot)
		Object.freeze(value)
	}
	return value
}
