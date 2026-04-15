import type { DocumentData } from './DocumentTabsStore.types'

/**
 * Вычисляет детерминированный отпечаток данных документа.
 * Используется для сравнения версий документа без依赖 от timestamp.
 *
 * Алгоритм:
 * 1. Сериализуем DocumentData в JSON с отсортированными ключами
 * 2. Вычисляем простой hash от строки
 *
 * Это не криптографический hash — достаточно быстрое сравнение
 * для определения изменений локальных данных.
 */
export function computeFingerprint(data: DocumentData): string {
	try {
		const serialized = JSON.stringify(data, getSortedReplacer())
		return simpleHash(serialized)
	} catch {
		// В случае ошибок сериализации возвращаем null-hash
		return 'error_' + Date.now().toString(36)
	}
}

/**
 * Создать replacer для JSON.stringify, который гарантирует
 * детерминированный порядок ключей.
 */
function getSortedReplacer(): (key: string, value: unknown) => unknown {
	const seen = new WeakSet()

	return function replacer(key: string, value: unknown): unknown {
		if (typeof value === 'object' && value !== null) {
			if (seen.has(value)) {
				return '[circular]'
			}
			seen.add(value)

			// Сортируем ключи объектов
			if (Array.isArray(value)) {
				return value
			}

			const sorted: Record<string, unknown> = {}
			const keys = Object.keys(value).sort()
			for (const k of keys) {
				sorted[k] = (value as Record<string, unknown>)[k]
			}
			return sorted
		}
		return value
	}
}

/**
 * Простой hash строки — быстрый и достаточно уникальный
 * для сравнения версий документа.
 */
function simpleHash(str: string): string {
	let hash = 0
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i)
		hash = ((hash << 5) - hash) + char
		hash = hash & hash // Convert to 32-bit integer
	}
	// Возвращаем hex-строку
	return Math.abs(hash).toString(16).padStart(8, '0')
}
