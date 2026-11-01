import type { DocumentSession } from 'src/6-entities/Document/model/DocumentTabsStore.types'

/** Фикстура подтверждённой серверной базы; клиентское время не является её идентификатором. */
export function confirmedDocument(document: DocumentSession, fileId: string, version = '1'): void {
	document.ref!.fileId = fileId
	document.sync.baseRevisionId = 'drive-v3:' + encodeURIComponent(fileId) + ':' + version
	document.sync.remoteRevisionId = document.sync.baseRevisionId
	document.sync.lastRemoteCheckAt = Date.now()
	document.sync.needsRemoteCheck = false
	document.sync.origin = 'drive'
}
