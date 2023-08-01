import React from 'react'
import DateTime, { timestamp } from 'src/utils/DateTime'
import styles from './CalendarEventItem.module.css'
import { eventFormStore, eventsStore } from 'src/stores/MainStore'
import { EventCacheStructure } from 'src/stores/EventsCache/EventCacheStructure'

type EventItemProps = {
  event: EventCacheStructure,
  timestamp: timestamp,
  days: number
}

export default function EventItem(props: EventItemProps) {
  const {timestamp, days} = props
  const {id, name, completed, background, color, repeatable, start, time, end, credit, debit} = props.event

  const openEventForm = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    const s = eventsStore.getEventData(id)
    if(s === undefined) return
    eventFormStore.setEventData({...s, id, completed, timestamp: start})
    eventFormStore.showForm()
  }

  const onDragStart = (e: React.DragEvent<HTMLElement>) => {
    e.dataTransfer.setData('event_item', JSON.stringify(props.event))
  }

  return ( 
  id === -1 ?
  <div className={styles.placeholder} ></div>
  :
  <div className={completed?styles.completed:repeatable?styles.repeatable:styles.item}
    draggable={true} onDragStart={onDragStart}
    style={{
      width: days==1?'calc(100% + 2px)':'calc(' +days +' * (100% + 1px) + 1px )',
      backgroundColor: background,
      color: color
    }} 
    onClick={openEventForm}
    title={
      name+
      (time!==null?'\ntime: ' + DateTime.secondsToHMM(time) : '')
      + (credit?'\ncredit: ' + credit:'')
      + (debit?'\ndebit: ' + debit:'')
    }>
      <div className={styles.name}>{
        timestamp-start === 0 ? name : `${(timestamp-start)/86400+1}/${(end-start)/86400} ${name}`
        }</div> <div className={styles.time}>{
        time === null ?
        (days-days>0?` ${(timestamp-start)/86400+days}/${(end-start)/86400}`:'')
        : DateTime.secondsToHMM(time)
      }</div>
  </div>)
}
