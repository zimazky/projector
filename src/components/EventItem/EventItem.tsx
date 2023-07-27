import React from 'react'
import DateTime from '../../utils/datetime'
import styles from './EventItem.module.css'

export default function EventItem({event, days, timestamp, onClick=(compactEvent)=>{}, onDragStart=e=>{}}) {
  const {name,completed,background,color,repeatable,start,time,end} = event
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
    onClick={e=>{e.stopPropagation(); onClick(event)}}
    title={
      name+
      (event.time!==null?'\ntime: '+DateTime.secondsToHMM(event.time):'')
      +(event.credit?'\ncredit: '+event.credit:'')
      +(event.debit?'\ndebit: '+event.debit:'')
    }>
      <div className={styles.name}>{
      timestamp-start === 0 ? name : `${(timestamp-start)/86400+1}/${(end-start)/86400} ${name}`
      }</div> <div className={styles.time}>{
      event.time === null ?
      (event.days-days>0?` ${(timestamp-start)/86400+days}/${(end-start)/86400}`:'')
      : DateTime.secondsToHMM(time)
      }</div>
  </div>)
}
