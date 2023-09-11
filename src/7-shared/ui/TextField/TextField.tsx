import React from 'react'
import styles from './TextField.module.css'

interface TextFieldProps extends React.HTMLProps<HTMLInputElement> {

  /** Ярлык */
  label: string
  /** Значение */
  value?: string
  /** Признак ошибки валидации */
  error?: boolean
  /** Признак неактивного поля */
  disabled?: boolean
  children?: React.ReactNode
}

const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(function (props, ref) {
  const {label, value, disabled, error, children, ...rest} = props
  const id = React.useId()
  return (
  <div className={styles.container + (error?' '+styles.error:'')}>
    <input id={id} className={styles.input} ref={ref} type='text' defaultValue={value} placeholder=' ' disabled={disabled} {...rest} />
    <label htmlFor={id} className={styles.label}>{label}</label>
    {children}
  </div>
  )
})

export default TextField