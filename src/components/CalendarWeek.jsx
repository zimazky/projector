import EventItem, {EventPlaceholder} from "./EventItem.jsx"
import styles from './CalendarWeek.module.css'

const min = (a,b)=>a<b?a:b
const minimize = d => (d/1000).toFixed(1)
const plus = d => d>0?'+'+d.toFixed(1):d.toFixed(1)

export default function CalendarWeek({week, onEventClick=(event)=>{}}) {
  const inputElementRef = React.useRef(null)

  return (
    <>
      <tr>{week.map( d=><td key={d.timestamp}>
        <div className={styles.day}>{new Date(d.timestamp*1000).getDate()}</div>
        <div className={styles.balance}>{
          minimize(d.plannedBalance) + 
          (d.plannedBalanceChange==0?'k':plus(d.plannedBalanceChange/1000)+'k') +
          ' ' + minimize(d.actualBalance)}</div></td>)}</tr>
      <tr className={styles.events}>{
        week.map( (d,j) => (
          <td key={d.timestamp}>{ 
              d.tasks.map((t,i)=>{
              if(t.id === -1) return <EventPlaceholder key={i}/>
              return <EventItem key={i} event={t} days={min(t.days,7-j)}
              onClick={onEventClick}/>
            })}
          <div className={styles.DayTaskInput}>
            <input ref={inputElementRef} rows={1} wrap='off' /*onBlur={onBlurHandle} onKeyDown={onKeyDownHandle}*/></input>
          </div>

          </td>
        ))}</tr>
    </>
  )
}
