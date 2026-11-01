import React from 'react'

import TextButton from 'src/7-shared/ui/Button/TextButton'
import Dialog from 'src/7-shared/ui/Dialog/Dialog'
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions'
import DialogContent from 'src/7-shared/ui/Dialog/DialogContent'

type YesCancelConfirmationProps = {
	/** Признак открытого окна */
	open: boolean
	/** Функция, вызываемая при отмене */
	onClose?: () => void
	/** Функция, вызываемая при подтверждении удаления */
	onConfirm?: () => void
	/** Конент */
	children?: React.ReactNode
}

const YesCancelConfirmation: React.FC<YesCancelConfirmationProps> = ({ open, onClose, onConfirm, children }) => {
	const descriptionId = React.useId()
	return (
		<Dialog open={open} onClose={onClose} aria-label="Подтверждение действия" aria-describedby={descriptionId}>
			<DialogContent>
				<div id={descriptionId}>{children}</div>
			</DialogContent>
			<DialogActions>
				<TextButton onClick={onConfirm}>Yes</TextButton>
				<TextButton onClick={onClose} data-dialog-initial-focus>
					Cancel
				</TextButton>
			</DialogActions>
		</Dialog>
	)
}

export default YesCancelConfirmation
