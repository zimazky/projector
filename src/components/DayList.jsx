import styles from './DayList.module.css'
import DateTime from '../utils/datetime.js'
import {eventList} from '../model/data.js'

function EventItem({event, timestamp, onClick=(compactEvent)=>{}}) {
  const {name,completed,background,color,repeatable,start,end,time,credit,debit} = event
  console.log('st',start,timestamp)

  return (
    <div className={completed?styles.completed:repeatable?styles.repeatable:styles.item}
      style={{backgroundColor: background,color: color}} 
      onClick={e=>{e.stopPropagation(); onClick(event)}}
    >
      {(start<timestamp)?<div className={styles.start}>{DateTime.getYYYYMMDD(start)}</div>
      :<div className={styles.startplaceholder}></div>}
      <div className={styles.name}>{name}</div>
      <div className={styles.time}>{DateTime.HHMMFromSeconds(time)}</div>
      <div className={styles.credit}>{credit?credit.toFixed(2):''}</div>
      <div className={styles.debit}>{debit?debit.toFixed(2):''}</div>
      {(timestamp+86400)<end?<div className={styles.end}>{DateTime.getYYYYMMDD(end)}</div>:<div> </div>}
    </div>
  )
}

export default function DayList({timestamp, onAddEvent=()=>{}, onChangeDate=()=>{}, onCalendarOpen=()=>{}}) {

  const today = DateTime.isToday(timestamp)
  const events = eventList.getEvents(timestamp)
  const actualBalance = eventList.getActualBalance(timestamp)
  const lastActualBalanceDate = eventList.lastActualBalanceDate
  const plannedBalance = eventList.getPlannedBalance(timestamp)
  const plannedBalanceChange = eventList.getPlannedBalanceChange(timestamp)

  const inputElementRef = React.useRef(null)
  const {day, month} = DateTime.getDayMonthWeekday(timestamp)

  function onClickHandle(e) {
    if(inputElementRef) inputElementRef.current.focus()
  }
  function onKeyDownHandle(e) {
    if (e.key == 'Enter') e.target.blur()
  }
  function onBlurHandle(e) {
    onAddEvent(timestamp, e.target.innerText)
    e.target.innerText = ''
  } 

  const minimize = d => (d/1000).toFixed(1)
  const plus = (d,n=1) => d>0?'+'+d.toFixed(1):d.toFixed(n)

  return (
    <div className={styles.day}
    onClick={onClickHandle}>
      <div>
        <div onClick={onCalendarOpen}>Calendar</div>
        <div onClick={e=>onChangeDate(timestamp-86400)}>Prev</div>
        <div className={today?styles.today:styles.header}>{day+' '+DateTime.MONTHS[month]}</div>
        <div onClick={e=>onChangeDate(timestamp+86400)}>Next</div>
      </div>
      <div className={styles.balance}>
        {minimize(plannedBalance) + 
        (plannedBalanceChange==0?'k':plus(plannedBalanceChange/1000)+'k') +
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
      { events.map((e,i)=>(<EventItem key={i} event={e} timestamp={timestamp} /*onClick={openEventForm}*//>))}
      <div ref={inputElementRef} className={styles.input} 
        contentEditable='true' 
        suppressContentEditableWarning={true}
        onBlur={onBlurHandle} 
        onKeyDown={onKeyDownHandle}>
      </div>
    </div> 
  )
}
