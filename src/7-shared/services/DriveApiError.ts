/** Безопасное сообщение для ошибок fetch/GAPI без предположений о структуре unknown. */
export function driveErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	if (typeof error === 'string' && error.trim()) return error
	if (error && typeof error === 'object') {
		const record = error as Record<string, unknown>
		if (typeof record.message === 'string') return record.message
		const result = record.result as { error?: { message?: unknown } } | undefined
		if (typeof result?.error?.message === 'string') return result.error.message
	}
	return 'Не удалось выполнить запрос Google Drive. Повторите попытку.'
}

export function driveErrorCode(error: unknown): number | null {
	if (!error || typeof error !== 'object') return null
	const record = error as { status?: unknown; result?: { error?: { code?: unknown } } }
	const code = record.result?.error?.code ?? record.status
	return typeof code === 'number' ? code : null
}
