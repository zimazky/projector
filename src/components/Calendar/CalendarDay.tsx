import React from 'react'
import styles from './CalendarDay.module.css'
import DateTime, { timestamp } from 'src/utils/DateTime'
import { plus } from 'src/utils/utils'
import { eventFormStore, mainStore } from 'src/stores/MainStore'
import { CalendarDayStructure } from 'src/stores/Calendar/CalendarStore'

function minimize(d: number) { return (d/1000).toFixed(1) }

type CalendarDayProperties = {
  data: CalendarDayStructure
  isToday: boolean
  onDragDrop: (e: React.DragEvent<HTMLElement>) => void
  children: any
}

export default function CalendarDay(props: CalendarDayProperties) {
  const {data, isToday, onDragDrop, children = null} = props
  const {timestamp, weather, actualBalance, plannedBalance, plannedBalanceChange, style} = data
  const inputElementRef = React.useRef<HTMLDivElement>(null)
  const {day, month} = DateTime.getDayMonthWeekday(timestamp)

  const onDayOpen = (timestamp: timestamp) => {
    mainStore.setCurrentDay(timestamp)
    mainStore.changeViewMode({mode: 'Day'})
  }

  const openEventFormWithNewEvent = (name: string) => {
    if(name==='') return
    eventFormStore.setEventData({
      id: null, name, timestamp,
      start: DateTime.getYYYYMMDD(timestamp)
    })
    eventFormStore.showForm()
  }

  function onClickHandle(e: React.MouseEvent<HTMLElement>) {
    if(inputElementRef) inputElementRef.current?.focus()
  }

  function onKeyDownHandle(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key == 'Enter') e.currentTarget.blur()
  }

  function onBlurHandle(e: React.FocusEvent<HTMLElement>) {
    openEventFormWithNewEvent(e.target.innerText)
    e.target.innerText = ''
  } 

  const dragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    if(e.ctrlKey) e.dataTransfer.dropEffect = 'copy'
    else e.dataTransfer.dropEffect = 'move'
  }

  return (
    <div className={style==='normal' ? styles.day : (style==='uncompleted' ? styles.between_firstplanned_and_actual : styles.before_actual_date) } 
      onClick={onClickHandle} onDrop={onDragDrop} onDragOver={dragOver}>
      <div className={isToday?styles.today:styles.header} onClick={e=>{onDayOpen(timestamp)}}>
        {day + (day==1?' '+DateTime.MONTHS[month]:'')}
        {weather ? <div className={styles.weather} title={
          'temperature: '+ plus(weather.temperatureMax)+'/'+plus(weather.temperatureMin)
          + '\nclouds: ' + weather.clouds.toFixed(0)
          + '\nprecipitation: ' + weather.pop.toFixed(2)
          + '\nrain: ' + weather.rain.toFixed(2)
          + '\nsnow: ' + weather.snow.toFixed(2)
          + '\ncount: ' + weather.count
          + (weather.isThunderstorm ? '\nThunderstorm' : '')
        }><sup>{'🌡️'+plus(weather.temperatureMax)}</sup><sub>{plus(weather.temperatureMin)}</sub><sup>{weather.emoji}</sup></div>: null}
      </div>
      <div className={styles.balance} title={'planned: '+plannedBalance.toFixed(2)+plus(plannedBalanceChange,2)+'\nactual: '+actualBalance.toFixed(2)}>{minimize(plannedBalance) + 
        (plannedBalanceChange==0?'k':plus(plannedBalanceChange/1000, 1)+'k') +
        ' ' + minimize(actualBalance)}</div>
      {children}
      <div ref={inputElementRef} className={styles.input} contentEditable='true' suppressContentEditableWarning={true}
      onBlur={onBlurHandle} onKeyDown={onKeyDownHandle}></div>
    </div> 
  )
}