import React from "react"
import DateTime, { timestamp } from "src/7-shared/libs/DateTime/DateTime"
import DayButton from "./DayButton"

import styles from './DatePickerCalendar.module.css'

type DatePickerCalendarProps = {
  /** Год */
  year: number
  /** Месяц (0..11) */
  month: number
  /** Метка времени выбранного дня */
  selectedTS: timestamp
  /** Функция, вызываемая при клике по дню календаря */
  onSelect?: (timestamp: number)=>void
}

const DatePickerCalendar: React.FC<DatePickerCalendarProps> = (props) => {
  const {year, month, selectedTS, onSelect = ()=>{}} = props

  const timestamp =DateTime.YearMonthDayToTimestamp(year, month, 1)
  const daysInMonth = DateTime.getDaysInMonth(year, month)
  // Смещение начала месяца от начала недели с учетом локализации
  const weekdayShift = (7 + DateTime.getWeekday(timestamp) - DateTime.startWeek) % 7
  const todayTS = DateTime.getBeginDayTimestamp(Date.now()/1000)

  const dayStructures: DayStructure[] = []

  for(let i=0; i<weekdayShift; i++) dayStructures.push({timestamp:0, day:0})
  for(let i=1, t=timestamp; i<=daysInMonth; i++, t+=86400) dayStructures.push({timestamp:t, day:i})
  const monthStructure: DayStructure[][] = []
  for(let i=0; i<dayStructures.length; i+=7) monthStructure.push(dayStructures.slice(i, i+7))

  return <div className={styles.calendar}>
    {monthStructure.map((week,i)=>(
      <div key={i} className={styles.week}>
        {week.map((d,i)=>d.day
        ? <DayButton key={d.timestamp} today={d.timestamp===todayTS} selected={d.timestamp===selectedTS}
          onClick={e=>{onSelect(d.timestamp)}}>
          {d.day}</DayButton>
        : <div key={i} className={styles.placeholder}></div>
        )}
      </div>
    ))}
  </div>
}

export default DatePickerCalendar

type DayStructure = {
  timestamp: number
  day: number
}