import React from 'react'
import styles from './TextField.module.css'

interface TextFieldProps {
  label: string
  value?: string
}

export default function TextField(props: TextFieldProps) {
  const {label, value = null} = props
  return (
  <div className={styles.container}>
    <label className={styles.label + (value?' '+styles.notempty:'')}>{label}</label>
    <input className={styles.input} type='text' value={value}/>
  </div>
  )
}