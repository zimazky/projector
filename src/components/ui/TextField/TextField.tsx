import React from 'react'
import styles from './TextField.module.css'

interface Props {
  label: string
  value?: string
  error?: boolean
}

export const TextField = React.forwardRef<HTMLInputElement, Props>(function (props, ref) {
  const {label, value, error, ...rest} = props
  console.log('error', error)
  return (
  <div className={styles.container + (error?' '+styles.error:'')}>
    <input className={styles.input} ref={ref} type='text' defaultValue={value} placeholder=' ' {...rest} />
    <label className={styles.label}>{label}</label>
  </div>
  )
})