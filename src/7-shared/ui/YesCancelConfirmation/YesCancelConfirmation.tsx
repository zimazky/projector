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

const YesCancelConfirmation: React.FC<YesCancelConfirmationProps> = ({open, onClose, onConfirm, children}) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>{children}</DialogContent>
      <DialogActions>
        <TextButton onClick={onConfirm}>Yes</TextButton>
        <TextButton onClick={onClose}>Cancel</TextButton>
      </DialogActions>
    </Dialog>
  )
}

export default YesCancelConfirmation