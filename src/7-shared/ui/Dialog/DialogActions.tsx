import React from 'react'
import styles from './DialogActions.module.css'

type DialogActionsProps = {
  children?: React.ReactNode
}

const DialogActions: React.FC<DialogActionsProps> = ({children}) => {
  return <div className={styles.actions}>{children}</div>
}

export default DialogActions