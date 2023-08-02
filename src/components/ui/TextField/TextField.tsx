import React from 'react'
import styles from './TextField.module.css'

interface Props {
  /** Ярлык */
  label: string
  /** Значение */
  value?: string
  /** Признак ошибки валидации */
  error?: boolean
  /** Признак неактивного поля */
  disabled?: boolean
}

const TextField = React.forwardRef<HTMLInputElement, Props>(function (props, ref) {
  const {label, value, disabled, error, ...rest} = props
  return (
  <div className={styles.container + (error?' '+styles.error:'')}>
    <input className={styles.input} ref={ref} type='text' defaultValue={value} placeholder=' ' disabled={disabled} {...rest} />
    <label className={styles.label}>{label}</label>
  </div>
  )
})

export default TextField