import React from 'react'
import styles from './Modal.module.css'

type ModalProps = {
  onCancel?: () => void
  children: React.ReactNode
}

const Modal: React.FC<ModalProps> = ({onCancel = ()=>{}, children = null}) => {
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.window} onClick={e=>e.stopPropagation()}>
          {children}
      </div>
    </div>
  )
}

export default Modal