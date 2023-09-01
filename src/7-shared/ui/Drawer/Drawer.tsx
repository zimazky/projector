import React from 'react'
import styles from './Drawer.module.css'

type DrawerProps = {
  /** Признак открытого сайдбара */
  open?: boolean
  /** Функция, вызываемая при закрытии сайдбара */
  onClose?: () => void
  children: React.ReactNode
}

const Drawer: React.FC<DrawerProps> = ({open = false, onClose = ()=>{}, children = null}) => {
  return (
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
  )
}

export default Drawer