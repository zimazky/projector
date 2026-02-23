import React from 'react'

import Dialog from 'src/7-shared/ui/Dialog/Dialog'
import DialogContent from 'src/7-shared/ui/Dialog/DialogContent'
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions'
import TextButton from 'src/7-shared/ui/Button/TextButton'

export type UnsavedDecision = 'save' | 'discard' | 'cancel'

type UnsavedChangesPromptProps = {
  open: boolean
  actionName: string
  onDecision: (decision: UnsavedDecision) => void
}

/**
 * Переиспользуемый диалог подтверждения при несохраненных изменениях.
 * Возвращает одно из решений: сохранить / не сохранять / отмена.
 */
const UnsavedChangesPrompt: React.FC<UnsavedChangesPromptProps> = ({ open, actionName, onDecision }) => {
  return (
    <Dialog open={open} onClose={() => onDecision('cancel')}>
      <DialogContent>
        Есть несохраненные изменения.
        <br />
        Что сделать перед действием "{actionName}"?
      </DialogContent>
      <DialogActions>
        <TextButton onClick={() => onDecision('save')}>Сохранить</TextButton>
        <TextButton onClick={() => onDecision('discard')}>Не сохранять</TextButton>
        <TextButton onClick={() => onDecision('cancel')}>Отмена</TextButton>
      </DialogActions>
    </Dialog>
  )
}

export default UnsavedChangesPrompt
