import React from 'react'

import Dialog from 'src/7-shared/ui/Dialog/Dialog'
import DialogContent from 'src/7-shared/ui/Dialog/DialogContent'
import DialogActions from 'src/7-shared/ui/Dialog/DialogActions'
import TextButton from 'src/7-shared/ui/Button/TextButton'

export type YesNoCancelDecision = 'yes' | 'no' | 'cancel'

type YesNoCancelConfirmationProps = {
  open: boolean
  /** Основной текст вопроса/описания */
  children?: React.ReactNode
  /** Обработчик решения пользователя */
  onDecision: (decision: YesNoCancelDecision) => void
  /** Подписи на кнопках, по умолчанию: Да / Нет / Отмена */
  yesLabel?: React.ReactNode
  noLabel?: React.ReactNode
  cancelLabel?: React.ReactNode
}

const YesNoCancelConfirmation: React.FC<YesNoCancelConfirmationProps> = ({
  open,
  children,
  onDecision,
  yesLabel = 'Да',
  noLabel = 'Нет',
  cancelLabel = 'Отмена',
}) => {
  return (
    <Dialog open={open} onClose={() => onDecision('cancel')}>
      <DialogContent>{children}</DialogContent>
      <DialogActions>
        <TextButton onClick={() => onDecision('yes')}>{yesLabel}</TextButton>
        <TextButton onClick={() => onDecision('no')}>{noLabel}</TextButton>
        <TextButton onClick={() => onDecision('cancel')}>{cancelLabel}</TextButton>
      </DialogActions>
    </Dialog>
  )
}

export default YesNoCancelConfirmation

