import React from 'react'
import styles from './Select.module.css'

interface Props {
  label: string
  options: {value: string, label:string}[]
  defaultValue?: string
  disabled?: boolean
  error?: boolean
}

const Select = React.forwardRef<HTMLSelectElement, Props>(function (props, ref) {
  const {label, options, defaultValue, disabled, error, ...rest} = props
  return (
  <div className={styles.container + (error?' '+styles.error:'')}>
    <select className={styles.select} ref={ref} disabled={disabled} defaultValue={defaultValue} placeholder=' ' {...rest}>
      {options.map((o,i) => <option key={i} value={o.value}>{o.label}</option>)}
    </select>
    <label className={styles.label}>{label}</label>
  </div>
  )
})

export default Select