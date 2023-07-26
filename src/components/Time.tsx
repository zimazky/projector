import React from 'react'
import styles from './Time.module.css'
import DateTime from 'src/utils/datetime'
import { mainStore } from 'src/stores/MainStore'

export default function Time() {
  const [time, setTime] = React.useState('')
  React.useEffect(() => {
    setInterval(()=>{ setTime(DateTime.getHHMMSS(Date.now()/1000)) }, 1000)
  }, [])

  return <span 
    className={styles.time} 
    onClick={()=>{
      mainStore.setCurrentDay(DateTime.getBeginDayTimestamp(Date.now()/1000))
      mainStore.forceUpdate()
    }}>
      {time}
    </span>
}