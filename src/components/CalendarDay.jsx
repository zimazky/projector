import styles from './CalendarDay.module.css'
import DateTime from '../utils/datetime.js'

export default function CalendarDay({data, onAddEvent=()=>{}, children = null}) {
  const {timestamp, actualBalance, plannedBalance, plannedBalanceChange} = data
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
  const plus = d => d>0?'+'+d.toFixed(1):d.toFixed(1)

  return (
    <div className={styles.day} onClick={onClickHandle}>
      <div className={styles.header}>{day + (day==1?' '+DateTime.MONTHS[month]:'') }</div>
      <div className={styles.balance}>{minimize(plannedBalance) + 
        (plannedBalanceChange==0?'k':plus(plannedBalanceChange/1000)+'k') +
        ' ' + minimize(actualBalance)}</div>
      <div> {children} </div>
      <div ref={inputElementRef} className={styles.input} contentEditable='true' suppressContentEditableWarning={true}
      onBlur={onBlurHandle} onKeyDown={onKeyDownHandle}></div>
    </div> 
  )
}
