import React from 'react'
import styles from './DialogContent.module.css'

type DialogContentProps = {
  children?: React.ReactNode
}

const DialogContent: React.FC<DialogContentProps> = ({children}) => {
  return <div className={styles.content}>{children}</div>
}

export default DialogContent