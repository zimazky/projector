import React from 'react'
import { observer } from 'mobx-react-lite'

import { calendarStore } from 'src/6-entities/stores/MainStore'

import CalendarIconBar from 'src/5-features/CalendarIconBar/CalendarIconBar'
import Time from 'src/5-features/Time/Time'

import styles from './Header.module.css'

const Header: React.FC = observer(function() {

  return <header className={styles.header}>
    <CalendarIconBar/>
    <span className={styles.caption}>{ calendarStore.caption }</span>
    <Time></Time>
  </header>
})

export default Header