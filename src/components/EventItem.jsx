import DateTime from '../utils/datetime.js'
import styles from './EventItem.module.css'

export default function EventItem({name, days, time=0}) {
  return <div className={styles.EventItem} style={{width: days==1?'calc(100% + 1px)':'calc(' +days +' * (100% + 1px) + 1px )'}}>
    <span>{name}</span><span className={styles.EventTime}>{DateTime.getTimeString(time)}</span></div>
}

export function EventPlaceholder() {
  return <div className={styles.EventPlaceholder} ></div>
}