import type { DriveFileMetadata } from 'src/7-shared/services/gapi'

export interface ConflictDialogProps {
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
