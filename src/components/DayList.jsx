//import styles from './CalendarDay.module.css'
import DateTime from '../utils/datetime.js'

function EventItem({event, timestamp, onClick=(compactEvent)=>{}}) {
  const {name,completed,background,color,repeatable,start,end,time,credit,debit} = event
  return (
    <div className={completed?styles.completed:repeatable?styles.repeatable:styles.item}
      style={{backgroundColor: background,color: color}} 
      onClick={e=>{e.stopPropagation(); onClick(event)}}
    >
      {start<timestamp?<div className={styles.start}>{DateTime.getYYYYMMDD(start)}</div>:<div></div>}
      <div className={styles.name}>{name}</div>
      <div className={styles.time}>{DateTime.HHMMFromSeconds(time)}</div>
      <div className={styles.credit}>{credit.toFixed(2)}</div>
      <div className={styles.debit}>{debit.toFixed(2)}</div>
      {(timestamp+86400)<end?<div className={styles.end}>{DateTime.getYYYYMMDD(end)}</div>:<div></div>}
    </div>
  )
}

export default function DayList({data, today=false, onAddEvent=()=>{}, children = null}) {
  const {timestamp, actualBalance, lastActualBalanceDate, plannedBalance, plannedBalanceChange} = data
  const inputElementRef = React.useRef(null)
  const {day, month} = DateTime.getDayMonthWeekday(timestamp)

  function onClickHandle(e) {
    if(inputElementRef) inputElementRef.current.focus()
  }
  function onKeyDownHandle(e) {
    console.log('key',e.key)
    if (e.key == 'Enter') e.target.blur()
  }
  function onBlurHandle(e) {
    onAddEvent(timestamp, e.target.innerText)
    e.target.innerText = ''
  } 

  const minimize = d => (d/1000).toFixed(1)
  const plus = (d,n=1) => d>0?'+'+d.toFixed(1):d.toFixed(n)

  return (
    <div className={timestamp>=lastActualBalanceDate?styles.day:styles.before_actual_date}
    onClick={onClickHandle}>
      <div className={today?styles.today:styles.header}>{day + (day==1?' '+DateTime.MONTHS[month]:'') }</div>
      <div className={styles.balance}>
        {minimize(plannedBalance) + 
        (plannedBalanceChange==0?'k':plus(plannedBalanceChange/1000)+'k') +
        ' ' + minimize(actualBalance)}
      </div>
      { tasks.map((t,i)=>(<EventItem key={i} event={t} onClick={openEventForm}/>))}
      <div ref={inputElementRef} className={styles.input} 
        contentEditable='true' 
        suppressContentEditableWarning={true}
        onBlur={onBlurHandle} 
        onKeyDown={onKeyDownHandle}>
      </div>
    </div> 
  )
}
