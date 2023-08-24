import React from 'react'

import DateTime from 'src/7-shared/helpers/DateTime'

import { calendarStore, mainStore } from 'src/6-entities/stores/MainStore'

import styles from './Time.module.css'

export default function Time() {
  const [time, setTime] = React.useState('')
  React.useEffect(() => {
    setInterval(()=>{ setTime(DateTime.getHHMMSS(Date.now()/1000)) }, 1000)
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