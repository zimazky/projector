import React from 'react'
import styles from './DayList.module.css'
import DateTime, { timestamp } from 'src/utils/DateTime'
import {eventsCache, mainStore} from 'src/stores/MainStore'
import { plus } from 'src/utils/utils'
import DayListEventItem from './DayListEventItem'

type DayListProps = {
  timestamp: timestamp
}

const DayList: React.FC<DayListProps> = (props) => {

  const {timestamp} = props
  const inputElementRef = React.useRef<HTMLDivElement>(null)

  const today = DateTime.isToday(timestamp)
  const events = eventsCache.getEvents(timestamp)
  const actualBalance = eventsCache.getActualBalance(timestamp)
  //const lastActualBalanceDate = eventsCache.lastActualBalanceDate
  const plannedBalance = eventsCache.getPlannedBalance(timestamp)
  const plannedBalanceChange = eventsCache.getPlannedBalanceChange(timestamp)

  const {day, month} = DateTime.getDayMonthWeekday(timestamp)

  const onCalendarOpen = () => { mainStore.changeViewMode({mode: 'Calendar'}) }

  function onClickHandle(e: React.MouseEvent) {
    if(inputElementRef) inputElementRef.current?.focus()
  }

  function onKeyDownHandle(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key == 'Enter') e.currentTarget.blur()
  }

  function onBlurHandle(e: React.FocusEvent<HTMLElement>) {
    //onAddEvent(timestamp, e.currentTarget.innerText)
    //e.currentTarget.innerText = ''
  } 

  const minimize = (d: number) => (d/1000).toFixed(1)

  return (
    <div className={styles.day}
    onClick={onClickHandle}>
      <div>
        <div onClick={onCalendarOpen}>Calendar</div>
        <div onClick={e=>mainStore.setCurrentDay(timestamp-86400)}>Prev</div>
        <div className={today?styles.today:styles.header}>{day+' '+DateTime.MONTHS[month]}</div>
        <div onClick={e=>mainStore.setCurrentDay(timestamp+86400)}>Next</div>
      </div>
      <div className={styles.balance}>
        {minimize(plannedBalance) + 
        (plannedBalanceChange==0?'k':plus(plannedBalanceChange/1000, 1)+'k') +
        ' ' + minimize(actualBalance)}
      </div>
      <div>
        <div className={styles.start}>start</div>
        <div className={styles.name}>event</div>
        <div className={styles.time}>time</div>
        <div className={styles.credit}>credit</div>
        <div className={styles.debit}>debit</div>
        <div className={styles.end}>end</div>
      </div>
      { events.map((e,i)=>(<DayListEventItem key={i} event={e} timestamp={timestamp} />))}
      <div ref={inputElementRef} className={styles.input} 
        contentEditable='true' 
        suppressContentEditableWarning={true}
        onBlur={onBlurHandle} 
        onKeyDown={onKeyDownHandle}>
      </div>
    </div> 
  )
}

export default DayList