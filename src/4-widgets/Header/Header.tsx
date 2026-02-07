import React, { useContext } from 'react'
import { observer } from 'mobx-react-lite'

import Time from 'src/7-shared/ui/Time/Time'

import { StoreContext } from 'src/contexts/StoreContext'

import CalendarIconBar from 'src/5-features/CalendarIconBar/CalendarIconBar'

import styles from './Header.module.css'

const Header: React.FC = observer(function() {
  const { calendarStore, mainStore } = useContext(StoreContext)

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