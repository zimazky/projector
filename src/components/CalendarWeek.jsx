import EventItem, {EventPlaceholder} from "./EventItem.jsx"
import styles from './CalendarWeek.module.css'
import CalendarDay from "./CalendarDay.jsx"

const min = (a,b)=>a<b?a:b

export default function CalendarWeek({week, onEventClick=(event)=>{}}) {

  return (
    <tr className={styles.week}>{week.map( (d,j)=><CalendarDay key={d.timestamp} data={d}> {
      d.tasks.map((t,i)=>{
        if(t.id === -1) return <EventPlaceholder key={i}/>
        return <EventItem key={i} event={t} days={min(t.days,7-j)} onClick={onEventClick}/>
      })}
      </CalendarDay>
      )}</tr>
  )
}
