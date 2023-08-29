import React from 'react'

import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

import { eventFormStore, eventsStore } from 'src/6-entities/stores/MainStore'
import { EventCacheStructure } from 'src/6-entities/stores/EventsCache/EventCacheStructure'

import styles from './CalendarEventItem.module.css'

type CalendarEventItemProps = {
  /** Данные события из кэша */
  event: EventCacheStructure,
  /** Метка времени дня, unixtime */
  timestamp: timestamp,
  /** Продолжительность события в днях в пределах текущей недели */
  daysInCurrentWeek: number
}

const CalendarEventItem: React.FC<CalendarEventItemProps> = (props) => {
  const {timestamp, daysInCurrentWeek: daysInCurrentWeek} = props
  const {id, name, completed, background, color, repeatable, start, time, end, credit, debit, days} = props.event

  const [isPointerDown, setIsPointerDown] = React.useState(false)

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

  return ( id === -1
  ?
  <div className={styles.placeholder} ></div>
  :
  <div className={completed?styles.completed:repeatable?styles.repeatable:styles.item}
    draggable={true} onDragStart={onDragStart}
    style={{
      width: props.daysInCurrentWeek==1?'calc(100% + 2px)':'calc(' +props.daysInCurrentWeek +' * (100% + 1px) + 1px )',
      backgroundColor: background,
      color: color
    }}
    onPointerDown={e=>{
      if(e.isPrimary) setIsPointerDown(true)
    }}
    onPointerLeave={e=>{
      if(e.isPrimary) setIsPointerDown(false)
    }}
    onPointerCancel={e=>{
      if(e.isPrimary) setIsPointerDown(false)
    }}
    onPointerUp={e=>{
      if(e.isPrimary && isPointerDown) openEventForm(e)
    }}
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
        (days-daysInCurrentWeek>0?` ${(timestamp-start)/86400+props.daysInCurrentWeek}/${(end-start)/86400}`:'')
        : DateTime.secondsToHMM(time)
      }</div>
  </div>)
}

export default CalendarEventItem
