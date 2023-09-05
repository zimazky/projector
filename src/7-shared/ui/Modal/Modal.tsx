import React from 'react'
import styles from './Modal.module.css'

type ModalProps = {
  /** Признак открытого окна */
  open: boolean
  /** Функция, вызываемая при закрытии сайдбара */
  onClose?: () => void
  children?: React.ReactNode
}

type state = 'hidden' | 'open' | 'closing'

const Modal: React.FC<ModalProps> = ({open = false, onClose = ()=>{}, children = null}) => {

  const [state, setState] = React.useState<state>(open ? 'open' : 'hidden')
  React.useEffect(()=>{
    if(open) setState('open')
    else if(state==='open') {
      setState('closing')
      setTimeout(()=>{ setState('hidden') }, 300)
    }
  }, [open])

  return state==='hidden' ? null :
  <div className={styles.overlay + ' ' + styles[state]}
    onClick={onClose}>
    <div className={styles.window} onClick={e=>e.stopPropagation()}>
      {children}
    </div>
  </div>
}

export default Modal