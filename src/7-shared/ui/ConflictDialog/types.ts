import type { DriveFileMetadata } from 'src/7-shared/services/gapi'
import type { DocumentUiState } from 'src/6-entities/Document/model/DocumentSyncSelectors'

export interface ConflictDialogProps {
	ui: DocumentUiState
	open: boolean
	localModifiedAt: number
	remoteModifiedAt: number
	hasLocalChanges: boolean
	hasRemoteChanges: boolean
	remoteMetadata: DriveFileMetadata
	onChooseLocal: () => void
	onChooseRemote: () => void
	onCancel: () => void
}
