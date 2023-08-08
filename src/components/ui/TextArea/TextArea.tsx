import React, { useCallback } from 'react'
import styles from './TextArea.module.css'

interface TextAreaProps {
  /** Ярлык */
  label: string
  /** Значение */
  value?: string
  /** Признак ошибки валидации */
  error?: boolean
  /** Признак неактивного поля */
  disabled?: boolean
}

const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(function (props, ref) {
  const {label, value, disabled, error, ...rest} = props

  return (
  <div className={styles.container + (error?' '+styles.error:'')} data-replicated-value={value}>
    <textarea className={styles.input} ref={ref} defaultValue={value} placeholder=' ' disabled={disabled} 
    {...rest}
    onInput={ e => {
      const parent = e.currentTarget.parentNode as HTMLElement
      if(parent !== null) {
        parent.dataset.replicatedValue = e.currentTarget.value
      }
    }}/>
    <label className={styles.label}>{label}</label>
  </div>
  )
})

export default TextArea