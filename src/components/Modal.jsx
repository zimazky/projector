import styles from './Modal.module.css'

export default function({isOpen = false, onSubmit=()=>{}, onCancel=()=>{}, children=null}) {

  return (
    isOpen &&
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalWindow} onClick={e=>e.stopPropagation()}>
        <div className={styles.modalBody}>
          {children}
        </div>
        <div className={styles.modalFooter}>
          <span className={styles.cancel} onClick={onCancel}>Cancel</span>
          <span className={styles.apply} onClick={onSubmit}>Apply</span>
        </div>
      </div>
    </div>
  )
}