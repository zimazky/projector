import React from 'react'
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

  const onChangeRef = React.useCallback((node: HTMLTextAreaElement) => {
    if(node !== null) {
      node = new Proxy<HTMLTextAreaElement>(node, {
        set(target: any, prop, value) {
          if(prop === 'value') target.parentNode.dataset.replicatedValue = value
          target[prop] = value
          return true
        },
        get(target: any, prop) { return target[prop] }
      })
    }
    if(!ref) return
    if(typeof ref === 'function') ref(node)
    else ref.current = node
  }, [])

  return (
  <div className={styles.container + (error?' '+styles.error:'')} data-replicated-value={value}>
    <textarea rows={1} className={styles.input} ref={onChangeRef} defaultValue={value} placeholder=' ' disabled={disabled} 
    {...rest}
    onInput={ e => {
      const parent = e.currentTarget.parentNode as HTMLElement
      parent.dataset.replicatedValue = e.currentTarget.value
    }}/>
    <label className={styles.label}>{label}</label>
  </div>
  )
})

export default TextArea