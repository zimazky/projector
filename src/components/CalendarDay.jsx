import styles from './CalendarDay.module.css'
import { MONTHS, getDayMonthWeekday } from '../daytime'

export default function CalendarDay({timestamp, dayHeight, balance, children = null}) {
  const {day, month} = getDayMonthWeekday(timestamp)
  
  return (
    <div className={styles.CalendarDay} style={{height: dayHeight}}>
      <div className={styles.CalendarDayHeader}>{day + (day==1?' '+MONTHS[month]:'') }</div>
      <div>{balance}</div>
      <div className="CalendarDayTasks"> {children} </div>
      <div className={styles.DayTaskInput}>
        <textarea  rows={1} wrap='off'></textarea>
      </div>


    </div> 
    )
}
