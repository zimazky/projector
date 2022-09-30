import React from 'react'
import styles from './Modal.module.css'

export default function({isOpen = false, onCancel=()=>{}, children=null}) {

  return (
    isOpen &&
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalWindow} onClick={e=>e.stopPropagation()}>
        <div className={styles.modalBody}>
          {children}
        </div>
      </div>
    </div>
  )
}