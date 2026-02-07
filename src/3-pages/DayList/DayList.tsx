import React, { useContext } from 'react'
import { observer } from 'mobx-react-lite'

import DateTime from 'src/7-shared/libs/DateTime/DateTime'
import { kilo, plus } from 'src/7-shared/helpers/utils'

import { StoreContext } from 'src/contexts/StoreContext'

import DayListEventItem from './DayListEventItem'
import styles from './DayList.module.css'

const DayList: React.FC = observer(() => {
  const { dayListStore, uiStore } = useContext(StoreContext)

  const inputElementRef = React.useRef<HTMLDivElement>(null)

  const timestamp = dayListStore.date
  const today = DateTime.isToday(timestamp)
  const { events, actualBalance, plannedBalance, plannedBalanceChange } = dayListStore.getDayListStructure()

  const {day, month} = DateTime.getDayMonthWeekday(timestamp)

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

  return (
    <div className={styles.day}
    onClick={onClickHandle}>
      <div>
        <div onClick={()=>uiStore.changeViewMode({mode: 'Calendar'})}>Calendar</div>
        <div onClick={e=>dayListStore.setDate(timestamp-86400)}>Prev</div>
        <div className={today?styles.today:styles.header}>{day+' '+DateTime.getMonthShortNamesArray()[month]}</div>
        <div onClick={e=>dayListStore.setDate(timestamp+86400)}>Next</div>
      </div>
      <div className={styles.balance}>
        {kilo(plannedBalance, 1) + 
        (plannedBalanceChange==0?'k':plus(plannedBalanceChange/1000, 1)+'k') +
        ' ' + kilo(actualBalance, 1)}
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
})

export default DayList