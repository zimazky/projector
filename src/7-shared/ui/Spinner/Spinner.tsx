import React from 'react'
import styles from './Spinner.module.css'

interface SpinnerProps {
  children?: React.ReactNode
}

const Spinner: React.FC<SpinnerProps> = ({children}) => {
  return <div className={styles.spinner}>
    <svg viewBox="0 0 44 44">
      <circle className={styles.circle} cx={22} cy={22} r={20.2} fill='none' strokeWidth={3.6}></circle>
    </svg>
  </div>
}

export default Spinner
