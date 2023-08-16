import React from 'react'
import styles from './Button.module.css'

export default function({active=false, disabled=false, children='Button', ...attributes}) {

  return (
    <span className={`${styles.button} ${active?styles.active:''}`} {...attributes}>
      {children}
    </span>
  )
}