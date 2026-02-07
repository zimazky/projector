import React from 'react'
import { observer } from 'mobx-react-lite'

import Time from 'src/7-shared/ui/Time/Time'

import { calendarStore, mainStore } from 'src/root'

import CalendarIconBar from 'src/5-features/CalendarIconBar/CalendarIconBar'

import styles from './Header.module.css'

const Header: React.FC = observer(function() {

  return <header className={styles.header}>
    <CalendarIconBar/>
    <span className={styles.caption}>{ calendarStore.caption }</span>
    <Time onClick={()=>{
      calendarStore.setWeek(Date.now()/1000)
      mainStore.forceUpdate()
    }}></Time>
  </header>
})

export default Header