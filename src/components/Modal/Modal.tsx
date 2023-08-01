import React from 'react'
import styles from './Modal.module.css'

type ModalProps = {
  onCancel: () => void
  children: React.ReactNode
}

const Modal: React.FC<ModalProps> = ({onCancel = ()=>{}, children = null}) => {
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalWindow} onClick={e=>e.stopPropagation()}>
        <div className={styles.modalBody}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default Modal