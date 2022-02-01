import DateTime from '../utils/datetime.js'
import styles from './EventItem.module.css'

export default function EventItem({event, days, onClick=(compactEvent)=>{}, onDragStart=e=>{}}) {
  const {name,completed,background,color,repeatable} = event
  return ( 
  event.id === -1 ?
  <div className={styles.placeholder} ></div>
  :
  <div className={completed?styles.completed:repeatable?styles.repeatable:styles.item}
    draggable={true} onDragStart={onDragStart}
    style={{
      width: days==1?'calc(100% + 2px)':'calc(' +days +' * (100% + 1px) + 1px )',
      backgroundColor: background,
      color: color
    }} 
    onClick={e=>{e.stopPropagation(); onClick(event)}}>
{/*    <div className={styles.event_row}>*/}
{/*      <div className={styles.complete_button}>{completed?'✔':'☐'}</div>*/}
      <div className={styles.name}>{name}</div>{' '+DateTime.HHMMFromSeconds(event.time)}
{/*    </div>*/}
  </div>)
}
