import styles from './CalendarDay.module.css'
import DateTime from '../utils/datetime.js'

export default function CalendarDay({timestamp, dayHeight, balance, children = null}) {
  const {day, month} = DateTime.getDayMonthWeekday(timestamp)
  
  return (
    <div className={styles.CalendarDay} style={{height: dayHeight}}>
      <div className={styles.CalendarDayHeader}>{day + (day==1?' '+DateTime.MONTHS[month]:'') }</div>
      <div>{balance}</div>
      <div className="CalendarDayTasks"> {children} </div>
      <div className={styles.DayTaskInput}>
        <textarea  rows={1} wrap='off'></textarea>
      </div>


    </div> 
    )
}
