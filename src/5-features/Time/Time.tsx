import React from 'react'

import DateTime from 'src/7-shared/libs/DateTime/DateTime'

import { calendarStore, mainStore } from 'src/6-entities/stores/MainStore'

import styles from './Time.module.css'

export default function Time() {
  const t = Date.now()/1000
  const s = 60 - t%60
  const [time, setTime] = React.useState(DateTime.getHHMM(t))
  React.useEffect(() => {
    setTimeout(()=>{
      setTime(DateTime.getHHMM(Date.now()/1000))
      setInterval(()=>{ setTime(DateTime.getHHMM(Date.now()/1000)) }, 60000)
    }, s*1000)
  }, [])

  return <span 
    className={styles.time} 
    onClick={()=>{
      calendarStore.setWeek(Date.now()/1000)
      mainStore.forceUpdate()
    }}>
      {time}
    </span>
}