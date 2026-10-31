import React, { useState } from 'react'
import { observer } from 'mobx-react-lite'
import Dialog from 'src/7-shared/ui/Dialog/Dialog'
import TextField from 'src/7-shared/ui/TextField/TextField'
import TextButton from 'src/7-shared/ui/Button/TextButton'
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions'
import DialogContent from 'src/7-shared/ui/Dialog/DialogContent'
import styles from './FileConflictResolver.module.css' // Will create this later
import type { DriveFileMetadata } from 'src/7-shared/services/gapi'

interface FileConflictResolverProps {
	isOpen: boolean
	conflictingFileName: string
	conflictingFiles: DriveFileMetadata[]
	selectedFileId: string
	onSelectedFileIdChange: (id: string) => void
	error: string | null
	isSaving: boolean
	newFileNameForConflict: string
	onNewFileNameChange: (newName: string) => void
	onResolve: (resolution: 'overwrite' | 'rename' | 'cancel') => void
}

const FileConflictResolver: React.FC<FileConflictResolverProps> = observer(
	({
		isOpen,
		conflictingFileName,
		conflictingFiles,
		selectedFileId,
		onSelectedFileIdChange,
		error,
		isSaving,
		newFileNameForConflict,
		onNewFileNameChange,
		onResolve
	}) => {
		// Define state for showing the rename input field, moved from SaveToDrive
		const [showRenameInput, setShowRenameInput] = useState(false)
		React.useEffect(() => {
			if (!isOpen) setShowRenameInput(false)
		}, [isOpen])

		const handleConfirmRename = () => {
			onResolve('rename')
			setShowRenameInput(false) // Hide rename input after resolution
		}

		const handleCancel = () => {
			onResolve('cancel')
			setShowRenameInput(false) // Hide rename input after resolution
		}

		const handleOverwrite = () => {
			onResolve('overwrite')
			setShowRenameInput(false) // Hide rename input after resolution
		}

		return (
			<Dialog open={isOpen} onClose={handleCancel}>
				<h3 className={styles.dialogTitle}>Конфликт имени файла</h3>
				<DialogContent>
					<p>Файл "{conflictingFileName}" уже существует в этой папке. Что вы хотите сделать?</p>
					{conflictingFiles.length > 1 && (
						<label>
							Файл для перезаписи
							<select
								aria-label="Файл для перезаписи"
								value={selectedFileId}
								disabled={isSaving}
								onChange={event => onSelectedFileIdChange(event.target.value)}
							>
								<option value="">Выберите файл</option>
								{conflictingFiles.map(file => (
									<option key={file.id} value={file.id}>
										{file.name} — {file.id}
									</option>
								))}
							</select>
						</label>
					)}
					{error && <p role="alert">{error}</p>}
					{showRenameInput && (
						<TextField
							label="Новое имя файла"
							value={newFileNameForConflict}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => onNewFileNameChange(e.target.value)}
							className={styles.fileNameInput}
						/>
					)}
				</DialogContent>
				<DialogActions>
					<TextButton onClick={handleOverwrite} disabled={isSaving || !selectedFileId}>
						Перезаписать
					</TextButton>
					<TextButton onClick={() => setShowRenameInput(true)} disabled={isSaving}>
						Переименовать
					</TextButton>
					<TextButton
						onClick={handleConfirmRename}
						disabled={isSaving || !showRenameInput || newFileNameForConflict.trim() === ''}
					>
						Подтвердить переименование
					</TextButton>
					<TextButton onClick={handleCancel} disabled={isSaving}>
						Отмена
					</TextButton>
				</DialogActions>
			</Dialog>
		)
	}
)

export default FileConflictResolver
