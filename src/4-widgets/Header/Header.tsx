import React, { useContext } from 'react'
import { observer } from 'mobx-react-lite'

import Time from 'src/7-shared/ui/Time/Time'

import { StoreContext } from 'src/1-app/Providers/StoreContext'

import CalendarIconBar from 'src/4-widgets/CalendarIconBar/CalendarIconBar'

import styles from './Header.module.css'

const Header: React.FC = observer(function() {
  const { calendarStore, mainStore, documentSessionStore } = useContext(StoreContext)

  return <header className={styles.header}>
    <CalendarIconBar/>
    <span className={styles.documentName}>
      {documentSessionStore.isOpened ? documentSessionStore.title : 'Документ не открыт'}
    </span>
    <span className={styles.caption}>{ calendarStore.caption }</span>
    <Time onClick={()=>{
      calendarStore.setWeek(Date.now()/1000)
      mainStore.forceUpdate()
    }}></Time>
  </header>
})

export default Header
