import React from 'react'
import styles from './Modal.module.css'

export default function({onCancel=()=>{}, children=null}) {

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