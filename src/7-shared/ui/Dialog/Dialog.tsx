import React from 'react'
import styles from './Dialog.module.css'

type DialogProps = {
  /** Признак открытого окна */
  open: boolean
  /** Функция, вызываемая при закрытии сайдбара */
  onClose?: () => void
  children?: React.ReactNode
}

const Dialog: React.FC<DialogProps> = ({open = false, onClose = ()=>{}, children = null}) => {
  return ( open?
    <div className={styles.overlay + (open?' '+styles.open:'')}
      onClick={e=>{
        const el = e.currentTarget as HTMLElement
        el.classList.replace(styles.open, styles.closing)
        setTimeout(onClose, 225)
      }}>
      <div className={styles.window} onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </div>
    : null
  )
}

export default Dialog