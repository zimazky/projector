import React from 'react'

import DateTime, { timestamp } from 'src/7-shared/libs/DateTime/DateTime'

import { EventCacheStructure } from 'src/6-entities/stores/EventsCache/EventCacheStructure'

import styles from './DayListEventItem.module.css'

type DayListEventItemProps = {
  event: EventCacheStructure,
  timestamp: timestamp
}

const DayListEventItem: React.FC<DayListEventItemProps> = ({event, timestamp}) => {
  const {name,completed,background,color,repeatable,start,end,time,credit,debit} = event

  return (
    <div className={completed?styles.completed:repeatable?styles.repeatable:styles.item}
      style={{backgroundColor: background,color: color}} 
      onClick={e=>{e.stopPropagation(); /*onClick(event)*/}}
    >
      {(start<timestamp)?<div className={styles.start}>{DateTime.getYYYYMMDD(start)}</div>
      :<div className={styles.startplaceholder}></div>}
      <div className={styles.name}>{name}</div>
      <div className={styles.time}>{time===null?'':DateTime.secondsToHMM(time)}</div>
      <div className={styles.credit}>{credit?credit.toFixed(2):''}</div>
      <div className={styles.debit}>{debit?debit.toFixed(2):''}</div>
      {(timestamp+86400)<end?<div className={styles.end}>{DateTime.getYYYYMMDD(end)}</div>:<div> </div>}
    </div>
  )
}

export default DayListEventItem
