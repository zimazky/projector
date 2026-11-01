import type { DocumentSession, AppDriveAvailability } from './DocumentTabsStore.types'
import { isDriveVersion } from './DocumentDriveProtocol'

export const REMOTE_CHECK_TTL_MS = 60 * 1000

/** Неизвестная локальная база не доказывает отсутствие изменений. */
export function getIsDirty(session: DocumentSession): boolean {
	return session.sync.baseLocalVersion === null || session.sync.localVersion !== session.sync.baseLocalVersion
}

export function getHasRemoteAhead(session: DocumentSession): boolean {
	const { baseRevisionId, remoteRevisionId } = session.sync
	return isDriveVersion(baseRevisionId) && isDriveVersion(remoteRevisionId) && baseRevisionId !== remoteRevisionId
}

export function getHasConflict(session: DocumentSession): boolean {
	return getIsDirty(session) && getHasRemoteAhead(session)
}

export function isRemoteCheckFresh(session: DocumentSession, now = Date.now(), ttl = REMOTE_CHECK_TTL_MS): boolean {
	const checked = session.sync.lastRemoteCheckAt
	return checked !== null && checked <= now && now - checked < ttl
}

export function getRemoteUnknown(session: DocumentSession): boolean {
	return (
		!!session.ref?.fileId &&
		(session.sync.needsRemoteCheck ||
			!isDriveVersion(session.sync.baseRevisionId) ||
			!isDriveVersion(session.sync.remoteRevisionId) ||
			!isRemoteCheckFresh(session))
	)
}

export type UiSyncStatus = 'new' | 'dirty' | 'unknown' | 'synced' | 'remote-ahead' | 'conflict' | 'syncing' | 'error'

export function getUiSyncStatus(session: DocumentSession): UiSyncStatus {
	if (session.operation !== 'idle') return 'syncing'
	if (session.error) return 'error'
	if (!session.ref?.fileId) return 'new'
	if (getHasConflict(session)) return 'conflict'
	if (getHasRemoteAhead(session)) return 'remote-ahead'
	if (getIsDirty(session)) return 'dirty'
	return getRemoteUnknown(session) ? 'unknown' : 'synced'
}

export function getShouldWarnOnClose(session: DocumentSession): boolean {
	return (
		session.operation !== 'opening' && (getIsDirty(session) || getHasRemoteAhead(session) || getRemoteUnknown(session))
	)
}

/** Ошибка не запрещает новую попытку, фоновые проверки не требуют авторизации. */
export function getCanSave(session: DocumentSession): boolean {
	return !!session.ref?.fileId && session.operation === 'idle'
}

export function getCanPullRemote(session: DocumentSession): boolean {
	return getCanSave(session) && (getHasRemoteAhead(session) || getRemoteUnknown(session))
}

export type DocumentUiState = {
	status: UiSyncStatus
	isDirty: boolean
	remoteUnknown: boolean
	hasRemoteAhead: boolean
	hasConflict: boolean
	showModifiedMark: boolean
	showSyncIcon: boolean
	titleSuffix: string
	tooltip: string
	statusIcon: string
	canSave: boolean
	canSync: boolean
	canPull: boolean
	shouldWarnOnClose: boolean
	closeMessage: string
}

/** Единый контракт вкладки, заголовка, панели команд и подтверждения закрытия. */
export function getDocumentUiState(session: DocumentSession): DocumentUiState {
	const status = getUiSyncStatus(session),
		dirty = getIsDirty(session),
		unknown = getRemoteUnknown(session)
	const remote = getHasRemoteAhead(session),
		conflict = getHasConflict(session)
	const descriptions: Record<UiSyncStatus, string> = {
		new: 'Новый документ, ещё не сохранён в Drive',
		dirty: 'Есть несохранённые изменения',
		unknown: 'Актуальность Drive не проверена',
		synced: 'Синхронизировано с Google Drive',
		'remote-ahead': 'На Drive есть другая версия',
		conflict: 'Конфликт: изменения локально и на Drive',
		syncing: 'Выполняется операция с Drive',
		error: session.error?.message || 'Ошибка операции с Drive'
	}
	let tooltip = descriptions[status]
	if (dirty && status !== 'dirty' && status !== 'conflict') tooltip += '. Есть несохранённые изменения'
	if (unknown && status !== 'unknown' && status !== 'syncing') tooltip += '. Актуальность Drive не проверена'
	const icons: Record<UiSyncStatus, string> = {
		new: '',
		dirty: '*',
		unknown: '?',
		synced: '✓',
		'remote-ahead': '☁',
		conflict: '⚠',
		syncing: '↻',
		error: '✕'
	}
	const closeMessage = conflict
		? 'Изменения есть локально и на Drive.'
		: dirty
			? 'Есть несохранённые изменения.'
			: remote
				? 'На Drive есть другая версия.'
				: unknown
					? 'Актуальность Drive не проверена.'
					: ''
	return {
		status,
		isDirty: dirty,
		remoteUnknown: unknown,
		hasRemoteAhead: remote,
		hasConflict: conflict,
		showModifiedMark: dirty,
		showSyncIcon: remote || unknown,
		titleSuffix: (dirty ? ' *' : '') + (status === 'unknown' ? ' ?' : remote ? ' ⚠' : ''),
		tooltip,
		statusIcon: icons[status],
		canSave: getCanSave(session),
		canSync: getCanSave(session),
		canPull: getCanPullRemote(session),
		shouldWarnOnClose: getShouldWarnOnClose(session),
		closeMessage
	}
}

export function shouldCheckRemote(
	session: DocumentSession,
	availability: AppDriveAvailability,
	now = Date.now(),
	ttl = REMOTE_CHECK_TTL_MS
): boolean {
	return (
		availability === 'drive-available' &&
		!!session.ref?.fileId &&
		(session.sync.needsRemoteCheck || !isRemoteCheckFresh(session, now, ttl))
	)
}
