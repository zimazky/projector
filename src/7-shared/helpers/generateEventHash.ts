import type { EventDto } from 'src/6-entities/Events/EventDto'

/**
 * Сгенерировать короткий хеш от содержимого события.
 * Использует простой алгоритм для создания стабильного идентификатора.
 * Хеш детерминирован — одинаковые данные всегда дают одинаковый результат.
 * 
 * @param e - событие для генерации хеша
 * @returns строковый хеш длиной 8 символов (base36)
 */
export function generateEventHash(e: EventDto): string {
	// Собираем ключевые поля в строку для хеширования
	const content = `${e.name}|${e.start}|${e.time ?? ''}|${e.credit ?? 0}|${e.debit ?? 0}|${e.project ?? ''}|${e.comment ?? ''}`
	
	let hash = 0
	for (let i = 0; i < content.length; i++) {
		const char = content.charCodeAt(i)
		hash = ((hash << 5) - hash) + char
		hash = hash & hash // Преобразуем в 32-битное целое
	}
	
	// Возвращаем абсолютное значение в base36 (8 символов)
	return Math.abs(hash).toString(36).substring(0, 8)
}
