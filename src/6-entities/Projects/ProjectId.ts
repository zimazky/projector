/** ID служебного проекта не зависит от его позиции или отображаемого имени. */
export const DEFAULT_PROJECT_ID = 'default'

/** Обратимое кодирование: миграция детерминирована и не опирается на короткий хэш. */
export const legacyProjectId = (name: string): string => 'legacy:' + encodeURIComponent(name)

export function newProjectId(): string {
	return 'project:' + (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`)
}
