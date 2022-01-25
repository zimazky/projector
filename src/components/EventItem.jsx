import DateTime from '../utils/datetime.js'
import styles from './EventItem.module.css'

export default function EventItem({event, days, onClick=(compactEvent)=>{} }) {
  const {name,completed,background,color} = event
  return (
  <div className={styles.item} 
    style={{
      width: days==1?'calc(100% + 2px)':'calc(' +days +' * (100% + 1px) + 1px )',
      backgroundColor: background,
      color: color
    }} 
    onClick={e=>{e.stopPropagation(); onClick(event)}}>
    {completed && <div className={styles.completed}></div>}
    <div className={styles.event_row}>
      <div className={styles.complete_button}>{completed?'✔':'☐'}</div>
      <span className={styles.name}>{name}</span>
      <span className={styles.time}>{DateTime.HHMMFromSeconds(event.time)}</span>
    </div>
  </div>)
}

export function EventPlaceholder() {
  return <div className={styles.EventPlaceholder} ></div>
}