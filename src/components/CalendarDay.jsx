import styles from './CalendarDay.module.css'
import DateTime from '../utils/datetime.js'

export default function CalendarDay({timestamp, dayHeight, actualBalance, plannedBalance, onAddEvent=()=>{}, children = null}) {
  const inputElementRef = React.useRef(null)
  const {day, month} = DateTime.getDayMonthWeekday(timestamp)

  function onClickHandle(e) {
    if(inputElementRef) {
      //console.log(inputElementRef.current)
      inputElementRef.current.focus()
    }
  }
  function onKeyDownHandle(e) {
    if (e.keyCode === 13) e.target.blur()
  }
  function onBlurHandle(e) {
    //console.log(e.target.value)
    onAddEvent(timestamp, e.target.value)
    e.target.value = ''
  } 

  return (
    <div className={styles.CalendarDay} style={{height: dayHeight}} onClick={onClickHandle}>
      <div className={styles.CalendarDayHeader}>{day + (day==1?' '+DateTime.MONTHS[month]:'') }</div>
      <div>{actualBalance}</div>
      <div>{plannedBalance}</div>
      <div className="CalendarDayTasks"> {children} </div>
      <div className={styles.DayTaskInput}>
        <input ref={inputElementRef} rows={1} wrap='off' onBlur={onBlurHandle} onKeyDown={onKeyDownHandle}></input>
      </div>


    </div> 
    )
}
