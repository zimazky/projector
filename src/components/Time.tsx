import React from 'react'
import styles from './Time.module.css'
import DateTime from 'src/utils/datetime'

export default function Time() {
  const [time, setTime] = React.useState('')
  React.useEffect(() => {
    setInterval(()=>{ setTime(DateTime.getHHMMSS(Date.now()/1000)) }, 1000)
  }, [])

  return <span className={styles.time}>{time}</span>
}