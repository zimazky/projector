import type { DocumentSession, SyncOperation, AppDriveAvailability } from './DocumentTabsStore.types'

/**
 * TTL для проверки актуальности удалённой проверки (в миллисекундах).
 * Активный документ: 60 секунд.
 */
export const REMOTE_CHECK_TTL_MS = 60 * 1000

/**
 * Вычисляет, есть ли локальные изменения относительно базовой версии.
 * localFingerprint !== baseFingerprint
 */
export function getIsDirty(session: DocumentSession): boolean {
	const { localFingerprint, baseFingerprint } = session.sync
	// Если оба null — считаем что изменений нет
	if (localFingerprint === null && baseFingerprint === null) return false
	// Если один из них null — считаем что есть (данные загружены, но base не установлен)
	if (localFingerprint === null || baseFingerprint === null) return true
	return localFingerprint !== baseFingerprint
}

/**
 * Проверяет, есть ли на Drive более новая версия.
 * remoteRevisionId !== null && remoteRevisionId !== baseRevisionId
 */
export function getHasRemoteAhead(session: DocumentSession): boolean {
	const { remoteRevisionId, baseRevisionId } = session.sync
	if (remoteRevisionId === null) return false
	if (baseRevisionId === null) return true // Не знаем base — предполагаем что remote новее
	return remoteRevisionId !== baseRevisionId
}

/**
 * Проверяет, есть ли конфликт: обе стороны изменены.
 */
export function getHasConflict(session: DocumentSession): boolean {
	return getIsDirty(session) && getHasRemoteAhead(session)
}

/**
 * Вычисляет производный статус синхронизации для UI.
 *
 * Возможные значения:
 * - 'new' — новый локальный документ, ещё нигде не сохранён
 * - 'dirty' — есть локальные изменения относительно базовой версии
 * - 'synced' — локальная версия совпадает с базовой и удалённой
 * - 'remote-ahead' — на Drive есть более новая версия, локально изменений нет
 * - 'conflict' — изменены и локальная, и удалённая стороны
 * - 'syncing' — идёт операция
 * - 'error' — последняя операция завершилась ошибкой
 */
export type UiSyncStatus =
	| 'new'
	| 'dirty'
	| 'synced'
	| 'remote-ahead'
	| 'conflict'
	| 'syncing'
	| 'error'

export function getUiSyncStatus(session: DocumentSession): UiSyncStatus {
	// Операция в процессе
	if (session.operation !== 'idle') {
		return 'syncing'
	}

	// Ошибка операции
	if (session.error !== null) {
		return 'error'
	}

	// Новый документ
	const hasNoFileId = session.ref?.fileId === null || session.ref?.fileId === undefined
	if (session.sync.origin === 'new-local' && hasNoFileId) {
		return 'new'
	}

	const isDirty = getIsDirty(session)
	const hasRemoteAhead = getHasRemoteAhead(session)

	// Конфликт
	if (isDirty && hasRemoteAhead) {
		return 'conflict'
	}

	// Remote ahead
	if (!isDirty && hasRemoteAhead) {
		return 'remote-ahead'
	}

	// Dirty
	if (isDirty && !hasRemoteAhead) {
		return 'dirty'
	}

	// Synced
	return 'synced'
}

/**
 * Определяет, нужно ли предупреждать при закрытии документа.
 * Предупреждаем если есть локальные изменения или конфликт.
 */
export function getShouldWarnOnClose(session: DocumentSession): boolean {
	const status = getUiSyncStatus(session)
	return status === 'dirty' || status === 'conflict' || status === 'new'
}

/**
 * Проверяет, можно ли сохранить документ в Drive.
 */
export function getCanSave(session: DocumentSession): boolean {
	const status = getUiSyncStatus(session)
	// Можно сохранить если есть fileId и статус не syncing/error
	const hasFileId = session.ref?.fileId !== null && session.ref?.fileId !== undefined
	return hasFileId && status !== 'syncing' && status !== 'error'
}

/**
 * Проверяет, можно ли загрузить версию из Drive.
 */
export function getCanPullRemote(session: DocumentSession): boolean {
	const status = getUiSyncStatus(session)
	// Можно загрузить если есть fileId и не идёт операция
	const hasFileId = session.ref?.fileId !== null && session.ref?.fileId !== undefined
	return hasFileId && status !== 'syncing' && (status === 'remote-ahead' || status === 'conflict')
}

/**
 * Полный UI-статус документа для использования в компонентах.
 */
export type DocumentUiState = {
	status: UiSyncStatus
	showModifiedMark: boolean
	showSyncIcon: boolean
	titleSuffix: string
	tooltip: string
	canSave: boolean
	canSync: boolean
}

export function getDocumentUiState(session: DocumentSession): DocumentUiState {
	const status = getUiSyncStatus(session)
	const isDirty = getIsDirty(session)
	const hasRemoteAhead = getHasRemoteAhead(session)
	const hasConflict = getHasConflict(session)

	let titleSuffix = ''
	let tooltip = ''

	switch (status) {
		case 'new':
			titleSuffix = ''
			tooltip = 'Новый документ, ещё не сохранён в Drive'
			break
		case 'dirty':
			titleSuffix = '*'
			tooltip = 'Есть несохранённые изменения'
			break
		case 'synced':
			titleSuffix = ''
			tooltip = 'Синхронизировано с Drive'
			break
		case 'remote-ahead':
			titleSuffix = ''
			tooltip = 'На Drive есть более новая версия'
			break
		case 'conflict':
			titleSuffix = ' ⚠'
			tooltip = 'Конфликт: изменения и локально, и на Drive'
			break
		case 'syncing':
			titleSuffix = ''
			tooltip = 'Синхронизация...'
			break
		case 'error':
			titleSuffix = ' ✕'
			tooltip = session.error?.message ?? 'Ошибка синхронизации'
			break
	}

	return {
		status,
		showModifiedMark: isDirty || hasConflict,
		showSyncIcon: hasRemoteAhead || hasConflict,
		titleSuffix,
		tooltip,
		canSave: getCanSave(session),
		canSync: getCanSave(session) || getCanPullRemote(session)
	}
}

/**
 * Проверяет, свежа ли удалённая проверка (в пределах TTL).
 */
export function isRemoteCheckFresh(
	session: DocumentSession,
	now: number = Date.now(),
	ttl: number = REMOTE_CHECK_TTL_MS
): boolean {
	const { lastRemoteCheckAt } = session.sync
	if (lastRemoteCheckAt === null) return false
	return now - lastRemoteCheckAt < ttl
}

/**
 * Определяет, нужно ли проверять удалённую версию.
 */
export function shouldCheckRemote(
	session: DocumentSession,
	availability: AppDriveAvailability,
	now: number = Date.now(),
	ttl: number = REMOTE_CHECK_TTL_MS
): boolean {
	// Drive недоступен — не проверяем
	if (availability !== 'drive-available') return false

	// Нет fileId — нечего проверять
	if (!session.ref?.fileId) return false

	// Явно требуется проверка
	if (session.sync.needsRemoteCheck) return true

	// Проверка устарела
	return !isRemoteCheckFresh(session, now, ttl)
}

/**
 * Синхронизирует legacy-поля состояния (state) с новой моделью (sync).
 * Вызывается после изменений в sync-модели для поддержания совместимости.
 */
export function syncLegacyStateFromNewModel(session: DocumentSession): void {
	const isDirty = getIsDirty(session)
	const hasRemoteAhead = getHasRemoteAhead(session)
	const hasConflict = getHasConflict(session)
	const uiStatus = getUiSyncStatus(session)

	// Обновляем isDirty
	session.state.isDirty = isDirty

	// Обновляем syncStatus
	if (uiStatus === 'syncing') {
		session.state.syncStatus = 'syncing'
	} else if (uiStatus === 'error') {
		session.state.syncStatus = 'error'
	} else if (hasConflict) {
		// Конфликт: обе стороны изменены
		session.state.syncStatus = 'needs-sync'
	} else if (hasRemoteAhead) {
		session.state.syncStatus = 'update-available'
	} else if (isDirty) {
		session.state.syncStatus = 'needs-sync'
	} else {
		session.state.syncStatus = 'synced'
	}

	// hasUnsyncedChanges: true если есть конфликт или remote-ahead
	session.state.hasUnsyncedChanges = hasRemoteAhead || hasConflict
}
