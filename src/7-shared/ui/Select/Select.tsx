import React from 'react'
import styles from './Select.module.css'

interface Props {
  label: string
  options: {value: string, label:string}[]
  value: string
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void
  disabled?: boolean
  error?: boolean
  className?: string; // Add className prop
}

const Select = React.forwardRef<HTMLSelectElement, Props>(function (props, ref) {
  const {label, options, value, disabled, error, onChange, className, ...rest} = props
  return (
  <div className={styles.container + (error?' '+styles.error:'') + (className ? ' ' + className : '')}>
    <select className={styles.select} ref={ref} disabled={disabled} value={value} onChange={onChange} {...rest}>
      {options.map((o,i) => <option key={i} value={o.value}>{o.label}</option>)}
    </select>
    <label className={styles.label}>{label}</label>
  </div>
  )
})

export default Select